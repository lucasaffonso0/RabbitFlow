import { useEffect, useRef, useState } from 'react';
import { api, type User } from '../api';
import { getLanguage, LANGS, setLanguage, useLanguage, useT, type Lang } from '../i18n';
import { Dialog } from './Dialog';
import { ChangePasswordForm } from './AuthScreens';
import { UsersDialog } from './UsersDialog';

export function UserMenu({ user, onUserChange, onLogout, onOpenConnections }: {
  user: User; onUserChange: (u: User) => void; onLogout: () => void; onOpenConnections: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'password' | 'users' | null>(null);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    // Esc fecha o menu (e não chega aos atalhos do grafo)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (d: 'password' | 'users') => {
    setOpen(false);
    setSaved(false);
    setDialog(d);
  };

  // troca na hora e salva na conta (vale nos outros navegadores); ignora respostas de uma escolha já superada
  const pickLanguage = (l: Lang) => {
    setLanguage(l);
    api.setLanguagePreference(l).then((u) => getLanguage() === l && onUserChange(u)).catch(() => {});
  };

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar-sm">{user.username[0]?.toUpperCase()}</span>
        <span className="user-name">{user.username}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <b>{user.username}</b>
            <span>{user.isAdmin ? t('auth.role.admin') : t('auth.role.user')}</span>
          </div>
          <button role="menuitem" onClick={() => pick('password')}>{t('auth.menu.changePassword')}</button>
          {user.isAdmin && <button role="menuitem" onClick={() => pick('users')}>{t('auth.menu.users')}</button>}
          {user.isAdmin && (
            <button role="menuitem" onClick={() => { setOpen(false); onOpenConnections(); }}>{t('auth.menu.connections')}</button>
          )}
          <hr />
          <div className="menu-section" role="group" aria-label={t('common.language')}>
            <div className="menu-label">{t('common.language')}</div>
            {LANGS.map((l) => (
              <button
                key={l.code}
                role="menuitemradio"
                aria-checked={l.code === lang}
                className="menu-lang"
                lang={l.code}
                onClick={() => pickLanguage(l.code)}
              >
                <span className="menu-check" aria-hidden>{l.code === lang ? '✓' : ''}</span>
                {l.label}
              </button>
            ))}
          </div>
          <hr />
          <button role="menuitem" onClick={onLogout}>{t('auth.menu.logout')}</button>
        </div>
      )}
      {dialog === 'password' && (
        <Dialog title={t('auth.password.title')} onClose={() => setDialog(null)}>
          {saved ? (
            <div className="dialog-done">
              <p>{t('auth.password.done')}</p>
              <button className="primary" onClick={() => setDialog(null)}>{t('common.close')}</button>
            </div>
          ) : (
            <ChangePasswordForm
              onCancel={() => setDialog(null)}
              onDone={(u) => {
                onUserChange(u);
                setSaved(true);
              }}
            />
          )}
        </Dialog>
      )}
      {dialog === 'users' && <UsersDialog me={user} onClose={() => setDialog(null)} />}
    </div>
  );
}
