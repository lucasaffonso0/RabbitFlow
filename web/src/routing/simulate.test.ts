import { describe, expect, it } from 'vitest';
import { headersMatch, simulate, topicMatches } from './simulate';
import type { Binding, Exchange, Queue, Topology } from '../types';

const ex = (name: string, type: string, alternateExchange: string | null = null): Exchange => ({
  name, type, alternateExchange, durable: true, autoDelete: false, internal: false, arguments: {}, policy: null,
  rates: { publishIn: 0, publishOut: 0 },
});
const q = (name: string): Queue => ({
  name, type: 'classic', durable: true, autoDelete: false, exclusive: false, arguments: {}, policy: null,
  state: 'running', deadLetterExchange: null, deadLetterRoutingKey: null, messages: 0, messagesReady: 0,
  messagesUnacked: 0, consumers: 0, rates: { publish: 0, deliver: 0, ack: 0 },
});
const b = (source: string, destination: string, routingKey = '', args: Record<string, unknown> = {},
  destinationType: 'queue' | 'exchange' = 'queue'): Binding => ({
  source, destination, destinationType, routingKey, arguments: args, propertiesKey: routingKey || '~',
});
const topo = (exchanges: Exchange[], queues: Queue[], bindings: Binding[]): Topology => ({
  vhost: '/', fetchedAt: '', exchanges, queues, bindings, consumers: [],
});

describe('topicMatches', () => {
  it.each([
    ['order.*', 'order.created', true],
    ['order.*', 'order.created.br', false],
    ['order.#', 'order', true],
    ['order.#', 'order.created.br', true],
    ['#', 'anything.at.all', true],
    ['*.created.*', 'order.created.br', true],
    ['#.br', 'order.created.br', true],
    ['a.#.z', 'a.z', true],
    ['a.#.z', 'a.b.c.z', true],
    ['a.#.z', 'a.b.c', false],
    ['order.created', 'order.cancelled', false],
  ])('%s vs %s → %s', (p, k, expected) => expect(topicMatches(p, k)).toBe(expected));
});

describe('headersMatch', () => {
  it('all exige todos', () => {
    const args = { 'x-match': 'all', a: '1', b: '2' };
    expect(headersMatch(args, { a: '1', b: '2' })).toBe(true);
    expect(headersMatch(args, { a: '1' })).toBe(false);
  });
  it('all é o padrão', () => expect(headersMatch({ a: 1 }, { a: '1' })).toBe(true));
  it('any exige ao menos um', () => {
    const args = { 'x-match': 'any', a: '1', b: '2' };
    expect(headersMatch(args, { b: '2' })).toBe(true);
    expect(headersMatch(args, { c: '3' })).toBe(false);
  });
  it('ignora chaves x- a menos que *-with-x', () => {
    expect(headersMatch({ 'x-match': 'all', 'x-foo': '1' }, {})).toBe(true);
    expect(headersMatch({ 'x-match': 'all-with-x', 'x-foo': '1' }, {})).toBe(false);
  });
});

describe('simulate', () => {
  it('direct', () => {
    const t = topo([ex('d', 'direct')], [q('q1'), q('q2')], [b('d', 'q1', 'k1'), b('d', 'q2', 'k2')]);
    expect(simulate(t, { exchange: 'd', routingKey: 'k1' }).queues).toEqual(['q1']);
  });

  it('fanout entrega a todos', () => {
    const t = topo([ex('f', 'fanout')], [q('q1'), q('q2')], [b('f', 'q1'), b('f', 'q2')]);
    expect(simulate(t, { exchange: 'f', routingKey: 'x' }).queues.sort()).toEqual(['q1', 'q2']);
  });

  it('headers', () => {
    const t = topo([ex('h', 'headers')], [q('q1')], [b('h', 'q1', '', { 'x-match': 'any', country: 'BR' })]);
    expect(simulate(t, { exchange: 'h', routingKey: '', headers: { country: 'BR' } }).queues).toEqual(['q1']);
    expect(simulate(t, { exchange: 'h', routingKey: '', headers: { country: 'PT' } }).dropped).toBe(true);
  });

  it('default exchange roteia pelo nome da queue', () => {
    const t = topo([ex('', 'direct')], [q('q1')], []);
    expect(simulate(t, { exchange: '', routingKey: 'q1' }).queues).toEqual(['q1']);
    expect(simulate(t, { exchange: '', routingKey: 'nope' }).dropped).toBe(true);
  });

  it('segue bindings exchange→exchange', () => {
    const t = topo(
      [ex('orders', 'topic'), ex('audit', 'fanout')],
      [q('orders.all'), q('audit.log')],
      [b('orders', 'orders.all', 'order.#'), b('orders', 'audit', '#', {}, 'exchange'), b('audit', 'audit.log')],
    );
    const r = simulate(t, { exchange: 'orders', routingKey: 'order.created.br' });
    expect(r.queues.sort()).toEqual(['audit.log', 'orders.all']);
    expect(r.exchanges).toEqual(['orders', 'audit']);
  });

  it('usa alternate-exchange quando nada casa', () => {
    const t = topo(
      [ex('orders', 'topic', 'unrouted'), ex('unrouted', 'fanout')],
      [q('orders.all'), q('unrouted')],
      [b('orders', 'orders.all', 'order.#'), b('unrouted', 'unrouted')],
    );
    const r = simulate(t, { exchange: 'orders', routingKey: 'payment.done' });
    expect(r.queues).toEqual(['unrouted']);
    expect(r.edgeIds).toContain('ae:orders');
    // quando casa, AE não é usada
    expect(simulate(t, { exchange: 'orders', routingKey: 'order.x' }).queues).toEqual(['orders.all']);
  });

  it('não entra em loop com ciclos', () => {
    const t = topo(
      [ex('a', 'fanout'), ex('b', 'fanout')],
      [q('q')],
      [b('a', 'b', '', {}, 'exchange'), b('b', 'a', '', {}, 'exchange'), b('b', 'q')],
    );
    expect(simulate(t, { exchange: 'a', routingKey: '' }).queues).toEqual(['q']);
  });

  it('descarta quando não há rota', () => {
    const t = topo([ex('d', 'direct')], [q('q1')], [b('d', 'q1', 'k1')]);
    const r = simulate(t, { exchange: 'd', routingKey: 'zzz' });
    expect(r.dropped).toBe(true);
    expect(r.queues).toEqual([]);
  });
});

describe('hops', () => {
  it('registra saltos em ordem com profundidade', () => {
    const t = topo(
      [ex('orders', 'topic', 'unrouted'), ex('audit', 'fanout'), ex('unrouted', 'fanout')],
      [q('orders.all'), q('audit.log'), q('unrouted')],
      [b('orders', 'orders.all', 'order.#'), b('orders', 'audit', '#', {}, 'exchange'), b('audit', 'audit.log'), b('unrouted', 'unrouted')],
    );
    const r = simulate(t, { exchange: 'orders', routingKey: 'order.x' });
    expect(r.hops.map((h) => [h.to.name, h.depth])).toEqual([['orders.all', 0], ['audit', 0], ['audit.log', 1]]);
    const ae = simulate(t, { exchange: 'orders', routingKey: 'zzz' });
    // '#' casa tudo, então audit recebe e a AE não é usada
    expect(ae.hops.some((h) => h.edgeId === 'ae:orders')).toBe(false);
  });
});
