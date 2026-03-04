import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getUserRole } from '@/lib/runs/repository';

export async function listRunsForUser(userId: string, dateStr?: string) {
  const supabase = createSupabaseServiceRoleClient();
  const role = await getUserRole(userId);

  let query = supabase
    .from('runs')
    .select('id,user_id,test_definition_key,environment,status,created_at,started_at,ended_at,error_message')
    .order('created_at', { ascending: false })
    .limit(50);

  if (role !== 'admin') {
    query = query.eq('user_id', userId);
  }

  if (dateStr) {
    // Add date filter assuming Argentina timezone
    const startOfDay = new Date(`${dateStr}T00:00:00-03:00`).toISOString();
    const endOfDay = new Date(`${dateStr}T23:59:59.999-03:00`).toISOString();
    query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No se pudieron listar runs: ${error.message}`);
  }

  return data ?? [];
}

export async function getRunDetailForUser(userId: string, runId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const role = await getUserRole(userId);

  const runQuery = supabase.from('runs').select('*').eq('id', runId);

  if (role !== 'admin') {
    runQuery.eq('user_id', userId);
  }

  const { data: run, error: runError } = await runQuery.single();

  if (runError || !run) {
    throw new Error('Run no encontrada o sin permisos.');
  }

  const [{ data: steps }, { data: events }, { data: artifacts }] = await Promise.all([
    supabase.from('run_steps').select('*').eq('run_id', runId).order('sequence', { ascending: true }),
    supabase.from('run_events').select('*').eq('run_id', runId).order('created_at', { ascending: true }),
    supabase.from('run_artifacts').select('*').eq('run_id', runId).order('created_at', { ascending: true })
  ]);

  return {
    run,
    steps: steps ?? [],
    events: events ?? [],
    artifacts: artifacts ?? []
  };
}

export async function retryRunForUser(userId: string, runId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const role = await getUserRole(userId);

  const runQuery = supabase.from('runs').select('*').eq('id', runId);
  if (role !== 'admin') {
    runQuery.eq('user_id', userId);
  }

  const { data: run, error: runError } = await runQuery.single();

  if (runError || !run) {
    throw new Error('Run no encontrada o sin permisos.');
  }

  const { error } = await supabase
    .from('runs')
    .update({
      status: 'queued',
      started_at: null,
      ended_at: null,
      error_message: null
    })
    .eq('id', runId);

  if (error) {
    throw new Error(`No se pudo reencolar la run: ${error.message}`);
  }
}
