/** Limite simples em memória para tentativas de login, por chave (ex.: IP + usuário, ou só IP). */
export class LoginLimiter {
  private attempts = new Map<string, { count: number; first: number }>();

  constructor(private max = 5, private windowMs = 15 * 60 * 1000, private maxKeys = 50_000) {}

  /** Segundos até poder tentar de novo (0 = liberado) */
  retryAfter(key: string): number {
    const a = this.attempts.get(key);
    if (!a) return 0;
    const elapsed = Date.now() - a.first;
    if (elapsed > this.windowMs) {
      this.attempts.delete(key);
      return 0;
    }
    return a.count >= this.max ? Math.ceil((this.windowMs - elapsed) / 1000) : 0;
  }

  fail(key: string) {
    const a = this.attempts.get(key);
    if (!a || Date.now() - a.first > this.windowMs) {
      if (this.attempts.size >= this.maxKeys) this.prune();
      this.attempts.set(key, { count: 1, first: Date.now() });
    } else a.count++;
  }

  reset(key: string) {
    this.attempts.delete(key);
  }

  /** Descarta janelas vencidas; se ainda estiver cheio, as mais antigas (evita crescer sem limite) */
  private prune() {
    const now = Date.now();
    for (const [k, a] of this.attempts) if (now - a.first > this.windowMs) this.attempts.delete(k);
    for (const k of this.attempts.keys()) {
      if (this.attempts.size < this.maxKeys * 0.9) break;
      this.attempts.delete(k);
    }
  }
}

/**
 * Dois limites: por IP + usuário (5 falhas) e por IP (30 falhas, contra tentar muitos usuários).
 * Sem TRUST_PROXY, atrás de um proxy todos têm o mesmo IP: ligue TRUST_PROXY=1 nesse caso.
 */
export class LoginLimits {
  constructor(
    readonly perAccount = new LoginLimiter(5),
    readonly perIp = new LoginLimiter(30),
  ) {}

  retryAfter(ip: string, username: string) {
    return Math.max(this.perAccount.retryAfter(`${ip}|${username}`), this.perIp.retryAfter(ip));
  }

  fail(ip: string, username: string) {
    this.perAccount.fail(`${ip}|${username}`);
    this.perIp.fail(ip);
  }

  success(ip: string, username: string) {
    this.perAccount.reset(`${ip}|${username}`);
  }
}
