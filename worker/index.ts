import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { executeRunByDefinition } from '@/lib/runs/executor';

const POLL_INTERVAL_MS = 5000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimNextRun() {
  const supabase = createSupabaseServiceRoleClient();

  const { data: queued, error: queuedError } = await supabase
    .from('runs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queuedError) {
    throw new Error(`Error buscando runs en cola: ${queuedError.message}`);
  }

  if (!queued) {
    return null;
  }

  const { data: claimed, error: claimError } = await supabase
    .from('runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString()
    })
    .eq('id', queued.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();

  if (claimError) {
    throw new Error(`Error reclamando run: ${claimError.message}`);
  }

  return claimed;
}

async function main() {
  console.log('[worker] iniciado');

  while (true) {
    try {
      const run = await claimNextRun();

      if (!run) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`[worker] ejecutando run ${run.id} (${run.test_definition_key})`);
      await executeRunByDefinition(run);
      console.log(`[worker] finalizada run ${run.id}`);
    } catch (error) {
      console.error('[worker] error', error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

void main();
