import { getEnv } from '@/lib/env';
import { executePagoFollowupQueries } from '@/lib/runs/pago-followup';
import { PaymentChannel, simulatePagoInBrowser } from '@/lib/runs/payment-browser';
import { generateBaseBasicoLinkPagos, generateBaseFullPagoMisCuentas } from '@/lib/siro/base-generator';
import { SiroClient } from '@/lib/siro/client';
import {
  buildIdReferenciaOperacion,
  buildNroClienteEmpresa,
  buildNroComprobante,
  isoNowMinus,
  isoNowPlus
} from '@/lib/siro/helpers';
import {
  appendRunEvent,
  createRunStep,
  finishRunStep,
  getProfileByUserId,
  markRunFailed,
  updateRunStatus
} from '@/lib/runs/repository';
import { JsonObject, TargetEnvironment } from '@/lib/types';

interface RunRow {
  id: string;
  user_id: string;
  test_definition_key: string;
  environment: TargetEnvironment;
  input_json?: unknown;
}

function asRecord(input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, any>;
}

function toStringValue(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toOptionalString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : undefined;
}

function toNumberValue(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return fallback;
}

function toBooleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function trimToMaxLength(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

function getProfileBaseCliente(profile: Record<string, any> | null | undefined) {
  return String(profile?.base_cliente ?? '70000000');
}

const VM_NOTIFICATION_CHANNELS = new Set([
  'qr',
  'debin',
  'link',
  'link_online',
  'link_pagos',
  'link_pagos_online',
  'lk',
  'pmc',
  'pmc_online',
  'pago_mis_cuentas',
  'pago_mis_cuentas_online'
]);

function normalizeCanal(input: unknown) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function shouldUseVmForNotifications(canal: unknown) {
  const normalized = normalizeCanal(canal);
  return normalized.length > 0 && VM_NOTIFICATION_CHANNELS.has(normalized);
}

function resolvePagoChannel(canal: unknown): PaymentChannel {
  const normalized = normalizeCanal(canal);

  switch (normalized) {
    case 'd':
    case 'td':
    case 'debito':
    case 'tarjeta_debito':
    case 'tarjeta_deb':
      return 'td';
    case 'c':
    case 'tc':
    case 'credito':
    case 'tarjeta_credito':
    case 'tarjeta_cred':
      return 'tc';
    case 'q':
    case 'qr':
      return 'qr';
    case 'n':
    case 'debin':
      return 'debin';
    case 'l':
    case 'lk':
    case 'link':
    case 'link_pagos':
      return 'link';
    case 'b':
    case 'pmc':
    case 'pago_mis_cuentas':
      return 'pmc';
    default:
      return 'td';
  }
}

function getStringField(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = String(source[key] ?? '').trim();
    if (value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function getQueryValue(query: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = String(query[key] ?? '').trim();
    if (value.length > 0) {
      return value;
    }
  }

  const lower = Object.entries(query).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});

  for (const key of keys) {
    const value = String(lower[key.toLowerCase()] ?? '').trim();
    if (value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function buildPagoCallbackUrls({
  runId,
  canal,
  forceVm
}: {
  runId: string;
  canal?: unknown;
  forceVm?: boolean;
}) {
  const env = getEnv();
  const useVmBase = Boolean(env.GCP_VM_URL) && (forceVm || shouldUseVmForNotifications(canal));
  const baseUrl = useVmBase ? String(env.GCP_VM_URL) : env.APP_BASE_URL;
  const ok = `${baseUrl}/api/webhooks/url-ok?run_id=${runId}`;
  const error = `${ok}&kind=error`;
  return { ok, error, baseUrl, useVmBase };
}

function buildDetalleAndImporte(input: Record<string, any>, fallbackAmount: number) {
  const rawDetalle = Array.isArray(input.Detalle) ? input.Detalle : [];

  if (rawDetalle.length === 0) {
    return {
      detalle: [
        {
          Descripcion: toStringValue(input.Descripcion, 'SERVICIO'),
          Importe: fallbackAmount
        }
      ],
      importe: fallbackAmount
    };
  }

  const detalle = rawDetalle.map((entry, index) => {
    const safeEntry = asRecord(entry);
    return {
      Descripcion: toStringValue(safeEntry.Descripcion, `ITEM_${index + 1}`),
      Importe: toNumberValue(safeEntry.Importe, fallbackAmount)
    };
  });

  const importe = detalle.reduce((acc, item) => acc + item.Importe, 0);
  return { detalle, importe };
}

function resolveComprobanteContext({
  input,
  baseCliente,
  conceptDigit,
  idPrefix
}: {
  input: Record<string, any>;
  baseCliente: string;
  conceptDigit: number;
  idPrefix: string;
}) {
  return {
    idReferenciaOperacion: toStringValue(
      input.IdReferenciaOperacion ?? input.idReferenciaOperacion,
      buildIdReferenciaOperacion(idPrefix)
    ),
    nroClienteEmpresa: toStringValue(
      input.nro_cliente_empresa ?? input.numeroClienteEmpresa,
      buildNroClienteEmpresa(baseCliente)
    ),
    nroComprobante: buildNroComprobante({
      conceptDigit,
      base: toOptionalString(input.nro_comprobante)
    })
  };
}

function resolveAdhesionNumber({
  input,
  profile,
  tipoAdhesion
}: {
  input: Record<string, any>;
  profile: Record<string, any> | null;
  tipoAdhesion: string;
}) {
  const env = getEnv();
  const forced = toOptionalString(input.numeroAdhesion ?? input.numeroAdhesionNuevo);
  if (forced) {
    return forced;
  }

  if (tipoAdhesion === 'DD') {
    return toStringValue(profile?.cbu, env.TEST_DEBIN_CBU);
  }

  return toStringValue(input.numeroTarjeta, env.TEST_CARD_CREDIT_NUMBER);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeSiroPagosCrearIntencion(run: RunRow) {
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);
  const channel = resolvePagoChannel(input.canal);
  const runBrowser = toBooleanValue(input.run_browser ?? input.ejecutar_browser, true);
  const callbackUrls = buildPagoCallbackUrls({
    runId: run.id,
    canal: input.canal ?? channel
  });

  const fallbackAmount = toNumberValue(input.Importe, 100);
  const { detalle, importe } = buildDetalleAndImporte(input, fallbackAmount);
  const comprobante = resolveComprobanteContext({
    input,
    baseCliente,
    conceptDigit: 0,
    idPrefix: 'API_PAGO'
  });

  const payload: JsonObject = {
    Concepto: toStringValue(input.Concepto, 'PRUEBA AUTOMATIZADA API PAGO'),
    Detalle: detalle,
    FechaExpiracion: toStringValue(input.FechaExpiracion, isoNowPlus(30)),
    Importe: importe,
    URL_OK: toStringValue(input.URL_OK, callbackUrls.ok),
    URL_ERROR: toStringValue(input.URL_ERROR, callbackUrls.error),
    IdReferenciaOperacion: comprobante.idReferenciaOperacion,
    nro_cliente_empresa: comprobante.nroClienteEmpresa,
    nro_comprobante: comprobante.nroComprobante
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'create_intencion',
    stepName: 'Crear intencion en /api/Pago',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.createPago(payload);
  const responseRecord = asRecord(response);
  const paymentUrl = getStringField(responseRecord, ['URL', 'Url', 'url']);
  const hash = getStringField(responseRecord, ['Hash', 'hash']);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  await appendRunEvent({
    runId: run.id,
    stepId: step.id,
    level: 'info',
    message: 'Intencion creada en /api/Pago',
    payload: {
      canal: channel,
      idReferenciaOperacion: comprobante.idReferenciaOperacion,
      hash: hash ?? null,
      paymentUrl: paymentUrl ?? null,
      callback_base_url: callbackUrls.baseUrl,
      callback_via_vm: callbackUrls.useVmBase
    }
  });

  let browserResult: Record<string, any> | undefined;
  let followupBrowser: Record<string, any> | undefined;
  let idResultado = '';
  let idReferenciaOperacion = comprobante.idReferenciaOperacion;
  const requiresRedirectSuccess = channel === 'td' || channel === 'tc';

  if (runBrowser) {
    if (!paymentUrl) {
      throw new Error('La creacion de /api/Pago no devolvio URL para abrir el Boton de Pagos.');
    }

    const browserStep = await createRunStep({
      runId: run.id,
      stepCode: 'playwright_pago',
      stepName: `Navegar Boton de Pagos (${channel.toUpperCase()})`,
      sequence: 2,
      requestJson: {
        canal: channel,
        paymentUrl,
        // playwright_headless: input.playwright_headless ?? null
        playwright_headless: true
      }
    });

    try {
      const browserResponse = await simulatePagoInBrowser({
        runId: run.id,
        stepId: browserStep.id,
        paymentUrl,
        environment: run.environment,
        channel,
        input,
        profile
      });

      idResultado = toStringValue(
        browserResponse.idResultado ??
          getQueryValue(browserResponse.callbackQuery, ['IdResultado', 'id_resultado', 'idResultado']),
        ''
      );
      idReferenciaOperacion = toStringValue(
        browserResponse.idReferenciaOperacion ??
          getQueryValue(browserResponse.callbackQuery, [
            'IdReferenciaOperacion',
            'idReferenciaOperacion',
            'id_referencia_operacion'
          ]),
        idReferenciaOperacion
      );

      browserResult = {
        ...browserResponse,
        canal: channel
      };

      if (requiresRedirectSuccess && idResultado.length === 0) {
        throw new Error(
          'No se detecto redireccion URL_OK con IdResultado en canal de tarjeta. El flujo de navegacion se considera fallido.'
        );
      }

      await finishRunStep({
        stepId: browserStep.id,
        status: 'success',
        responseJson: browserResult
      });
    } catch (error) {
      await finishRunStep({
        stepId: browserStep.id,
        status: 'failed',
        responseJson: browserResult,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    if (!requiresRedirectSuccess || idResultado.length > 0) {
      followupBrowser = await executePagoFollowupQueries({
        runId: run.id,
        environment: run.environment,
        source: 'post_browser',
        hash,
        idResultado,
        idReferenciaOperacion
      });
    }
  } else {
    await appendRunEvent({
      runId: run.id,
      stepId: step.id,
      level: 'warn',
      message: 'Navegacion Playwright omitida por configuracion',
      payload: {
        canal: channel
      }
    });
  }

  const shouldWaitWebhook = idResultado.length === 0;
  if (shouldWaitWebhook) {
    await createRunStep({
      runId: run.id,
      stepCode: 'espera_url_ok',
      stepName: 'Esperar notificacion URL_OK',
      sequence: 90,
      status: 'awaiting_external_event',
      requestJson: {
        canal: channel,
        idReferenciaOperacion
      }
    });
  }

  await updateRunStatus(run.id, shouldWaitWebhook ? 'waiting_webhook' : 'completed', {
    request: payload,
    response,
    canal: channel,
    payment_url: paymentUrl ?? null,
    hash: hash ?? null,
    idResultado: idResultado || null,
    idReferenciaOperacion,
    browser: browserResult ?? null,
    followup_browser: followupBrowser ?? null
  });
}

async function executeSiroPagosConsulta(run: RunRow) {
  const input = asRecord(run.input_json);
  const siro = new SiroClient(run.environment);

  const payload: JsonObject = {
    FechaDesde: toStringValue(input.FechaDesde, isoNowMinus(7)),
    FechaHasta: toStringValue(input.FechaHasta, isoNowPlus(0)),
    idReferenciaOperacion: toOptionalString(input.idReferenciaOperacion ?? input.IdReferenciaOperacion),
    estado: toOptionalString(input.estado),
    nro_terminal: toOptionalString(input.nro_terminal)
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'consulta_intencion',
    stepName: 'Consultar /api/Pago/Consulta',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.consultaPago(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  await updateRunStatus(run.id, 'completed', { request: payload, response });
}

async function executeSiroPagosStringQR(run: RunRow) {
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);
  const callbackUrls = buildPagoCallbackUrls({
    runId: run.id,
    forceVm: true
  });

  const fallbackAmount = toNumberValue(input.Importe, 100);
  const { detalle, importe } = buildDetalleAndImporte(input, fallbackAmount);
  const comprobante = resolveComprobanteContext({
    input,
    baseCliente,
    conceptDigit: 1,
    idPrefix: 'STRING_QR'
  });

  const payload: JsonObject = {
    Concepto: toStringValue(input.Concepto, 'PRUEBA STRING QR'),
    Detalle: detalle,
    Importe: importe,
    URL_OK: toStringValue(input.URL_OK, callbackUrls.ok),
    URL_ERROR: toStringValue(input.URL_ERROR, callbackUrls.error),
    IdReferenciaOperacion: comprobante.idReferenciaOperacion,
    nro_cliente_empresa: comprobante.nroClienteEmpresa,
    nro_comprobante: comprobante.nroComprobante
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'string_qr',
    stepName: 'Crear /api/Pago/StringQR',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.createPagoStringQR(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'awaiting_external_event',
    responseJson: response
  });

  await updateRunStatus(run.id, 'waiting_webhook', {
    request: payload,
    response
  });
}

async function executeSiroPagosStringQROffline(run: RunRow) {
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);

  const comprobante = resolveComprobanteContext({
    input,
    baseCliente,
    conceptDigit: 2,
    idPrefix: 'STRING_QR_OFF'
  });

  const payload: JsonObject = {
    vto_1: toStringValue(input.vto_1, isoNowPlus(5)),
    importe_1: toNumberValue(input.importe_1, 100),
    vto_2: toStringValue(input.vto_2, isoNowPlus(10)),
    importe_2: toNumberValue(input.importe_2, 120),
    vto_3: toStringValue(input.vto_3, isoNowPlus(15)),
    importe_3: toNumberValue(input.importe_3, 140),
    nro_cliente_empresa: comprobante.nroClienteEmpresa,
    nro_comprobante: comprobante.nroComprobante
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'string_qr_offline',
    stepName: 'Crear /api/Pago/StringQROffline',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.createPagoStringQROffline(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  await updateRunStatus(run.id, 'completed', { request: payload, response });
}

async function executeSiroPagosQREstatico(run: RunRow) {
  const env = getEnv();
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);
  const callbackUrls = buildPagoCallbackUrls({
    runId: run.id,
    forceVm: true
  });

  const terminal = trimToMaxLength(toStringValue(input.nro_terminal, String(Date.now()).slice(-10)), 10);
  const nroEmpresa = trimToMaxLength(toStringValue(input.nro_empresa, env.SIRO_CONVENIO_ID), 10);

  const stringPayload: JsonObject = {
    nro_empresa: nroEmpresa,
    nro_terminal: terminal
  };

  const step1 = await createRunStep({
    runId: run.id,
    stepCode: 'qr_estatico_string',
    stepName: 'Crear /api/Pago/StringQREstatico',
    sequence: 1,
    requestJson: stringPayload
  });

  const response1 = await siro.createPagoStringQREstatico(stringPayload);

  await finishRunStep({
    stepId: step1.id,
    status: 'success',
    responseJson: response1
  });

  const comprobante = resolveComprobanteContext({
    input,
    baseCliente,
    conceptDigit: 3,
    idPrefix: 'QR_ESTATICO'
  });

  const qrPayload: JsonObject = {
    nro_terminal: terminal,
    Importe: toNumberValue(input.Importe ?? input.importe, 100),
    URL_OK: toStringValue(input.URL_OK, callbackUrls.ok),
    URL_ERROR: toStringValue(input.URL_ERROR, callbackUrls.error),
    IdReferenciaOperacion: comprobante.idReferenciaOperacion,
    nro_cliente_empresa: comprobante.nroClienteEmpresa,
    nro_comprobante: comprobante.nroComprobante
  };

  const step2 = await createRunStep({
    runId: run.id,
    stepCode: 'qr_estatico_peticion',
    stepName: 'Crear /api/Pago/QREstatico',
    sequence: 2,
    requestJson: qrPayload
  });

  const response2 = await siro.createPagoQREstatico(qrPayload);

  await finishRunStep({
    stepId: step2.id,
    status: 'awaiting_external_event',
    responseJson: response2
  });

  await updateRunStatus(run.id, 'waiting_webhook', {
    stringQrRequest: stringPayload,
    stringQrResponse: response1,
    qrRequest: qrPayload,
    qrResponse: response2
  });
}

async function executeSiroPagosComprobante(run: RunRow) {
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);
  const callbackUrls = buildPagoCallbackUrls({
    runId: run.id,
    canal: input.canal
  });

  const comprobante = resolveComprobanteContext({
    input,
    baseCliente,
    conceptDigit: 4,
    idPrefix: 'COMPROBANTE'
  });

  const idRef = comprobante.idReferenciaOperacion;
  const payload: JsonObject = {
    nro_cliente_empresa: comprobante.nroClienteEmpresa,
    nro_comprobante: comprobante.nroComprobante,
    URL_OK: toStringValue(input.URL_OK, callbackUrls.ok),
    URL_ERROR: toStringValue(input.URL_ERROR, callbackUrls.error),
    IdReferenciaOperacion: idRef,
    idReferenciaOperacion: idRef,
    UsarVencimientosComprobante: toBooleanValue(input.UsarVencimientosComprobante, false)
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'pago_comprobante',
    stepName: 'Crear /api/Pago/Comprobante',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.createPagoComprobante(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'awaiting_external_event',
    responseJson: response
  });

  await updateRunStatus(run.id, 'waiting_webhook', {
    request: payload,
    response
  });
}

async function executeSiroApiPagosUpload(run: RunRow) {
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);

  const formato = toStringValue(input.formato, 'basico').toLowerCase();
  const amount = toNumberValue(input.importe, 100);
  const generatedBase =
    formato === 'full'
      ? generateBaseFullPagoMisCuentas({ baseCliente, amount, mensaje: 'PRUEBA FULL PMC' })
      : generateBaseBasicoLinkPagos({ baseCliente, amount, mensaje: 'PRUEBA BASICO LINK' });

  const payload: JsonObject = {
    base_pagos: toStringValue(input.base_pagos, generatedBase),
    confirmar_automaticamente: toBooleanValue(input.confirmar_automaticamente, true)
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_pagos_upload',
    stepName: 'Subir /siro/Pagos',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.postPagosUpload(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  const nroTransaccion = Number((response as any)?.nro_transaccion ?? 0);
  if (!nroTransaccion) {
    throw new Error('La API no devolvio nro_transaccion en /siro/Pagos.');
  }

  const consultaPayload: JsonObject = {
    nro_transaccion: nroTransaccion,
    obtener_informacion_base: toBooleanValue(input.obtener_informacion_base, true)
  };

  const maxIntentos = Math.max(
    1,
    Math.min(10, toNumberValue(input.consultas_estado_max_intentos, 3))
  );
  const esperaMs = Math.max(
    1000,
    Math.min(30_000, toNumberValue(input.consultas_estado_intervalo_ms, 4000))
  );

  const stepConsulta = await createRunStep({
    runId: run.id,
    stepCode: 'siro_estado_transaccion_post_upload',
    stepName: 'Consultar /siro/Pagos/{nro_transaccion}',
    sequence: 2,
    requestJson: {
      ...consultaPayload,
      consultas_estado_max_intentos: maxIntentos,
      consultas_estado_intervalo_ms: esperaMs
    }
  });

  let ultimoEstadoResponse: JsonObject = {};
  let estadoFinal = '';

  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    ultimoEstadoResponse = await siro.getPagosByTransaccion(nroTransaccion, {
      obtener_informacion_base: consultaPayload.obtener_informacion_base
    });

    estadoFinal = String((ultimoEstadoResponse as any)?.estado ?? '').toUpperCase();

    await appendRunEvent({
      runId: run.id,
      stepId: stepConsulta.id,
      level: 'info',
      message: `Consulta estado base ${intento}/${maxIntentos}`,
      payload: {
        nro_transaccion: nroTransaccion,
        estado: estadoFinal || 'SIN_ESTADO'
      }
    });

    if (estadoFinal && estadoFinal !== 'PENDIENTE') {
      break;
    }

    if (intento < maxIntentos) {
      await sleep(esperaMs);
    }
  }

  await finishRunStep({
    stepId: stepConsulta.id,
    status: 'success',
    responseJson: ultimoEstadoResponse
  });

  await updateRunStatus(run.id, 'completed', {
    upload: { request: payload, response },
    estado_transaccion: { request: consultaPayload, response: ultimoEstadoResponse }
  });
}

async function executeSiroApiPagosEstadoTransaccion(run: RunRow) {
  const input = asRecord(run.input_json);
  const siro = new SiroClient(run.environment);

  const nroTransaccion = toNumberValue(input.nro_transaccion, 0);
  if (!nroTransaccion) {
    throw new Error('nro_transaccion es obligatorio.');
  }

  const query: JsonObject = {
    obtener_informacion_base: toBooleanValue(input.obtener_informacion_base, true)
  };

  const stepRequest: JsonObject = {
    nro_transaccion: nroTransaccion,
    ...query
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_estado_transaccion',
    stepName: 'Consultar /siro/Pagos/{nro_transaccion}',
    sequence: 1,
    requestJson: stepRequest
  });

  const response = await siro.getPagosByTransaccion(nroTransaccion, query);

  await finishRunStep({ stepId: step.id, status: 'success', responseJson: response });
  await updateRunStatus(run.id, 'completed', { request: stepRequest, response });
}

async function executeSiroApiPagosConsulta(run: RunRow) {
  const input = asRecord(run.input_json);
  const siro = new SiroClient(run.environment);

  const payload: JsonObject = {
    fecha_desde: toStringValue(input.fecha_desde, isoNowMinus(7)),
    fecha_hasta: toStringValue(input.fecha_hasta, isoNowPlus(0)),
    obtener_informacion_base: toBooleanValue(input.obtener_informacion_base, true)
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_pagos_consulta',
    stepName: 'Consultar /siro/Pago/Consulta',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.postPagoConsulta(payload);

  await finishRunStep({ stepId: step.id, status: 'success', responseJson: response });
  await updateRunStatus(run.id, 'completed', { request: payload, response });
}

async function executeSiroApiListadosProceso(run: RunRow) {
  const input = asRecord(run.input_json);
  const siro = new SiroClient(run.environment);
  const env = getEnv();

  const payload: JsonObject = {
    fecha_desde: toStringValue(input.fecha_desde, isoNowMinus(7)),
    fecha_hasta: toStringValue(input.fecha_hasta, isoNowPlus(0)),
    cuit_administrador: toStringValue(input.cuit_administrador, env.SIRO_ADMIN_CUIT),
    nro_empresa: toStringValue(input.nro_empresa, env.SIRO_CONVENIO_ID)
  };

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_listados_proceso',
    stepName: 'Consultar /siro/Listados/Proceso',
    sequence: 1,
    requestJson: payload
  });

  const response = await siro.postListadosProceso(payload);

  await finishRunStep({ stepId: step.id, status: 'success', responseJson: response });
  await updateRunStatus(run.id, 'completed', { request: payload, response });
}

async function executeSiroApiAdminConvenios(run: RunRow) {
  const siro = new SiroClient(run.environment);

  const adminRequest: JsonObject = {
    endpoint: '/siro/Administradores'
  };

  const step1 = await createRunStep({
    runId: run.id,
    stepCode: 'siro_administradores',
    stepName: 'Consultar /siro/Administradores',
    sequence: 1,
    requestJson: adminRequest
  });

  const adminResponse = await siro.getAdministradores();
  await finishRunStep({ stepId: step1.id, status: 'success', responseJson: adminResponse });

  const conveniosRequest: JsonObject = {
    endpoint: '/siro/Convenios'
  };

  const step2 = await createRunStep({
    runId: run.id,
    stepCode: 'siro_convenios',
    stepName: 'Consultar /siro/Convenios',
    sequence: 2,
    requestJson: conveniosRequest
  });

  const convenioResponse = await siro.getConvenios();
  await finishRunStep({ stepId: step2.id, status: 'success', responseJson: convenioResponse });

  await updateRunStatus(run.id, 'completed', {
    administradores: {
      request: adminRequest,
      response: adminResponse
    },
    convenios: {
      request: conveniosRequest,
      response: convenioResponse
    }
  });
}

async function executeSiroApiAdhesionesCiclo(run: RunRow) {
  const input = asRecord(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment);
  const env = getEnv();

  const nroCpe = toStringValue(input.numeroClienteEmpresa ?? input.nro_cpe, buildNroClienteEmpresa(baseCliente));
  const tipoAdhesion = toStringValue(input.tipoAdhesion, 'DD').toUpperCase();
  const numeroAdhesion = resolveAdhesionNumber({ input, profile, tipoAdhesion });
  const numeroAdhesionNuevo = toStringValue(input.numeroAdhesionNuevo, numeroAdhesion);
  const tipoAdhesionNueva = toStringValue(input.tipoAdhesionNueva, tipoAdhesion).toUpperCase();

  const altaPayload: JsonObject = {
    numeroAdhesion,
    numeroClienteEmpresa: nroCpe,
    tipoAdhesion
  };

  const step1 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_alta',
    stepName: 'POST /siro/Adhesiones',
    sequence: 1,
    requestJson: altaPayload
  });

  const altaResponse = await siro.postAdhesionAlta(altaPayload);
  await finishRunStep({ stepId: step1.id, status: 'success', responseJson: altaResponse });

  const cpeRequest: JsonObject = {
    nro_cpe: nroCpe
  };

  const step2 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_por_cpe',
    stepName: 'GET /siro/Adhesiones/{nro_cpe}',
    sequence: 2,
    requestJson: cpeRequest
  });

  const cpeResponse = await siro.getAdhesionByCpe(nroCpe);
  await finishRunStep({ stepId: step2.id, status: 'success', responseJson: cpeResponse });

  const vigentesPayload: JsonObject = {
    cuit_admin: toStringValue(input.cuit_admin, env.SIRO_ADMIN_CUIT),
    nro_empresa: toStringValue(input.nro_empresa, env.SIRO_CONVENIO_ID),
    nro_pag: toNumberValue(input.nro_pag, 1)
  };

  const step3 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_vigentes',
    stepName: 'GET /siro/Adhesiones/Vigentes',
    sequence: 3,
    requestJson: vigentesPayload
  });

  const vigentesResponse = await siro.getAdhesionesVigentes(vigentesPayload);
  await finishRunStep({ stepId: step3.id, status: 'success', responseJson: vigentesResponse });

  const modificarPayload: JsonObject = {
    numeroAdhesionNuevo,
    numeroClienteEmpresa: nroCpe,
    tipoAdhesionNueva
  };

  const step4 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_modificar',
    stepName: 'POST /siro/Adhesiones/Modificar',
    sequence: 4,
    requestJson: modificarPayload
  });

  const modificarResponse = await siro.postAdhesionModificar(modificarPayload);
  await finishRunStep({ stepId: step4.id, status: 'success', responseJson: modificarResponse });

  const step5 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_desactivar',
    stepName: 'POST /siro/Adhesiones/Desactivar/{nro_cpe}',
    sequence: 5,
    requestJson: cpeRequest
  });

  const desactivarResponse = await siro.postAdhesionDesactivar(nroCpe);
  await finishRunStep({ stepId: step5.id, status: 'success', responseJson: desactivarResponse });

  const bajasPayload: JsonObject = {
    cuit_admin: toStringValue(input.cuit_admin, env.SIRO_ADMIN_CUIT),
    nro_empresa: toStringValue(input.nro_empresa, env.SIRO_CONVENIO_ID),
    nro_pag: toNumberValue(input.nro_pag, 1),
    fechaBajaDesde: toStringValue(input.fechaBajaDesde, isoNowMinus(7)),
    fechaBajaHasta: toStringValue(input.fechaBajaHasta, isoNowPlus(1))
  };

  const step6 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_bajas',
    stepName: 'GET /siro/Adhesiones/Bajas',
    sequence: 6,
    requestJson: bajasPayload
  });

  const bajasResponse = await siro.getAdhesionesBajas(bajasPayload);
  await finishRunStep({ stepId: step6.id, status: 'success', responseJson: bajasResponse });

  await updateRunStatus(run.id, 'completed', {
    alta: { request: altaPayload, response: altaResponse },
    porCpe: { request: cpeRequest, response: cpeResponse },
    vigentes: { request: vigentesPayload, response: vigentesResponse },
    modificar: { request: modificarPayload, response: modificarResponse },
    desactivar: { request: cpeRequest, response: desactivarResponse },
    bajas: { request: bajasPayload, response: bajasResponse }
  });
}

