import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENC_PREFIX = "enc:v1:";
const KEY_ENV_NAME = "KEEL_ENCRYPTION_KEY";

declare global {
  var __keelEncKey: Buffer | undefined;
}

function loadOrCreateEncryptionKey(): Buffer {
  if (globalThis.__keelEncKey) return globalThis.__keelEncKey;

  let hex = process.env[KEY_ENV_NAME]?.trim();

  if (!hex) {
    const envLocalPath = path.join(process.cwd(), ".env.local");
    const dataKeyPath = path.join(process.cwd(), "data", ".keel-key");

    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, "utf8");
      const match = content.match(/^KEEL_ENCRYPTION_KEY\s*=\s*([0-9a-fA-F]{64})\s*$/m);
      if (match) {
        hex = match[1];
      }
    }

    if (!hex && fs.existsSync(dataKeyPath)) {
      const saved = fs.readFileSync(dataKeyPath, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(saved)) {
        hex = saved;
      }
    }

    if (!hex) {
      hex = crypto.randomBytes(32).toString("hex");
      try {
        if (process.env.NODE_ENV === "production") {
          // Persist inside the mounted /app/data volume so container updates keep the key
          fs.mkdirSync(path.dirname(dataKeyPath), { recursive: true });
          fs.writeFileSync(dataKeyPath, `${hex}\n`, { mode: 0o600 });
        } else {
          const line = `\n# Auto-generated AES-256-GCM encryption key for Keel data at rest\n${KEY_ENV_NAME}=${hex}\n`;
          fs.appendFileSync(envLocalPath, line, { mode: 0o600 });
        }
      } catch {
        // Fallback: keep in memory for this process
      }
    }
    process.env[KEY_ENV_NAME] = hex;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    // Derive a 32-byte key deterministically if user provided a passphrase
    globalThis.__keelEncKey = crypto.createHash("sha256").update(hex).digest();
  } else {
    globalThis.__keelEncKey = Buffer.from(hex, "hex");
  }

  return globalThis.__keelEncKey;
}

/**
 * Encrypts a UTF-8 string using AES-256-GCM.
 * Empty strings are kept empty so empty-check queries remain clean.
 */
export function encryptString(plain: string): string {
  if (!plain) return "";
  if (plain.startsWith(ENC_PREFIX)) return plain;

  const key = loadOrCreateEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypts an `enc:v1:...` string; returns legacy plaintext untouched for
 * seamless backwards-compatible migration of existing rows.
 */
export function decryptString(raw: string | null | undefined): string {
  if (!raw) return "";
  if (!raw.startsWith(ENC_PREFIX)) return raw;

  try {
    const rest = raw.slice(ENC_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length !== 3) return raw;
    const [ivB64, tagB64, dataB64] = parts;
    const key = loadOrCreateEncryptionKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "[Encrypted — check KEEL_ENCRYPTION_KEY]";
  }
}

export function isEncryptionConfigured(): boolean {
  try {
    loadOrCreateEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
