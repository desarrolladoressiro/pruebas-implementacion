import { RunStatus } from '@/lib/types';
import { getStatusClassName } from '@/lib/runs/display';

export function runStatusBadge(status: RunStatus) {
  return getStatusClassName(status);
}