export async function executeRunByDefinition(run: RunRow) {
  await updateRunStatus(run.id, 'running');

  await appendRunEvent({
    runId: run.id,
    level: 'info',
    message: `Inicio de ejecucion ${run.test_definition_key}`,
    payload: {
      environment: run.environment
    }
  });

  try {
    switch (run.test_definition_key) {
      case 'siro_pagos_crear_intencion':
        await executeSiroPagosCrearIntencion(run);
        break;
      case 'siro_pagos_consulta_intencion':
        await executeSiroPagosConsulta(run);
        break;
      case 'siro_pagos_string_qr':
        await executeSiroPagosStringQR(run);
        break;
      case 'siro_pagos_string_qr_offline':
        await executeSiroPagosStringQROffline(run);
        break;
      case 'siro_pagos_qr_estatico':
        await executeSiroPagosQREstatico(run);
        break;
      case 'siro_pagos_comprobante':
        await executeSiroPagosComprobante(run);
        break;
      case 'siro_api_pagos_upload':
        await executeSiroApiPagosUpload(run);
        break;
      case 'siro_api_pagos_estado_transaccion':
        await executeSiroApiPagosEstadoTransaccion(run);
        break;
      case 'siro_api_pagos_consulta':
        await executeSiroApiPagosConsulta(run);
        break;
      case 'siro_api_listados_proceso':
        await executeSiroApiListadosProceso(run);
        break;
      case 'siro_api_admin_convenios':
        await executeSiroApiAdminConvenios(run);
        break;
      case 'siro_api_adhesiones_ciclo':
        await executeSiroApiAdhesionesCiclo(run);
        break;
      default:
        throw new Error(`No existe executor para ${run.test_definition_key}`);
    }

    await appendRunEvent({
      runId: run.id,
      level: 'info',
      message: 'Ejecucion de pasos finalizada'
    });
  } catch (error) {
    await markRunFailed(run.id, error instanceof Error ? error.message : 'Error desconocido');
  }
}
