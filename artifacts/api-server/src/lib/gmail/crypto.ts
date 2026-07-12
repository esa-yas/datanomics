import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gmailEnv } from '../env';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function hashConnectToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function encryptSecret(plaintext: string): string {
  const key = deriveKey(gmailEnv.tokenEncryptionKey);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload');
  const key = deriveKey(gmailEnv.tokenEncryptionKey);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

export function generateConnectToken(): string {
  return randomBytes(32).toString('base64url');
}
