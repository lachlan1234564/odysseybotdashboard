import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadBaseConfig } from "./config.js";

const KEY_FILE = ".bot-dashboard/secret-key";
const LEGACY_KEY_FILE = ".corepanel/secret-key";

export function secretStorageStatus(): {
  ready: boolean;
  source: "environment" | "local-file" | "missing";
  message: string;
} {
  const config = loadBaseConfig();
  if (config.SETUP_SECRET_KEY || config.COREPANEL_SECRET_KEY) {
    return {
      ready: true,
      source: "environment",
      message: "Encryption key is configured from Railway/service variables."
    };
  }
  if (config.NODE_ENV !== "production") {
    return {
      ready: true,
      source: "local-file",
      message: "A local development encryption key will be stored in .bot-dashboard/secret-key."
    };
  }
  return {
    ready: false,
    source: "missing",
    message: "Set SETUP_SECRET_KEY in Railway before saving Discord bot tokens."
  };
}

function loadSecretKeyMaterial(): string {
  const config = loadBaseConfig();
  if (config.SETUP_SECRET_KEY) return config.SETUP_SECRET_KEY;
  if (config.COREPANEL_SECRET_KEY) return config.COREPANEL_SECRET_KEY;
  if (config.NODE_ENV === "production") {
    throw new Error("SETUP_SECRET_KEY is required before storing encrypted setup secrets in production.");
  }

  const keyPath = path.join(config.projectRoot, KEY_FILE);
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, "utf8").trim();
  const legacyKeyPath = path.join(config.projectRoot, LEGACY_KEY_FILE);
  if (fs.existsSync(legacyKeyPath)) return fs.readFileSync(legacyKeyPath, "utf8").trim();
  const generated = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, generated, { mode: 0o600 });
  return generated;
}

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(loadSecretKeyMaterial()).digest();
}

export function encryptSecret(value: string): string {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Stored secret is not in a supported encrypted format.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:v1:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, version, salt, expectedHash] = storedHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !expectedHash) return false;
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64url"), 64);
  const expected = Buffer.from(expectedHash, "base64url");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function maskSecret(value: string): string {
  if (!value) return "";
  const suffix = value.slice(-4);
  return `••••••••${suffix}`;
}
