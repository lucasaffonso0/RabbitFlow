import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Binding, Consumer, Exchange, Queue, Topology } from '../types';
import { aeId, bindingId, cgId, dlxId, exId, qId } from '../types';
import { queueStatus } from './status';
import { fmtNumber, t } from '../i18n';
import type { Outcome, Timeline } from '../routing/timeline';

export interface Filters {
  search: string;
  showConsumers: boolean;
  showDlx: boolean;
  /** Esconde as exchanges pré-definidas do RabbitMQ (amq.*) */
  hideAmq: boolean;
  onlyWithMessages: boolean;
  /** Esconde exchanges que não levam mensagens a lugar nenhum (em cadeia) */
  onlyWithDestination: boolean;
  focusId: string | null;
  /** Exchanges marcadas no filtro; null = todas */
  exchanges: string[] | null;
}

/** O que está em destaque no momento, em ordem de prioridade */
export interface Emphasis {
  simulation: Timeline | null;
  hoverId: string | null;
  alerts: boolean;
  /** Mostra o tráfego real (bolinhas contínuas) estimado pelas taxas */
  live: boolean;
}

export type SimMark = { at: number; outcome: Outcome; run: number };
type Visual = { dim: boolean; hl: boolean; sim?: SimMark };
export type ExchangeNodeData = Visual & { kind: 'exchange'; exchange: Exchange; outCount: number };
export type QueueNodeData = Visual & { kind: 'queue'; queue: Queue; maxReady: number };
export type ConsumersNodeData = Visual & { kind: 'consumers'; queue: string; consumers: Consumer[] };
export type AnyNodeData = ExchangeNodeData | QueueNodeData | ConsumersNodeData;
export type EdgeKind = 'binding' | 'e2e' | 'dlx' | 'ae' | 'consumer';
/** memberIds: IDs lógicos representados pela aresta (vários bindings entre o mesmo par viram uma aresta só) */
export type AppEdgeData = {
  kind: EdgeKind;
  bindings: Binding[];
  memberIds: string[];
  /** Bolinha da simulação: sai em `at` ms; `run` reinicia a animação */
  pulse?: { at: number; run: number };
  /** Tráfego estimado em msg/s (só com "ao vivo" ligado) */
  rate?: number;
};

export type AppNode = Node<AnyNodeData>;
export type AppEdge = Edge<AppEdgeData>;

export const NODE_SIZE: Record<AnyNodeData['kind'], { width: number; height: number }> = {
  exchange: { width: 232, height: 78 },
  queue: { width: 256, height: 112 },
  consumers: { width: 208, height: 56 },
};

export const EDGE_COLORS: Record<EdgeKind, string> = {
  binding: 'var(--edge)',
  e2e: '#8b5cf6',
  dlx: '#ef4444',
  ae: '#f59e0b',
  consumer: 'var(--edge-muted)',
};

export const edgeLabel = (kind: EdgeKind): string => t(`graph.edge.${kind}`);

const MAX_LABEL = 26;

export const exchangeLabel = (name: string) => (name === '' ? '(default)' : name);

function bindingLabel(b: Binding, sourceType: string | undefined): string | undefined {
  if (sourceType === 'headers') {
    // formato curto: "any: country=BR, lang=pt"
    const mode = String(b.arguments['x-match'] ?? 'all');
    const entries = Object.entries(b.arguments).filter(([k]) => k !== 'x-match');
    return entries.length ? `${mode}: ${entries.map(([k, v]) => `${k}=${String(v)}`).join(', ')}` : undefined;
  }
  if (sourceType === 'fanout') return undefined;
  return b.routingKey === '' ? '""' : b.routingKey;
}

