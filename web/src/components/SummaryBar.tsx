import { queueStatus } from '../graph/status';
import { fmtNum, fmtRate } from '../graph/nodes';
import type { Topology } from '../types';
import { useT } from '../i18n';

interface Props {
  topology: Topology | null;
  alertsOn: boolean;
  onToggleAlerts: () => void;
}

export function SummaryBar({ topology: topo, alertsOn, onToggleAlerts }: Props) {
  const t = useT();
  if (!topo) return <div className="summary skeleton" />;
  const ready = topo.queues.reduce((s, q) => s + q.messagesReady, 0);
  const unacked = topo.queues.reduce((s, q) => s + q.messagesUnacked, 0);
  const rateIn = topo.queues.reduce((s, q) => s + q.rates.publish, 0);
  const rateOut = topo.queues.reduce((s, q) => s + q.rates.deliver, 0);
  const warn = topo.queues.filter((q) => queueStatus(q) === 'warn').length;
  const bad = topo.queues.filter((q) => queueStatus(q) === 'bad').length;
  const alerts = warn + bad;

  return (
    <div className="summary">
      <Stat label="Exchanges" value={topo.exchanges.filter((e) => !e.name.startsWith('amq.')).length} hint={t('app.summary.exchangesHint')} />
      <Stat label="Queues" value={topo.queues.length} />
      <Stat label="Consumers" value={topo.consumers.length} />
      <span className="summary-sep" />
      <Stat label={t('app.summary.ready')} value={fmtNum(ready)} hint={t('app.summary.readyHint')} />
      <Stat label={t('app.summary.unacked')} value={fmtNum(unacked)} hint={t('app.summary.unackedHint')} />
      <Stat label={t('app.summary.inOut')} value={`${fmtRate(rateIn)} / ${fmtRate(rateOut)}`} unit="msg/s" />
      <span className="spacer" />
      <button
        className={`alert-chip ${alerts ? 'has' : 'none'} ${alertsOn ? 'on' : ''}`}
        onClick={onToggleAlerts}
        disabled={!alerts}
        title={alerts ? t('app.summary.alertsTitle') : undefined}
      >
        {alerts ? (
          <>
            <b>{alerts}</b> {t('app.summary.alerts', { n: alerts })}
            <span className="alert-action">{alertsOn ? t('app.summary.clear') : t('app.summary.show')}</span>
          </>
        ) : (
          <>✓ {t('app.summary.noAlerts')}</>
        )}
      </button>
    </div>
  );
}

function Stat({ label, value, unit, hint }: { label: string; value: string | number; unit?: string; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}{unit && <small> {unit}</small>}</span>
    </div>
  );
}
