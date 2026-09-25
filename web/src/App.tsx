import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { api } from './api';
import { buildGraph, nodeName, type Filters } from './graph/buildGraph';
import { buildTimeline, type Timeline } from './routing/timeline';
import { GraphView, type Selection } from './graph/GraphView';
import { Sidebar, SidebarRail, type SidebarTab } from './components/Sidebar';
import { DetailsPanel } from './components/DetailsPanel';
import { SummaryBar } from './components/SummaryBar';
import { Legend } from './components/Legend';
import { emptySim, runSim, type SimState } from './components/Simulator';
import { readPref, writePref } from './persist';
import { UserMenu } from './auth/UserMenu';
import { ConnectionsDialog } from './auth/ConnectionsDialog';
import type { Connection } from './api';
import type { Session } from './auth/AuthGate';
import { useTopology } from './useTopology';
import { fmtTime, t, useLanguage } from './i18n';

type Theme = 'system' | 'light' | 'dark';

interface VhostState {
  exchanges: string[] | null;
  focusId: string | null;
  search: string;
  selection: Selection;
  pinnedId: string | null;
  sim: Omit<SimState, 'result' | 'run'>;
}

const defaultFilters: Filters = {
  search: '',
  showConsumers: true,
  showDlx: true,
  hideAmq: true,
  onlyWithMessages: false,
  onlyWithDestination: false,
  focusId: null,
  exchanges: null,
};

const INTERVALS = [0, 2000, 5000, 10000, 30000];

/** Rótulo da frequência de atualização no idioma atual */
const intervalLabel = (ms: number) => (ms === 0 ? t('app.interval.paused') : t('app.interval.every', { n: ms / 1000 }));

/** Descarta preferências de opções que não existem mais (ex.: hideDefault) */
function withoutRemoved(saved: Record<string, unknown>): Partial<Filters> {
  return Object.fromEntries(Object.entries(saved).filter(([k]) => k in defaultFilters)) as Partial<Filters>;
}

