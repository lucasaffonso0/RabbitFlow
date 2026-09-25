import { useMemo } from 'react';
import { formatTrace, simulate, type SimResult } from '../routing/simulate';
import { exchangeLabel } from '../graph/buildGraph';
import { exchangeColor, exchangeHint } from '../graph/nodes';
import type { Topology } from '../types';
import { useT } from '../i18n';

export interface HeaderRow { k: string; v: string }

export interface SentMessage {
  exchange: string;
  routingKey: string;
  headers: HeaderRow[];
  queues: number;
  dropped: boolean;
}

export interface SimState {
  exchange: string;
  routingKey: string;
  headers: HeaderRow[];
  payload: string;
  result: SimResult | null;
  /** Exchange/routing key do resultado exibido (o formulário pode ter mudado depois) */
  sent: SentMessage | null;
  /** Incrementa a cada envio/replay para reiniciar a animação */
  run: number;
  history: SentMessage[];
  /** true até o usuário escolher uma exchange; permite pré-selecionar uma exchange "de verdade" */
  pristine: boolean;
}

export const emptySim: SimState = {
  exchange: '', routingKey: '', headers: [], payload: '', result: null, sent: null, run: 0, history: [], pristine: true,
};

interface Props {
  state: SimState;
  onChange: (s: SimState) => void;
  topology: Topology | null;
}

export function runSim(t: Topology, m: Pick<SentMessage, 'exchange' | 'routingKey' | 'headers'>): SimResult {
  const headers = Object.fromEntries(m.headers.filter((h) => h.k.trim()).map((h) => [h.k.trim(), h.v]));
  return simulate(t, { exchange: m.exchange, routingKey: m.routingKey, headers });
}

/** "order.created.*" → "order.created.x"; "order.#" → "order" */
const exampleKey = (pattern: string) =>
  pattern.split('.').filter((w) => w !== '#').map((w) => (w === '*' ? 'x' : w)).join('.');

