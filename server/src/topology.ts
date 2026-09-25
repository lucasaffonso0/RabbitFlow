import { vh, type RabbitClient } from './rabbit.js';

type Args = Record<string, unknown>;

interface RawExchange {
  name: string;
  type: string;
  durable: boolean;
  auto_delete: boolean;
  internal: boolean;
  arguments: Args;
  policy?: string | null;
  effective_policy_definition?: Args | null;
  message_stats?: { publish_in_details?: { rate: number }; publish_out_details?: { rate: number } };
}

interface RawQueue {
  name: string;
  type?: string;
  durable: boolean;
  auto_delete: boolean;
  exclusive?: boolean;
  arguments: Args;
  policy?: string | null;
  effective_policy_definition?: Args | null;
  state?: string;
  messages?: number;
  messages_ready?: number;
  messages_unacknowledged?: number;
  consumers?: number;
  message_stats?: {
    publish_details?: { rate: number };
    deliver_get_details?: { rate: number };
    ack_details?: { rate: number };
  };
}

interface RawBinding {
  source: string;
  destination: string;
  destination_type: 'queue' | 'exchange';
  routing_key: string;
  arguments: Args;
  properties_key: string;
}

interface RawConsumer {
  consumer_tag: string;
  queue: { name: string };
  channel_details?: { name?: string; connection_name?: string; peer_host?: string; peer_port?: number };
  prefetch_count: number;
  ack_required: boolean;
  active?: boolean;
}

const pick = (args: Args | null | undefined, key: string) =>
  args && typeof args[key] === 'string' ? (args[key] as string) : undefined;

// Sem janela, a taxa instantânea oscila para 0 entre coletas de estatística; média de 30s estabiliza.
const RATES = 'msg_rates_age=30&msg_rates_incr=5';

export async function getTopology(rabbit: RabbitClient, vhost: string) {
  const v = vh(vhost);
  const [exchanges, queues, bindings, consumers] = await Promise.all([
    rabbit.get<RawExchange[]>(`/exchanges/${v}?${RATES}`),
    rabbit.get<RawQueue[]>(`/queues/${v}?${RATES}`),
    rabbit.get<RawBinding[]>(`/bindings/${v}`),
    rabbit.get<RawConsumer[]>(`/consumers/${v}`),
  ]);

  return {
    vhost,
    fetchedAt: new Date().toISOString(),
    exchanges: exchanges.map((e) => ({
      name: e.name,
      type: e.type,
      durable: e.durable,
      autoDelete: e.auto_delete,
      internal: e.internal,
      arguments: e.arguments ?? {},
      policy: e.policy ?? null,
      // x-argument tem precedência sobre a policy, como no broker
      alternateExchange:
        pick(e.arguments, 'alternate-exchange') ?? pick(e.effective_policy_definition, 'alternate-exchange') ?? null,
      rates: {
        publishIn: e.message_stats?.publish_in_details?.rate ?? 0,
        publishOut: e.message_stats?.publish_out_details?.rate ?? 0,
      },
    })),
    queues: queues.map((q) => ({
      name: q.name,
      type: q.type ?? (pick(q.arguments, 'x-queue-type') || 'classic'),
      durable: q.durable,
      autoDelete: q.auto_delete,
      exclusive: q.exclusive ?? false,
      arguments: q.arguments ?? {},
      policy: q.policy ?? null,
      state: q.state ?? 'unknown',
      deadLetterExchange:
        pick(q.arguments, 'x-dead-letter-exchange') ?? pick(q.effective_policy_definition, 'dead-letter-exchange') ?? null,
      deadLetterRoutingKey:
        pick(q.arguments, 'x-dead-letter-routing-key') ??
        pick(q.effective_policy_definition, 'dead-letter-routing-key') ??
        null,
      messages: q.messages ?? 0,
      messagesReady: q.messages_ready ?? 0,
      messagesUnacked: q.messages_unacknowledged ?? 0,
      consumers: q.consumers ?? 0,
      rates: {
        publish: q.message_stats?.publish_details?.rate ?? 0,
        deliver: q.message_stats?.deliver_get_details?.rate ?? 0,
        ack: q.message_stats?.ack_details?.rate ?? 0,
      },
    })),
    bindings: bindings.map((b) => ({
      source: b.source,
      destination: b.destination,
      destinationType: b.destination_type,
      routingKey: b.routing_key,
      arguments: b.arguments ?? {},
      propertiesKey: b.properties_key,
    })),
    consumers: consumers.map((c) => ({
      tag: c.consumer_tag,
      queue: c.queue.name,
      channel: c.channel_details?.name ?? '',
      connection: c.channel_details?.connection_name ?? '',
      peer: c.channel_details?.peer_host ? `${c.channel_details.peer_host}:${c.channel_details.peer_port}` : '',
      prefetch: c.prefetch_count,
      ackRequired: c.ack_required,
      active: c.active ?? true,
    })),
  };
}
