export type Args = Record<string, unknown>;

export interface Exchange {
  name: string;
  type: string;
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  arguments: Args;
  policy: string | null;
  alternateExchange: string | null;
  rates: { publishIn: number; publishOut: number };
}

export interface Queue {
  name: string;
  type: string;
  durable: boolean;
  autoDelete: boolean;
  exclusive: boolean;
  arguments: Args;
  policy: string | null;
  state: string;
  deadLetterExchange: string | null;
  deadLetterRoutingKey: string | null;
  messages: number;
  messagesReady: number;
  messagesUnacked: number;
  consumers: number;
  rates: {
    publish: number;
    deliver: number;
    ack: number;
    /** Variação do total de mensagens (msg/s) desde a leitura anterior; calculada no navegador */
    growth?: number;
  };
}

export interface Binding {
  source: string;
  destination: string;
  destinationType: 'queue' | 'exchange';
  routingKey: string;
  arguments: Args;
  propertiesKey: string;
}

export interface Consumer {
  tag: string;
  queue: string;
  channel: string;
  connection: string;
  peer: string;
  prefetch: number;
  ackRequired: boolean;
  active: boolean;
}

export interface Topology {
  vhost: string;
  fetchedAt: string;
  exchanges: Exchange[];
  queues: Queue[];
  bindings: Binding[];
  consumers: Consumer[];
}

// IDs compartilhados entre o grafo e o simulador
export const exId = (name: string) => `ex:${name}`;
export const qId = (name: string) => `q:${name}`;
/** Um nó agrupa todos os consumers de uma queue */
export const cgId = (queue: string) => `cg:${queue}`;
export const bindingId = (b: Binding) =>
  `b:${b.source}->${b.destinationType}:${b.destination}:${b.propertiesKey}`;
export const aeId = (exchange: string) => `ae:${exchange}`;
export const dlxId = (queue: string) => `dlx:${queue}`;