/** Monta nós e arestas (sem posição) aplicando filtros e destaques. */
export function buildGraph(topo: Topology, f: Filters, emphasis: Emphasis) {
  const reach = f.exchanges ? downstream(topo, f.exchanges, f.showDlx) : null;
  const exVisible = (e: Exchange) =>
    !(f.hideAmq && e.name.startsWith('amq.')) &&
    (!reach || reach.exchanges.has(e.name));
  const exchanges = topo.exchanges.filter(exVisible);
  const queues = topo.queues.filter(
    (q) => (!f.onlyWithMessages || q.messages > 0) && (!reach || reach.queues.has(q.name)),
  );
  const exNames = new Set(exchanges.map((e) => e.name));
  const qNames = new Set(queues.map((q) => q.name));
  const exType = new Map(topo.exchanges.map((e) => [e.name, e.type]));
  const maxReady = Math.max(0, ...queues.map((q) => q.messagesReady));

  let edges: AppEdge[] = [];
  const edge = (id: string, source: string, target: string, kind: EdgeKind, label?: string): AppEdge => ({
    id, source, target, label, type: 'flow',
    data: { kind, bindings: [], memberIds: [id] },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[kind], width: 14, height: 14 },
    style: {
      stroke: EDGE_COLORS[kind],
      strokeWidth: kind === 'consumer' ? 1.25 : 1.6,
      strokeDasharray: kind === 'dlx' ? '6 4' : kind === 'ae' ? '2 4' : undefined,
    },
    labelStyle: { fill: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--mono)' },
    labelBgStyle: { fill: 'var(--panel)', stroke: 'var(--border)', strokeWidth: 1 },
    labelBgPadding: [5, 2],
    labelBgBorderRadius: 4,
  });

  const grouped = new Map<string, AppEdge>();
  for (const b of topo.bindings) {
    if (!exNames.has(b.source)) continue;
    const toQueue = b.destinationType === 'queue';
    if (toQueue ? !qNames.has(b.destination) : !exNames.has(b.destination)) continue;
    const source = exId(b.source);
    const target = toQueue ? qId(b.destination) : exId(b.destination);
    const label = bindingLabel(b, exType.get(b.source));
    const existing = grouped.get(`${source}>${target}`);
    if (existing) {
      existing.data!.bindings.push(b);
      existing.data!.memberIds.push(bindingId(b));
      if (label) existing.label = existing.label ? `${existing.label}, ${label}` : label;
      continue;
    }
    const e = edge(bindingId(b), source, target, toQueue ? 'binding' : 'e2e', label);
    e.data!.bindings = [b];
    grouped.set(`${source}>${target}`, e);
    edges.push(e);
  }

  for (const e of exchanges) {
    if (e.alternateExchange && exNames.has(e.alternateExchange)) {
      edges.push(edge(aeId(e.name), exId(e.name), exId(e.alternateExchange), 'ae', t('graph.edge.aeLabel')));
    }
  }

  if (f.showDlx) {
    for (const q of queues) {
      if (q.deadLetterExchange !== null && exNames.has(q.deadLetterExchange)) {
        edges.push(edge(dlxId(q.name), qId(q.name), exId(q.deadLetterExchange), 'dlx', t('graph.edge.dlxLabel')));
      }
    }
  }

  let shownExchanges = exchanges;
  if (f.onlyWithDestination) {
    const dead = withoutDestination(exchanges.map((e) => exId(e.name)), edges);
    edges = edges.filter((e) => !dead.has(e.source) && !dead.has(e.target));
    shownExchanges = exchanges.filter((e) => !dead.has(exId(e.name)));
  }

  const outCount = new Map<string, number>();
  for (const e of edges) outCount.set(e.source, (outCount.get(e.source) ?? 0) + 1);

  let nodes: AppNode[] = [
    ...shownExchanges.map((e): AppNode => ({
      id: exId(e.name), type: 'exchange', position: { x: 0, y: 0 },
      data: { kind: 'exchange', exchange: e, outCount: outCount.get(exId(e.name)) ?? 0, dim: false, hl: false },
    })),
    ...queues.map((q): AppNode => ({
      id: qId(q.name), type: 'queue', position: { x: 0, y: 0 },
      data: { kind: 'queue', queue: q, maxReady, dim: false, hl: false },
    })),
  ];

  if (f.showConsumers) {
    const byQueue = new Map<string, Consumer[]>();
    for (const c of topo.consumers) {
      if (!qNames.has(c.queue)) continue;
      byQueue.set(c.queue, [...(byQueue.get(c.queue) ?? []), c]);
    }
    for (const [queue, consumers] of byQueue) {
      nodes.push({
        id: cgId(queue), type: 'consumers', position: { x: 0, y: 0 },
        data: { kind: 'consumers', queue, consumers, dim: false, hl: false },
      });
      edges.push(edge(`ce:${queue}`, qId(queue), cgId(queue), 'consumer'));
    }
  }

  // Isolar: mantém só o fluxo que passa pelo nó (de onde vêm e para onde vão as mensagens).
  // Não usa "tudo que está conectado": a default exchange liga todas as queues e traria o grafo inteiro.
  if (f.focusId && nodes.some((n) => n.id === f.focusId)) {
    const flow = flowThrough([f.focusId], edges);
    nodes = nodes.filter((n) => flow.nodes.has(n.id));
    edges = edges.filter((e) => flow.edges.has(e.id));
  }

  // rótulos longos poluem o grafo; o texto completo fica no painel de detalhes
  for (const e of edges) {
    if (typeof e.label === 'string' && e.label.length > MAX_LABEL) e.label = `${e.label.slice(0, MAX_LABEL - 1)}…`;
  }

  if (emphasis.live && !emphasis.simulation) {
    const rates = estimateTraffic(topo, edges);
    for (const e of edges) {
      const rate = rates.get(e.id) ?? 0;
      e.data = { ...e.data!, rate };
      if (rate <= 0) continue;
      const digits = rate >= 10 ? 0 : 1;
      const txt = `${fmtNumber(rate, { minimumFractionDigits: digits, maximumFractionDigits: digits })}/s`;
      e.label = e.label ? `${e.label} · ${txt}` : txt;
      // mais volume, linha mais grossa (escala log para não explodir)
      e.style = { ...e.style, strokeWidth: 1.6 + Math.min(3.4, Math.log10(rate + 1) * 1.7) };
    }
  }

  applyEmphasis(nodes, edges, f, emphasis);
  return { nodes, edges };
}

