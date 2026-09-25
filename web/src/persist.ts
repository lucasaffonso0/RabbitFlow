/**
 * Preferências salvas no navegador (filtros, aba, tema…). Ficam separadas por usuário logado,
 * para duas pessoas no mesmo navegador não se misturarem. Sem storage (aba privada, bloqueio)
 * tudo segue funcionando, só não persiste.
 */
let userPrefix = '';

/** Define o usuário dono das preferências; na 1ª vez herda as preferências de antes do login */
export function setPrefsUser(userId: number | null) {
  userPrefix = userId === null ? '' : `u${userId}:`;
  if (userId === null) return;
  try {
    if (localStorage.getItem('rv.__migrated') !== null) return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('rv.') && !key.startsWith('rv.pos:') && !key.startsWith('rv.vp:')) {
        localStorage.setItem(userPrefix + key, localStorage.getItem(key)!);
      }
    }
    localStorage.setItem('rv.__migrated', String(userId));
  } catch {
    /* sem storage */
  }
}

export function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(userPrefix + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(userPrefix + key, JSON.stringify(value));
  } catch {
    /* sem storage: ignora */
  }
}
