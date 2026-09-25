import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { MsgKey } from '../i18n.js';

// N=2^15 (32 MB por hash): acima do mínimo da OWASP e cabe no limite de memória do container
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEYLEN = 64;

const scryptAsync = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(pw, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** Formato: scrypt$N$r$p$salt$hash (base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

/** Hash gerado com parâmetros mais fracos que os atuais (regravado no próximo login) */
export function needsRehash(stored: string): boolean {
  const [scheme, n, r, p] = stored.split('$');
  return scheme !== 'scrypt' || +n < PARAMS.N || +r < PARAMS.r || +p < PARAMS.p;
}

/** Hash válido de uma senha qualquer: usado para gastar o mesmo tempo quando o usuário não existe */
export const DUMMY_HASH = `scrypt$${PARAMS.N}$8$1$AAAAAAAAAAAAAAAAAAAAAA==$` + Buffer.alloc(KEYLEN).toString('base64');

/** Devolvem a chave da mensagem de erro, ou null se válido */
export function validatePassword(password: unknown): MsgKey | null {
  if (typeof password !== 'string') return 'err.passwordRequired';
  if (password.length < 8) return 'err.passwordTooShort';
  if (password.length > 200) return 'err.passwordTooLong';
  return null;
}

export function validateUsername(username: unknown): MsgKey | null {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return 'err.usernameInvalid';
  return null;
}

/** Senha temporária legível, sem caracteres ambíguos (0/O, 1/l/I): ex. "k7mq-x4tr-9hwp" */
export function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}
