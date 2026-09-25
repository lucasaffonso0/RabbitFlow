import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { loadSecretKey } from './secrets.js';

const port = Number(process.env.PORT ?? 4100);
const dataDir = process.env.DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const dbFile = path.join(dataDir, 'rabbitflow.db');

const db = openDb(dbFile);
purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db), 60 * 60 * 1000).unref();

createApp(db, { secretKey: loadSecretKey(dataDir) }).listen(port, () => console.log(`RabbitFlow em http://localhost:${port} (banco: ${dbFile})`));
