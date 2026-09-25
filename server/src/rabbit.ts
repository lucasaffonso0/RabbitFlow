import type { MsgKey } from './i18n.js';

/** Erro vindo do RabbitMQ; `reasonKey` detalha falhas de conexão (traduzido junto com a mensagem) */
export class RabbitError extends Error {
  constructor(
    public key: MsgKey,
    public vars: Record<string, string | number>,
    public status = 502,
    public code = 'RABBIT_ERROR',
    public reasonKey?: MsgKey,
  ) {
    super(key);
  }
}

export interface RabbitConfig {
  apiUrl: string;
  username: string;
  password: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Único ponto de acesso ao RabbitMQ: somente GET na Management API.
 * O RabbitFlow é estritamente de leitura no broker — não publica, não cria, não altera, não apaga nada.
 */
export class RabbitClient {
  private base: string;
  private auth: string;

  constructor(cfg: RabbitConfig) {
    this.base = cfg.apiUrl.replace(/\/+$/, '');
    this.auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  }

  async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/api${path}`, {
        method: 'GET',
        headers: { Authorization: this.auth },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // a Management API não redireciona: não seguimos para outro endereço com as credenciais
        redirect: 'manual',
      });
    } catch (err) {
      const e = err as Error;
      const cause = e.cause as (Error & { code?: string; errors?: { code?: string }[] }) | undefined;
      const code = cause?.code ?? cause?.errors?.[0]?.code;
      const reasonKey: MsgKey | undefined =
        e.name === 'TimeoutError' ? 'rabbit.reason.timeout'
        : code === 'ECONNREFUSED' ? 'rabbit.reason.refused'
        : code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'rabbit.reason.notFound'
        : undefined;
      const reason = code ?? (cause?.message || e.message);
      throw new RabbitError('rabbit.unreachable', { url: this.base, reason }, 502, 'RABBIT_UNREACHABLE', reasonKey);
    }
    if (res.status === 401) throw new RabbitError('rabbit.auth', {}, 502, 'RABBIT_AUTH');
    if (res.status >= 300 && res.status < 400) throw new RabbitError('rabbit.redirect', { status: res.status });
    // o corpo da resposta NÃO é repassado: a URL pode apontar para qualquer serviço interno
    if (!res.ok) throw new RabbitError('rabbit.httpError', { status: res.status, path });
    if (!(res.headers.get('content-type') ?? '').includes('json')) throw new RabbitError('rabbit.notRabbit', {});
    return res.json() as Promise<T>;
  }

  async overview() {
    const o = await this.get<{ rabbitmq_version: string; cluster_name: string; erlang_version: string }>('/overview');
    return { version: o.rabbitmq_version, cluster: o.cluster_name, erlang: o.erlang_version };
  }

  async vhosts() {
    return (await this.get<{ name: string }[]>('/vhosts')).map((v) => v.name);
  }
}

export const vh = (vhost: string) => encodeURIComponent(vhost);
