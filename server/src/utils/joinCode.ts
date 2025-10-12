/**
 * Generate a random 6-character alphanumeric join code
 */
export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Validate join code format (6 alphanumeric characters)
 */
export function validateJoinCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code.toUpperCase());
}
