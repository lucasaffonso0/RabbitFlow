import type { Queue } from '../types';
import { t } from '../i18n';

export type QueueStatus = 'ok' | 'warn' | 'idle' | 'bad';

export const statusLabel = (status: QueueStatus): string => t(`graph.status.${status}`);

export const statusHelp = (status: QueueStatus): string => t(`graph.statusHelp.${status}`);

export function queueStatus(q: Queue): QueueStatus {
  if (q.state !== 'running' && q.state !== 'unknown') return 'bad';
  if (q.consumers === 0) return q.messagesReady > 0 ? 'warn' : 'idle';
  return 'ok';
}
