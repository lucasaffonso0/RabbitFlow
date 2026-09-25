import type { Filters } from '../graph/buildGraph';
import { exchangeLabel } from '../graph/buildGraph';
import { exchangeColor } from '../graph/nodes';
import type { Topology } from '../types';
import { exId } from '../types';
import { Simulator, type SimState } from './Simulator';
import { IconCollapse, IconExpand, IconSearch, IconSend } from './icons';
import { useT } from '../i18n';

export type SidebarTab = 'explore' | 'simulate';

interface Props {
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  topology: Topology | null;
  onNavigate: (id: string) => void;
  sim: SimState;
  onSim: (s: SimState) => void;
  onCollapse: () => void;
}

const SHORTCUT = '[';

/** Painel recolhido: trilho com atalhos para as abas e o botão de expandir no mesmo lugar do de recolher */
export function SidebarRail({ tab, hasSim, onOpen }: { tab: SidebarTab; hasSim: boolean; onOpen: (t?: SidebarTab) => void }) {
  const t = useT();
  return (
    <aside className="rail" aria-label={t('app.rail.aria')}>
      <div className="rail-tabs">
        <button className={tab === 'explore' ? 'on' : ''} onClick={() => onOpen('explore')} title={t('app.tab.explore')} aria-label={t('app.rail.open', { tab: t('app.tab.explore') })}>
          <IconSearch />
        </button>
        <button className={tab === 'simulate' ? 'on' : ''} onClick={() => onOpen('simulate')} title={t('app.tab.simulate')} aria-label={t('app.rail.open', { tab: t('app.tab.simulate') })}>
          <IconSend />
          {hasSim && <span className="rail-dot" />}
        </button>
      </div>
      <div className="rail-foot">
        <button onClick={() => onOpen()} title={t('app.panel.expandTitle', { key: SHORTCUT })} aria-label={t('app.panel.expand')}>
          <IconExpand />
        </button>
      </div>
    </aside>
  );
}

export function Sidebar(p: Props) {
  const t = useT();
  return (
    <aside className="sidebar">
      <div className="sidebar-body">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={p.tab === 'explore'} className={p.tab === 'explore' ? 'on' : ''} onClick={() => p.onTab('explore')}>
          {t('app.tab.explore')}
        </button>
        <button role="tab" aria-selected={p.tab === 'simulate'} className={p.tab === 'simulate' ? 'on' : ''} onClick={() => p.onTab('simulate')}>
          {t('app.tab.simulate')}
          {p.sim.result && <span className="tab-dot" />}
        </button>
      </div>
      {p.tab === 'explore' ? <Explore {...p} /> : (
        <section>
          <p className="readonly-note">
            🔒 {t('app.simNote.before')} <b>{t('app.simNote.bold')}</b> {t('app.simNote.after')}
          </p>
          <Simulator state={p.sim} onChange={p.onSim} topology={p.topology} />
        </section>
      )}
      </div>
      <footer className="sidebar-foot">
        <span className="kbd-hint"><kbd>{SHORTCUT}</kbd> {t('app.panel.shortcutHint')}</span>
        <button className="collapse-btn" onClick={p.onCollapse} title={t('app.panel.collapseTitle', { key: SHORTCUT })} aria-label={t('app.panel.collapse')}>
          <IconCollapse />
        </button>
      </footer>
    </aside>
  );
}

function Explore({ filters: f, onFilters, topology: topo, onNavigate }: Props) {
  const t = useT();
  const toggle = (key: keyof Filters, label: string, hint?: string) => (
    <label className="switch" title={hint}>
      <input type="checkbox" checked={f[key] as boolean} onChange={(e) => onFilters({ ...f, [key]: e.target.checked })} />
      <span className="track" />
      {label}
    </label>
  );

  const list = (topo?.exchanges ?? []).filter((e) => !(f.hideAmq && e.name.startsWith('amq.')));
  const all = list.map((e) => e.name);
  const selected = new Set(f.exchanges ?? all);
  const count = all.filter((n) => selected.has(n)).length;
  const isAll = f.exchanges === null || count === all.length;
  const setSel = (names: string[]) =>
    onFilters({ ...f, exchanges: names.length === all.length && all.every((n) => names.includes(n)) ? null : names });
  const flip = (name: string) => setSel(selected.has(name) ? [...selected].filter((n) => n !== name) : [...selected, name]);
  const outs = (name: string) => topo?.bindings.filter((b) => b.source === name).length ?? 0;
  const term = f.search.trim().toLowerCase();
  const shown = term ? list.filter((e) => exchangeLabel(e.name).toLowerCase().includes(term)) : list;

  return (
    <>
      <section>
        <div className="search-box">
          <span aria-hidden>⌕</span>
          <input
            placeholder={t('app.explore.search')}
            value={f.search}
            onChange={(e) => onFilters({ ...f, search: e.target.value })}
          />
          {f.search && <button className="link" onClick={() => onFilters({ ...f, search: '' })} aria-label={t('app.explore.clearSearch')}>✕</button>}
        </div>
      </section>

      <section className="grow-section">
        <div className="section-head">
          <h3>Exchanges <span className="count">{isAll ? all.length : `${count}/${all.length}`}</span></h3>
          <div className="section-actions">
            <button className="link" disabled={isAll} onClick={() => onFilters({ ...f, exchanges: null })}>{t('app.explore.all')}</button>
            <button className="link" disabled={count === 0} onClick={() => setSel([])}>{t('app.explore.none')}</button>
          </div>
        </div>
        <p className="hint">{t('app.explore.hint')}</p>
        <ul className="ex-list">
          {shown.map((e) => (
            <li key={e.name} className={selected.has(e.name) ? '' : 'off'}>
              <input
                type="checkbox"
                checked={selected.has(e.name)}
                onChange={() => flip(e.name)}
                aria-label={t('app.explore.show', { name: exchangeLabel(e.name) })}
              />
              <span className="dot" style={{ background: exchangeColor(e.type) }} title={e.type} />
              <button className="ex-name" onClick={() => onNavigate(exId(e.name))} disabled={!selected.has(e.name)} title={`${exchangeLabel(e.name)} (${e.type})`}>
                {exchangeLabel(e.name)}
              </button>
              <span className="ex-out" title={t('app.explore.outBindings')}>{outs(e.name)}</span>
              <button className="link only" onClick={() => setSel([e.name])} title={t('app.explore.onlyThisTitle')}>{t('app.explore.onlyThis')}</button>
            </li>
          ))}
          {shown.length === 0 && <li className="muted small">{t('app.explore.noExchange')}</li>}
        </ul>
      </section>

      <section>
        <h3>{t('app.explore.display')}</h3>
        {toggle('showConsumers', 'Consumers')}
        {toggle('showDlx', t('app.explore.dlx'))}
        {toggle('onlyWithMessages', t('app.explore.onlyWithMessages'))}
        {toggle('hideAmq', t('app.explore.hideAmq'), t('app.explore.hideAmqHint'))}
        {toggle('onlyWithDestination', t('app.explore.onlyWithDestination'), t('app.explore.onlyWithDestinationHint'))}
      </section>
    </>
  );
}
