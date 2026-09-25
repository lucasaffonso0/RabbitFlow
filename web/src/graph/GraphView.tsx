import { useEffect, useRef, useState } from 'react';
import {
  Background, MiniMap, Panel, ReactFlow, useNodesInitialized, useNodesState, useReactFlow,
  type NodeChange,
} from '@xyflow/react';
import { NODE_SIZE, type AppEdge, type AppNode } from './buildGraph';
import { layout, placeNodes } from './layout';
import { LayoutStore } from './layoutStore';
import { exchangeColor, nodeTypes } from './nodes';
import { exportGraphPng } from './exportPng';
import { edgeTypes } from './FlowEdge';
import { useT } from '../i18n';

export type Selection = { type: 'node' | 'edge'; id: string } | null;

type Point = { x: number; y: number };
const UNDO_MS = 10_000;

interface Props {
  /** conexão e vhost da topologia exibida: posições e enquadramento são salvos por conexão + vhost */
  connection: number | null;
  vhost: string | null;
  nodes: AppNode[];
  edges: AppEdge[];
  selectedId: string | null;
  onSelect: (s: Selection) => void;
  onHover: (id: string | null) => void;
  /** Duplo clique fixa/solta o caminho do nó */
  onTogglePin: (id: string) => void;
  /** Pede para centralizar um nó; `n` muda a cada pedido */
  centerRequest: { id: string; n: number } | null;
  colorMode: 'system' | 'light' | 'dark';
  live: boolean;
  onLive: (on: boolean) => void;
  /** Auto-refresh pausado: as taxas não mudam, então o "ao vivo" fica congelado */
  paused: boolean;
  exportSubtitle: string;
  exportFile: string;
}