function exportFileName(vhost: string | null) {
  const name = !vhost || vhost === '/' ? 'root' : vhost.replace(/^\//, '').replace(/[^\w.-]+/g, '_');
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `rabbitflow-${name}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
}

export default function App({ session }: { session: Session }) {
  // re-renderiza ao trocar o idioma (e refaz o grafo, que tem rótulos traduzidos)
  const lang = useLanguage();
  const isAdmin = session.user.isAdmin;
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  /** Muda quando uma conexão é editada: recarrega a atual (ex.: senha corrigida) */
  const [connVersion, setConnVersion] = useState(0);
  const [overview, setOverview] = useState<{ version: string; cluster: string } | null>(null);
  const [vhosts, setVhosts] = useState<string[]>([]);
  const [vhost, setVhost] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  /** conexão + vhost: chave de tudo que é salvo por vhost */
  const scope = connectionId !== null && vhost !== null ? `${connectionId}:${vhost}` : null;
  const [intervalMs, setIntervalMs] = useState(() => readPref('rv.interval', 5000));
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters, ...withoutRemoved(readPref('rv.filters', {})), search: '', focusId: null, exchanges: null,
  }));
  const [sim, setSim] = useState<SimState>(emptySim);
  const [selection, setSelection] = useState<Selection>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Caminho fixado: mantém o destaque do hover travado neste nó */
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const pinnedRef = useRef(pinnedId);
  pinnedRef.current = pinnedId;
  const togglePin = useCallback((id: string) => setPinnedId((cur) => (cur === id ? null : id)), []);
  const [alerts, setAlerts] = useState(false);
  const [live, setLive] = useState(() => readPref('rv.live', false));
  const [centerRequest, setCenterRequest] = useState<{ id: string; n: number } | null>(null);
  const [tab, setTab] = useState<SidebarTab>(() => readPref<SidebarTab>('rv.tab', 'explore'));
  /** vhost cujo estado salvo já foi aplicado; antes disso não gravamos para não sobrescrever */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const pendingSim = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => readPref('rv.sidebar', true));
  const [theme, setTheme] = useState<Theme>(() => readPref<Theme>('rv.theme', 'system'));

  const { data: topo, error, loading, reload } = useTopology(connectionId, vhost, intervalMs);

  // Conexões cadastradas; mantém a escolhida (ou a salva), senão a primeira
  const loadConnections = useCallback((prefer?: number) => {
    api.connections()
      .then((list) => {
        setConnections(list);
        setConnectionId((cur) => {
          const want = prefer ?? cur ?? readPref<number | null>('rv.connection', null);
          return list.some((c) => c.id === want) ? want! : (list[0]?.id ?? null);
        });
      })
      .catch((err) => setBootError((err as Error).message));
  }, []);
  useEffect(() => loadConnections(), [loadConnections]);

  // Primeiro acesso de um administrador: abre o cadastro de conexões
  useEffect(() => {
    if (connections?.length === 0 && isAdmin) setShowConnections(true);
  }, [connections, isAdmin]);

  // Ao trocar de conexão: versão, vhosts e o vhost lembrado para ela
  useEffect(() => {
    setOverview(null);
    setVhosts([]);
    setVhost(null);
    setBootError(null);
    if (connectionId === null) return;
    writePref('rv.connection', connectionId);
    let cancelled = false;
    Promise.all([api.overview(connectionId), api.vhosts(connectionId)])
      .then(([o, v]) => {
        if (cancelled) return;
        setOverview(o);
        setVhosts(v);
        const saved = readPref<string | null>(`rv.vhost:${connectionId}`, null);
        setVhost(saved !== null && v.includes(saved) ? saved : (v[0] ?? '/'));
      })
      .catch((err) => !cancelled && setBootError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [connectionId, connVersion]);

  useEffect(() => writePref('rv.interval', intervalMs), [intervalMs]);
  useEffect(() => writePref('rv.tab', tab), [tab]);
  useEffect(() => writePref('rv.live', live), [live]);
  useEffect(() => writePref('rv.sidebar', sidebarOpen), [sidebarOpen]);

  // Atalho "[" recolhe/expande o painel (ignorado enquanto se digita)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      setSidebarOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const { search: _s, focusId: _f, exchanges: _e, ...persist } = filters;
    writePref('rv.filters', persist);
  }, [filters]);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    writePref('rv.theme', theme);
  }, [theme]);

  // Estado que depende do vhost (nomes de exchanges/queues) é salvo separado por conexão + vhost
  useEffect(() => {
    if (scope === null) return;
    const saved = readPref<Partial<VhostState>>(`rv.v:${scope}`, {});
    setFilters((f) => ({ ...f, exchanges: saved.exchanges ?? null, focusId: saved.focusId ?? null, search: saved.search ?? '' }));
    setSelection(saved.selection ?? null);
    setPinnedId(saved.pinnedId ?? null);
    setSim({ ...emptySim, ...saved.sim, result: null, run: 0 });
    pendingSim.current = Boolean(saved.sim?.sent);
    setAlerts(false);
    setLoadedFor(scope);
  }, [scope]);

  useEffect(() => {
    if (scope === null || loadedFor !== scope) return;
    const { exchange, routingKey, headers, payload, sent, history, pristine } = sim;
    const state: VhostState = {
      exchanges: filters.exchanges,
      focusId: filters.focusId,
      search: filters.search,
      selection,
      pinnedId,
      sim: { exchange, routingKey, headers, payload, sent, history, pristine },
    };
    writePref(`rv.v:${scope}`, state);
  }, [scope, loadedFor, filters.exchanges, filters.focusId, filters.search, selection, pinnedId, sim]);

  // Esc solta o caminho fixado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc desfaz um de cada vez: primeiro o caminho fixado, depois o isolamento
      if (pinnedRef.current) setPinnedId(null);
      else setFilters((f) => (f.focusId ? { ...f, focusId: null } : f));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Refaz a última simulação ao recarregar a página (o resultado em si não é salvo)
  useEffect(() => {
    if (!topo || !pendingSim.current) return;
    pendingSim.current = false;
    setSim((s) => (s.sent ? { ...s, result: runSim(topo, s.sent), run: s.run + 1 } : s));
  }, [topo]);

  const changeVhost = (v: string) => {
    setVhost(v);
    if (connectionId !== null) writePref(`rv.vhost:${connectionId}`, v);
  };
  const connection = connections?.find((c) => c.id === connectionId) ?? null;

  // Sugere no simulador a exchange "de usuário" com mais bindings de saída
  useEffect(() => {
    if (topo && (sim.pristine || !topo.exchanges.some((e) => e.name === sim.exchange))) {
      const out = (name: string) => topo.bindings.filter((b) => b.source === name).length;
      const candidates = topo.exchanges.filter((e) => e.name !== '' && !e.name.startsWith('amq.'));
      const first = candidates.sort((a, b) => out(b.name) - out(a.name))[0] ?? topo.exchanges[0];
      if (first && first.name !== sim.exchange) setSim((s) => ({ ...s, exchange: first.name, result: null }));
    }
  }, [topo, sim.exchange, sim.pristine]);

  // a timeline só depende do envio (run); refresh de métricas não reinicia a animação
  const simulation = useMemo<Timeline | null>(
    () => (sim.result && sim.sent && topo ? buildTimeline(sim.result, topo, sim.run, sim.sent.exchange) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.result, sim.sent, sim.run],
  );

  const graph = useMemo(
    () => (topo ? buildGraph(topo, filters, { simulation, hoverId: pinnedId ?? hoverId, alerts, live }) : { nodes: [], edges: [] }),
    [topo, filters, simulation, hoverId, pinnedId, alerts, live, lang],
  );

  const navigate = useCallback((id: string) => {
    setSelection({ type: 'node', id });
    setCenterRequest((c) => ({ id, n: (c?.n ?? 0) + 1 }));
  }, []);

  const focusNode = filters.focusId ? graph.nodes.find((n) => n.id === filters.focusId) ?? null : null;
  const pinnedNode = pinnedId ? graph.nodes.find((n) => n.id === pinnedId) ?? null : null;
  const selNode = selection?.type === 'node' ? graph.nodes.find((n) => n.id === selection.id) ?? null : null;
  const selEdge = selection?.type === 'edge' ? graph.edges.find((e) => e.id === selection.id) ?? null : null;
  const updated = topo ? fmtTime(Date.parse(topo.fetchedAt)) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">🐇</span> RabbitFlow</div>
        <label className="vhost conn" title={connection ? t('app.conn.title', { url: connection.apiUrl, user: connection.username }) : t('app.conn.titleNone')}>
          <span>{t('app.conn.label')}</span>
          <select
            value={connectionId ?? ''}
            onChange={(e) => (e.target.value === '__manage' ? setShowConnections(true) : setConnectionId(Number(e.target.value)))}
          >
            {connections?.length === 0 && <option value="">{t('app.conn.none')}</option>}
            {connections?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {isAdmin && <option value="__manage">{t('app.conn.manage')}</option>}
          </select>
        </label>
        <label className="vhost" title="Virtual host">
          <span>vhost</span>
          <select value={vhost ?? ''} onChange={(e) => changeVhost(e.target.value)}>
            {vhosts.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {overview && <span className="cluster">{overview.cluster} · v{overview.version}</span>}
        <span className="spacer" />
        <div className={`live ${error ? 'err' : intervalMs ? 'on' : 'off'}`} title={error ?? undefined}>
          <i />
          <span>{error ? t('app.status.offline') : updated ? t('app.status.updated', { time: updated }) : connections?.length === 0 ? t('app.status.noConnection') : t('app.status.loading')}</span>
          <select value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} aria-label={t('app.refresh.interval')}>
            {INTERVALS.map((ms) => <option key={ms} value={ms}>{intervalLabel(ms)}</option>)}
          </select>
          <button className="icon small" onClick={reload} disabled={loading} title={t('app.refresh.now')} aria-label={t('app.refresh.now')}>↻</button>
        </div>
        <span className="readonly" title={t('app.readonly.title')}>
          🔒 {t('app.readonly.label')}
        </span>
        <select className="theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label={t('app.theme')}>
          <option value="system">{t('app.theme.system')}</option>
          <option value="light">{t('app.theme.light')}</option>
          <option value="dark">{t('app.theme.dark')}</option>
        </select>
        <UserMenu
          user={session.user}
          onUserChange={session.onUserChange}
          onLogout={session.onLogout}
          onOpenConnections={() => setShowConnections(true)}
        />
      </header>

      <SummaryBar topology={topo} alertsOn={alerts} onToggleAlerts={() => setAlerts(!alerts)} />

      {(bootError || error) && (
        <div className="banner">
          {t('app.error.read', { conn: connection ? ` (${connection.name})` : '', error: bootError ?? error ?? '' })}
          {isAdmin && connection && <button className="link" onClick={() => setShowConnections(true)}>{t('app.error.review')}</button>}
        </div>
      )}
      {showConnections && (
        <ConnectionsDialog
          onClose={() => setShowConnections(false)}
          onChanged={(select) => {
            loadConnections(select);
            setConnVersion((v) => v + 1);
          }}
          editId={bootError || error ? connectionId : null}
        />
      )}

      <div className="main">
        {sidebarOpen ? (
          <Sidebar
            onCollapse={() => setSidebarOpen(false)}
            tab={tab}
            onTab={setTab}
            filters={filters}
            onFilters={setFilters}
            topology={topo}
            onNavigate={navigate}
            sim={sim}
            onSim={setSim}
          />
        ) : (
          <SidebarRail
            tab={tab}
            hasSim={Boolean(sim.result)}
            onOpen={(next) => {
              if (next) setTab(next);
              setSidebarOpen(true);
            }}
          />
        )}
        <div className="canvas">
          {connections?.length === 0 ? (
            <div className="empty interactive">
              <div>
                <b>{t('app.empty.noConn.title')}</b>
                {isAdmin ? (
                  <>
                    <p>{t('app.empty.noConn.admin')}</p>
                    <button className="primary" onClick={() => setShowConnections(true)}>{t('app.empty.noConn.add')}</button>
                  </>
                ) : (
                  <p>{t('app.empty.noConn.ask')}</p>
                )}
              </div>
            </div>
          ) : (
            !topo && !error && !bootError && <div className="empty">{t('app.empty.reading')}</div>
          )}
          {topo && graph.nodes.length === 0 && (
            <div className="empty">
              <div>
                <b>{t('app.empty.nothing.title')}</b>
                <p>{t('app.empty.nothing.text')}</p>
              </div>
            </div>
          )}
          {(filters.focusId || (pinnedId && !sim.result)) && (
            <div className="canvas-banners">
              {filters.focusId && (
                <div className="pin-banner isolate" role="status">
                  <span>◎ {t('app.isolate.label')}</span>
                  <b>{focusNode ? nodeName(focusNode) : filters.focusId.replace(/^(ex|q|cg):/, '')}</b>
                  <button className="link" onClick={() => setFilters((f) => ({ ...f, focusId: null }))} title={t('app.isolate.exitTitle')}>
                    {t('app.isolate.exit')}
                  </button>
                </div>
              )}
              {pinnedId && !sim.result && (
                <div className="pin-banner" role="status">
                  <span>📌 {t('app.pin.label')}</span>
                  <b>{pinnedNode ? nodeName(pinnedNode) : pinnedId.replace(/^(ex|q|cg):/, '')}</b>
                  {!pinnedNode && <span className="muted-on-accent">{t('app.pin.hidden')}</span>}
                  <button className="link" onClick={() => setPinnedId(null)} title={t('app.pin.releaseTitle')}>{t('app.pin.release')}</button>
                </div>
              )}
            </div>
          )}
          {sim.result && sim.sent && (
            <div className="sim-banner">
              <span>✉ {t('app.sim.banner')}</span>
              <code>{sim.sent.routingKey || '""'}</code>
              <span>→ {sim.result.dropped ? t('app.sim.dropped') : t('app.sim.queues', { n: sim.result.queues.length })}</span>
              <button className="link" onClick={() => setSim({ ...sim, run: sim.run + 1 })}>↻ {t('app.sim.repeat')}</button>
              <button className="link" onClick={() => setSim({ ...sim, result: null, sent: null })}>{t('app.sim.clear')}</button>
            </div>
          )}
          <ReactFlowProvider>
            <GraphView
              connection={topo ? connectionId : null}
              vhost={topo?.vhost ?? null}
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selection?.type === 'node' ? selection.id : null}
              onSelect={setSelection}
              onHover={setHoverId}
              onTogglePin={togglePin}
              centerRequest={centerRequest}
              colorMode={theme}
              live={live}
              onLive={setLive}
              paused={intervalMs === 0}
              exportSubtitle={`${overview?.cluster ?? ''} · RabbitMQ ${overview?.version ?? ''} · vhost ${vhost ?? ''}`}
              exportFile={exportFileName(vhost)}
            />
          </ReactFlowProvider>
          <Legend />
        </div>
        {topo && (selNode || selEdge) && (
          <DetailsPanel
            node={selNode}
            edge={selEdge}
            nodes={graph.nodes}
            edges={graph.edges}
            onClose={() => setSelection(null)}
            onNavigate={navigate}
            focusId={filters.focusId}
            onFocus={(id) => setFilters((f) => ({ ...f, focusId: f.focusId === id ? null : id }))}
            pinnedId={pinnedId}
            onTogglePin={togglePin}
            onSimulateFrom={(ex) => {
              setSim((s) => ({ ...s, exchange: ex, result: null, pristine: false }));
              setTab('simulate');
              setSidebarOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
