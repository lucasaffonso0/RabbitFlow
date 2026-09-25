// jsdom não é usado: fornece o mínimo que o módulo de idioma lê do navegador
const g = globalThis as Record<string, unknown>;
g.navigator ??= { language: 'pt-BR', languages: ['pt-BR'] };
g.document ??= { documentElement: { lang: '' } };
g.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
