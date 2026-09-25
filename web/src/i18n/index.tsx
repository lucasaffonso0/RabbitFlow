import { useSyncExternalStore } from 'react';
import { LANGS, type Lang } from './define';
import { bundles, type MessageKey } from './messages';

export { LANGS, type Lang, type MessageKey };

const STORAGE_KEY = 'rv.lang';
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang;
  } catch {
    /* sem storage */
  }
  for (const pref of navigator.languages ?? [navigator.language]) {
    const p = pref.toLowerCase();
    if (p.startsWith('pt')) return 'pt-BR';
    if (p.startsWith('es')) return 'es';
    if (p.startsWith('en')) return 'en';
  }
  return 'pt-BR';
}

let current: Lang = detect();
document.documentElement.lang = current;

export const getLanguage = () => current;

/** Troca o idioma da interface (e lembra neste navegador, para a tela de login) */
export function setLanguage(lang: Lang) {
  if (lang === current || !LANGS.some((l) => l.code === lang)) return;
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* sem storage */
  }
  listeners.forEach((l) => l());
}

export type Vars = Record<string, string | number>;

/** Traduz uma chave. "{x}" recebe vars.x; "um|vários" escolhe pelo vars.n */
export function t(key: MessageKey, vars?: Vars): string {
  let msg: string = bundles[current][key] ?? bundles['pt-BR'][key] ?? key;
  if (vars && msg.includes('|') && typeof vars.n === 'number') {
    const [one, other] = msg.split('|');
    msg = vars.n === 1 ? one : (other ?? one);
  }
  return vars ? msg.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : msg;
}

/** Idioma atual; o componente re-renderiza quando ele muda */
export function useLanguage(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Use no topo do componente: garante re-render ao trocar o idioma e devolve `t` */
export function useT() {
  useLanguage();
  return t;
}

/** Números e datas no formato do idioma */
export const fmtNumber = (n: number, opts?: Intl.NumberFormatOptions) => n.toLocaleString(current, opts);
export const fmtDateTime = (ms: number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }) =>
  new Date(ms).toLocaleString(current, opts);
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(current);
