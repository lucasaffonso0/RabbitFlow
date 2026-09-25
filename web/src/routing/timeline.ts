import { cgId, exId, qId, type Topology } from '../types';
import type { SimResult } from './simulate';

/** Duração de cada salto da bolinha (exchange → destino) */
export const HOP_MS = 850;

export type Outcome = 'published' | 'dropped' | 'routed' | 'queued' | 'delivered' | 'consumed';

export interface Timeline {
  /** Muda a cada envio/replay; reinicia as animações */
  run: number;
  /** id lógico da aresta → instante (ms) em que a bolinha sai */
  edges: Map<string, number>;
  /** id do nó → instante em que a mensagem chega e o que acontece lá */
  nodes: Map<string, { at: number; outcome: Outcome }>;
  endsAt: number;
}

/** Converte o resultado da simulação na sequência temporal usada pela animação. */
export function buildTimeline(r: SimResult, topo: Topology, run: number, entry: string): Timeline {
  const edges = new Map<string, number>();
  const nodes = new Map<string, { at: number; outcome: Outcome }>();
  const consumers = new Map(topo.queues.map((q) => [q.name, q.consumers]));
  const setNode = (id: string, at: number, outcome: Outcome) => {
    const cur = nodes.get(id);
    if (!cur || at < cur.at) nodes.set(id, { at, outcome });
  };
  const setEdge = (id: string, at: number) => edges.set(id, Math.min(edges.get(id) ?? Infinity, at));

  setNode(exId(entry), 0, r.dropped ? 'dropped' : 'published');
  let endsAt = HOP_MS;

  for (const h of r.hops) {
    const leave = h.depth * HOP_MS;
    const arrive = leave + HOP_MS;
    setEdge(h.edgeId, leave);
    if (h.to.kind === 'exchange') {
      setNode(exId(h.to.name), arrive, 'routed');
    } else if ((consumers.get(h.to.name) ?? 0) > 0) {
      setNode(qId(h.to.name), arrive, 'delivered');
      setEdge(`ce:${h.to.name}`, arrive);
      setNode(cgId(h.to.name), arrive + HOP_MS, 'consumed');
      endsAt = Math.max(endsAt, arrive + HOP_MS);
    } else {
      setNode(qId(h.to.name), arrive, 'queued');
    }
    endsAt = Math.max(endsAt, arrive);
  }
  return { run, edges, nodes, endsAt };
}
