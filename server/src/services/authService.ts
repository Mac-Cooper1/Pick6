/**
 * Account lookups and the self-serve password reset (Oct 4; replaced the
 * login page's "email the dev" box).
 *
 *  - Emails match in any case everywhere (login, signup's duplicate check,
 *    reset), exactly otherwise. The column is unique as typed, but no two
 *    accounts differ only by case, and signup now keeps it that way.
 *  - Asking for a reset always gets the same answer, and the controller
 *    replies before the email is built, so neither the reply nor its timing
 *    says whether an address has an account.
 *  - Each account gets at most one reset email a minute and five a day, and
 *    the whole app forty a day, so a script hammering the form can't eat
 *    Resend's free 100 emails a day (in memory: a deploy resets the counts).
 */

import bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  generatePasswordResetToken,
  resetTokenUserId,
  verifyPasswordResetToken,
} from '../utils/auth';
import { appUrl, renderEmail, sendEmail } from './emailService';

export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const RESET_COOLDOWN_MS = MINUTE;
const RESETS_PER_USER_PER_DAY = 5;
const RESETS_PER_DAY = 40;

const resetsByUser = new Map<number, number[]>();
let resetsSent: number[] = [];

/**
 * The account for an email, in any case. Deliberately not Prisma's
 * `mode: 'insensitive'`: that compiles to ILIKE, where % and _ in the typed
 * email are wildcards ("%@gmail.com" would match someone's account).
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM "User" WHERE lower(email) = lower(${email.trim()}) ORDER BY id LIMIT 1`;
  return row ? prisma.user.findUnique({ where: { id: row.id } }) : null;
}

/** Room under the limits for one more reset email to this user (and records it) */
function takeResetSlot(userId: number, now: number): boolean {
  resetsSent = resetsSent.filter((t) => now - t < DAY);
  const mine = (resetsByUser.get(userId) ?? []).filter((t) => now - t < DAY);
  const tooSoon = mine.length > 0 && now - mine[mine.length - 1] < RESET_COOLDOWN_MS;
  if (tooSoon || mine.length >= RESETS_PER_USER_PER_DAY || resetsSent.length >= RESETS_PER_DAY) {
    resetsByUser.set(userId, mine);
    return false;
  }
  mine.push(now);
  resetsByUser.set(userId, mine);
  resetsSent.push(now);
  return true;
}

/**
 * Email a reset link if the address has an account and the limits allow.
 * Resolves quietly either way: the caller tells the user the same thing.
 */
export async function requestPasswordReset(email: string, now: number = Date.now()): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) return;
  if (!takeResetSlot(user.id, now)) {
    console.log(`[Auth] Reset email for user ${user.id} not sent (rate limit)`);
    return;
  }

  // The token rides in the fragment (#), which browsers never send to a
  // server: it stays out of request logs and Referer headers
  const token = generatePasswordResetToken(user.id, user.passwordHash);
  const link = appUrl(`/reset-password#token=${token}`);
  const firstName = user.name.split(' ')[0];

  const { html, text } = renderEmail({
    preheader: 'Your Pick 6 password reset link. It works for 1 hour.',
    heading: 'Reset your password',
    paragraphs: [
      `Hey ${firstName}, someone (hopefully you) asked to reset the password for your Pick 6 account.`,
      'This link works for 1 hour and only once. Using it signs you in.',
    ],
    button: { label: 'Choose a new password', url: link },
    footer: "Didn't ask for this? You can ignore this email. Your password stays the same.",
  });
  await sendEmail({ to: user.email, subject: 'Reset your Pick 6 password', html, text });
}

/**
 * Set a new password from a reset link. One error for every bad link
 * (expired, already used, tampered): the fix is the same, ask for a new one.
 */
export async function resetPassword(token: unknown, password: unknown): Promise<User> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }

  const invalid = new AppError('This reset link has expired or was already used. Request a new one.', 400);
  const userId = typeof token === 'string' ? resetTokenUserId(token) : null;
  if (userId === null) throw invalid;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !verifyPasswordResetToken(token as string, user.passwordHash)) throw invalid;

  // Only if the hash is still the one the link was signed with: two tabs
  // racing the same link can't both get through
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const updated = await prisma.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash },
    data: { passwordHash },
  });
  if (updated.count === 0) throw invalid;

  console.log(`[Auth] Password reset via email link for user ${user.id}`);
  return { ...user, passwordHash };
}
