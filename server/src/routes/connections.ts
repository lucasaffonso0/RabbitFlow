import { Router, type Request } from 'express';
import { tx, type DB } from '../db.js';
import { HttpError, currentUser, requireAdmin, wrap } from '../http.js';
import { RabbitClient } from '../rabbit.js';
import { decryptSecret, encryptSecret } from '../secrets.js';
import type { MsgKey } from '../i18n.js';

interface ConnectionRow {
  id: number;
  name: string;
  api_url: string;
  username: string;
  password_enc: string;
  created_at: number;
  updated_at: number;
}

/** Nunca inclui a senha */
const publicConnection = (c: ConnectionRow) => ({ id: c.id, name: c.name, apiUrl: c.api_url, username: c.username });

/** Aceita "http://host:15672", ".../", ".../api" ou a URL da página do management */
export function normalizeApiUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(400, 'err.apiUrlRequired');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'err.apiUrlInvalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'err.apiUrlScheme');
  if (url.username || url.password) throw new HttpError(400, 'err.apiUrlCredentials');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '').replace(/\/#.*$/, '');
  return url.toString().replace(/\/+$/, '');
}

const FIELD_ERRORS = {
  name: ['err.connectionNameRequired', 'err.connectionNameTooLong'],
  username: ['err.connectionUserRequired', 'err.connectionUserTooLong'],
} as const satisfies Record<string, readonly [MsgKey, MsgKey]>;

const text = (v: unknown, field: keyof typeof FIELD_ERRORS, max: number) => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, FIELD_ERRORS[field][0]);
  if (v.length > max) throw new HttpError(400, FIELD_ERRORS[field][1]);
  return v.trim();
};

/** Clientes do RabbitMQ por conexão, recriados quando a conexão é editada */
export class ConnectionClients {
  private cache = new Map<number, { updatedAt: number; client: RabbitClient }>();

  constructor(private db: DB, private key: Buffer) {}

  client(id: number): RabbitClient {
    const row = this.db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow | undefined;
    if (!row) throw new HttpError(404, 'err.connectionNotFound', 'CONNECTION_NOT_FOUND');
    const cached = this.cache.get(id);
    if (cached && cached.updatedAt === row.updated_at) return cached.client;
    let password: string;
    try {
      password = decryptSecret(row.password_enc, this.key);
    } catch {
      throw new HttpError(500, 'err.secretUnreadable', 'SECRET_UNREADABLE');
    }
    const client = new RabbitClient({ apiUrl: row.api_url, username: row.username, password });
    this.cache.set(id, { updatedAt: row.updated_at, client });
    return client;
  }

  forget(id: number) {
    this.cache.delete(id);
  }

  password(id: number): string {
    const row = this.db.prepare('SELECT password_enc FROM connections WHERE id = ?').get(id) as { password_enc: string } | undefined;
    if (!row) throw new HttpError(404, 'err.connectionNotFound', 'CONNECTION_NOT_FOUND');
    return decryptSecret(row.password_enc, this.key);
  }
}

export const connectionIdOf = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'err.connectionRequired');
  return id;
};

export function connectionRoutes(db: DB, key: Buffer, clients: ConnectionClients) {
  const r = Router();
  const find = (id: number) => db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow | undefined;
  const target = (req: Request) => {
    const c = find(connectionIdOf(req.params.id));
    if (!c) throw new HttpError(404, 'err.connectionNotFound', 'CONNECTION_NOT_FOUND');
    return c;
  };
  const nameTaken = (name: string, exceptId = 0) =>
    Boolean(db.prepare('SELECT 1 FROM connections WHERE name = ? AND id <> ?').get(name, exceptId));

  // Todos os usuários logados veem as conexões (sem senha) para poder escolher
  r.get('/', wrap(() =>
    (db.prepare('SELECT * FROM connections ORDER BY name COLLATE NOCASE').all() as unknown as ConnectionRow[]).map(publicConnection),
  ));

  // Testa sem salvar. Só faz GET /api/overview no RabbitMQ.
  r.post('/test', requireAdmin, wrap(async (req) => {
    const { apiUrl, username, password, id } = req.body ?? {};
    const pass = typeof password === 'string' && password !== '' ? password : id ? clients.password(connectionIdOf(id)) : '';
    if (!pass) throw new HttpError(400, 'err.passwordRequired');
    const client = new RabbitClient({ apiUrl: normalizeApiUrl(apiUrl), username: text(username, 'username', 200), password: pass });
    return client.overview();
  }));

  r.post('/', requireAdmin, wrap((req, res) => {
    const { name, apiUrl, username, password } = req.body ?? {};
    const n = text(name, 'name', 60);
    const url = normalizeApiUrl(apiUrl);
    const u = text(username, 'username', 200);
    if (typeof password !== 'string' || !password) throw new HttpError(400, 'err.passwordRequired');
    return tx(db, () => {
      if (nameTaken(n)) throw new HttpError(409, 'err.connectionExists', undefined, { name: n });
      const isFirst = (db.prepare('SELECT COUNT(*) AS n FROM connections').get() as { n: number }).n === 0;
      const now = Date.now();
      const { lastInsertRowid } = db
        .prepare('INSERT INTO connections (name, api_url, username, password_enc, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(n, url, u, encryptSecret(password, key), now, now, currentUser(res).id);
      const id = Number(lastInsertRowid);
      if (isFirst) {
        // a primeira conexão herda o layout salvo antes das conexões existirem
        db.prepare('INSERT OR IGNORE INTO layout_positions SELECT user_id, ?, vhost, node_id, x, y FROM legacy_layout_positions').run(id);
        db.prepare('INSERT OR IGNORE INTO layout_viewports SELECT user_id, ?, vhost, x, y, zoom FROM legacy_layout_viewports').run(id);
        db.exec('DELETE FROM legacy_layout_positions; DELETE FROM legacy_layout_viewports;');
      }
      return publicConnection(find(id)!);
    });
  }));

  r.patch('/:id', requireAdmin, wrap((req) => {
    const c = target(req);
    const { name, apiUrl, username, password } = req.body ?? {};
    const n = name === undefined ? c.name : text(name, 'name', 60);
    const url = apiUrl === undefined ? c.api_url : normalizeApiUrl(apiUrl);
    const u = username === undefined ? c.username : text(username, 'username', 200);
    // senha em branco = mantém a atual
    const enc = typeof password === 'string' && password !== '' ? encryptSecret(password, key) : c.password_enc;
    if (nameTaken(n, c.id)) throw new HttpError(409, 'err.connectionExists', undefined, { name: n });
    db.prepare('UPDATE connections SET name = ?, api_url = ?, username = ?, password_enc = ?, updated_at = ? WHERE id = ?')
      .run(n, url, u, enc, Date.now(), c.id);
    clients.forget(c.id);
    return publicConnection(find(c.id)!);
  }));

  r.delete('/:id', requireAdmin, wrap((req) => {
    const c = target(req);
    db.prepare('DELETE FROM connections WHERE id = ?').run(c.id); // layouts da conexão saem em cascata
    clients.forget(c.id);
    return { ok: true };
  }));

  return r;
}
