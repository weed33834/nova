/**
 * Password hashing utilities — bcrypt wrapper.
 *
 * Centralizes hashing/verification so the rest of the auth layer never
 * touches bcrypt directly. Rounds default to 12 (industry standard as of 2025);
 * overridable via `NOVA_BCRYPT_ROUNDS` for test environments that need speed.
 */
import bcrypt from 'bcryptjs';

const ROUNDS = Number.parseInt(process.env.NOVA_BCRYPT_ROUNDS || '12', 10);

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
