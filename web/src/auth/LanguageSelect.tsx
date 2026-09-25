import { LANGS, setLanguage, useLanguage, useT, type Lang } from '../i18n';

/** Idioma escolhido na tela de login: ao entrar, vence o salvo na conta (e passa a ser o da conta) */
let pickedBeforeLogin: Lang | null = null;

export function takeLanguagePickedBeforeLogin(): Lang | null {
  const lang = pickedBeforeLogin;
  pickedBeforeLogin = null;
  return lang;
}

const pickBeforeLogin = (lang: Lang) => {
  pickedBeforeLogin = lang;
  setLanguage(lang);
};

/** Seletor de idioma; cada opção aparece no próprio idioma (Português / English / Español) */
export function LanguageSelect({ onChange = pickBeforeLogin, className }: { onChange?: (lang: Lang) => void; className?: string }) {
  const t = useT();
  const lang = useLanguage();
  return (
    <select
      className={`lang-select ${className ?? ''}`.trim()}
      value={lang}
      onChange={(e) => onChange(e.target.value as Lang)}
      aria-label={t('common.language')}
      title={t('common.language')}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
