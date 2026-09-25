import type { Topology } from './types';
import { getLanguage, t, type Lang } from './i18n';

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  /** idioma escolhido pelo usuário (null = ainda não escolheu) */
  language: Lang | null;
}

export interface UserListItem extends User {
  createdAt: number;
  createdBy: string | null;
  lastLoginAt: number | null;
}

export interface Connection {
  id: number;
  name: string;
  apiUrl: string;
  username: string;
}

export interface ConnectionInput {
  name: string;
  apiUrl: string;
  username: string;
  /** vazio na edição = mantém a senha salva */
  password: string;
}

export type Overview = { version: string; cluster: string; erlang: string };

export type Point = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/** Disparado quando a sessão acaba (401) ou exige troca de senha; o AuthGate volta para a tela certa */
export const AUTH_EVENT = 'rabbitflow:auth';

async function request<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    keepalive: opts.keepalive,
    // o servidor responde as mensagens de erro no idioma da interface
    headers: { 'X-RabbitFlow-Lang': getLanguage(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(data.error ?? t('common.somethingWrong'), res.status, data.code);
    const isAuthCall = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/setup') || path.startsWith('/api/auth/password');
    if (!isAuthCall && (err.code === 'UNAUTHENTICATED' || err.code === 'PASSWORD_CHANGE_REQUIRED')) {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: err.code }));
    }
    throw err;
  }
  return data as T;
}

const q = (connection: number, vhost: string) => `connection=${connection}&vhost=${encodeURIComponent(vhost)}`;
const c = (connection: number) => `/api/c/${connection}`;

export const api = {
  // leitura do RabbitMQ, por conexão
  overview: (connection: number) => request<Overview>('GET', `${c(connection)}/overview`),
  vhosts: (connection: number) => request<string[]>('GET', `${c(connection)}/vhosts`),
  topology: (connection: number, vhost: string) =>
    request<Topology>('GET', `${c(connection)}/topology?vhost=${encodeURIComponent(vhost)}`),

  connections: () => request<Connection[]>('GET', '/api/connections'),
  createConnection: (input: ConnectionInput) => request<Connection>('POST', '/api/connections', input),
  updateConnection: (id: number, input: ConnectionInput) => request<Connection>('PATCH', `/api/connections/${id}`, input),
  deleteConnection: (id: number) => request<{ ok: true }>('DELETE', `/api/connections/${id}`),
  /** Testa sem salvar; com `id` e senha vazia usa a senha já salva */
  testConnection: (input: Omit<ConnectionInput, 'name'> & { id?: number }) =>
    request<Overview>('POST', '/api/connections/test', input),

  authState: () => request<{ setupRequired: boolean; user: User | null }>('GET', '/api/auth/state'),
  setup: (username: string, password: string) => request<User>('POST', '/api/auth/setup', { username, password }),
  login: (username: string, password: string) => request<User>('POST', '/api/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout', {}),
  changePassword: (current: string, next: string) => request<User>('POST', '/api/auth/password', { current, next }),
  setLanguagePreference: (language: Lang) => request<User>('PUT', '/api/auth/preferences', { language }),

  users: () => request<UserListItem[]>('GET', '/api/users'),
  createUser: (username: string, isAdmin: boolean) =>
    request<{ user: User; tempPassword: string }>('POST', '/api/users', { username, isAdmin }),
  resetPassword: (id: number) => request<{ tempPassword: string }>('POST', `/api/users/${id}/reset-password`, {}),
  setAdmin: (id: number, isAdmin: boolean) => request<User>('PATCH', `/api/users/${id}`, { isAdmin }),
  deleteUser: (id: number) => request<{ ok: true }>('DELETE', `/api/users/${id}`),

  layout: (connection: number, vhost: string) =>
    request<{ positions: Record<string, Point>; viewport: Viewport | null }>('GET', `/api/layout?${q(connection, vhost)}`),
  savePositions: (connection: number, vhost: string, positions: Record<string, Point>, replace = false, keepalive = false) =>
    request('PUT', `/api/layout/positions?${q(connection, vhost)}`, { positions, replace }, { keepalive }),
  saveViewport: (connection: number, vhost: string, vp: Viewport, keepalive = false) =>
    request('PUT', `/api/layout/viewport?${q(connection, vhost)}`, vp, { keepalive }),
};
