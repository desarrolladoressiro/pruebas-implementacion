import { appendRunEvent, createRunStep, finishRunStep } from '@/lib/runs/repository';
import { SiroClient } from '@/lib/siro/client';
import { isoNowMinus, isoNowPlus } from '@/lib/siro/helpers';
import { downloadSiroWebTransaccionesLineaReport } from '@/lib/runs/siro-web-report';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { JsonObject, TargetEnvironment } from '@/lib/types';

type FollowupSource = 'post_browser' | 'post_webhook';

interface ExecutePagoFollowupOptions {
  runId: string;
  environment: TargetEnvironment;
  source: FollowupSource;
  hash?: string;
  idResultado?: string;
  idReferenciaOperacion?: string;
}

export interface PagoFollowupResult {
  source: FollowupSource;
  hash: string | null;
  idResultado: string | null;
  idReferenciaOperacion: string | null;
  hashResultadoResponse?: JsonObject;
  consultaResponse?: JsonObject;
  siroWebTransaccionesLinea?: JsonObject;
}

function trimToOptional(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : undefined;
}

function buildStepCode(prefix: 'hash_resultado' | 'consulta', source: FollowupSource) {
  return source === 'post_webhook' ? `pago_${prefix}_webhook` : `pago_${prefix}_browser`;
}

function buildStepName(prefix: 'hash_resultado' | 'consulta', source: FollowupSource) {
  const suffix = source === 'post_webhook' ? 'despues de webhook' : 'despues de navegador';

  if (prefix === 'hash_resultado') {
    return `Consultar /api/Pago/{hash}/{id_resultado} (${suffix})`;
  }

  return `Consultar /api/Pago/Consulta por idReferenciaOperacion (${suffix})`;
}

async function nextSequenceForRun(runId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('run_steps')
    .select('sequence')
    .eq('run_id', runId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.sequence ?? 0) + 1;
}

export async function executePagoFollowupQueries(
  options: ExecutePagoFollowupOptions
): Promise<PagoFollowupResult> {
  const siro = new SiroClient(options.environment);

  const hash = trimToOptional(options.hash);
  const idResultado = trimToOptional(options.idResultado);
  const idReferenciaOperacion = trimToOptional(options.idReferenciaOperacion);
  let sequence = await nextSequenceForRun(options.runId);

  const result: PagoFollowupResult = {
    source: options.source,
    hash: hash ?? null,
    idResultado: idResultado ?? null,
    idReferenciaOperacion: idReferenciaOperacion ?? null
  };

  if (hash && idResultado) {
    const requestPayload: JsonObject = {
      hash,
      id_resultado: idResultado
    };

    const hashStep = await createRunStep({
      runId: options.runId,
      stepCode: buildStepCode('hash_resultado', options.source),
      stepName: buildStepName('hash_resultado', options.source),
      sequence,
      requestJson: requestPayload
    });
    sequence += 1;

    const hashResponse = await siro.getPagoByHashResultado(hash, idResultado);
    await finishRunStep({
      stepId: hashStep.id,
      status: 'success',
      responseJson: hashResponse
    });
    result.hashResultadoResponse = hashResponse;
  } else {
    await appendRunEvent({
      runId: options.runId,
      level: 'warn',
      message: 'No se pudo consultar /api/Pago/{hash}/{id_resultado}: falta hash o id_resultado',
      payload: {
        source: options.source,
        hash: hash ?? null,
        idResultado: idResultado ?? null
      }
    });
  }

  if (idReferenciaOperacion) {
    const requestPayload: JsonObject = {
      FechaDesde: isoNowMinus(7),
      FechaHasta: isoNowPlus(0),
      idReferenciaOperacion
    };

    const consultaStep = await createRunStep({
      runId: options.runId,
      stepCode: buildStepCode('consulta', options.source),
      stepName: buildStepName('consulta', options.source),
      sequence,
      requestJson: requestPayload
    });
    sequence += 1;

    const consultaResponse = await siro.consultaPago(requestPayload);
    await finishRunStep({
      stepId: consultaStep.id,
      status: 'success',
      responseJson: consultaResponse
    });
    result.consultaResponse = consultaResponse;
  } else {
    await appendRunEvent({
      runId: options.runId,
      level: 'warn',
      message: 'No se pudo consultar /api/Pago/Consulta: falta idReferenciaOperacion',
      payload: {
        source: options.source
      }
    });
  }

  await appendRunEvent({
    runId: options.runId,
    level: 'info',
    message: 'Consultas de seguimiento de intencion de pago completadas',
    payload: {
      source: options.source,
      hash: hash ?? null,
      idResultado: idResultado ?? null,
      idReferenciaOperacion: idReferenciaOperacion ?? null
    }
  });

  const siroWebStep = await createRunStep({
    runId: options.runId,
    stepCode: options.source === 'post_webhook' ? 'siro_web_xlistpend_webhook' : 'siro_web_xlistpend_browser',
    stepName:
      options.source === 'post_webhook'
        ? 'SIRO WEB - Reporte Transacciones en Linea (despues de webhook)'
        : 'SIRO WEB - Reporte Transacciones en Linea (despues de navegador)',
    sequence,
    requestJson: {
      reporte: 'XLISTPEND',
      descripcion: 'Transacciones en Linea'
    }
  });

  try {
    const reportResult = await downloadSiroWebTransaccionesLineaReport({
      runId: options.runId,
      stepId: siroWebStep.id,
      environment: options.environment
    });

    await finishRunStep({
      stepId: siroWebStep.id,
      status: 'success',
      responseJson: { ...reportResult }
    });
    result.siroWebTransaccionesLinea = { ...reportResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRunStep({
      stepId: siroWebStep.id,
      status: 'failed',
      errorMessage: message
    });
    await appendRunEvent({
      runId: options.runId,
      stepId: siroWebStep.id,
      level: 'warn',
      message: 'No se pudo descargar reporte de SIRO WEB - Transacciones en Linea',
      payload: {
        source: options.source,
        error: message
      }
    });
    result.siroWebTransaccionesLinea = {
      ok: false,
      error: message
    };
  }

  return result;
}
