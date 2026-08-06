import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Server-only storage for the user's OpenRouter API key. There is no
 * database, so the key is kept in an httpOnly cookie (never reaches
 * client-side JS, never sits in localStorage/sessionStorage) and encrypted
 * at rest with AES-256-GCM so the raw key isn't sitting in plaintext in the
 * browser's cookie jar either. Mirrors the encrypt-at-rest approach the rest
 * of this product uses for local profile data.
 */

const COOKIE_NAME = "formfill_openrouter_key";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET is not set. Add it to .env.local — see .env.local.example."
    );
  }
  // scrypt derives a fixed 32-byte key from a secret of any length, so the
  // env var can be a plain passphrase rather than a precise hex string.
  return scryptSync(secret, "formfill-api-key-store", 32);
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64url")).join(".");
}

function decrypt(payload: string): string {
  const [ivPart, authTagPart, ciphertextPart] = payload.split(".");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Malformed stored key.");
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Encrypts and stores the key. Only callable from a Route Handler or Server Function. */
export async function saveApiKey(apiKey: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encrypt(apiKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Whether a key is currently stored. Safe to expose to the client — never leaks the value itself. */
export async function hasApiKey(): Promise<boolean> {
  const store = await cookies();
  return store.has(COOKIE_NAME);
}

export async function clearApiKey(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Server-only: decrypts the stored key for use in a server-side OpenRouter
 * call (e.g. from /api/understand). Never send this value back to the client.
 */
export async function readApiKey(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return decrypt(raw);
  } catch {
    return null;
  }
}
