import Link from 'next/link';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentUser } from '@/lib/auth';
import { syncTestDefinitions } from '@/lib/runs/sync-definitions';
import { listRunsForUser } from '@/lib/runs/queries';
import { StartRunForm } from '@/components/start-run-form';
import { RunStatusPill } from '@/components/runs/run-status-pill';
import { formatDateTimeAr } from '@/lib/datetime';

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const sp = await searchParams;
  const rawDateStr = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const todayStr = rawDateStr.slice(0, 10);
  const filterDateStr = sp.date ?? todayStr;

  await syncTestDefinitions();

  const supabase = createSupabaseServiceRoleClient();
  const [{ data: definitions }, runs] = await Promise.all([
    supabase
      .from('test_definitions')
      .select('key,name,domain,description,default_input')
      .eq('enabled', true)
      .order('domain', { ascending: true })
      .order('name', { ascending: true }),
    listRunsForUser(user.id, filterDateStr)
  ]);

  return (
    <div className="dashboard-layout">
      {/* Left Column: Form */}
      <div className="scrollable-panel">
        <div className="scrollable-panel-header">
          <div className="flex-col">
            <span style={{ fontSize: '1.25rem' }}>Nueva Ejecución</span>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400 }}>Módulos habilitados: API SIRO Pagos + API SIRO.</span>
          </div>
        </div>
        <div className="scrollable-panel-body">
          <StartRunForm definitions={definitions ?? []} />
        </div>
      </div>

      {/* Right Column: Recent Runs */}
      <div className="scrollable-panel">
        <div className="scrollable-panel-header">
          <span style={{ fontSize: '1.25rem' }}>Últimas runs</span>
          <form method="GET" style={{ display: 'flex', gap: 8, margin: 0 }}>
            <input type="date" name="date" defaultValue={filterDateStr} className="input" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} />
            <button type="submit" className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}>Filtrar</button>
          </form>
        </div>
        <div className="scrollable-panel-body" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Definición</th>
                <th>Entorno</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, idx) => (
                <tr key={run.id} className="animate-enter" style={{ animationDelay: `${idx * 0.03}s` }}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{formatDateTimeAr(run.created_at).split(',')[0]}</div>
                    <div className="muted" style={{ fontSize: '12px' }}>{formatDateTimeAr(run.created_at).split(',')[1]}</div>
                  </td>
                  <td>
                    <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                      {String(run.test_definition_key)}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(243, 172, 51, 0.1)', color: '#b47100' }}>
                      {String(run.environment)}
                    </span>
                  </td>
                  <td>
                    <RunStatusPill status={String(run.status)} />
                  </td>
                  <td>
                    <Link href={`/runs/${run.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr className="animate-enter">
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No hay ejecuciones para esta fecha.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
