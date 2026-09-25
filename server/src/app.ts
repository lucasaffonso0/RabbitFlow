import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DB } from './db.js';
import { RabbitError } from './rabbit.js';
import { getTopology } from './topology.js';
import { HttpError, authGate, securityHeaders, wrap, writeGuard } from './http.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { layoutRoutes } from './routes/layout.js';
import { ConnectionClients, connectionIdOf, connectionRoutes } from './routes/connections.js';
import type { LoginLimits } from './auth/rateLimit.js';
import { langOf, translate } from './i18n.js';

export function createApp(
  db: DB,
  opts: { secretKey: Buffer; limits?: LoginLimits; webDist?: string; maxLayoutPositions?: number },
) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', true);

  app.use(securityHeaders);

  // Saúde do próprio processo (não consulta o RabbitMQ); usado pelo healthcheck do container
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Escritas só nas rotas do próprio RabbitFlow; o RabbitMQ continua só com GET (ver rabbit.ts)
  app.use(writeGuard);
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', authGate(db));

  app.use('/api/auth', authRoutes(db, opts.limits));
  app.use('/api/users', userRoutes(db));
  app.use('/api/layout', layoutRoutes(db, opts.maxLayoutPositions));
  const clients = new ConnectionClients(db, opts.secretKey);
  app.use('/api/connections', connectionRoutes(db, opts.secretKey, clients));

  // Leitura do RabbitMQ, por conexão cadastrada (só GET — ver rabbit.ts)
  const rabbit = (id: string) => clients.client(connectionIdOf(id));
  app.get('/api/c/:id/overview', wrap((req) => rabbit(req.params.id).overview()));
  app.get('/api/c/:id/vhosts', wrap((req) => rabbit(req.params.id).vhosts()));
  app.get('/api/c/:id/topology', wrap((req) =>
    getTopology(rabbit(req.params.id), typeof req.query.vhost === 'string' ? req.query.vhost : '/'),
  ));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'err.routeNotFound')));

  // Em produção serve o build do frontend
  const webDist = opts.webDist ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  // mensagens de erro no idioma de quem pediu
  app.use((err: Error & { status?: number; type?: string }, req: Request, res: Response, _next: NextFunction) => {
    const lang = langOf(req, res);
    if (err instanceof HttpError) return res.status(err.status).json({ error: translate(lang, err.key, err.vars), code: err.code });
    if (err instanceof RabbitError) {
      const vars = err.reasonKey ? { ...err.vars, reason: translate(lang, err.reasonKey) } : err.vars;
      return res.status(err.status).json({ error: translate(lang, err.key, vars), code: err.code });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: translate(lang, 'err.invalidJson') });
    console.error(err);
    res.status(500).json({ error: translate(lang, 'err.internal') });
  });

  return app;
}
