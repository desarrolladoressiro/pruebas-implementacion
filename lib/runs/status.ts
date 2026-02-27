import { RunStatus } from '@/lib/types';

export function runStatusBadge(status: RunStatus) {
  if (status === 'completed') {
    return 'badge badge-ok';
  }

  if (status === 'failed' || status === 'timed_out' || status === 'cancelled') {
    return 'badge badge-err';
  }

  return 'badge badge-warn';
}
