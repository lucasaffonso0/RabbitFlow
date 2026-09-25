import { describe, expect, it } from 'vitest';
import { bundles } from './messages';
import { setLanguage, t } from './index';

describe('i18n', () => {
  it('troca o idioma', () => {
    setLanguage('en');
    expect(t('common.close')).toBe('Close');
    setLanguage('es');
    expect(t('common.close')).toBe('Cerrar');
    setLanguage('pt-BR');
    expect(t('common.close')).toBe('Fechar');
  });
  it('todos os idiomas têm as mesmas chaves e nenhuma tradução vazia', () => {
    const keys = Object.keys(bundles['pt-BR']).sort();
    for (const lang of ['en', 'es'] as const) expect(Object.keys(bundles[lang]).sort()).toEqual(keys);
    for (const lang of ['pt-BR', 'en', 'es'] as const) {
      for (const [k, v] of Object.entries(bundles[lang])) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });
  it('as variáveis {x} de cada mensagem existem em todos os idiomas', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [k, v] of Object.entries(bundles['pt-BR'])) {
      expect(vars(bundles.en[k as keyof typeof bundles.en]), `en ${k}`).toBe(vars(v));
      expect(vars(bundles.es[k as keyof typeof bundles.es]), `es ${k}`).toBe(vars(v));
    }
  });
});
