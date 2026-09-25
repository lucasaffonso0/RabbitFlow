import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, type DB } from './db.js';
import { createApp } from './app.js';
import { LoginLimiter, LoginLimits } from './auth/rateLimit.js';
import { hashPassword, verifyPassword, generateTempPassword } from './auth/passwords.js';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { decryptSecret, encryptSecret } from './secrets.js';

let server: Server;
let base = '';
let db: DB;

/** Cliente com "pote" de cookies próprio (cada um é um navegador) */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

// RabbitMQ falso: responde a Management API e registra o que recebeu
const rabbitRequests: { method: string; url: string }[] = [];
const fakeRabbit = http.createServer((req, res) => {
  rabbitRequests.push({ method: req.method!, url: req.url! });
  if (req.headers.authorization !== 'Basic ' + Buffer.from('guest:guest').toString('base64')) {
    res.writeHead(401).end('{"error":"not_authorised"}');
    return;
  }
  const path = req.url!.split('?')[0];
  const body: Record<string, unknown> = {
    '/api/overview': { rabbitmq_version: '3.9.27-falso', cluster_name: 'rabbit@falso', erlang_version: '25' },
    '/api/vhosts': [{ name: '/' }, { name: '/billing' }],
    '/api/exchanges/%2F': [], '/api/queues/%2F': [], '/api/bindings/%2F': [], '/api/consumers/%2F': [],
  };
  res.writeHead(path in body ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(body[path] ?? {}));
});
let rabbitUrl = '';
await new Promise<void>((r) => fakeRabbit.listen(0, r));
rabbitUrl = `http://127.0.0.1:${(fakeRabbit.address() as AddressInfo).port}`;
afterAll(() => fakeRabbit.close());

