import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getRunDetailForUser } from '@/lib/runs/queries';
import { RunLivePanel } from '@/components/runs/run-live-panel';

export default async function RunDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return notFound();
  }

  const { id } = await params;
  let detail;

  try {
    detail = await getRunDetailForUser(user.id, id);
  } catch {
    return notFound();
  }

  return (
    <section className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Detalle de Run</h1>
      <RunLivePanel
        runId={id}
        initialRun={detail.run}
        initialSteps={detail.steps}
        initialEvents={detail.events}
      />
    </section>
  );
}
