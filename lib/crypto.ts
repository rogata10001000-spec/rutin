import "server-only";

import crypto from "crypto";
import { getServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = getServerEnv().LINE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      "LINE_TOKEN_ENC_KEY is not set. LINE公式アカウントのtoken暗号化に必要です（base64 32byte）。"
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `LINE_TOKEN_ENC_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). 例: openssl rand -base64 32`
    );
  }

  cachedKey = key;
  return key;
}

/**
 * 秘匿文字列を AES-256-GCM で暗号化し、base64 文字列を返す。
 * 形式: base64(iv).base64(authTag).base64(ciphertext)
 */
export function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/**
 * encryptSecret で暗号化した文字列を復号する。
 */
export function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivB64, authTagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * 暗号化鍵が設定されているか（管理画面のバリデーション用）。
 */
export function isTokenEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
