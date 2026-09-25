import { describe, expect, it } from 'vitest';
import { buildGraph, downstream, estimateTraffic, flowThrough, withoutDestination, type Filters } from './buildGraph';
import type { Binding, Exchange, Queue, Topology } from '../types';

const ex = (name: string, alternateExchange: string | null = null) =>
  ({ name, type: 'fanout', alternateExchange }) as Exchange;
const q = (name: string, deadLetterExchange: string | null = null) => ({ name, deadLetterExchange }) as Queue;
const b = (source: string, destination: string, destinationType: 'queue' | 'exchange' = 'queue') =>
  ({ source, destination, destinationType, routingKey: '', arguments: {}, propertiesKey: '~' }) as Binding;

const topo: Topology = {
  vhost: '/', fetchedAt: '', consumers: [],
  exchanges: [ex('orders', 'unrouted'), ex('audit'), ex('unrouted'), ex('dlx'), ex('other')],
  queues: [q('orders.q', 'dlx'), q('audit.q'), q('unrouted.q'), q('dead.q'), q('other.q')],
  bindings: [
    b('orders', 'orders.q'), b('orders', 'audit', 'exchange'), b('audit', 'audit.q'),
    b('unrouted', 'unrouted.q'), b('dlx', 'dead.q'), b('other', 'other.q'), b('other', 'audit', 'exchange'),
  ],
};

describe('downstream', () => {
  it('segue bindings, exchange→exchange, alternate e DLX', () => {
    const r = downstream(topo, ['orders'], true);
    expect([...r.exchanges].sort()).toEqual(['audit', 'dlx', 'orders', 'unrouted']);
    expect([...r.queues].sort()).toEqual(['audit.q', 'dead.q', 'orders.q', 'unrouted.q']);
  });

  it('não segue DLX quando desligado', () => {
    const r = downstream(topo, ['orders'], false);
    expect(r.exchanges.has('dlx')).toBe(false);
    expect(r.queues.has('dead.q')).toBe(false);
  });

  it('não sobe na direção contrária', () => {
    const r = downstream(topo, ['audit'], true);
    expect([...r.exchanges]).toEqual(['audit']);
    expect([...r.queues]).toEqual(['audit.q']);
  });

  it('lista vazia não mostra nada', () => {
    const r = downstream(topo, [], true);
    expect(r.exchanges.size + r.queues.size).toBe(0);
  });
});

describe('flowThrough', () => {
  const e = (source: string, target: string) => ({ id: `${source}>${target}`, source, target }) as never;
  const edges = [e('a', 'b'), e('b', 'c'), e('x', 'b'), e('c', 'd'), e('z', 'y')];

  it('acende o que chega e o que sai', () => {
    const r = flowThrough(['b'], edges);
    expect([...r.nodes].sort()).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect(r.edges.has('z>y')).toBe(false);
  });

  it('só para cima', () => {
    const r = flowThrough(['c'], edges, 'up');
    expect([...r.nodes].sort()).toEqual(['a', 'b', 'c', 'x']);
  });
});

describe('estimateTraffic', () => {
  const rates = (publish: number, deliver: number) => ({ publish, deliver, ack: 0 });
  const t = {
    vhost: '/', fetchedAt: '', consumers: [], bindings: [],
    exchanges: [{ name: 'a', rates: { publishIn: 0, publishOut: 0 } }, { name: 'b', rates: { publishIn: 0, publishOut: 0 } },
      { name: 'dlx', rates: { publishIn: 0, publishOut: 6 } }],
    queues: [{ name: 'q', rates: rates(10, 4) }, { name: 'r', rates: rates(3, 0) }],
  } as unknown as Topology;
  const e = (id: string, source: string, target: string, kind: string) =>
    ({ id, source, target, data: { kind, bindings: [], memberIds: [id] } }) as never;

  it('divide a entrada da queue entre as arestas que chegam e usa a entrega para consumers', () => {
    const r = estimateTraffic(t, [
      e('1', 'ex:a', 'q:q', 'binding'), e('2', 'ex:b', 'q:q', 'binding'), e('3', 'ex:a', 'q:r', 'binding'),
      e('4', 'q:q', 'cg:q', 'consumer'), e('5', 'q:q', 'ex:dlx', 'dlx'),
    ]);
    expect([r.get('1'), r.get('2'), r.get('3'), r.get('4'), r.get('5')]).toEqual([5, 5, 3, 4, 6]);
  });

  it('exchange sem estatística própria recebe o que sai dela', () => {
    // a → b (exchange→exchange); b não publica nada direto, mas entrega 3/s em r
    const r = estimateTraffic(t, [e('ab', 'ex:a', 'ex:b', 'e2e'), e('br', 'ex:b', 'q:r', 'binding')]);
    expect(r.get('ab')).toBe(3);
  });

  it('dead-letter sem taxa de publish usa o crescimento da queue', () => {
    const dl = {
      ...t,
      exchanges: [...t.exchanges, { name: 'x', rates: { publishIn: 0, publishOut: 0 } }],
      queues: [...t.queues, { name: 'dead', rates: { publish: 0, deliver: 0, ack: 0, growth: 2.5 } }],
    } as Topology;
    const r = estimateTraffic(dl, [e('d1', 'q:q', 'ex:x', 'dlx'), e('d2', 'ex:x', 'q:dead', 'binding')]);
    expect([r.get('d1'), r.get('d2')]).toEqual([2.5, 2.5]);
  });

  it('não entra em loop em ciclos de exchanges', () => {
    const r = estimateTraffic(t, [e('ab', 'ex:a', 'ex:b', 'e2e'), e('ba', 'ex:b', 'ex:a', 'e2e')]);
    expect(r.get('ab')).toBe(0);
  });
});