beforeEach(async () => {
  server?.close();
  db = openDb(':memory:');
  server = createApp(db, {
    secretKey: randomBytes(32),
    limits: new LoginLimits(new LoginLimiter(3, 60_000), new LoginLimiter(30, 60_000)),
    webDist: '/nao-existe',
    maxLayoutPositions: 50,
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

async function setupAdmin() {
  const admin = client();
  const r = await admin('POST', '/api/auth/setup', { username: 'admin', password: 'senha-forte-1' });
  expect(r.status).toBe(200);
  return admin;
}

describe('senhas', () => {
  it('hash e verificação', async () => {
    const h = await hashPassword('correta-123');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correta-123', h)).toBe(true);
    expect(await verifyPassword('errada-123', h)).toBe(false);
  });
  it('senha temporária tem formato legível', () => {
    expect(generateTempPassword()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});

describe('primeiro acesso', () => {
  it('pede configuração e só permite criar o administrador uma vez', async () => {
    const c = client();
    expect((await c('GET', '/api/auth/state')).data).toEqual({ setupRequired: true, user: null });
    const r = await c('POST', '/api/auth/setup', { username: 'admin', password: 'senha-forte-1' });
    expect(r.data).toMatchObject({ username: 'admin', isAdmin: true, mustChangePassword: false });
    expect((await c('GET', '/api/auth/state')).data.setupRequired).toBe(false);
    const again = await client()('POST', '/api/auth/setup', { username: 'outro', password: 'senha-forte-2' });
    expect(again.status).toBe(409);
  });
  it('valida usuário e senha', async () => {
    const c = client();
    expect((await c('POST', '/api/auth/setup', { username: 'a', password: 'senha-forte-1' })).status).toBe(400);
    expect((await c('POST', '/api/auth/setup', { username: 'admin', password: 'curta' })).status).toBe(400);
  });
});

describe('login e sessão', () => {
  it('sem login as rotas da API respondem 401', async () => {
    await setupAdmin();
    expect((await client()('GET', '/api/c/1/topology?vhost=/')).status).toBe(401);
    expect((await client()('GET', '/api/layout?connection=1&vhost=/')).status).toBe(401);
    expect((await client()('GET', '/api/connections')).status).toBe(401);
  });
  it('login certo, errado e logout', async () => {
    await setupAdmin();
    const c = client();
    expect((await c('POST', '/api/auth/login', { username: 'admin', password: 'errada-123' })).status).toBe(401);
    const ok = await c('POST', '/api/auth/login', { username: 'ADMIN', password: 'senha-forte-1' });
    expect(ok.status).toBe(200);
    expect((await c('GET', '/api/auth/me')).data.username).toBe('admin');
    await c('POST', '/api/auth/logout', {});
    expect((await c('GET', '/api/auth/me')).status).toBe(401);
  });
  it('bloqueia após muitas tentativas', async () => {
    await setupAdmin();
    const c = client();
    for (let i = 0; i < 3; i++) await c('POST', '/api/auth/login', { username: 'admin', password: 'errada-123' });
    const r = await c('POST', '/api/auth/login', { username: 'admin', password: 'senha-forte-1' });
    expect(r.status).toBe(429);
  });
  it('trocar a senha encerra as outras sessões', async () => {
    const a = await setupAdmin();
    const b = client();
    await b('POST', '/api/auth/login', { username: 'admin', password: 'senha-forte-1' });
    expect((await a('POST', '/api/auth/password', { current: 'errada', next: 'nova-senha-123' })).status).toBe(400);
    expect((await a('POST', '/api/auth/password', { current: 'senha-forte-1', next: 'nova-senha-123' })).status).toBe(200);
    expect((await a('GET', '/api/auth/me')).status).toBe(200);
    expect((await b('GET', '/api/auth/me')).status).toBe(401);
  });
});

describe('usuários', () => {
  it('admin cria usuário com senha temporária que precisa ser trocada', async () => {
    const admin = await setupAdmin();
    const created = await admin('POST', '/api/users', { username: 'maria', isAdmin: false });
    expect(created.status).toBe(200);
    const temp = created.data.tempPassword as string;
    const maria = client();
    const login = await maria('POST', '/api/auth/login', { username: 'maria', password: temp });
    expect(login.data.mustChangePassword).toBe(true);
    // com senha temporária só pode trocar a senha
    expect((await maria('GET', '/api/connections')).status).toBe(403);
    expect((await maria('POST', '/api/auth/password', { current: temp, next: 'da-maria-123' })).status).toBe(200);
    expect((await maria('GET', '/api/connections')).status).toBe(200);
  });
  it('não-admin não gerencia usuários', async () => {
    const admin = await setupAdmin();
    const { data } = await admin('POST', '/api/users', { username: 'joao', isAdmin: false });
    const joao = client();
    await joao('POST', '/api/auth/login', { username: 'joao', password: data.tempPassword });
    await joao('POST', '/api/auth/password', { current: data.tempPassword, next: 'do-joao-123' });
    expect((await joao('GET', '/api/users')).status).toBe(403);
    expect((await joao('POST', '/api/users', { username: 'hacker' })).status).toBe(403);
  });
  it('protege o último administrador e a própria conta', async () => {
    const admin = await setupAdmin();
    const me = (await admin('GET', '/api/auth/me')).data;
    expect((await admin('DELETE', `/api/users/${me.id}`)).status).toBe(400);
    expect((await admin('PATCH', `/api/users/${me.id}`, { isAdmin: false })).status).toBe(409);
    const { data } = await admin('POST', '/api/users', { username: 'ana', isAdmin: true });
    expect((await admin('PATCH', `/api/users/${me.id}`, { isAdmin: false })).status).toBe(200);
    expect((await admin('DELETE', `/api/users/${data.user.id}`)).status).toBe(403); // agora não é mais admin
  });
  it('não permite usuário duplicado', async () => {
    const admin = await setupAdmin();
    await admin('POST', '/api/users', { username: 'pedro' });
    expect((await admin('POST', '/api/users', { username: 'PEDRO' })).status).toBe(409);
  });
  it('redefinir senha gera temporária e derruba as sessões do usuário', async () => {
    const admin = await setupAdmin();
    const { data } = await admin('POST', '/api/users', { username: 'lia' });
    const lia = client();
    await lia('POST', '/api/auth/login', { username: 'lia', password: data.tempPassword });
    const reset = await admin('POST', `/api/users/${data.user.id}/reset-password`, {});
    expect(reset.data.tempPassword).not.toBe(data.tempPassword);
    expect((await lia('GET', '/api/auth/me')).status).toBe(401);
  });
});

describe('layout', () => {
  it('salva por usuário, conexão e vhost, com substituição total', async () => {
    const admin = await setupAdmin();
    const c1 = (await admin('POST', '/api/connections', { name: 'prod', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    const c2 = (await admin('POST', '/api/connections', { name: 'staging', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    const { data } = await admin('POST', '/api/users', { username: 'bia' });
    const bia = client();
    await bia('POST', '/api/auth/login', { username: 'bia', password: data.tempPassword });
    await bia('POST', '/api/auth/password', { current: data.tempPassword, next: 'da-bia-1234' });

    const L = (c: number, vhost = '%2F') => `/api/layout?connection=${c}&vhost=${vhost}`;
    const P = (c: number) => `/api/layout/positions?connection=${c}&vhost=%2F`;
    await admin('PUT', P(c1), { positions: { 'ex:a': { x: 1, y: 2 }, 'q:b': { x: 3, y: 4 } } });
    await admin('PUT', P(c1), { positions: { 'ex:a': { x: 10, y: 20 } } });
    await admin('PUT', `/api/layout/viewport?connection=${c1}&vhost=%2F`, { x: 5, y: 6, zoom: 0.8 });
    expect((await admin('GET', L(c1))).data).toEqual({
      positions: { 'ex:a': { x: 10, y: 20 }, 'q:b': { x: 3, y: 4 } },
      viewport: { x: 5, y: 6, zoom: 0.8 },
    });
    // outro usuário, outra conexão e outro vhost não enxergam
    expect((await bia('GET', L(c1))).data).toEqual({ positions: {}, viewport: null });
    expect((await admin('GET', L(c2))).data.positions).toEqual({});
    expect((await admin('GET', L(c1, '%2Foutro'))).data.positions).toEqual({});

    await admin('PUT', P(c1), { positions: { 'q:z': { x: 0, y: 0 } }, replace: true });
    expect((await admin('GET', L(c1))).data.positions).toEqual({ 'q:z': { x: 0, y: 0 } });

    // remover a conexão apaga o layout dela
    await admin('DELETE', `/api/connections/${c1}`);
    expect((await admin('GET', L(c1))).status).toBe(404);
  });
  it('rejeita dados inválidos', async () => {
    const admin = await setupAdmin();
    const c = (await admin('POST', '/api/connections', { name: 'x', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    expect((await admin('PUT', `/api/layout/positions?connection=${c}&vhost=/`, { positions: { a: { x: 'x', y: 1 } } })).status).toBe(400);
    expect((await admin('PUT', `/api/layout/positions?connection=${c}`, { positions: {} })).status).toBe(400);
    expect((await admin('PUT', '/api/layout/positions?vhost=/', { positions: {} })).status).toBe(400);
    expect((await admin('GET', '/api/layout?connection=999&vhost=/')).status).toBe(404);
  });
});

describe('conexões com o RabbitMQ', () => {
  it('admin cadastra, testa, edita e remove; senha nunca volta', async () => {
    const admin = await setupAdmin();
    const test = await admin('POST', '/api/connections/test', { apiUrl: rabbitUrl, username: 'guest', password: 'guest' });
    expect(test.data).toEqual({ version: '3.9.27-falso', cluster: 'rabbit@falso', erlang: '25' });
    const bad = await admin('POST', '/api/connections/test', { apiUrl: rabbitUrl, username: 'guest', password: 'errada' });
    expect(bad.status).toBe(502);
    expect(bad.data.code).toBe('RABBIT_AUTH');

    const created = await admin('POST', '/api/connections', { name: 'Produção', apiUrl: rabbitUrl + '/api/', username: 'guest', password: 'guest' });
    expect(created.data).toEqual({ id: created.data.id, name: 'Produção', apiUrl: rabbitUrl, username: 'guest' });
    expect((await admin('POST', '/api/connections', { name: 'produção', apiUrl: rabbitUrl, username: 'a', password: 'b' })).status).toBe(409);
    const id = created.data.id;

    expect((await admin('GET', `/api/c/${id}/vhosts`)).data).toEqual(['/', '/billing']);
    // editar sem senha mantém a senha salva
    await admin('PATCH', `/api/connections/${id}`, { name: 'Prod' });
    expect((await admin('GET', `/api/c/${id}/overview`)).status).toBe(200);
    // testar uma conexão salva sem redigitar a senha
    expect((await admin('POST', '/api/connections/test', { id, apiUrl: rabbitUrl, username: 'guest' })).status).toBe(200);
    // senha errada salva → erro claro ao ler
    await admin('PATCH', `/api/connections/${id}`, { password: 'errada' });
    expect((await admin('GET', `/api/c/${id}/overview`)).data.code).toBe('RABBIT_AUTH');

    const list = await admin('GET', '/api/connections');
    expect(list.data[0]).toEqual({ id, name: 'Prod', apiUrl: rabbitUrl, username: 'guest' }); // sem senha
    expect(await admin('DELETE', `/api/connections/${id}`)).toMatchObject({ status: 200 });
    expect((await admin('GET', `/api/c/${id}/overview`)).status).toBe(404);
  });
  it('valida a URL', async () => {
    const admin = await setupAdmin();
    const post = (apiUrl: string) => admin('POST', '/api/connections', { name: 'x' + apiUrl.length, apiUrl, username: 'u', password: 'p' });
    expect((await post('ftp://rabbit:15672')).status).toBe(400);
    expect((await post('nao é url')).status).toBe(400);
    expect((await post('http://user:senha@rabbit:15672')).status).toBe(400);
  });
  it('usuário comum vê as conexões (sem senha) mas não gerencia', async () => {
    const admin = await setupAdmin();
    await admin('POST', '/api/connections', { name: 'prod', apiUrl: rabbitUrl, username: 'guest', password: 'guest' });
    const { data } = await admin('POST', '/api/users', { username: 'rui' });
    const rui = client();
    await rui('POST', '/api/auth/login', { username: 'rui', password: data.tempPassword });
    await rui('POST', '/api/auth/password', { current: data.tempPassword, next: 'do-rui-12345' });
    const list = await rui('GET', '/api/connections');
    expect(list.data).toHaveLength(1);
    expect((await rui('GET', `/api/c/${list.data[0].id}/topology?vhost=%2F`)).status).toBe(200);
    expect((await rui('POST', '/api/connections', { name: 'x', apiUrl: rabbitUrl, username: 'a', password: 'b' })).status).toBe(403);
    expect((await rui('DELETE', `/api/connections/${list.data[0].id}`)).status).toBe(403);
    expect((await rui('POST', '/api/connections/test', { apiUrl: rabbitUrl, username: 'a', password: 'b' })).status).toBe(403);
  });
  it('ao RabbitMQ só chega GET', async () => {
    const admin = await setupAdmin();
    const id = (await admin('POST', '/api/connections', { name: 'p', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    rabbitRequests.length = 0;
    await admin('GET', `/api/c/${id}/topology?vhost=%2F`);
    await admin('POST', `/api/c/${id}/topology?vhost=%2F`, {});
    await admin('DELETE', `/api/c/${id}/vhosts`);
    expect(rabbitRequests.length).toBeGreaterThan(0);
    expect(new Set(rabbitRequests.map((r) => r.method))).toEqual(new Set(['GET']));
  });
  it('senha guardada criptografada', () => {
    const key = randomBytes(32);
    const enc = encryptSecret('segredo', key);
    expect(enc).not.toContain('segredo');
    expect(decryptSecret(enc, key)).toBe('segredo');
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });
});

describe('proteções', () => {
  it('escrita fora das rotas do app é 405 (nada chega ao RabbitMQ)', async () => {
    const admin = await setupAdmin();
    expect((await admin('POST', '/api/c/1/topology?vhost=/', {})).status).toBe(405);
    expect((await admin('DELETE', '/api/c/1/vhosts', {})).status).toBe(405);
  });
  it('exige JSON e mesma origem nas escritas', async () => {
    await setupAdmin();
    const res = await fetch(base + '/api/auth/login', { method: 'POST', body: 'username=admin', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(res.status).toBe(415);
    const c = client();
    const cross = await c('POST', '/api/auth/login', { username: 'admin', password: 'senha-forte-1' }, { origin: 'https://site-malicioso.com' });
    expect(cross.status).toBe(403);
  });
  it('senha nunca volta nas respostas', async () => {
    const admin = await setupAdmin();
    const { data } = await admin('GET', '/api/users');
    expect(JSON.stringify(data)).not.toMatch(/password_hash|scrypt/);
  });
});

describe('migração do banco', () => {
  it('layout salvo antes das conexões é herdado pela primeira conexão', async () => {
    const { MIGRATIONS } = await import('./db.js');
    const { createRequire } = await import('node:module');
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-')), 'v1.db');
    // banco no formato antigo (v1), com um usuário e um layout salvo
    const old = new DatabaseSync(file);
    old.exec(MIGRATIONS[0]);
    old.exec('PRAGMA user_version = 1');
    old.prepare("INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (1, 'admin', ?, 1, 0)").run(await hashPassword('senha-forte-1'));
    old.prepare("INSERT INTO layout_positions VALUES (1, '/', 'ex:orders', 11, 22)").run();
    old.close();

    server.close();
    db = openDb(file);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    server = createApp(db, { secretKey: randomBytes(32), webDist: '/nao-existe' }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const admin = client();
    await admin('POST', '/api/auth/login', { username: 'admin', password: 'senha-forte-1' });
    const id = (await admin('POST', '/api/connections', { name: 'prod', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    expect((await admin('GET', `/api/layout?connection=${id}&vhost=%2F`)).data.positions).toEqual({ 'ex:orders': { x: 11, y: 22 } });
    // a segunda conexão começa vazia
    const id2 = (await admin('POST', '/api/connections', { name: 'stg', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    expect((await admin('GET', `/api/layout?connection=${id2}&vhost=%2F`)).data.positions).toEqual({});
  });
});

describe('idioma', () => {
  it('mensagens de erro no idioma pedido (cabeçalho ou conta)', async () => {
    await setupAdmin();
    const c = client();
    const bad = { username: 'admin', password: 'errada-123' };
    expect((await c('POST', '/api/auth/login', bad)).data.error).toBe('Usuário ou senha inválidos.');
    expect((await c('POST', '/api/auth/login', bad, { 'x-rabbitflow-lang': 'en' })).data.error).toBe('Invalid username or password.');
    expect((await c('POST', '/api/auth/login', bad, { 'x-rabbitflow-lang': 'es' })).data.error).toBe('Usuario o contraseña inválidos.');
    expect((await client()('GET', '/api/auth/me', undefined, { 'accept-language': 'en-US,en;q=0.9' })).data.error).toBe('Log in to continue.');
  });
  it('preferência salva na conta e devolvida no login', async () => {
    const admin = await setupAdmin();
    expect((await admin('GET', '/api/auth/me')).data.language).toBeNull();
    expect((await admin('PUT', '/api/auth/preferences', { language: 'fr' })).status).toBe(400);
    expect((await admin('PUT', '/api/auth/preferences', { language: 'es' })).data.language).toBe('es');
    const again = client();
    expect((await again('POST', '/api/auth/login', { username: 'admin', password: 'senha-forte-1' })).data.language).toBe('es');
    // sem cabeçalho, erros saem no idioma da conta
    expect((await again('GET', '/api/users/999')).data.error).toBe('Ruta no encontrada.');
  });
  it('mensagem do RabbitMQ traduzida, com o motivo', async () => {
    const admin = await setupAdmin();
    // porta livre e fechada (o fetch bloqueia portas baixas como a 1)
    const closed = http.createServer();
    await new Promise<void>((r) => closed.listen(0, r));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((r) => closed.close(r));
    const r = await admin('POST', '/api/connections/test', { apiUrl: `http://127.0.0.1:${port}`, username: 'a', password: 'b' }, { 'x-rabbitflow-lang': 'en' });
    expect(r.data.error).toBe(`Could not connect to http://127.0.0.1:${port}: connection refused (is RabbitMQ up? use the management port, usually 15672)`);
  });
  it('dicionário do servidor completo nos três idiomas', async () => {
    const { serverBundles } = await import('./i18n.js');
    const keys = Object.keys(serverBundles['pt-BR']).sort();
    expect(Object.keys(serverBundles.en).sort()).toEqual(keys);
    expect(Object.keys(serverBundles.es).sort()).toEqual(keys);
  });
});

describe('segurança', () => {
  it('cabeçalhos de segurança em todas as respostas', async () => {
    const res = await fetch(base + '/api/auth/state');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('não repassa o conteúdo de outros serviços (SSRF) nem segue redirecionamentos', async () => {
    const admin = await setupAdmin();
    const got: string[] = [];
    const internal = http.createServer((req, res) => {
      got.push(`${req.headers.host}${req.url}`);
      if (req.url!.startsWith('/redir')) res.writeHead(302, { location: `http://127.0.0.1:${port}/segredo` }).end();
      else res.writeHead(403).end('CONFIG-INTERNA: db_password=supersecreta');
    });
    await new Promise<void>((r) => internal.listen(0, r));
    const port = (internal.address() as AddressInfo).port;
    const leak = await admin('POST', '/api/connections/test', { apiUrl: `http://127.0.0.1:${port}`, username: 'u', password: 'p' });
    expect(leak.status).toBe(502);
    expect(JSON.stringify(leak.data)).not.toContain('supersecreta');
    const redir = await admin('POST', '/api/connections/test', { apiUrl: `http://127.0.0.1:${port}/redir`, username: 'u', password: 'p' });
    expect(redir.status).toBe(502);
    expect(got.some((u) => u.includes('/segredo'))).toBe(false); // não seguiu
    internal.close();
  });

  it('limite por IP contra tentativas espalhadas em vários usuários', async () => {
    await setupAdmin();
    const c = client();
    for (let i = 0; i < 30; i++) await c('POST', '/api/auth/login', { username: `u${i}`, password: 'x' });
    expect((await c('POST', '/api/auth/login', { username: 'admin', password: 'senha-forte-1' })).status).toBe(429);
  });

  it('sessão tem prazo máximo mesmo com uso contínuo', async () => {
    const admin = await setupAdmin();
    expect((await admin('GET', '/api/auth/me')).status).toBe(200);
    db.prepare('UPDATE sessions SET created_at = ?').run(Date.now() - 31 * 24 * 3600 * 1000);
    expect((await admin('GET', '/api/auth/me')).status).toBe(401);
  });

  it('layout por usuário tem limite de tamanho', async () => {
    const admin = await setupAdmin();
    const c = (await admin('POST', '/api/connections', { name: 'x', apiUrl: rabbitUrl, username: 'guest', password: 'guest' })).data.id;
    const many = (n: number, prefix: string) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, { x: 0, y: 0 }]));
    expect((await admin('PUT', `/api/layout/positions?connection=${c}&vhost=/`, { positions: many(40, 'a') })).status).toBe(200);
    expect((await admin('PUT', `/api/layout/positions?connection=${c}&vhost=/b`, { positions: many(20, 'b') })).status).toBe(413);
    // substituir tudo não conta o que será apagado
    expect((await admin('PUT', `/api/layout/positions?connection=${c}&vhost=/`, { positions: many(45, 'c'), replace: true })).status).toBe(200);
  });

  it('senha com parâmetros antigos é regravada no login', async () => {
    const { scryptSync, randomBytes: rb } = await import('node:crypto');
    const salt = rb(16);
    const old = ['scrypt', 16384, 8, 1, salt.toString('base64'), scryptSync('senha-antiga-1', salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')].join('$');
    await setupAdmin();
    db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(old);
    expect((await client()('POST', '/api/auth/login', { username: 'admin', password: 'senha-antiga-1' })).status).toBe(200);
    const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get() as { password_hash: string };
    expect(password_hash.split('$')[1]).toBe('32768');
  });
});