/** Decide o que fica aceso: simulação > hover > alertas > busca. */
function applyEmphasis(nodes: AppNode[], edges: AppEdge[], f: Filters, em: Emphasis) {
  let lit: Set<string> | null = null;
  let litEdges: Set<string> | null = null;
  let hl = new Set<string>();
  let accent = false;

  if (em.simulation) {
    const t = em.simulation;
    lit = new Set(t.nodes.keys());
    litEdges = new Set();
    for (const e of edges) {
      const starts = e.data!.memberIds.map((id) => t.edges.get(id)).filter((v): v is number => v !== undefined);
      if (!starts.length) continue;
      litEdges.add(e.id);
      e.data = { ...e.data!, pulse: { at: Math.min(...starts), run: t.run } };
    }
    for (const n of nodes) {
      const mark = t.nodes.get(n.id);
      if (mark) n.data = { ...n.data, sim: { ...mark, run: t.run } } as AnyNodeData;
    }
    accent = true;
  } else if (em.hoverId && nodes.some((n) => n.id === em.hoverId)) {
    ({ nodes: lit, edges: litEdges } = flowThrough([em.hoverId], edges));
  } else if (em.alerts) {
    const alerting = nodes
      .filter((n) => n.data.kind === 'queue' && queueStatus(n.data.queue) === 'warn')
      .map((n) => n.id);
    ({ nodes: lit, edges: litEdges } = flowThrough(alerting, edges, 'up'));
    hl = new Set(alerting);
  } else if (f.search.trim()) {
    const term = f.search.trim().toLowerCase();
    const matches = new Set(nodes.filter((n) => nodeName(n).toLowerCase().includes(term)).map((n) => n.id));
    lit = new Set(matches);
    litEdges = new Set();
    for (const e of edges) {
      if (matches.has(e.source) || matches.has(e.target)) {
        lit.add(e.source);
        lit.add(e.target);
        litEdges.add(e.id);
      }
    }
    hl = matches;
  }

  if (!lit || !litEdges) return;
  for (const n of nodes) n.data = { ...n.data, dim: !lit.has(n.id), hl: hl.has(n.id) } as AnyNodeData;
  // na simulação o destaque vem da animação, não do anel laranja estático
  if (accent) for (const n of nodes) n.data = { ...n.data, hl: false } as AnyNodeData;
  for (const e of edges) {
    if (litEdges.has(e.id)) {
      e.zIndex = 10;
      e.style = { ...e.style, strokeWidth: Math.max(2.4, Number(e.style?.strokeWidth ?? 0)) };
      if (accent) {
        e.style = { ...e.style, stroke: 'var(--accent)', strokeWidth: 3 };
        e.markerEnd = { type: MarkerType.ArrowClosed, color: 'var(--accent)', width: 14, height: 14 };
      }
    } else {
      dimEdge(e, 0.1);
    }
  }
}

function dimEdge(e: AppEdge, opacity: number) {
  e.style = { ...e.style, opacity };
  e.labelStyle = { ...e.labelStyle, opacity };
  e.labelBgStyle = { ...e.labelBgStyle, opacity };
}

/** Caminho completo que passa pelos nós: tudo que chega (up) e/ou tudo que sai (down). */
export function flowThrough(starts: string[], edges: AppEdge[], dir: 'both' | 'up' | 'down' = 'both') {
  const nodes = new Set(starts);
  const hit = new Set<string>();
  const walk = (forward: boolean) => {
    const seen = new Set(starts);
    const stack = [...starts];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of edges) {
        const from = forward ? e.source : e.target;
        const to = forward ? e.target : e.source;
        if (from !== cur) continue;
        hit.add(e.id);
        nodes.add(to);
        if (!seen.has(to)) {
          seen.add(to);
          stack.push(to);
        }
      }
    }
  };
  if (dir !== 'up') walk(true);
  if (dir !== 'down') walk(false);
  return { nodes, edges: hit };
}

