import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Topology } from './types';

/**
 * Busca a topologia do vhost da conexão e repete a cada `intervalMs` (0 = pausado).
 * Só devolve dados da conexão/vhost atuais: ao trocar, nunca aparece a topologia anterior.
 */
export function useTopology(connection: number | null, vhost: string | null, intervalMs: number) {
  const key = connection !== null && vhost !== null ? `${connection}|${vhost}` : null;
  const [state, setState] = useState<{ key: string; topo: Topology } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  const prev = useRef<Topology | null>(null);

  const load = useCallback(async () => {
    if (connection === null || vhost === null) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const t = await api.topology(connection, vhost);
      if (id !== reqId.current) return;
      withGrowth(t, prev.current);
      prev.current = t;
      setState({ key: `${connection}|${vhost}`, topo: t });
      setError(null);
    } catch (err) {
      if (id === reqId.current) setError((err as Error).message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [connection, vhost]);

  useEffect(() => {
    setState(null);
    setError(null);
    prev.current = null;
    load();
  }, [load]);

  useEffect(() => {
    if (!intervalMs) return;
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);

  const data = state && state.key === key ? state.topo : null;
  return { data, error, loading, reload: load };
}

/**
 * Mensagens que chegam por dead-letter não contam como "publish" nas estatísticas da queue.
 * O crescimento entre duas leituras permite estimar essa entrada.
 */
function withGrowth(t: Topology, before: Topology | null) {
  if (!before || before.vhost !== t.vhost) return;
  const dt = (Date.parse(t.fetchedAt) - Date.parse(before.fetchedAt)) / 1000;
  if (!(dt > 0)) return;
  const old = new Map(before.queues.map((q) => [q.name, q.messages]));
  for (const q of t.queues) {
    const m = old.get(q.name);
    if (m !== undefined) q.rates.growth = (q.messages - m) / dt;
  }
}