describe('withoutDestination', () => {
  const e = (source: string, target: string, kind = 'binding') =>
    ({ id: `${source}>${target}`, source, target, data: { kind, bindings: [], memberIds: [] } }) as never;
  const ex = ['ex:a', 'ex:b', 'ex:c', 'ex:solo', 'ex:ae'];

  it('exchange sem binding não tem destino', () => {
    expect(withoutDestination(ex, [e('ex:a', 'q:1')]).has('ex:solo')).toBe(true);
  });

  it('em cadeia: quem só entrega para exchange sem destino também some', () => {
    const dead = withoutDestination(ex, [e('ex:b', 'ex:c', 'e2e'), e('ex:a', 'q:1')]);
    expect(dead.has('ex:c')).toBe(true);
    expect(dead.has('ex:b')).toBe(true);
    expect(dead.has('ex:a')).toBe(false);
  });

  it('alternate-exchange que entrega em queue conta como destino', () => {
    const dead = withoutDestination(ex, [e('ex:a', 'ex:ae', 'ae'), e('ex:ae', 'q:x')]);
    expect(dead.has('ex:a')).toBe(false);
    expect(dead.has('ex:ae')).toBe(false);
  });

  it('ciclo sem saída para queue não tem destino', () => {
    const dead = withoutDestination(ex, [e('ex:a', 'ex:b', 'e2e'), e('ex:b', 'ex:a', 'e2e')]);
    expect(dead.has('ex:a') && dead.has('ex:b')).toBe(true);
  });
});

describe('isolar no grafo', () => {
  const rates = { publish: 0, deliver: 0, ack: 0 };
  const exc = (name: string) => ({ name, type: 'direct', arguments: {}, alternateExchange: null, rates: { publishIn: 0, publishOut: 0 } });
  const que = (name: string) => ({ name, type: 'classic', arguments: {}, state: 'running', deadLetterExchange: null, deadLetterRoutingKey: null,
    messages: 0, messagesReady: 0, messagesUnacked: 0, consumers: 0, rates });
  const bind = (source: string, destination: string) =>
    ({ source, destination, destinationType: 'queue', routingKey: destination, arguments: {}, propertiesKey: destination });
  // a default exchange liga todas as queues; antes isso fazia "isolar" trazer o grafo inteiro
  const topo = {
    vhost: '/', fetchedAt: '', consumers: [],
    exchanges: [exc(''), exc('a'), exc('b')],
    queues: [que('qa'), que('qb'), que('qc')],
    bindings: [bind('', 'qa'), bind('', 'qb'), bind('', 'qc'), bind('a', 'qa'), bind('b', 'qb')],
  } as unknown as Topology;
  const f: Filters = {
    search: '', hideAmq: true, showConsumers: true, showDlx: true, onlyWithMessages: false,
    onlyWithDestination: false, focusId: null, exchanges: null,
  };
  const em = { simulation: null, hoverId: null, alerts: false, live: false };
  const ids = (focusId: string) => buildGraph(topo, { ...f, focusId }, em).nodes.map((n) => n.id).sort();

  it('isolar uma exchange mostra só o que ela alimenta', () => {
    expect(ids('ex:a')).toEqual(['ex:a', 'q:qa']);
  });

  it('isolar uma queue mostra quem entrega para ela, sem as queues "irmãs" da default', () => {
    expect(ids('q:qa')).toEqual(['ex:', 'ex:a', 'q:qa']);
  });
});
