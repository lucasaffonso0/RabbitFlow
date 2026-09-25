import { describe, expect, it } from 'vitest';
import { layout, placeNodes } from './layout';
import type { AppEdge, AppNode } from './buildGraph';

const node = (id: string, kind: 'exchange' | 'queue' = 'queue') => ({ id, data: { kind }, position: { x: 0, y: 0 } }) as unknown as AppNode;
const edge = (source: string, target: string) => ({ id: `${source}>${target}`, source, target }) as AppEdge;

describe('placeNodes', () => {
  const nodes = [node('ex:a', 'exchange'), node('q:1'), node('q:2')];
  const edges = [edge('ex:a', 'q:1'), edge('ex:a', 'q:2')];

  it('sem posições conhecidas usa o layout automático', () => {
    expect(placeNodes(nodes, edges, new Map())).toEqual(layout(nodes, edges));
  });

  it('nunca move quem já tem posição', () => {
    const known = new Map([['ex:a', { x: 999, y: -50 }], ['q:1', { x: 5, y: 5 }]]);
    const r = placeNodes(nodes, edges, known);
    expect(r.get('ex:a')).toEqual({ x: 999, y: -50 });
    expect(r.get('q:1')).toEqual({ x: 5, y: 5 });
  });

  it('nó novo encaixa relativo ao vizinho posicionado', () => {
    const auto = layout(nodes, edges);
    const known = new Map([['ex:a', { x: 1000, y: 1000 }], ['q:1', { x: 0, y: 0 }]]);
    const r = placeNodes(nodes, edges, known);
    const a = auto.get('ex:a')!;
    const q2 = auto.get('q:2')!;
    expect(r.get('q:2')).toEqual({ x: 1000 + (q2.x - a.x), y: 1000 + (q2.y - a.y) });
  });

  it('grupo sem vizinho posicionado vai para baixo do existente', () => {
    const more = [...nodes, node('ex:z', 'exchange'), node('q:z')];
    const r = placeNodes(more, [...edges, edge('ex:z', 'q:z')], new Map([['ex:a', { x: 0, y: 0 }], ['q:1', { x: 300, y: 0 }], ['q:2', { x: 300, y: 130 }]]));
    expect(r.get('ex:z')!.y).toBeGreaterThan(130);
    expect(r.get('q:z')!.y).toBeGreaterThan(130);
  });
});
