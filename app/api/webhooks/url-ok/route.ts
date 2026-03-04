import { NextResponse } from 'next/server';
import { appendRunEvent, finishRunStep, updateRunStatus } from '@/lib/runs/repository';
import { executePagoFollowupQueries } from '@/lib/runs/pago-followup';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { TargetEnvironment } from '@/lib/types';

function paramsToObject(params: URLSearchParams) {
  return Array.from(params.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

function asRecord(input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, any>;
}

function pickFirstValue(values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text.length > 0) {
      return text;
    }
  }
  return undefined;
}

function findDeepStringByKey(input: unknown, targetKeys: string[], maxDepth = 4): string | undefined {
  if (maxDepth < 0 || input === null || input === undefined) {
    return undefined;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findDeepStringByKey(item, targetKeys, maxDepth - 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const lowerMap = Object.entries(record).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});

  for (const key of targetKeys) {
    const raw = lowerMap[key.toLowerCase()];
    const text = String(raw ?? '').trim();
    if (text.length > 0) {
      return text;
    }
  }

  for (const value of Object.values(record)) {
    const found = findDeepStringByKey(value, targetKeys, maxDepth - 1);
    if (found) {
      return found;
    }
  }

  return undefined;
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
    const { data: runRow } = await supabase
      .from('runs')
      .select('id,environment,test_definition_key,input_json,output_json')
      .eq('id', runId)
      .maybeSingle();

    await appendRunEvent({
      runId,
      level: kind === 'error' ? 'error' : 'info',
      message: 'Webhook URL_OK recibido',
      payload: {
        query: queryParams,
        body: body ?? {}
      }
    });

    let followupWebhook: Record<string, any> | null = null;
    const runOutput = asRecord(runRow?.output_json);
    const runInput = asRecord(runRow?.input_json);

    const testKey = String(runRow?.test_definition_key ?? '');
    const isSiroPagosRun = testKey.startsWith('siro_pagos_') || testKey.includes('siro_pagos');

    if (isSiroPagosRun) {
      const idResultado = pickFirstValue([
        queryParams.IdResultado,
        queryParams.id_resultado,
        queryParams.idResultado,
        body?.IdResultado,
        body?.id_resultado
      ]);
      const idReferenciaOperacion = pickFirstValue([
        queryParams.IdReferenciaOperacion,
        queryParams.idReferenciaOperacion,
        queryParams.id_referencia_operacion,
        body?.IdReferenciaOperacion,
        body?.idReferenciaOperacion,
        findDeepStringByKey(runOutput, ['IdReferenciaOperacion', 'idReferenciaOperacion']),
        findDeepStringByKey(runInput, ['IdReferenciaOperacion', 'idReferenciaOperacion'])
      ]);
      const hash = pickFirstValue([
        queryParams.Hash,
        queryParams.hash,
        body?.Hash,
        body?.hash,
        findDeepStringByKey(runOutput, ['Hash', 'hash'])
      ]);
      let resolvedHash = hash;
      let resolvedIdReferencia = idReferenciaOperacion;

      if (!resolvedHash || !resolvedIdReferencia) {
        const { data: stepRows } = await supabase
          .from('run_steps')
          .select('request_json,response_json')
          .eq('run_id', runId)
          .order('sequence', { ascending: true });

        if (!resolvedHash) {
          resolvedHash = pickFirstValue(
            (stepRows ?? []).map((step) => findDeepStringByKey(step.response_json, ['Hash', 'hash']))
          );
        }

        if (!resolvedIdReferencia) {
          resolvedIdReferencia = pickFirstValue(
            (stepRows ?? []).map((step) =>
              findDeepStringByKey(step.request_json, ['IdReferenciaOperacion', 'idReferenciaOperacion'])
            )
          );
        }
      }

      try {
        const fallbackEnvironment =
          (pickFirstValue([
            runRow?.environment,
            runOutput?.environment,
            runInput?.environment
          ]) as TargetEnvironment | undefined) ?? 'homologacion';

        await appendRunEvent({
          runId,
          level: 'info',
          message: 'Iniciando seguimiento post-webhook (API + SIRO WEB)',
          payload: {
            testDefinitionKey: testKey,
            environment: fallbackEnvironment,
            hash: resolvedHash ?? null,
            idResultado: idResultado ?? null,
            idReferenciaOperacion: resolvedIdReferencia ?? null
          }
        });

        followupWebhook = await executePagoFollowupQueries({
          runId,
          environment: fallbackEnvironment,
          source: 'post_webhook',
          hash: resolvedHash,
          idResultado,
          idReferenciaOperacion: resolvedIdReferencia
        });
      } catch (error) {
        await appendRunEvent({
          runId,
          level: 'error',
          message: 'Error en consultas de seguimiento post-webhook',
          payload: {
            error: error instanceof Error ? error.message : String(error),
            hash: resolvedHash ?? null,
            idResultado: idResultado ?? null,
            idReferenciaOperacion: resolvedIdReferencia ?? null
          }
        });
      }
    }

    await finalizeAwaitingSteps(runId, queryParams, body, kind);

    const mergedOutput = {
      ...runOutput,
      webhook: queryParams,
      body: body ?? {},
      followup_webhook: followupWebhook
    };

    if (kind === 'error') {
      await updateRunStatus(runId, 'failed', mergedOutput);
    } else {
      await updateRunStatus(runId, 'completed', mergedOutput);
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
