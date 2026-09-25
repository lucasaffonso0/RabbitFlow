import { Router } from 'express';
import { tx, type DB } from '../db.js';
import { generateTempPassword, hashPassword, validateUsername } from '../auth/passwords.js';
import { deleteUserSessions, publicUser, type UserRow } from '../auth/sessions.js';
import { HttpError, currentUser, requireAdmin, wrap } from '../http.js';

/** Gestão de usuários: só administradores */
export function userRoutes(db: DB) {
  const r = Router();
  r.use(requireAdmin);

  const find = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  const admins = () => (db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get() as { n: number }).n;
  const target = (raw: string) => {
    const user = find(Number(raw));
    if (!user) throw new HttpError(404, 'err.userNotFound');
    return user;
  };

  r.get('/', wrap(() =>
    (db.prepare(`
      SELECT u.*, c.username AS created_by_name FROM users u LEFT JOIN users c ON c.id = u.created_by
      ORDER BY u.username COLLATE NOCASE
    `).all() as unknown as (UserRow & { created_by_name: string | null })[]).map((u) => ({
      ...publicUser(u),
      createdAt: u.created_at,
      createdBy: u.created_by_name,
      lastLoginAt: u.last_login_at,
    })),
  ));

  r.post('/', wrap(async (req, res) => {
    const { username, isAdmin } = req.body ?? {};
    const err = validateUsername(username);
    if (err) throw new HttpError(400, err);
    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);
    const user = tx(db, () => {
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
        throw new HttpError(409, 'err.userExists', undefined, { name: username });
      }
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (username, password_hash, is_admin, must_change_password, created_at, created_by) VALUES (?, ?, ?, 1, ?, ?)')
        .run(username, hash, isAdmin ? 1 : 0, Date.now(), currentUser(res).id);
      return find(Number(lastInsertRowid))!;
    });
    return { user: publicUser(user), tempPassword };
  }));

  r.post('/:id/reset-password', wrap(async (req, res) => {
    const user = target(req.params.id);
    if (user.id === currentUser(res).id) throw new HttpError(400, 'err.useChangePassword');
    const tempPassword = generateTempPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await hashPassword(tempPassword), user.id);
    deleteUserSessions(db, user.id);
    return { tempPassword };
  }));

  r.patch('/:id', wrap((req) => {
    const { isAdmin } = req.body ?? {};
    if (typeof isAdmin !== 'boolean') throw new HttpError(400, 'err.isAdminRequired');
    return tx(db, () => {
      const user = target(req.params.id);
      if (!isAdmin && user.is_admin === 1 && admins() <= 1) {
        throw new HttpError(409, 'err.lastAdmin');
      }
      db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, user.id);
      return publicUser(find(user.id)!);
    });
  }));

  r.delete('/:id', wrap((req, res) =>
    tx(db, () => {
      const user = target(req.params.id);
      if (user.id === currentUser(res).id) throw new HttpError(400, 'err.cannotDeleteSelf');
      if (user.is_admin === 1 && admins() <= 1) throw new HttpError(409, 'err.lastAdmin');
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // sessões e layout saem em cascata
      return { ok: true };
    }),
  ));

  return r;
}