export function GraphView(p: Props) {
  const t = useT();
  const { nodes: built, edges } = p;
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const { fitView, zoomIn, zoomOut, setCenter, getZoom, getNode, setViewport } = useReactFlow();
  /** Posições de todos os nós já vistos neste vhost (inclusive os ocultos por filtro) */
  const posRef = useRef(new Map<string, Point>());
  const store = useRef<LayoutStore | null>(null);
  /** vhost cujo layout já veio do servidor; antes disso nada é posicionado */
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [undo, setUndo] = useState<Map<string, Point> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialized = useNodesInitialized();
  const pendingFit = useRef(false);
  const selectedRef = useRef(p.selectedId);
  selectedRef.current = p.selectedId;
  const [exporting, setExporting] = useState(false);

  // Carrega o layout salvo no servidor (por usuário) ao abrir um vhost
  useEffect(() => {
    if (p.vhost === null || p.connection === null) return;
    const s = new LayoutStore(p.connection, p.vhost);
    store.current = s;
    setReadyFor(null);
    setUndo(null);
    setNodes([]);
    let cancelled = false;
    s.load()
      .catch((err) => {
        console.warn('Não foi possível carregar o layout salvo', err);
        return { positions: new Map<string, Point>(), viewport: null };
      })
      .then(({ positions, viewport }) => {
        if (cancelled) return;
        posRef.current = positions;
        if (viewport) setViewport(viewport);
        else pendingFit.current = true;
        setReadyFor(`${s.connection}|${s.vhost}`);
      });
    // grava o que estiver pendente ao trocar de vhost ou fechar a aba
    const onHide = () => s.flush(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onHide);
      s.flush(true);
    };
  }, [p.connection, p.vhost, setNodes, setViewport]);

  useEffect(() => {
    if (p.vhost === null || readyFor !== `${p.connection}|${p.vhost}`) return;
    // quem já tem posição nunca se move; só nós novos ganham lugar
    const placed = placeNodes(built, edges, posRef.current);
    const added: [string, Point][] = [];
    for (const [id, pt] of placed) {
      if (!posRef.current.has(id)) {
        posRef.current.set(id, pt);
        added.push([id, pt]);
      }
    }
    if (added.length) store.current?.save(added);
    setNodes((prev) => {
      // em refresh de métricas mantém posições (inclusive as arrastadas pelo usuário)
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return built.map((n) => {
        const old = prevById.get(n.id);
        return {
          ...n,
          // mantém a medida já feita pelo React Flow: sem ela o nó fica oculto até ser medido
          // de novo, o que fazia o grafo piscar a cada hover/refresh (e às vezes sumir)
          measured: old?.measured,
          selected: n.id === selectedRef.current,
          position: posRef.current.get(n.id) ?? placed.get(n.id)!,
        };
      });
    });
  }, [built, edges, p.connection, p.vhost, readyFor, setNodes]);

  // arrasto: atualiza a posição conhecida já durante o movimento (um refresh no meio não "puxa" o nó de volta)
  const handleNodesChange = (changes: NodeChange<AppNode>[]) => {
    for (const c of changes) if (c.type === 'position' && c.position) posRef.current.set(c.id, c.position);
    onNodesChange(changes);
  };

  const applyPositions = (pos: Map<string, Point>) =>
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));

  const organize = () => {
    const before = new Map(posRef.current);
    for (const [id, pt] of layout(built, edges)) posRef.current.set(id, pt);
    store.current?.replaceAll(posRef.current);
    applyPositions(posRef.current);
    requestAnimationFrame(() => fitView({ padding: 0.1, duration: 300 }));
    clearTimeout(undoTimer.current);
    setUndo(before);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const undoOrganize = () => {
    if (!undo) return;
    posRef.current = undo;
    store.current?.replaceAll(undo);
    applyPositions(undo);
    requestAnimationFrame(() => fitView({ padding: 0.1, duration: 300 }));
    clearTimeout(undoTimer.current);
    setUndo(null);
  };

  useEffect(() => {
    setNodes((ns) => ns.map((n) => (n.selected === (n.id === p.selectedId) ? n : { ...n, selected: n.id === p.selectedId })));
  }, [p.selectedId, setNodes]);

  // enquadra só depois que o React Flow mediu os nós novos
  useEffect(() => {
    if (initialized && pendingFit.current) {
      pendingFit.current = false;
      fitView({ padding: 0.1, duration: 300 });
    }
  }, [initialized, nodes, fitView]);

  useEffect(() => {
    if (!p.centerRequest) return;
    const n = getNode(p.centerRequest.id) as AppNode | undefined;
    if (!n) return;
    const s = NODE_SIZE[n.data.kind];
    setCenter(n.position.x + s.width / 2, n.position.y + s.height / 2, { zoom: Math.max(getZoom(), 0.9), duration: 450 });
  }, [p.centerRequest, getNode, setCenter, getZoom]);

  const doExport = async () => {
    setExporting(true);
    try {
      await exportGraphPng(nodes, p.exportSubtitle, p.exportFile);
    } catch (err) {
      alert(t('graph.exportFailed', { error: (err as Error).message }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onNodeDragStop={(_, _node, dragged) =>
        store.current?.save(dragged.map((n) => [n.id, posRef.current.get(n.id) ?? n.position] as [string, Point]))
      }
      onMoveEnd={(_, vp) => store.current?.saveViewport(vp)}
      onNodeClick={(_, n) => p.onSelect({ type: 'node', id: n.id })}
      onEdgeClick={(_, e) => p.onSelect({ type: 'edge', id: e.id })}
      onPaneClick={() => p.onSelect(null)}
      onNodeMouseEnter={(_, n) => p.onHover(n.id)}
      onNodeDoubleClick={(_, n) => p.onTogglePin(n.id)}
      zoomOnDoubleClick={false}
      onNodeMouseLeave={() => p.onHover(null)}
      nodesConnectable={false}
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      colorMode={p.colorMode}
    >
      <Background gap={22} size={1.2} />
      <Panel position="top-right" className="toolbar">
        <button
          className={`live-toggle ${p.live ? 'on' : ''}`}
          onClick={() => p.onLive(!p.live)}
          aria-pressed={p.live}
          title={p.live ? t('graph.live.hide') : t('graph.live.show')}
        >
          <i />{t('graph.live.label')}{p.live && p.paused ? ` ${t('graph.live.paused')}` : ''}
        </button>
        <span className="sep" />
        <button onClick={() => zoomOut({ duration: 200 })} title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')}>−</button>
        <button onClick={() => zoomIn({ duration: 200 })} title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')}>+</button>
        <button onClick={() => fitView({ padding: 0.08, duration: 300 })} title={t('graph.fitTitle')}>⤢ {t('graph.fit')}</button>
        {undo ? (
          <button className="undo" onClick={undoOrganize} title={t('graph.undoTitle')}>↶ {t('graph.undo')}</button>
        ) : (
          <button onClick={organize} title={t('graph.organizeTitle')}>
            ⌗ {t('graph.organize')}
          </button>
        )}
        <span className="sep" />
        <button onClick={doExport} disabled={exporting || nodes.length === 0} title={t('graph.exportTitle')}>
          {exporting ? t('graph.exporting') : `⤓ ${t('graph.png')}`}
        </button>
      </Panel>
      <MiniMap
        style={{ width: 170, height: 110 }}
        pannable
        zoomable
        nodeBorderRadius={4}
        maskColor="var(--minimap-mask)"
        nodeColor={(n) => {
          const d = (n as AppNode).data;
          if (d.kind === 'exchange') return exchangeColor(d.exchange.type);
          if (d.kind === 'queue') return '#0ea5e9';
          return '#94a3b8';
        }}
      />
    </ReactFlow>
  );
}
