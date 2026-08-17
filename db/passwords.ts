import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hashHex, "hex");
  return derived.length === storedBuffer.length && timingSafeEqual(derived, storedBuffer);
}

// See MF-V-01-DUZELTME-PLANI-1.0.9.md 1.4. Applied wherever a password is
// set: /api/users (admin creating/editing accounts) and
// /api/profile/password (self-service change).
export function validatePasswordPolicy(password: string, username: string): string | null {
  if (password.length < 10) return "Şifre en az 10 karakter olmalı";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Şifre en az bir harf ve bir rakam içermeli";
  if (username && password.toLowerCase() === username.toLowerCase()) return "Şifre kullanıcı adıyla aynı olamaz";
  return null;
}
