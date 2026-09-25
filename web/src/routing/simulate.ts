import { aeId, bindingId, type Binding, type Topology } from '../types';
import { t, type MessageKey, type Vars } from '../i18n';

/** Passo do roteamento, traduzido só na hora de exibir (trocar o idioma traduz simulações já feitas) */
export interface TraceStep {
  depth: number;
  key: MessageKey;
  vars: Vars;
}

export const formatTrace = (steps: TraceStep[]) => steps.map((s) => '  '.repeat(s.depth) + t(s.key, s.vars));

export interface SimInput {
  exchange: string;
  routingKey: string;
  headers?: Record<string, unknown>;
}

/** Um salto da mensagem: percorre `edgeId` saindo no instante `depth` (em saltos) */
export interface Hop {
  edgeId: string;
  from: string;
  to: { kind: 'queue' | 'exchange'; name: string };
  depth: number;
}

export interface SimResult {
  /** Saltos em ordem de percurso (base da animação) */
  hops: Hop[];
  /** Queues que receberiam a mensagem */
  queues: string[];
  /** Exchanges percorridas (inclui a de entrada) */
  exchanges: string[];
  /** IDs das arestas percorridas (bindings e alternate-exchange) */
  edgeIds: string[];
  /** Passos legíveis para exibir ao usuário */
  trace: TraceStep[];
  dropped: boolean;
}

export function topicMatches(pattern: string, key: string): boolean {
  const p = pattern.split('.');
  const k = key.split('.');
  const memo = new Map<string, boolean>();
  const go = (i: number, j: number): boolean => {
    const id = `${i},${j}`;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    let r: boolean;
    if (i === p.length) r = j === k.length;
    else if (p[i] === '#') r = go(i + 1, j) || (j < k.length && go(i, j + 1));
    else r = j < k.length && (p[i] === '*' || p[i] === k[j]) && go(i + 1, j + 1);
    memo.set(id, r);
    return r;
  };
  return go(0, 0);
}

export function headersMatch(bindingArgs: Record<string, unknown>, headers: Record<string, unknown>): boolean {
  const mode = String(bindingArgs['x-match'] ?? 'all');
  const withX = mode.endsWith('-with-x');
  const any = mode.startsWith('any');
  const keys = Object.keys(bindingArgs).filter((k) => k !== 'x-match' && (withX || !k.startsWith('x-')));
  const test = (k: string) => {
    if (!(k in headers)) return false;
    const expected = bindingArgs[k];
    // valor vazio no binding casa apenas pela presença do header
    if (expected === null || expected === undefined || expected === '') return true;
    return String(headers[k]) === String(expected);
  };
  return any ? keys.some(test) : keys.every(test);
}

function bindingMatches(type: string, b: Binding, key: string, headers: Record<string, unknown>): boolean {
  switch (type) {
    case 'fanout':
      return true;
    case 'direct':
      return b.routingKey === key;
    case 'topic':
      return topicMatches(b.routingKey, key);
    case 'headers':
      return headersMatch(b.arguments, headers);
    default:
      // tipos de plugin (x-delayed-message, x-consistent-hash...) não são simulados; aproxima como direct
      return b.routingKey === key;
  }
}

export function simulate(topo: Topology, input: SimInput): SimResult {
  const headers = input.headers ?? {};
  const key = input.routingKey;
  const exchanges = new Map(topo.exchanges.map((e) => [e.name, e]));
  const queueNames = new Set(topo.queues.map((q) => q.name));
  const bySource = new Map<string, Binding[]>();
  for (const b of topo.bindings) {
    const list = bySource.get(b.source) ?? [];
    list.push(b);
    bySource.set(b.source, list);
  }

  const queues = new Set<string>();
  const visited: string[] = [];
  const edgeIds = new Set<string>();
  const hops: Hop[] = [];
  const hop = (edgeId: string, from: string, kind: 'queue' | 'exchange', name: string, depth: number) => {
    edgeIds.add(edgeId);
    hops.push({ edgeId, from, to: { kind, name }, depth });
  };
  const trace: TraceStep[] = [];
  const label = (n: string) => (n === '' ? '(default)' : n);

  const route = (name: string, depth: number) => {
    const step = (key: MessageKey, vars: Vars) => trace.push({ depth, key, vars });
    if (visited.includes(name)) {
      step('sim.cycle', { name: label(name) });
      return;
    }
    visited.push(name);

    if (name === '') {
      if (queueNames.has(key)) {
        queues.add(key);
        const implicit = bySource.get('')?.find((b) => b.destination === key);
        hop(implicit ? bindingId(implicit) : `default:${key}`, '', 'queue', key, depth);
        step('sim.defaultToQueue', { queue: key });
      } else {
        step('sim.defaultNoQueue', { key });
      }
      return;
    }

    const ex = exchanges.get(name);
    if (!ex) {
      step('sim.exchangeMissing', { name });
      return;
    }

    const matched = (bySource.get(name) ?? []).filter((b) => bindingMatches(ex.type, b, key, headers));
    step('sim.matched', { name, type: ex.type, n: matched.length });

    if (matched.length === 0 && ex.alternateExchange) {
      step('sim.toAlternate', { name: ex.alternateExchange });
      hop(aeId(name), name, 'exchange', ex.alternateExchange, depth);
      route(ex.alternateExchange, depth + 1);
      return;
    }

    for (const b of matched) {
      hop(bindingId(b), name, b.destinationType, b.destination, depth);
      if (b.destinationType === 'queue') {
        queues.add(b.destination);
        step('sim.toQueue', { name: b.destination });
      } else {
        step('sim.toExchange', { name: b.destination });
        route(b.destination, depth + 1);
      }
    }
  };

  route(input.exchange, 0);

  return {
    queues: [...queues],
    exchanges: visited,
    edgeIds: [...edgeIds],
    hops,
    trace,
    dropped: queues.size === 0,
  };
}
