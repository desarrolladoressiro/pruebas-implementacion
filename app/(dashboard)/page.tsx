import Link from 'next/link';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentUser } from '@/lib/auth';
import { syncTestDefinitions } from '@/lib/runs/sync-definitions';
import { listRunsForUser } from '@/lib/runs/queries';
import { StartRunForm } from '@/components/start-run-form';
import { RunStatusPill } from '@/components/runs/run-status-pill';
import { formatDateTimeAr } from '@/lib/datetime';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  await syncTestDefinitions();

  const supabase = createSupabaseServiceRoleClient();
  const [{ data: definitions }, runs] = await Promise.all([
    supabase
      .from('test_definitions')
      .select('key,name,domain,description,default_input')
      .eq('enabled', true)
      .order('domain', { ascending: true })
      .order('name', { ascending: true }),
    listRunsForUser(user.id)
  ]);

  return (
    <section className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Dashboard</h1>
      <p className="muted" style={{ margin: 0 }}>
        Modulos habilitados en esta etapa: API SIRO Pagos + API SIRO.
      </p>

      <div className="grid grid-2">
        <StartRunForm definitions={definitions ?? []} />

        <section className="card grid">
          <h2 style={{ margin: 0 }}>Ultimas runs</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Definicion</th>
                <th>Entorno</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatDateTimeAr(run.created_at)}</td>
                  <td>{String(run.test_definition_key)}</td>
                  <td>{String(run.environment)}</td>
                  <td>
                    <RunStatusPill status={String(run.status)} />
                  </td>
                  <td>
                    <Link href={`/runs/${run.id}`}>Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
