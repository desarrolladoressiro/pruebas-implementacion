import { NextResponse } from 'next/server';
import { appendRunEvent, finishRunStep, updateRunStatus } from '@/lib/runs/repository';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

function paramsToObject(params: URLSearchParams) {
  return Array.from(params.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

async function finalizeAwaitingSteps(runId: string, payload: Record<string, string>, body: any, kind: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: steps, error } = await supabase
    .from('run_steps')
    .select('id')
    .eq('run_id', runId)
    .eq('status', 'awaiting_external_event');

  if (error || !steps?.length) {
    return;
  }

  for (const step of steps) {
    await finishRunStep({
      stepId: step.id,
      status: kind === 'error' ? 'failed' : 'success',
      responseJson: {
        webhook: payload,
        body: body ?? {}
      }
    });
  }
}

async function processWebhook(request: Request, body?: any) {
  const url = new URL(request.url);
  const queryParams = paramsToObject(url.searchParams);
  const runId = String(queryParams.run_id ?? body?.run_id ?? '');
  const kind = String(queryParams.kind ?? body?.kind ?? 'ok');

  const supabase = createSupabaseServiceRoleClient();

  await supabase.from('webhook_events').insert({
    run_id: runId || null,
    source: 'siro_url_ok',
    query_params: queryParams,
    payload_json: body ?? {}
  });

  if (runId) {
    await appendRunEvent({
      runId,
      level: kind === 'error' ? 'error' : 'info',
      message: 'Webhook URL_OK recibido',
      payload: {
        query: queryParams,
        body: body ?? {}
      }
    });

    await finalizeAwaitingSteps(runId, queryParams, body, kind);

    if (kind === 'error') {
      await updateRunStatus(runId, 'failed', {
        webhook: queryParams,
        body: body ?? {}
      });
    } else {
      await updateRunStatus(runId, 'completed', {
        webhook: queryParams,
        body: body ?? {}
      });
    }
  }

  return NextResponse.json({ ok: true, runId, kind, queryParams });
}

export async function GET(request: Request) {
  return processWebhook(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as any;
  return processWebhook(request, body);
}
