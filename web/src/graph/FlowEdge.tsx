import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { AppEdgeData, EdgeKind } from './buildGraph';
import { HOP_MS } from '../routing/timeline';

/** Aresta padrão + bolinha animada quando uma mensagem simulada passa por ela. */
export function FlowEdge(p: EdgeProps<Edge<AppEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath(p);
  const pulse = p.data?.pulse;
  return (
    <>
      <BaseEdge
        id={p.id}
        path={path}
        markerEnd={p.markerEnd}
        style={p.style}
        label={p.label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={p.labelStyle}
        labelShowBg={p.labelShowBg}
        labelBgStyle={p.labelBgStyle}
        labelBgPadding={p.labelBgPadding}
        labelBgBorderRadius={p.labelBgBorderRadius}
        interactionWidth={p.interactionWidth}
      />
      {pulse && <Pulse key={pulse.run} path={path} delay={pulse.at} />}
      {!pulse && p.data?.rate ? (
        // aresta esmaecida (hover/busca) não mostra tráfego
        Number(p.style?.opacity ?? 1) >= 0.5 && <LiveDots path={path} rate={p.data.rate} kind={p.data.kind} />
      ) : null}
    </>
  );
}

function Pulse({ path, delay }: { path: string; delay: number }) {
  const [phase, setPhase] = useState<'wait' | 'run' | 'done'>('wait');
  const motion = useRef<SVGAnimateMotionElement>(null);

  useEffect(() => {
    const start = setTimeout(() => setPhase('run'), delay);
    const end = setTimeout(() => setPhase('done'), delay + HOP_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [delay]);

  useLayoutEffect(() => {
    if (phase === 'run') motion.current?.beginElement();
  }, [phase]);

  if (phase !== 'run') return null;
  return (
    <g className="msg-pulse" pointerEvents="none">
      <circle r={16} className="msg-glow" />
      <circle r={8} className="msg-dot" />
      <animateMotion
        ref={motion}
        dur={`${HOP_MS}ms`}
        begin="indefinite"
        fill="freeze"
        path={path}
        calcMode="spline"
        keyTimes="0;1"
        keySplines="0.45 0 0.35 1"
      />
    </g>
  );
}

const LIVE_COLORS: Record<EdgeKind, string> = {
  binding: 'var(--queue)',
  e2e: '#8b5cf6',
  dlx: '#ef4444',
  ae: '#f59e0b',
  consumer: 'var(--ok)',
};

/**
 * Tráfego contínuo: a quantidade de bolinhas simultâneas cresce com a taxa (escala log),
 * então 1 msg/s e 1.000 msg/s ficam visualmente distintos sem poluir.
 */
function LiveDots({ path, rate, kind }: { path: string; rate: number; kind: EdgeKind }) {
  const count = Math.max(1, Math.min(6, Math.round(1 + Math.log2(rate + 1) / 1.6)));
  const dur = Math.max(1.1, 2.6 - Math.log10(rate + 1) * 0.6);
  return (
    <g className="live-dots" pointerEvents="none" style={{ ['--live' as string]: LIVE_COLORS[kind] }}>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} r={5} className="live-dot">
          {/* begin negativo espalha as bolinhas ao longo da linha desde o primeiro quadro */}
          <animateMotion dur={`${dur}s`} begin={`${(-i * dur) / count}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </g>
  );
}

export const edgeTypes = { flow: FlowEdge };