export function Simulator({ state, onChange, topology: topo }: Props) {
  const t = useT();
  const exchanges = useMemo(
    () => (topo?.exchanges ?? []).filter((e) => !e.name.startsWith('amq.')),
    [topo],
  );
  const ex = topo?.exchanges.find((e) => e.name === state.exchange);
  const type = ex?.type;

  // Sugestões tiradas dos bindings da exchange escolhida
  const keySuggestions = useMemo(() => {
    if (!topo || type === 'fanout' || type === 'headers') return [];
    if (state.exchange === '') return topo.queues.map((q) => q.name).slice(0, 12);
    return [...new Set(topo.bindings.filter((b) => b.source === state.exchange && b.routingKey).map((b) => b.routingKey))];
  }, [topo, state.exchange, type]);
  const headerSuggestions = useMemo(() => {
    if (!topo || type !== 'headers') return [];
    return topo.bindings
      .filter((b) => b.source === state.exchange)
      .map((b) => Object.entries(b.arguments).filter(([k]) => !k.startsWith('x-')).map(([k, v]) => ({ k, v: String(v) })))
      .filter((rows) => rows.length);
  }, [topo, state.exchange, type]);

  const send = (msg?: SentMessage) => {
    if (!topo) return;
    const m = msg ?? { exchange: state.exchange, routingKey: state.routingKey, headers: state.headers, queues: 0, dropped: false };
    const result = runSim(topo, m);
    const sent = { ...m, queues: result.queues.length, dropped: result.dropped };
    const same = (a: SentMessage) =>
      a.exchange === sent.exchange && a.routingKey === sent.routingKey && JSON.stringify(a.headers) === JSON.stringify(sent.headers);
    onChange({
      ...state,
      ...(msg ? { exchange: m.exchange, routingKey: m.routingKey, headers: m.headers, pristine: false } : {}),
      pristine: false,
      result,
      sent,
      run: state.run + 1,
      history: [sent, ...state.history.filter((h) => !same(h))].slice(0, 6),
    });
  };

  const setHeader = (i: number, patch: Partial<HeaderRow>) =>
    onChange({ ...state, headers: state.headers.map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  const consumersOf = (queue: string) => topo?.queues.find((q) => q.name === queue)?.consumers ?? 0;

  return (
    <div className="sim">
      <form className="msg-card" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="msg-card-head">
          <span>✉ {t('app.sim.newMessage')}</span>
        </div>

        <label className="field">
          {t('app.sim.publishTo')}
          <select
            value={state.exchange}
            onChange={(e) => onChange({ ...state, exchange: e.target.value, pristine: false })}
          >
            {exchanges.map((e) => <option key={e.name} value={e.name}>{exchangeLabel(e.name)} · {e.type}</option>)}
          </select>
        </label>
        {ex && (
          <p className="field-hint">
            <span className="dot" style={{ background: exchangeColor(ex.type) }} />
            {ex.name === '' ? t('app.sim.defaultHint') : t('app.sim.routesBy', { hint: exchangeHint(ex.type) ?? ex.type })}
          </p>
        )}

        <label className="field">
          Routing key
          <input
            value={state.routingKey}
            placeholder={type === 'fanout' ? t('app.sim.rkFanout') : state.exchange === '' ? t('app.sim.rkQueueName') : t('app.sim.rkExample')}
            onChange={(e) => onChange({ ...state, routingKey: e.target.value })}
            spellCheck={false}
          />
        </label>
        {keySuggestions.length > 0 && (
          <div className="chips" aria-label={t('app.sim.rkSuggestions')}>
            {keySuggestions.map((k) => (
              <button
                type="button"
                key={k}
                className="chip"
                title={k !== exampleKey(k) ? t('app.sim.bindingUses', { pattern: k, example: exampleKey(k) }) : undefined}
                onClick={() => onChange({ ...state, routingKey: exampleKey(k) })}
              >
                {k}
              </button>
            ))}
          </div>
        )}

        <details className="field-group" open={type === 'headers' || state.headers.length > 0}>
          <summary>Headers {state.headers.length > 0 && <span className="count">{state.headers.length}</span>}</summary>
          {state.headers.map((h, i) => (
            <div className="header-row" key={i}>
              <input placeholder={t('app.sim.headerKey')} value={h.k} onChange={(e) => setHeader(i, { k: e.target.value })} spellCheck={false} />
              <input placeholder={t('app.sim.headerValue')} value={h.v} onChange={(e) => setHeader(i, { v: e.target.value })} spellCheck={false} />
              <button type="button" className="icon small" aria-label={t('app.sim.removeHeader')}
                onClick={() => onChange({ ...state, headers: state.headers.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="link" onClick={() => onChange({ ...state, headers: [...state.headers, { k: '', v: '' }] })}>
            + {t('app.sim.addHeader')}
          </button>
          {headerSuggestions.length > 0 && (
            <div className="chips">
              {headerSuggestions.map((rows) => {
                const label = rows.map((r) => `${r.k}=${r.v}`).join(', ');
                return (
                  <button type="button" key={label} className="chip" onClick={() => onChange({ ...state, headers: rows })}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </details>

        <details className="field-group">
          <summary>{t('app.sim.body')}</summary>
          <textarea
            rows={3}
            value={state.payload}
            placeholder='{"id": 123}'
            onChange={(e) => onChange({ ...state, payload: e.target.value })}
            spellCheck={false}
          />
          <p className="field-hint">{t('app.sim.bodyHint')}</p>
        </details>

        <button type="submit" className="primary send" disabled={!topo}>▶ {t('app.sim.send')}</button>
        <p className="send-note">{t('app.sim.sendNote')}</p>
      </form>

      {state.result && state.sent && (
        <div className={`sim-outcome ${state.result.dropped ? 'bad' : ''}`}>
          <div className="sim-outcome-head">
            {state.result.dropped ? (
              <b>✕ {t('app.sim.droppedTitle')}</b>
            ) : (
              <b>✓ {t('app.sim.delivered', { n: state.result.queues.length })}</b>
            )}
            <div className="row tight-actions">
              <button type="button" onClick={() => onChange({ ...state, run: state.run + 1 })} title={t('app.sim.replayTitle')}>↻ {t('app.sim.repeat')}</button>
              <button type="button" onClick={() => onChange({ ...state, result: null, sent: null })}>{t('app.sim.clear')}</button>
            </div>
          </div>
          {!state.result.dropped && (
            <ul className="dest-list">
              {state.result.queues.map((q) => {
                const n = consumersOf(q);
                return (
                  <li key={q}>
                    <span className="dest-name">{q}</span>
                    {n > 0
                      ? <span className="dest st-ok">{t('app.sim.consumed', { n })}</span>
                      : <span className="dest st-warn">{t('app.sim.stays')}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {state.result.dropped && (
            <p className="field-hint">
              {ex?.alternateExchange ? t('app.sim.noMatchAe') : t('app.sim.noMatchNoAe')}{' '}
              {t('app.sim.lostBefore')} <code>mandatory</code>{t('app.sim.lostAfter')}
            </p>
          )}
          <details className="trace">
            <summary>{t('app.sim.trace')}</summary>
            <pre>{formatTrace(state.result.trace).join('\n')}</pre>
          </details>
        </div>
      )}

      {state.history.length > 0 && (
        <div className="history">
          <h4>{t('app.sim.history')}</h4>
          <ul>
            {state.history.map((h) => (
              <li key={`${h.exchange}|${h.routingKey}|${JSON.stringify(h.headers)}`}>
                <button type="button" onClick={() => send(h)} title={t('app.sim.sendAgain')}>
                  <span className="h-main">
                    <b>{exchangeLabel(h.exchange)}</b>
                    <code>{h.routingKey || (h.headers.length ? h.headers.map((x) => `${x.k}=${x.v}`).join(', ') : '""')}</code>
                  </span>
                  <span className={h.dropped ? 'h-res bad' : 'h-res'}>{h.dropped ? t('app.sim.dropped') : t('app.sim.queues', { n: h.queues })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
