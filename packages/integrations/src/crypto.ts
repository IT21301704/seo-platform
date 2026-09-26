import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** 32-byte key from ENCRYPTION_KEY (64 hex chars or base64). */
export function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env["ENCRYPTION_KEY"] ?? "";
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64). Generate one with: openssl rand -hex 32",
    );
  }
  return key;
}

/** AES-256-GCM. Output: "v1:<iv>:<tag>:<ciphertext>" (base64 parts). */
export function encryptSecret(plaintext: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string, key: Buffer = encryptionKey()): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined)
    throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