/**
 * Estima msg/s por aresta a partir das taxas que o RabbitMQ expõe (por queue e por exchange;
 * não há taxa por binding no modo de estatísticas padrão):
 * - → queue: taxa de entrada da queue, dividida entre as arestas que chegam nela; se a queue
 *   não tem taxa de publish (entrada via dead-letter), usa o crescimento entre leituras
 * - → exchange: saída da exchange; se ela não tem estatística própria (só recebe de outras
 *   exchanges, DLX ou alternate), usa a soma do que sai dela — o que entra é o que sai
 * - queue → consumers: taxa de entrega da queue (exata)
 */
export function estimateTraffic(topo: Topology, edges: AppEdge[]): Map<string, number> {
  const queues = new Map(topo.queues.map((q) => [qId(q.name), q]));
  const exchanges = new Map(topo.exchanges.map((e) => [exId(e.name), e]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, AppEdge[]>();
  for (const e of edges) {
    if (e.data!.kind === 'consumer') continue;
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
  }

  // sem taxa de publish (ex.: só recebe por dead-letter), estima pelo crescimento + o que saiu
  const queueIn = (q: Queue) =>
    q.rates.publish > 0 ? q.rates.publish : Math.max(0, (q.rates.growth ?? 0) + q.rates.deliver);
  const intoExchange = new Map<string, number>();
  const visiting = new Set<string>();
  const exchangeRate = (id: string): number => {
    const cached = intoExchange.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // ciclo exchange→exchange
    visiting.add(id);
    const own = exchanges.get(id)?.rates.publishOut ?? 0;
    const rate = own > 0 ? own : (outgoing.get(id) ?? []).reduce((sum, e) => sum + edgeRate(e), 0);
    visiting.delete(id);
    intoExchange.set(id, rate);
    return rate;
  };
  const edgeRate = (e: AppEdge): number => {
    if (e.data!.kind === 'consumer') return queues.get(e.source)?.rates.deliver ?? 0;
    const share = incoming.get(e.target) ?? 1;
    const q = queues.get(e.target);
    if (q) return queueIn(q) / share;
    return exchanges.has(e.target) ? exchangeRate(e.target) / share : 0;
  };

  return new Map(edges.map((e) => [e.id, edgeRate(e)]));
}

/**
 * Exchanges que não entregam para nada visível. Em cadeia: se A só entrega para B e B não entrega
 * para ninguém, os dois ficam sem destino. Queues são sempre destino válido.
 */
export function withoutDestination(exchangeIds: string[], edges: AppEdge[]): Set<string> {
  // "vivas" = conseguem chegar a alguma queue; calculado de trás para frente (cobre ciclos)
  const isExchange = new Set(exchangeIds);
  const routes = edges.filter((e) => e.data!.kind !== 'consumer' && isExchange.has(e.source));
  const alive = new Set(routes.filter((e) => !isExchange.has(e.target)).map((e) => e.source));
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of routes) {
      if (!alive.has(e.source) && alive.has(e.target)) {
        alive.add(e.source);
        grew = true;
      }
    }
  }
  return new Set(exchangeIds.filter((id) => !alive.has(id)));
}

export function nodeName(n: AppNode): string {
  const d = n.data;
  if (d.kind === 'exchange') return exchangeLabel(d.exchange.name);
  if (d.kind === 'queue') return d.queue.name;
  return t('graph.nodeName.consumers', { queue: d.queue });
}

/**
 * Tudo que pode receber mensagens das exchanges escolhidas: queues ligadas, exchanges
 * ligadas (exchange→exchange), alternate-exchanges e, opcionalmente, dead-letter exchanges.
 */
export function downstream(topo: Topology, roots: string[], followDlx: boolean) {
  const exchanges = new Set<string>();
  const queues = new Set<string>();
  const exByName = new Map(topo.exchanges.map((e) => [e.name, e]));
  const qByName = new Map(topo.queues.map((q) => [q.name, q]));
  const stack = [...roots];
  while (stack.length) {
    const name = stack.pop()!;
    if (exchanges.has(name) || !exByName.has(name)) continue;
    exchanges.add(name);
    const ae = exByName.get(name)!.alternateExchange;
    if (ae) stack.push(ae);
    for (const b of topo.bindings) {
      if (b.source !== name) continue;
      if (b.destinationType === 'exchange') {
        stack.push(b.destination);
      } else if (!queues.has(b.destination)) {
        queues.add(b.destination);
        const dlx = qByName.get(b.destination)?.deadLetterExchange;
        if (followDlx && dlx !== null && dlx !== undefined) stack.push(dlx);
      }
    }
  }
  return { exchanges, queues };
}

/** Chave que muda só quando a estrutura (não as métricas) muda. */
export function structureKey(nodes: AppNode[], edges: AppEdge[]): string {
  return nodes.map((n) => n.id).sort().join('|') + '#' + edges.map((e) => e.id).sort().join('|');
}
