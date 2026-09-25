import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Chave que protege as senhas das conexões com o RabbitMQ no banco.
 * RABBITFLOW_SECRET_KEY (qualquer texto longo) tem prioridade; sem ela, é gerada uma vez em <DATA_DIR>/secret.key.
 * Sem a chave certa as senhas salvas não podem ser lidas.
 */
export function loadSecretKey(dataDir: string): Buffer {
  const fromEnv = process.env.RABBITFLOW_SECRET_KEY;
  if (fromEnv) return createHash('sha256').update(fromEnv).digest();
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
}

/** AES-256-GCM: "v1:" + base64(iv | tag | texto cifrado) */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptSecret(stored: string, key: Buffer): string {
  if (!stored.startsWith('v1:')) throw new Error('Formato de segredo desconhecido.');
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
