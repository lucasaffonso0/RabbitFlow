import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Connection, type ConnectionInput, type Overview } from '../api';
import { useT } from '../i18n';
import { Dialog, rich } from './Dialog';

const empty: ConnectionInput = { name: '', apiUrl: '', username: '', password: '' };

interface Props {
  onClose: () => void;
  /** Lista mudou; `select` = conexão recém-criada para já exibir */
  onChanged: (select?: number) => void;
  /** Abre direto na edição desta conexão (ex.: ela está falhando) */
  editId?: number | null;
}

/** Cadastro das conexões com o RabbitMQ (somente administradores) */
export function ConnectionsDialog({ onClose, onChanged, editId }: Props) {
  const t = useT();
  const [list, setList] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null = só a lista; 'new' = cadastro; número = edição */
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const [form, setForm] = useState<ConnectionInput>(empty);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: true; info: Overview } | { ok: false; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(() => api.connections().then(setList, (e) => setError((e as Error).message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setEditing('new');
    setForm(empty);
    setTest(null);
    setError(null);
  };
  const startEdit = (c: Connection) => {
    setEditing(c.id);
    setForm({ name: c.name, apiUrl: c.apiUrl, username: c.username, password: '' });
    setTest(null);
    setError(null);
  };

  // abre direto no cadastro (sem conexões) ou na edição pedida
  useEffect(() => {
    if (!list) return;
    if (editing !== null) return;
    const target = editId ? list.find((c) => c.id === editId) : undefined;
    if (target) startEdit(target);
    else if (list.length === 0) startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const set = (k: keyof ConnectionInput) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setTest(null);
  };

  const runTest = async () => {
    setBusy(true);
    setTesting(true);
    setTest(null);
    try {
      const info = await api.testConnection({ ...form, id: typeof editing === 'number' ? editing : undefined });
      setTest({ ok: true, info });
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
      setTesting(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = editing === 'new' ? await api.createConnection(form) : await api.updateConnection(editing as number, form);
      await load();
      onChanged(saved.id);
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteConnection(id);
      await load();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  const isNew = editing === 'new';

  return (
    <Dialog title={t('auth.conn.title')} onClose={onClose} wide>
      {editing === null ? (
        <>
          <div className="conn-head">
            <p className="muted small">
              {rich(t('auth.conn.intro'), { read: <b>{t('auth.conn.read')}</b>, tag: <code>monitoring</code> })}
            </p>
            <button className="primary" onClick={startNew}>{t('auth.conn.add')}</button>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <ul className="conn-list">
            {list?.map((c) => (
              <li key={c.id}>
                <div className="conn-info">
                  <b>{c.name}</b>
                  <span>{rich(t('auth.conn.userLine'), { url: c.apiUrl, user: <code>{c.username}</code> })}</span>
                </div>
                <div className="row-actions">
                  {confirmDelete === c.id ? (
                    <>
                      <span>{t('auth.conn.confirmRemove', { name: c.name })}</span>
                      <button className="danger" disabled={busy} onClick={() => remove(c.id)}>{t('auth.remove')}</button>
                      <button onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(c)}>{t('auth.edit')}</button>
                      <button className="danger-ghost" onClick={() => setConfirmDelete(c.id)}>{t('auth.remove')}</button>
                    </>
                  )}
                </div>
              </li>
            ))}
            {list?.length === 0 && <li className="muted">{t('auth.conn.empty')}</li>}
            {!list && !error && <li className="muted">{t('common.loading')}</li>}
          </ul>
        </>
      ) : (
        <form className="conn-form" onSubmit={save}>
          <h3>{isNew ? t('auth.conn.new') : t('auth.conn.editTitle', { name: list?.find((c) => c.id === editing)?.name ?? '' })}</h3>
          <label className="auth-field">
            <span>{t('auth.conn.name')}</span>
            <input value={form.name} onChange={set('name')} placeholder={t('auth.conn.namePlaceholder')} autoFocus required maxLength={60} />
          </label>
          <label className="auth-field">
            <span>{t('auth.conn.apiUrl')}</span>
            <input value={form.apiUrl} onChange={set('apiUrl')} placeholder="http://rabbitmq:15672" required spellCheck={false} />
            <small>{rich(t('auth.conn.apiUrlHint'), { url: <code>http://host.docker.internal:15672</code> })}</small>
          </label>
          <div className="conn-grid">
            <label className="auth-field">
              <span>{t('auth.field.username')}</span>
              <input value={form.username} onChange={set('username')} required autoComplete="off" spellCheck={false} />
            </label>
            <label className="auth-field">
              <span>{t('auth.field.password')}</span>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                required={isNew}
                autoComplete="new-password"
                placeholder={isNew ? '' : t('auth.conn.passwordKeep')}
              />
            </label>
          </div>
          <p className="muted small">{t('auth.conn.passwordNote')}</p>

          {test && (
            test.ok ? (
              <div className="conn-test ok">{t('auth.conn.testOk', { version: test.info.version, cluster: test.info.cluster })}</div>
            ) : (
              <div className="auth-error" role="alert">✕ {test.message}</div>
            )
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}

          <div className="conn-actions">
            <button type="button" onClick={runTest} disabled={busy || !form.apiUrl || !form.username || (isNew && !form.password)}>
              {testing ? t('auth.conn.testing') : t('auth.conn.test')}
            </button>
            <span className="spacer" />
            {(list?.length ?? 0) > 0 && <button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button>}
            <button className="primary" disabled={busy}>{isNew ? t('auth.conn.addSubmit') : t('common.save')}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
