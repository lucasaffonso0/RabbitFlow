import { useState } from 'react';
import { readPref, writePref } from '../persist';
import { EXCHANGE_COLORS, exchangeHint } from '../graph/nodes';
import { useT } from '../i18n';

export function Legend() {
  const t = useT();
  const [open, setOpen] = useState(() => readPref('rv.legend', false));
  const toggle = () => {
    setOpen(!open);
    writePref('rv.legend', !open);
  };

  if (!open) {
    return <button className="legend-fab" onClick={toggle}>? {t('app.legend.open')}</button>;
  }
  return (
    <div className="legend-card">
      <header>
        <b>{t('app.legend.title')}</b>
        <button className="link" onClick={toggle} aria-label={t('app.legend.close')}>✕</button>
      </header>
      <div className="flow-line">
        <span>publisher</span>→<span className="k-ex">exchange</span>→<span className="k-q">queue</span>→<span className="k-c">consumer</span>
      </div>
      <dl>
        <dt><span className="shape shape-ex" /></dt>
        <dd><b>Exchange</b> {t('app.legend.exchange')}</dd>
        <dt><span className="shape shape-q" /></dt>
        <dd><b>Queue</b> {t('app.legend.queue')}</dd>
        <dt><span className="shape shape-c" /></dt>
        <dd><b>Consumers</b> {t('app.legend.consumers')}</dd>
      </dl>
      <div className="legend-grid">
        {Object.entries(EXCHANGE_COLORS).map(([type, color]) => (
          <div key={type}><span className="dot" style={{ background: color }} /><b>{type}</b> <span>{exchangeHint(type)}</span></div>
        ))}
      </div>
      <div className="legend-grid">
        <div><span className="ln ln-b" />binding</div>
        <div><span className="ln ln-e2e" />exchange → exchange</div>
        <div><span className="ln ln-dlx" />{t('app.legend.dlx')}</div>
        <div><span className="ln ln-ae" />{t('app.legend.ae')}</div>
      </div>
      <div className="legend-grid">
        <div><span className="status st-ok"><i />OK</span> {t('app.legend.hasConsumer')}</div>
        <div><span className="status st-warn"><i />{t('app.legend.accumulating')}</span> {t('app.legend.noConsumer')}</div>
      </div>
      <p className="tip">{t('app.legend.hoverTip')} <b>{t('app.legend.dblClick')}</b> {t('app.legend.dblClickTip')}</p>
      <p className="tip">
        <b>{t('app.legend.liveTitle')}</b> {t('app.legend.liveTip')}
      </p>
    </div>
  );
}
