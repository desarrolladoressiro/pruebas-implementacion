'use client';

interface RunStatusPillProps {
  status: string;
}

function classForStatus(status: string) {
  if (status === 'completed' || status === 'success') {
    return 'badge badge-ok';
  }

  if (status === 'failed' || status === 'timed_out' || status === 'cancelled') {
    return 'badge badge-err';
  }

  return 'badge badge-warn';
}

export function RunStatusPill({ status }: RunStatusPillProps) {
  return <span className={classForStatus(status)}>{status}</span>;
}
