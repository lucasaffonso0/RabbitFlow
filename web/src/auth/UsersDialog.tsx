import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type User, type UserListItem } from '../api';
import { fmtDateTime, useT } from '../i18n';
import { Dialog, rich } from './Dialog';

const when = (ms: number | null) => (ms ? fmtDateTime(ms, { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Senha temporária exibida uma única vez, com botão de copiar */
function TempPassword({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      /* sem permissão de clipboard: o usuário copia manualmente */
    }
  };
  return (
    <div className="temp-pass" role="status">
      <p>{rich(t('auth.temp.intro'), { name: <b>{username}</b> })}</p>
      <div className="temp-pass-row">
        <code>{password}</code>
        <button onClick={copy}>{copied ? t('auth.temp.copied') : t('auth.temp.copy')}</button>
      </div>
      <p className="muted small">{t('auth.temp.once')}</p>
      <button className="link" onClick={onClose}>{t('auth.temp.ok')}</button>
    </div>
  );
}

export function UsersDialog({ me, onClose }: { me: User; onClose: () => void }) {
  const t = useT();
  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const [username, setUsername] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: number; action: 'reset' | 'delete' } | null>(null);

  const load = useCallback(() => {
    api.users().then(setUsers, (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.createUser(username.trim(), isAdmin);
      setTemp({ username: r.user.username, password: r.tempPassword });
      setUsername('');
      setIsAdmin(false);
    });
  };

  return (
    <Dialog title={t('auth.users.title')} onClose={onClose} wide>
      <form className="new-user" onSubmit={create}>
        <input
          placeholder={t('auth.users.newPlaceholder')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          spellCheck={false}
          aria-label={t('auth.users.newAria')}
        />
        <label className="check-inline">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> {t('auth.users.adminCheck')}
        </label>
        <button className="primary" disabled={busy || username.trim().length < 3}>{t('auth.users.create')}</button>
      </form>
      <p className="muted small">{t('auth.users.hint')}</p>

      {temp && <TempPassword username={temp.username} password={temp.password} onClose={() => setTemp(null)} />}
      {error && <div className="auth-error" role="alert">{error}</div>}

      <table className="users-table">
        <thead>
          <tr><th>{t('auth.field.username')}</th><th>{t('auth.users.colLastLogin')}</th><th>{t('auth.users.colCreated')}</th><th /></tr>
        </thead>
        <tbody>
          {users?.map((u) => {
            const self = u.id === me.id;
            const asking = confirm?.id === u.id ? confirm.action : null;
            return (
              <tr key={u.id}>
                <td>
                  <b>{u.username}</b>
                  {u.isAdmin && <span className="tag admin">{t('auth.users.tagAdmin')}</span>}
                  {self && <span className="tag">{t('auth.users.you')}</span>}
                  {u.mustChangePassword && <span className="tag warn" title={t('auth.users.tempTitle')}>{t('auth.users.tempTag')}</span>}
                </td>
                <td>{when(u.lastLoginAt)}</td>
                <td>{when(u.createdAt)}{u.createdBy && <span className="muted"> {t('auth.users.by', { name: u.createdBy })}</span>}</td>
                <td>
                  <div className="row-actions">
                  {asking ? (
                    <>
                      <span>{asking === 'delete' ? t('auth.users.confirmRemove', { name: u.username }) : t('auth.users.confirmReset', { name: u.username })}</span>
                      <button
                        className={asking === 'delete' ? 'danger' : 'primary'}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            if (asking === 'delete') await api.deleteUser(u.id);
                            else setTemp({ username: u.username, password: (await api.resetPassword(u.id)).tempPassword });
                          })
                        }
                      >
                        {t('common.confirm')}
                      </button>
                      <button onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
                    </>
                  ) : (
                    <>
                      {!self && (
                        <button disabled={busy} onClick={() => run(async () => void (await api.setAdmin(u.id, !u.isAdmin)))}>
                          {u.isAdmin ? t('auth.users.revokeAdmin') : t('auth.users.makeAdmin')}
                        </button>
                      )}
                      {!self && <button disabled={busy} onClick={() => setConfirm({ id: u.id, action: 'reset' })}>{t('auth.users.reset')}</button>}
                      {!self && <button className="danger-ghost" disabled={busy} onClick={() => setConfirm({ id: u.id, action: 'delete' })}>{t('auth.remove')}</button>}
                    </>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!users && !error && <tr><td colSpan={4} className="muted">{t('common.loading')}</td></tr>}
        </tbody>
      </table>
    </Dialog>
  );
}
