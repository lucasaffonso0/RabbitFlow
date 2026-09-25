import { api, type Point, type Viewport } from '../api';

const SAVE_DELAY = 400;
const VIEWPORT_DELAY = 600;

/**
 * Sincroniza posições e enquadramento de um vhost com o servidor (por usuário).
 * Junta alterações em lotes e reenvia o que falhar na próxima gravação.
 */
export class LayoutStore {
  private dirty = new Map<string, Point>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private vpTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingViewport: Viewport | null = null;

  constructor(readonly connection: number, readonly vhost: string) {}

  /** Carrega do servidor; na 1ª vez, migra o que estava salvo só no navegador */
  async load(): Promise<{ positions: Map<string, Point>; viewport: Viewport | null }> {
    const res = await api.layout(this.connection, this.vhost);
    let positions = res.positions;
    let viewport = res.viewport;
    if (Object.keys(positions).length === 0) {
      const local = readLegacy<Record<string, Point>>(`rv.pos:${this.vhost}`);
      if (local && Object.keys(local).length) {
        positions = local;
        await api.savePositions(this.connection, this.vhost, local, true);
        viewport = viewport ?? readLegacy<Viewport>(`rv.vp:${this.vhost}`);
        if (viewport) await api.saveViewport(this.connection, this.vhost, viewport);
      }
      removeLegacy(`rv.pos:${this.vhost}`);
      removeLegacy(`rv.vp:${this.vhost}`);
    }
    return { positions: new Map(Object.entries(positions)), viewport };
  }

  save(entries: Iterable<[string, Point]>) {
    for (const [id, p] of entries) this.dirty.set(id, p);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
  }

  /** Substitui todo o layout do vhost (Organizar / Desfazer) */
  replaceAll(positions: Map<string, Point>) {
    clearTimeout(this.timer);
    this.dirty.clear();
    api.savePositions(this.connection, this.vhost, Object.fromEntries(positions), true).catch((err) => {
      console.warn('Não foi possível salvar o layout', err);
      this.save(positions);
    });
  }

  saveViewport(vp: Viewport) {
    this.pendingViewport = vp;
    clearTimeout(this.vpTimer);
    this.vpTimer = setTimeout(() => this.flushViewport(), VIEWPORT_DELAY);
  }

  /** Envia o que estiver pendente (keepalive: funciona mesmo ao fechar a aba) */
  flush(keepalive = false) {
    clearTimeout(this.timer);
    if (this.dirty.size) {
      const batch = new Map(this.dirty);
      this.dirty.clear();
      api.savePositions(this.connection, this.vhost, Object.fromEntries(batch), false, keepalive).catch((err) => {
        console.warn('Não foi possível salvar o layout', err);
        for (const [id, p] of batch) if (!this.dirty.has(id)) this.dirty.set(id, p);
      });
    }
    if (keepalive) this.flushViewport(true);
  }

  private flushViewport(keepalive = false) {
    clearTimeout(this.vpTimer);
    if (!this.pendingViewport) return;
    const vp = this.pendingViewport;
    this.pendingViewport = null;
    api.saveViewport(this.connection, this.vhost, vp, keepalive).catch(() => undefined);
  }
}

function readLegacy<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : (JSON.parse(v) as T);
  } catch {
    return null;
  }
}

function removeLegacy(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* sem storage */
  }
}
