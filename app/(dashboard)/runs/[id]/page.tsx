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
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: '40px' }}>
        <RunLivePanel
          runId={id}
          initialRun={detail.run}
          initialSteps={detail.steps}
          initialEvents={detail.events}
          initialArtifacts={detail.artifacts}
        />
      </div>
    </div>
  );
}
