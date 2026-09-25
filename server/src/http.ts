import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db.js';
import { SESSION_COOKIE, cookieMaxAge, userForSession, type UserRow } from './auth/sessions.js';
import { langOf, translate, type MsgKey } from './i18n.js';

/** Erro de API: a mensagem é uma chave, traduzida no idioma de quem pediu (ver app.ts) */
export class HttpError extends Error {
  constructor(public status: number, public key: MsgKey, public code?: string, public vars: Record<string, string | number> = {}) {
    super(key);
  }
}

const reply = (req: Request, res: Response, status: number, key: MsgKey) =>
  res.status(status).json({ error: translate(langOf(req, res), key) });

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .then((data) => {
        if (!res.headersSent) res.json(data ?? { ok: true });
      }, next);

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const isHttps = (req: Request) =>
  req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isHttps(req), path: '/', maxAge: cookieMaxAge() });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isHttps(req), path: '/' });
}

export const currentUser = (res: Response) => res.locals.user as UserRow;

/**
 * Cabeçalhos de segurança: CSP restrita à própria origem (inclusive contra embutir a página em outro
 * site), sem sniffing de tipo, sem Referer e HSTS quando servido por HTTPS.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      // React Flow e os nós usam style="" inline
      "style-src 'self' 'unsafe-inline'",
      // exportar PNG gera imagens data:/blob:
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}

/** Rotas que funcionam sem login */
const PUBLIC = new Set(['/api/auth/state', '/api/auth/setup', '/api/auth/login']);
/** O que um usuário com senha temporária ainda pode fazer */
const ALLOWED_WHILE_MUST_CHANGE = new Set(['/api/auth/me', '/api/auth/password', '/api/auth/logout', '/api/auth/state', '/api/auth/preferences']);

export function authGate(db: DB) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = userForSession(db, readCookie(req, SESSION_COOKIE));
    res.locals.user = user;
    const path = req.originalUrl.split('?')[0]; // caminho completo, mesmo montado em /api
    if (PUBLIC.has(path)) return next();
    if (!user) return next(new HttpError(401, 'err.loginRequired', 'UNAUTHENTICATED'));
    if (user.must_change_password === 1 && !ALLOWED_WHILE_MUST_CHANGE.has(path)) {
      return next(new HttpError(403, 'err.passwordChangeRequired', 'PASSWORD_CHANGE_REQUIRED'));
    }
    next();
  };
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (currentUser(res)?.is_admin !== 1) return next(new HttpError(403, 'err.adminOnly', 'FORBIDDEN'));
  next();
}

/**
 * Escritas só nas rotas do próprio RabbitFlow (auth, usuários, layout, cadastro de conexões) — nunca no RabbitMQ.
 * Também exige JSON e mesma origem, o que junto do cookie SameSite bloqueia CSRF.
 */
export function writeGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const allowed = ['/api/auth/', '/api/users', '/api/layout', '/api/connections'].some((p) => req.path.startsWith(p));
  if (!allowed) return reply(req, res, 405, 'err.readOnly');
  // POST é o único método que outro site consegue disparar sem preflight de CORS: sempre exige JSON.
  // PUT/PATCH/DELETE vindos de outra origem já são barrados pelo navegador; exigem JSON só se tiverem corpo.
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if ((req.method === 'POST' || hasBody) && !req.is('application/json')) {
    return reply(req, res, 415, 'err.jsonRequired');
  }
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      /* origem inválida */
    }
    if (originHost !== host) return reply(req, res, 403, 'err.originNotAllowed');
  }
  next();
}
