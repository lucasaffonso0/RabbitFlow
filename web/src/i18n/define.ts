export type Lang = 'pt-BR' | 'en' | 'es';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

/**
 * Mensagens de uma área da interface, nos três idiomas.
 * O TypeScript exige as mesmas chaves em todos: faltar uma tradução é erro de compilação.
 * Sintaxe: "{nome}" é substituído pelo valor; "singular|plural" escolhe pela variável {n}.
 */
export function defineMessages<K extends string>(m: Record<Lang, Record<K, string>>) {
  return m;
}
