/**
 * Turning caught values into text. Anything can be thrown, so catch blocks
 * get `unknown` and go through these instead of assuming an Error.
 */

/** The message of anything thrown, for logs and admin reports */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A message safe to send to a client: a thrown Error's own message (the
 * services throw plain Errors with user-facing text, e.g. "Swap lists are
 * locked"), except Prisma's, whose text names the database host and the
 * failing query. Those get the fallback; the full error stays in the log.
 */
export function clientMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || error.name.startsWith('PrismaClient')) return fallback;
  return error.message || fallback;
}
