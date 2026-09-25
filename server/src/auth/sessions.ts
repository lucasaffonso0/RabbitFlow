import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db.js';

export const SESSION_COOKIE = 'rf_session';
const DAY = 24 * 60 * 60 * 1000;
const sessionMs = () => Math.max(1, Number(process.env.SESSION_DAYS ?? 7)) * DAY;
// prazo máximo, mesmo com uso contínuo: uma sessão roubada não vale para sempre
const sessionMaxMs = () => Math.max(1, Number(process.env.SESSION_MAX_DAYS ?? 30)) * DAY;

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  must_change_password: number;
  created_at: number;
  created_by: number | null;
  last_login_at: number | null;
  language: string | null;
}

export interface PublicUser {
  id: number;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  language: string | null;
}

export const publicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  isAdmin: u.is_admin === 1,
  mustChangePassword: u.must_change_password === 1,
  language: u.language ?? null,
});

// no banco fica só o hash: um vazamento do arquivo não permite sequestrar sessões
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, userId: number, userAgent: string | undefined): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(hashToken(token), userId, now, now + sessionMs(), now, (userAgent ?? '').slice(0, 300));
  return token;
}

/** Usuário da sessão, ou null. Renova a validade com o uso (no máximo uma escrita por minuto). */
export function userForSession(db: DB, token: string | undefined): UserRow | null {
  if (!token) return null;
  const hash = hashToken(token);
  const row = db
    .prepare('SELECT s.expires_at, s.last_seen_at, s.created_at AS session_created_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .get(hash) as (UserRow & { expires_at: number; last_seen_at: number; session_created_at: number }) | undefined;
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at < now || now - row.session_created_at > sessionMaxMs()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  if (now - row.last_seen_at > 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, now + sessionMs(), hash);
  }
  const { expires_at: _e, last_seen_at: _l, session_created_at: _c, ...user } = row;
  return user;
}

export function deleteSession(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Encerra as sessões do usuário, mantendo opcionalmente a atual */
export function deleteUserSessions(db: DB, userId: number, keepToken?: string) {
  if (keepToken) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, hashToken(keepToken));
  else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeExpiredSessions(db: DB) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

export const cookieMaxAge = () => sessionMs();
