'use client';

import { getStatusClassName, getStatusDisplayName } from '@/lib/runs/display';

interface RunStatusPillProps {
  status: string;
}

export function RunStatusPill({ status }: RunStatusPillProps) {
  return <span className={getStatusClassName(status)}>{getStatusDisplayName(status)}</span>;
}
