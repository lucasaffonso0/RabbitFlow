import { useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type User } from '../api';
import { t, useT } from '../i18n';
import { rich } from './Dialog';
import { LanguageSelect } from './LanguageSelect';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  useT();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><span className="logo">🐇</span><span>Rabbit<span className="brand-accent">Flow</span></span></div>
        <h1>{title}</h1>
        {subtitle && <p className="auth-sub">{subtitle}</p>}
        {children}
      </div>
      <div className="auth-foot-row">
        <p className="auth-foot">{t('auth.foot')}</p>
        <LanguageSelect />
      </div>
    </div>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; autoFocus?: boolean; hint?: string;
}) {
  return (
    <label className="auth-field">
      <span>{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        spellCheck={false}
        required
      />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

const message = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : t('common.somethingWrong'));

/** Formulário com estado de envio e erro */
function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

export function SetupScreen({ onDone }: { onDone: (u: User) => void }) {
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    if (password !== confirm) throw new Error(t('auth.setup.mismatch'));
    onDone(await api.setup(username, password));
  });
  return (
    <AuthCard title={t('auth.setup.title')} subtitle={t('auth.setup.subtitle')}>
      <form onSubmit={submit}>
        <Field label={t('auth.field.username')} value={username} onChange={setUsername} autoComplete="username" autoFocus hint={t('auth.field.usernameHint')} />
        <Field label={t('auth.field.password')} type="password" value={password} onChange={setPassword} autoComplete="new-password" hint={t('auth.field.passwordHint')} />
        <Field label={t('auth.field.confirmPassword')} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary auth-submit" disabled={busy}>{busy ? t('auth.setup.submitting') : t('auth.setup.submit')}</button>
      </form>
    </AuthCard>
  );
}

export function LoginScreen({ onDone, notice }: { onDone: (u: User) => void; notice?: string | null }) {
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit(async () => onDone(await api.login(username, password)));
  return (
    <AuthCard title={t('auth.login.title')}>
      {notice && <div className="auth-notice">{notice}</div>}
      <form onSubmit={submit}>
        <Field label={t('auth.field.username')} value={username} onChange={setUsername} autoComplete="username" autoFocus />
        <Field label={t('auth.field.password')} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary auth-submit" disabled={busy}>{busy ? t('auth.login.submitting') : t('auth.login.submit')}</button>
      </form>
      <p className="auth-help">{t('auth.login.forgot')}</p>
    </AuthCard>
  );
}

/** Formulário de troca de senha: tela obrigatória (senha temporária) ou dentro do diálogo "Alterar senha" */
export function ChangePasswordForm({ onDone, forced, onCancel }: { onDone: (u: User) => void; forced?: boolean; onCancel?: () => void }) {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    if (next !== confirm) throw new Error(t('auth.change.mismatch'));
    onDone(await api.changePassword(current, next));
  });
  return (
    <form onSubmit={submit}>
      <Field label={forced ? t('auth.change.temporary') : t('auth.change.current')} type="password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      <Field label={t('auth.change.new')} type="password" value={next} onChange={setNext} autoComplete="new-password" hint={t('auth.field.passwordHint')} />
      <Field label={t('auth.change.confirm')} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="auth-actions">
        {onCancel && <button type="button" onClick={onCancel}>{t('common.cancel')}</button>}
        <button className="primary auth-submit" disabled={busy}>{busy ? t('auth.change.saving') : t('auth.change.submit')}</button>
      </div>
    </form>
  );
}

export function ForcedPasswordScreen({ user, onDone, onLogout }: { user: User; onDone: (u: User) => void; onLogout: () => void }) {
  const t = useT();
  return (
    <AuthCard title={t('auth.forced.title')} subtitle={rich(t('auth.forced.subtitle'), { name: <b>{user.username}</b> })}>
      <ChangePasswordForm forced onDone={onDone} />
      <p className="auth-help"><button className="link" onClick={onLogout}>{t('auth.logout')}</button></p>
    </AuthCard>
  );
}
