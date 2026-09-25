import { Fragment, useEffect, type ReactNode } from 'react';
import { useT } from '../i18n';

/** Monta um texto traduzido trocando os "{nome}" por elementos (ex.: <b>, <code>) */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/g).map((part, i) => (i % 2 ? <Fragment key={i}>{nodes[part] ?? `{${part}}`}</Fragment> : part));
}

/** Modal simples: fecha com Esc ou clicando fora */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
