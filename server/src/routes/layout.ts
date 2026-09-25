import { Router, type Request } from 'express';
import { tx, type DB } from '../db.js';
import { HttpError, currentUser, wrap } from '../http.js';
import { connectionIdOf } from './connections.js';

const MAX_NODES = 20_000;

const vhostOf = (req: Request) => {
  const v = req.query.vhost;
  if (typeof v !== 'string' || v.length === 0 || v.length > 255) throw new HttpError(400, 'err.vhostRequired');
  return v;
};
/** Conexão da query (?connection=ID), conferindo que existe */
const connectionOf = (db: DB, req: Request) => {
  const id = connectionIdOf(req.query.connection);
  if (!db.prepare('SELECT 1 FROM connections WHERE id = ?').get(id)) throw new HttpError(404, 'err.connectionNotFound', 'CONNECTION_NOT_FOUND');
  return id;
};
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Posições do grafo e enquadramento, por usuário, conexão e vhost */
export function layoutRoutes(db: DB, maxPositions = 100_000) {
  const r = Router();

  r.get('/', wrap((req, res) => {
    const vhost = vhostOf(req);
    const conn = connectionOf(db, req);
    const user = currentUser(res).id;
    const rows = db.prepare('SELECT node_id, x, y FROM layout_positions WHERE user_id = ? AND connection_id = ? AND vhost = ?').all(user, conn, vhost) as {
      node_id: string; x: number; y: number;
    }[];
    const vp = db.prepare('SELECT x, y, zoom FROM layout_viewports WHERE user_id = ? AND connection_id = ? AND vhost = ?').get(user, conn, vhost) as
      | { x: number; y: number; zoom: number }
      | undefined;
    return {
      positions: Object.fromEntries(rows.map((p) => [p.node_id, { x: p.x, y: p.y }])),
      viewport: vp ? { x: vp.x, y: vp.y, zoom: vp.zoom } : null,
    };
  }));

  r.put('/positions', wrap((req, res) => {
    const vhost = vhostOf(req);
    const conn = connectionOf(db, req);
    const { positions, replace } = req.body ?? {};
    if (!positions || typeof positions !== 'object' || Array.isArray(positions)) throw new HttpError(400, 'err.positionsRequired');
    const entries = Object.entries(positions as Record<string, { x: unknown; y: unknown }>);
    if (entries.length > MAX_NODES) throw new HttpError(413, 'err.tooManyNodes');
    for (const [id, p] of entries) {
      if (id.length > 512 || !p || !num(p.x) || !num(p.y)) throw new HttpError(400, 'err.invalidPosition', undefined, { id: id.slice(0, 60) });
    }
    const user = currentUser(res).id;
    tx(db, () => {
      // limite por usuário, somando todas as conexões e vhosts (evita encher o disco)
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM layout_positions WHERE user_id = ?').get(user) as { n: number };
      if (n + entries.length > maxPositions + (replace === true ? n : 0)) throw new HttpError(413, 'err.layoutTooLarge');
      if (replace === true) {
        db.prepare('DELETE FROM layout_positions WHERE user_id = ? AND connection_id = ? AND vhost = ?').run(user, conn, vhost);
      }
      const upsert = db.prepare(`
        INSERT INTO layout_positions (user_id, connection_id, vhost, node_id, x, y) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, connection_id, vhost, node_id) DO UPDATE SET x = excluded.x, y = excluded.y
      `);
      for (const [id, p] of entries) upsert.run(user, conn, vhost, id, p.x as number, p.y as number);
    });
    return { ok: true, saved: entries.length };
  }));

  r.put('/viewport', wrap((req, res) => {
    const vhost = vhostOf(req);
    const conn = connectionOf(db, req);
    const { x, y, zoom } = req.body ?? {};
    if (!num(x) || !num(y) || !num(zoom) || zoom <= 0) throw new HttpError(400, 'err.invalidViewport');
    db.prepare(`
      INSERT INTO layout_viewports (user_id, connection_id, vhost, x, y, zoom) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, connection_id, vhost) DO UPDATE SET x = excluded.x, y = excluded.y, zoom = excluded.zoom
    `).run(currentUser(res).id, conn, vhost, x, y, zoom);
    return { ok: true };
  }));

  return r;
}
