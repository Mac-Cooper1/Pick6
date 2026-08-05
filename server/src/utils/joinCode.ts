import { randomInt } from 'crypto';

// No 0/O/1/I/L — unambiguous when read aloud or typed from a group chat
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a cryptographically random 6-character join code
 */
export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Validate join code format (6 alphanumeric characters; custom codes may use
 * the full alphanumeric set)
 */
export function validateJoinCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code.toUpperCase());
}
