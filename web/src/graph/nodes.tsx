import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ConsumersNodeData, ExchangeNodeData, QueueNodeData, SimMark } from './buildGraph';
import { exchangeLabel } from './buildGraph';
import { queueStatus, statusHelp, statusLabel } from './status';
import { fmtNumber, t, useT, type MessageKey } from '../i18n';

export const EXCHANGE_COLORS: Record<string, string> = {
  direct: '#3b82f6',
  topic: '#8b5cf6',
  fanout: '#10b981',
  headers: '#f59e0b',
};
export const exchangeColor = (type: string) => EXCHANGE_COLORS[type] ?? '#64748b';

/** Como cada tipo de exchange decide para onde a mensagem vai */
const EXCHANGE_HINT_KEYS: Record<string, MessageKey> = {
  direct: 'graph.hint.direct',
  topic: 'graph.hint.topic',
  fanout: 'graph.hint.fanout',
  headers: 'graph.hint.headers',
};
export const exchangeHint = (type: string): string => t(EXCHANGE_HINT_KEYS[type] ?? 'graph.hint.plugin');

const fixed = (n: number, digits: number) =>
  fmtNumber(n, { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtRate = (n: number) => (n === 0 ? '0' : fixed(n, n >= 10 ? 0 : 1));
export const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${fixed(n / 1_000_000, 1)}M` : n >= 10_000 ? `${fixed(n / 1000, 1)}k` : fmtNumber(n);

const SIM_BADGE: Record<SimMark['outcome'], MessageKey | '+1' | null> = {
  published: 'graph.sim.published',
  dropped: 'graph.sim.dropped',
  routed: null,
  queued: 'graph.sim.queued',
  delivered: '+1',
  consumed: 'graph.sim.consumed',
};

/** Selo + onda que aparecem quando a mensagem simulada chega no nó */
function SimArrival({ sim }: { sim?: SimMark }) {
  const t = useT();
  if (!sim) return null;
  const badge = SIM_BADGE[sim.outcome];
  const text = badge === '+1' || badge === null ? badge : t(badge);
  const style = { animationDelay: `${sim.at}ms` };
  return (
    <span key={sim.run} className="sim-arrival">
      <span className={`sim-ring o-${sim.outcome}`} style={style} />
      {text && (
        <span
          className={`sim-badge o-${sim.outcome}`}
          // "+1" aparece e some; os demais selos ficam
          style={sim.outcome === 'delivered' ? { animationDelay: `${sim.at}ms, ${sim.at + 1200}ms` } : style}
        >
          {text}
        </span>
      )}
    </span>
  );
}

const cls = (d: { dim: boolean; hl: boolean }, base: string, selected: boolean) =>
  [base, d.dim && 'dim', d.hl && 'hl', selected && 'selected'].filter(Boolean).join(' ');

export function ExchangeNode({ data, selected }: NodeProps<Node<ExchangeNodeData>>) {
  const t = useT();
  const e = data.exchange;
  return (
    <div className={cls(data, 'node node-exchange', selected)} style={{ ['--c' as string]: exchangeColor(e.type) }}>
      <Handle type="target" position={Position.Left} />
      <SimArrival sim={data.sim} />
      <div className="node-head">
        <span className="kind">{t('graph.kind.exchange')}</span>
        <span className="type-tag">{e.type}</span>
      </div>
      <div className="node-title" title={exchangeLabel(e.name)}>{exchangeLabel(e.name)}</div>
      <div className="node-foot">
        <span>{exchangeHint(e.type)}</span>
        {e.rates.publishIn > 0 && <span className="rate">{fmtRate(e.rates.publishIn)}/s</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function QueueNode({ data, selected }: NodeProps<Node<QueueNodeData>>) {
  const t = useT();
  const q = data.queue;
  const status = queueStatus(q);
  // escala log: diferenças entre 10 e 10.000 continuam visíveis
  const depth = data.maxReady > 0 ? Math.log10(q.messagesReady + 1) / Math.log10(data.maxReady + 1) : 0;
  return (
    <div className={cls(data, `node node-queue st-${status}`, selected)}>
      <Handle type="target" position={Position.Left} />
      <SimArrival sim={data.sim} />
      <div className="node-head">
        <span className="kind">{t('graph.kind.queue')}{q.type !== 'classic' ? ` · ${q.type}` : ''}</span>
        {q.deadLetterExchange !== null && <span className="tag-dlx" title={t('graph.queue.dlxTitle')}>DLX</span>}
        <span className={`status st-${status}`} title={statusHelp(status)}>
          <i />{statusLabel(status)}
        </span>
      </div>
      <div className="node-title" title={q.name}>{q.name}</div>
      <div className="q-stats">
        <div title={t('graph.queue.readyTitle')}>
          <b>{fmtNum(q.messagesReady)}</b><span>{t('graph.queue.ready')}</span>
        </div>
        <div title={t('graph.queue.unackedTitle')}>
          <b>{fmtNum(q.messagesUnacked)}</b><span>{t('graph.queue.unacked')}</span>
        </div>
        <div title={t('graph.queue.rateTitle')}>
          <b>{fmtRate(q.rates.publish)}<small>↓</small> {fmtRate(q.rates.deliver)}<small>↑</small></b><span>{t('graph.queue.rate')}</span>
        </div>
      </div>
      <div className="depth" title={t('graph.queue.depthTitle', { n: q.messagesReady })}>
        <div style={{ width: `${Math.max(q.messagesReady > 0 ? 3 : 0, depth * 100)}%` }} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function ConsumersNode({ data, selected }: NodeProps<Node<ConsumersNodeData>>) {
  const t = useT();
  const cs = data.consumers;
  const hosts = [...new Set(cs.map((c) => c.peer.split(':')[0] || c.connection))];
  const prefetch = [...new Set(cs.map((c) => c.prefetch))];
  return (
    <div className={cls(data, 'node node-consumers', selected)}>
      <Handle type="target" position={Position.Left} />
      <SimArrival sim={data.sim} />
      <div className="avatar">{cs.length}</div>
      <div className="consumers-body">
        <div className="node-title small">{t('graph.consumers.count', { n: cs.length })}</div>
        <div className="node-sub" title={cs.map((c) => `${c.tag} (${c.peer})`).join('\n')}>
          {hosts.length === 1 ? hosts[0] : t('graph.consumers.hosts', { n: hosts.length })} · {t('graph.consumers.prefetch', { value: prefetch.join('/') })}
        </div>
      </div>
    </div>
  );
}

export const nodeTypes = { exchange: ExchangeNode, queue: QueueNode, consumers: ConsumersNode };
