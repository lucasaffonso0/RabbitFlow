import { Router } from 'express';
import { tx, type DB } from '../db.js';
import {
  DUMMY_HASH, hashPassword, needsRehash, validatePassword, validateUsername, verifyPassword,
} from '../auth/passwords.js';
import {
  SESSION_COOKIE, createSession, deleteSession, deleteUserSessions, publicUser, type UserRow,
} from '../auth/sessions.js';
import { LoginLimits } from '../auth/rateLimit.js';
import { isLang } from '../i18n.js';
import { HttpError, clearSessionCookie, currentUser, readCookie, setSessionCookie, wrap } from '../http.js';

export function authRoutes(db: DB, limits = new LoginLimits()) {
  const r = Router();
  const userCount = () => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;

  r.get('/state', wrap((_req, res) => {
    const user = res.locals.user as UserRow | null;
    return { setupRequired: userCount() === 0, user: user ? publicUser(user) : null };
  }));

  // Primeiro acesso: cria o administrador. Só funciona com o banco sem usuários.
  r.post('/setup', wrap(async (req, res) => {
    const { username, password } = req.body ?? {};
    const err = validateUsername(username) ?? validatePassword(password);
    if (err) throw new HttpError(400, err);
    const hash = await hashPassword(password);
    const user = tx(db, () => {
      if (userCount() > 0) throw new HttpError(409, 'err.alreadySetUp');
      const now = Date.now();
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (username, password_hash, is_admin, created_at, last_login_at) VALUES (?, ?, 1, ?, ?)')
        .run(username, hash, now, now);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid) as unknown as UserRow;
    });
    setSessionCookie(req, res, createSession(db, user.id, req.headers['user-agent']));
    return publicUser(user);
  }));

  r.post('/login', wrap(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'err.credentialsRequired');
    const ip = req.ip ?? '';
    const name = username.toLowerCase();
    const wait = limits.retryAfter(ip, name);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpError(429, 'err.tooManyAttempts', 'RATE_LIMITED', { minutes: Math.ceil(wait / 60) });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    // compara mesmo sem usuário, para não revelar pelo tempo de resposta quais usuários existem
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      limits.fail(ip, name);
      throw new HttpError(401, 'err.invalidCredentials', 'INVALID_CREDENTIALS');
    }
    limits.success(ip, name);
    // hash antigo (parâmetros mais fracos): regrava com os atuais
    if (needsRehash(user.password_hash)) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
    }
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
    setSessionCookie(req, res, createSession(db, user.id, req.headers['user-agent']));
    return publicUser(user);
  }));

  r.post('/logout', wrap((req, res) => {
    deleteSession(db, readCookie(req, SESSION_COOKIE));
    clearSessionCookie(req, res);
    return { ok: true };
  }));

  r.get('/me', wrap((_req, res) => publicUser(currentUser(res))));

  r.post('/password', wrap(async (req, res) => {
    const user = currentUser(res);
    const { current, next } = req.body ?? {};
    if (typeof current !== 'string' || !(await verifyPassword(current, user.password_hash))) {
      throw new HttpError(400, 'err.wrongPassword', 'WRONG_PASSWORD');
    }
    const err = validatePassword(next);
    if (err) throw new HttpError(400, err);
    if (next === current) throw new HttpError(400, 'err.samePassword');
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await hashPassword(next), user.id);
    // encerra as outras sessões (ex.: se a senha antiga tinha vazado)
    deleteUserSessions(db, user.id, readCookie(req, SESSION_COOKIE));
    return publicUser({ ...user, must_change_password: 0 });
  }));

  // idioma da interface, salvo na conta
  r.put('/preferences', wrap((req, res) => {
    const { language } = req.body ?? {};
    if (!isLang(language)) throw new HttpError(400, 'err.invalidLanguage');
    const user = currentUser(res);
    db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, user.id);
    return publicUser({ ...user, language });
  }));

  return r;
}
