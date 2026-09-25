import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// carregado via require: ferramentas de build/teste mais antigas não reconhecem o módulo embutido "node:sqlite"
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type DB = DatabaseSyncType;

/** Cada item é uma migração; a posição define a versão (PRAGMA user_version). Só acrescente no fim. */
export const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_login_at INTEGER
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE layout_positions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vhost TEXT NOT NULL,
    node_id TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    PRIMARY KEY (user_id, vhost, node_id)
  );
  CREATE TABLE layout_viewports (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vhost TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    zoom REAL NOT NULL,
    PRIMARY KEY (user_id, vhost)
  );
  `,
  // v2: conexões com o RabbitMQ cadastradas na aplicação; layout passa a ser por conexão.
  // O layout de antes (sem conexão) fica guardado e é herdado pela primeira conexão cadastrada.
  `
  CREATE TABLE connections (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    api_url TEXT NOT NULL,
    username TEXT NOT NULL,
    password_enc TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  ALTER TABLE layout_positions RENAME TO legacy_layout_positions;
  ALTER TABLE layout_viewports RENAME TO legacy_layout_viewports;
  CREATE TABLE layout_positions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    vhost TEXT NOT NULL,
    node_id TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    PRIMARY KEY (user_id, connection_id, vhost, node_id)
  );
  CREATE TABLE layout_viewports (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    vhost TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    zoom REAL NOT NULL,
    PRIMARY KEY (user_id, connection_id, vhost)
  );
  `,
  // v3: idioma da interface escolhido por cada usuário (null = segue o navegador)
  `ALTER TABLE users ADD COLUMN language TEXT;`,
];

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA temp_store = MEMORY;');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Executa `fn` numa transação (trava de escrita desde o início) */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
