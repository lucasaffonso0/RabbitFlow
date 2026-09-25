import type { Lang } from './define';
import common from './ns/common';
import auth from './ns/auth';
import app from './ns/app';
import graph from './ns/graph';
import sim from './ns/sim';

/** Cada área da interface tem seu arquivo em ./ns; registre-o aqui */
const namespaces = [common, auth, app, graph, sim] as const;

type Merge<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? (H extends Record<Lang, infer M> ? M : never) & Merge<R>
  : unknown;

export type Messages = Merge<typeof namespaces>;
export type MessageKey = keyof Messages & string;

export const bundles = Object.fromEntries(
  (['pt-BR', 'en', 'es'] as Lang[]).map((lang) => [lang, Object.assign({}, ...namespaces.map((ns) => ns[lang]))]),
) as Record<Lang, Record<MessageKey, string>>;
