/**
 * Outgoing email: Resend's HTTP API, one fetch, no SDK. Today it only
 * carries password reset links.
 *
 *  - RESEND_API_KEY set (production): sends from EMAIL_FROM, default
 *    "Pick 6 <noreply@pick6cfb.com>", the usual sender for account email.
 *  - No key (local dev): prints the email to the server log instead, so
 *    the reset flow works offline and the link can be copied from there.
 *    In production a missing key logs an error and sends nothing; the
 *    link never reaches Render's logs.
 *  - captureEmails() (smoke test): keeps emails in memory, never sends,
 *    even when a key is set locally.
 */

import { errorMessage } from '../utils/errors';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

let captured: OutgoingEmail[] | null = null;

/** Smoke test: from now on, keep every email in this array instead of sending */
export function captureEmails(): OutgoingEmail[] {
  captured = [];
  return captured;
}

/**
 * Absolute link into the app. Always a configured base, never the request's
 * Host header: a forged Host would otherwise put someone else's domain (and
 * a live reset token) into a real user's inbox.
 */
export function appUrl(path: string): string {
  const base =
    process.env.APP_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://pick6cfb.com' : 'http://localhost:3000');
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** Send one email. Never throws: true when it went out (or was logged/captured). */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  if (captured) {
    captured.push(email);
    return true;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // A reset link is a credential: print it only on a dev machine
    if (process.env.NODE_ENV === 'production') {
      console.error(`[Email] RESEND_API_KEY not set: "${email.subject}" was not sent`);
      return false;
    }
    console.log(
      `[Email] RESEND_API_KEY not set, not sending. To: ${email.to} | ${email.subject}\n${email.text}`
    );
    return true;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Pick 6 <noreply@pick6cfb.com>',
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Email] Resend ${res.status} for "${email.subject}": ${body.slice(0, 300)}`);
      return false;
    }
    console.log(`[Email] Sent "${email.subject}"`);
    return true;
  } catch (error) {
    console.error(`[Email] Send failed for "${email.subject}": ${errorMessage(error)}`);
    return false;
  }
}

// ---------- The email layout ----------

export interface EmailContent {
  preheader: string; // the inbox preview line under the subject
  heading: string;
  paragraphs: string[];
  button: { label: string; url: string };
  footer: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY_FONT = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";

/**
 * The app's look in email-safe HTML (tables, inline styles): the green
 * header band with the wordmark, one card, one green button. Every string
 * is escaped (names come from users). The text version carries the same
 * words for mail apps that skip HTML.
 */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:#1f2937;">${escapeHtml(p)}</p>`)
    .join('');
  const url = escapeHtml(content.button.url);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
<tr><td bgcolor="#14532d" style="background:#14532d;border-radius:12px 12px 0 0;padding:18px 24px;">
<span style="font:800 26px/1 ${DISPLAY_FONT};color:#ffffff;letter-spacing:0.02em;text-transform:uppercase;">Pick <span style="color:#fbbf24;">6</span></span>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:28px 24px 12px;">
<h1 style="margin:0 0 16px;font:800 28px/1.1 ${DISPLAY_FONT};color:#14532d;text-transform:uppercase;">${escapeHtml(content.heading)}</h1>
${paragraphs}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;"><tr>
<td bgcolor="#15803d" style="border-radius:8px;"><a href="${url}" style="display:inline-block;padding:13px 24px;font:600 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.button.label)}</a></td>
</tr></table>
<p style="margin:0 0 16px;font:13px/1.5 ${FONT};color:#6b7280;">Button not working? Copy this link:<br><a href="${url}" style="color:#166534;word-break:break-all;">${url}</a></p>
</td></tr>
<tr><td style="padding:16px 8px;font:13px/1.5 ${FONT};color:#6b7280;text-align:center;">${escapeHtml(content.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    `${content.button.label}: ${content.button.url}`,
    '',
    '--',
    content.footer,
  ].join('\n');

  return { html, text };
}
