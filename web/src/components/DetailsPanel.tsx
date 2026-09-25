import type { ReactNode } from 'react';
import type { AppEdge, AppNode } from '../graph/buildGraph';
import { EDGE_COLORS, edgeLabel, exchangeLabel, nodeName } from '../graph/buildGraph';
import { exchangeColor, exchangeHint, fmtNum, fmtRate } from '../graph/nodes';
import { queueStatus, statusHelp, statusLabel } from '../graph/status';
import type { Args, Binding, Consumer } from '../types';
import { t, useT } from '../i18n';

interface Props {
  node: AppNode | null;
  edge: AppEdge | null;
  nodes: AppNode[];
  edges: AppEdge[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  /** Nó isolado no momento; o botão Isolar alterna */
  focusId: string | null;
  onFocus: (id: string) => void;
  pinnedId: string | null;
  onTogglePin: (id: string) => void;
  onSimulateFrom: (exchange: string) => void;
}

/** Texto completo do binding (o rótulo da aresta no grafo pode estar encurtado) */
function bindingText(b: Binding): string {
  const args = Object.entries(b.arguments);
  if (args.length) return args.map(([k, v]) => `${k}=${String(v)}`).join(', ');
  return b.routingKey;
}

/** Tipo da ligação no idioma atual (dead-letter e alternate ficam como no RabbitMQ) */
const linkKind = (k: string) => (k === 'e2e' ? t('app.details.chained') : k === 'dlx' ? 'dead-letter' : k === 'ae' ? 'alternate' : '');

const yes = (v: boolean) => (v ? t('app.details.yes') : t('app.details.no'));

function Props_({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="props">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

function ArgsBlock({ args, title = 'Arguments' }: { args: Args; title?: string }) {
  const n = Object.keys(args).length;
  if (!n) return null;
  return (
    <details className="args">
      <summary>{title} ({n})</summary>
      <pre>{JSON.stringify(args, null, 2)}</pre>
    </details>
  );
}

function Metric({ value, label, tone }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div className={`metric ${tone ?? ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function kindOf(n: AppNode | undefined) {
  if (!n) return '';
  return n.data.kind === 'exchange' ? 'exchange' : n.data.kind === 'queue' ? 'queue' : 'consumers';
}

/** Lista de vizinhos clicáveis (quem entrega para este nó / para quem ele entrega) */
function Links({ title, list, nodes, side, onNavigate }: {
  title: string; list: AppEdge[]; nodes: AppNode[]; side: 'source' | 'target'; onNavigate: (id: string) => void;
}) {
  const t = useT();
  if (!list.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <section>
      <h4>{title} <span className="count">{list.length}</span></h4>
      <ul className="links">
        {list.map((e) => {
          const other = byId.get(side === 'source' ? e.source : e.target);
          if (!other) return null;
          const keys = e.data!.bindings.map(bindingText).filter(Boolean);
          return (
            <li key={e.id}>
              <button onClick={() => onNavigate(other.id)} title={t('app.details.goTo', { name: nodeName(other) })}>
                <span className={`k-badge k-${kindOf(other)}`} style={other.data.kind === 'exchange' ? { ['--c' as string]: exchangeColor(other.data.exchange.type) } : undefined}>
                  {kindOf(other) === 'consumers' ? 'consumers' : kindOf(other)}
                </span>
                <span className="link-name">{nodeName(other)}</span>
                {e.data!.kind !== 'binding' && e.data!.kind !== 'consumer' && (
                  <span className="link-kind" style={{ color: EDGE_COLORS[e.data!.kind] }} title={edgeLabel(e.data!.kind)}>{linkKind(e.data!.kind)}</span>
                )}
                {keys.length > 0 && (
                  <span className="link-keys">{keys.map((k) => <code key={k}>{k}</code>)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConsumerList({ consumers }: { consumers: Consumer[] }) {
  const t = useT();
  if (!consumers.length) return null;
  return (
    <section>
      <h4>Consumers <span className="count">{consumers.length}</span></h4>
      <ul className="consumer-list">
        {consumers.map((c) => (
          <li key={c.tag}>
            <b title={c.tag}>{c.tag}</b>
            <span>{c.peer || c.connection}</span>
            <span>prefetch {c.prefetch} · {c.ackRequired ? t('app.details.ackManual') : 'auto-ack'}{c.active ? '' : ` · ${t('app.details.inactive')}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DetailsPanel({ node, edge, nodes, edges, onClose, onNavigate, focusId, onFocus, onSimulateFrom, pinnedId, onTogglePin }: Props) {
  const t = useT();
  let kind = '';
  let title = '';
  let subtitle: ReactNode = null;
  let color = 'var(--queue)';
  let body: ReactNode = null;

  if (node) {
    const d = node.data;
    const incoming = edges.filter((e) => e.target === node.id);
    const outgoing = edges.filter((e) => e.source === node.id);
    const links = (
      <>
        <Links title={t('app.details.receivesFrom')} list={incoming} nodes={nodes} side="source" onNavigate={onNavigate} />
        <Links title={t('app.details.deliversTo')} list={outgoing} nodes={nodes} side="target" onNavigate={onNavigate} />
      </>
    );

    if (d.kind === 'exchange') {
      const e = d.exchange;
      kind = `Exchange · ${e.type}`;
      title = exchangeLabel(e.name);
      color = exchangeColor(e.type);
      subtitle = <>{t('app.details.routesBy')} <b>{exchangeHint(e.type) ?? e.type}</b></>;
      body = (
        <>
          <div className="metrics-row">
            <Metric value={outgoing.length} label={t('app.details.destinations')} />
            <Metric value={fmtRate(e.rates.publishIn)} label={t('app.details.inRate')} />
            <Metric value={fmtRate(e.rates.publishOut)} label={t('app.details.outRate')} />
          </div>
          {links}
          {incoming.length === 0 && outgoing.length === 0 && <p className="muted">{t('app.details.noLinks')}</p>}
          <section>
            <h4>Propriedades</h4>
            <Props_ rows={[
              ['Durable', yes(e.durable)], ['Auto-delete', yes(e.autoDelete)], ['Internal', yes(e.internal)],
              ['Policy', e.policy ?? '—'], ['Alternate exchange', e.alternateExchange ?? '—'],
            ]} />
            <ArgsBlock args={e.arguments} />
          </section>
        </>
      );
    } else if (d.kind === 'queue') {
      const q = d.queue;
      const st = queueStatus(q);
      kind = `Queue · ${q.type}`;
      title = q.name;
      subtitle = <span className={`status st-${st}`}><i />{statusLabel(st)} — {statusHelp(st).toLowerCase()}</span>;
      const consumers = nodes.find((n) => n.data.kind === 'consumers' && n.data.queue === q.name);
      body = (
        <>
          <div className="metrics-row">
            <Metric value={fmtNum(q.messagesReady)} label={t('app.details.ready')} tone={st === 'warn' ? 'warn' : ''} />
            <Metric value={fmtNum(q.messagesUnacked)} label={t('app.details.unacked')} />
            <Metric value={q.consumers} label="consumers" tone={q.consumers === 0 ? 'muted' : ''} />
          </div>
          <div className="metrics-row">
            <Metric value={fmtRate(q.rates.publish)} label={t('app.details.inRate')} />
            <Metric value={fmtRate(q.rates.deliver)} label={t('app.details.deliverRate')} />
            <Metric value={fmtRate(q.rates.ack)} label="ack msg/s" />
          </div>
          {links}
          {consumers?.data.kind === 'consumers' && <ConsumerList consumers={consumers.data.consumers} />}
          <section>
            <h4>Propriedades</h4>
            <Props_ rows={[
              [t('app.details.state'), q.state], ['Durable', yes(q.durable)], ['Exclusive', yes(q.exclusive)],
              ['Auto-delete', yes(q.autoDelete)], ['Policy', q.policy ?? '—'],
              ['Dead-letter exchange', q.deadLetterExchange === null ? '—' : exchangeLabel(q.deadLetterExchange)],
              ['Dead-letter routing key', q.deadLetterRoutingKey ?? '—'],
            ]} />
            <ArgsBlock args={q.arguments} />
          </section>
        </>
      );
    } else {
      kind = 'Consumers';
      title = d.queue;
      color = 'var(--faint)';
      subtitle = <>{t('app.details.readingQueue', { n: d.consumers.length })}</>;
      body = (
        <>
          {links}
          <ConsumerList consumers={d.consumers} />
        </>
      );
    }
  } else if (edge) {
    const k = edge.data!.kind;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    kind = edgeLabel(k);
    title = `${from ? nodeName(from) : edge.source} → ${to ? nodeName(to) : edge.target}`;
    color = EDGE_COLORS[k];
    body = (
      <>
        {edge.data!.bindings.map((b) => (
          <section key={b.propertiesKey}>
            <Props_ rows={[['Routing key', <code key="rk">{b.routingKey === '' ? '""' : b.routingKey}</code>]]} />
            <ArgsBlock args={b.arguments} />
          </section>
        ))}
        {!edge.data!.bindings.length && edge.label && <p className="muted">{String(edge.label)}</p>}
      </>
    );
  } else {
    return null;
  }

  // Ações ficam logo abaixo do título (fixas), não no fim do painel
  let actions: ReactNode = null;
  if (node) {
    const d = node.data;
    const pinned = pinnedId === node.id;
    actions = (
      <>
        <button className={pinned ? 'pin-on' : ''} onClick={() => onTogglePin(node.id)} title={t('app.details.pinTitle')}>
          📌 {pinned ? t('app.details.unpin') : t('app.details.pin')}
        </button>
        {d.kind !== 'consumers' && (
          <button
            className={focusId === node.id ? 'pin-on' : ''}
            onClick={() => onFocus(node.id)}
            title={focusId === node.id
              ? t('app.details.unfocusTitle')
              : t('app.details.focusTitle')}
          >
            ◎ {focusId === node.id ? t('app.details.unfocus') : t('app.details.focus')}
          </button>
        )}
        {d.kind === 'exchange' && (
          <button onClick={() => onSimulateFrom(d.exchange.name)} title={t('app.details.simulateTitle')}>✉ {t('app.details.simulate')}</button>
        )}
      </>
    );
  } else if (edge) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    actions = (
      <>
        {from && <button onClick={() => onNavigate(from.id)} title={t('app.details.goSource')}>← {nodeName(from)}</button>}
        {to && <button onClick={() => onNavigate(to.id)} title={t('app.details.goTarget')}>{nodeName(to)} →</button>}
      </>
    );
  }

  return (
    <aside className="details" style={{ ['--c' as string]: color }}>
      <header>
        <div>
          <span className="details-kind">{kind}</span>
          <h2 title={title}>{title}</h2>
          {subtitle && <div className="details-sub">{subtitle}</div>}
        </div>
        <button className="icon" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </header>
      {actions && <div className="details-actions">{actions}</div>}
      <div className="details-body">{body}</div>
    </aside>
  );
}
