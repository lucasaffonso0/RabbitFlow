import dagre from '@dagrejs/dagre';
import { NODE_SIZE, type AppEdge, type AppNode } from './buildGraph';

export function layout(nodes: AppNode[], edges: AppEdge[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 22, ranksep: 120, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  // cópia: o dagre grava x/y no objeto passado
  for (const n of nodes) g.setNode(n.id, { ...NODE_SIZE[n.data.kind] });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    const s = NODE_SIZE[n.data.kind];
    pos.set(n.id, { x: p.x - s.width / 2, y: p.y - s.height / 2 });
  }
  return pos;
}

type Point = { x: number; y: number };

/**
 * Posiciona os nós respeitando o que já tem posição (arrastado pelo usuário ou salvo):
 * só nós novos recebem lugar. Cada nó novo é ancorado num vizinho já posicionado, mantendo
 * o mesmo deslocamento relativo que o layout automático daria — assim ele "encaixa" sem mover
 * nada. Nós sem vizinho posicionado vão para baixo do que já existe.
 */
export function placeNodes(nodes: AppNode[], edges: AppEdge[], known: Map<string, Point>): Map<string, Point> {
  const result = new Map<string, Point>();
  const missing = new Set<string>();
  for (const n of nodes) {
    const p = known.get(n.id);
    if (p) result.set(n.id, p);
    else missing.add(n.id);
  }
  if (missing.size === 0) return result;

  const auto = layout(nodes, edges);
  if (result.size === 0) return auto; // nada posicionado ainda: layout automático completo

  const neighbors = new Map<string, string[]>();
  for (const e of edges) {
    neighbors.set(e.source, [...(neighbors.get(e.source) ?? []), e.target]);
    neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), e.source]);
  }

  // ancora em ondas: um nó recém-colocado pode servir de âncora para o próximo
  let progress = true;
  while (missing.size && progress) {
    progress = false;
    for (const id of [...missing]) {
      const anchor = (neighbors.get(id) ?? []).find((nb) => result.has(nb));
      if (!anchor) continue;
      const a = result.get(anchor)!;
      const da = auto.get(anchor)!;
      const d = auto.get(id)!;
      result.set(id, { x: a.x + (d.x - da.x), y: a.y + (d.y - da.y) });
      missing.delete(id);
      progress = true;
    }
  }

  if (missing.size) {
    // grupos soltos: abaixo de tudo, preservando a forma do layout automático
    const maxY = Math.max(...[...result.values()].map((p) => p.y)) + 160;
    const minX = Math.min(...[...result.values()].map((p) => p.x));
    const pts = [...missing].map((id) => auto.get(id)!);
    const ox = Math.min(...pts.map((p) => p.x));
    const oy = Math.min(...pts.map((p) => p.y));
    for (const id of missing) {
      const d = auto.get(id)!;
      result.set(id, { x: minX + (d.x - ox), y: maxY + (d.y - oy) });
    }
  }
  return result;
}
