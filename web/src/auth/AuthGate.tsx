import { useCallback, useEffect, useState } from 'react';
import { api, AUTH_EVENT, type User } from '../api';
import { setPrefsUser } from '../persist';
import { setLanguage, useT, type MessageKey } from '../i18n';
import { takeLanguagePickedBeforeLogin } from './LanguageSelect';
import { ForcedPasswordScreen, LoginScreen, SetupScreen } from './AuthScreens';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'setup' }
  | { kind: 'login'; notice?: MessageKey }
  | { kind: 'forced'; user: User }
  | { kind: 'app'; user: User };

export interface Session {
  user: User;
  onUserChange: (u: User) => void;
  onLogout: () => void;
}

/** Decide entre primeiro acesso, login, troca obrigatória de senha e o app */
export function AuthGate({ children }: { children: (s: Session) => JSX.Element }) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const enter = useCallback((user: User) => {
    if (user.mustChangePassword) return setState({ kind: 'forced', user });
    setPrefsUser(user.id); // preferências do navegador ficam separadas por usuário
    const picked = takeLanguagePickedBeforeLogin();
    if (picked) {
      // escolhido agora na tela de login: vale e vira o idioma da conta
      setLanguage(picked);
      if (picked !== user.language) {
        api.setLanguagePreference(picked).catch(() => undefined);
        user = { ...user, language: picked };
      }
    } else if (user.language) {
      setLanguage(user.language); // idioma salvo na conta vale em qualquer navegador
    }
    setState({ kind: 'app', user });
  }, []);

  const refresh = useCallback(() => {
    api.authState()
      .then((s) => (s.setupRequired ? setState({ kind: 'setup' }) : s.user ? enter(s.user) : setState({ kind: 'login' })))
      .catch((err) => setState({ kind: 'error', message: (err as Error).message }));
  }, [enter]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const onAuth = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      if (code === 'UNAUTHENTICATED') setState({ kind: 'login', notice: 'auth.sessionEnded' });
      else refresh();
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [refresh]);

  const logout = useCallback(() => {
    api.logout().catch(() => undefined).finally(() => {
      setPrefsUser(null);
      setState({ kind: 'login' });
    });
  }, []);

  switch (state.kind) {
    case 'loading':
      return <div className="auth-page"><p className="muted">{t('common.loading')}</p></div>;
    case 'error':
      return (
        <div className="auth-page">
          <div className="auth-card">
            <h1>{t('auth.connectError')}</h1>
            <p className="auth-error">{state.message}</p>
            <button onClick={refresh}>{t('common.retry')}</button>
          </div>
        </div>
      );
    case 'setup':
      return <SetupScreen onDone={enter} />;
    case 'login':
      return <LoginScreen onDone={enter} notice={state.notice && t(state.notice)} />;
    case 'forced':
      return <ForcedPasswordScreen user={state.user} onDone={enter} onLogout={logout} />;
    case 'app':
      // key: troca de usuário remonta o app com as preferências certas
      return <div key={state.user.id} className="app-root">{children({ user: state.user, onUserChange: enter, onLogout: logout })}</div>;
  }
}
