import { getEnv } from '@/lib/env';
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

function asObject(input: unknown): JsonObject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as JsonObject;
}

function getProfileBaseCliente(profile: Record<string, unknown> | null | undefined) {
  const raw = String(profile?.base_cliente ?? '70000000');
  return raw;
}

async function executeSiroPagosCrearIntencion(run: any) {
  const input = asObject(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const env = getEnv();
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'create_intencion',
    stepName: 'Crear intencion en /api/Pago',
    sequence: 1
  });

  const idReferenciaOperacion = String(input.IdReferenciaOperacion ?? buildIdReferenciaOperacion('API_PAGO'));
  const nroClienteEmpresa = String(input.nro_cliente_empresa ?? buildNroClienteEmpresa(baseCliente));
  const nroComprobante = String(input.nro_comprobante ?? buildNroComprobante({ conceptDigit: 0 }));

  const payload: JsonObject = {
    Concepto: String(input.Concepto ?? 'PRUEBA AUTOMATIZADA API PAGO'),
    Detalle: input.Detalle ?? [
      {
        Descripcion: 'SERVICIO',
        Importe: Number(input.Importe ?? 100)
      }
    ],
    FechaExpiracion: String(input.FechaExpiracion ?? isoNowPlus(30)),
    Importe: Number(input.Importe ?? 100),
    URL_OK: String(input.URL_OK ?? `${env.APP_BASE_URL}/api/webhooks/url-ok?run_id=${run.id}`),
    URL_ERROR: String(input.URL_ERROR ?? `${env.APP_BASE_URL}/api/webhooks/url-ok?run_id=${run.id}&kind=error`),
    IdReferenciaOperacion: idReferenciaOperacion,
    nro_cliente_empresa: nroClienteEmpresa,
    nro_comprobante: nroComprobante
  };

  const response = await siro.createPago(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'awaiting_external_event',
    responseJson: response
  });

  await appendRunEvent({
    runId: run.id,
    stepId: step.id,
    level: 'info',
    message: 'Intencion creada. Run en espera de URL_OK.',
    payload: {
      idReferenciaOperacion,
      hash: String((response as any).Hash ?? '')
    }
  });

  await updateRunStatus(run.id, 'waiting_webhook', {
    idReferenciaOperacion,
    hash: String((response as any).Hash ?? '')
  });
}

async function executeSiroPagosConsulta(run: any) {
  const input = asObject(run.input_json);
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'consulta_intencion',
    stepName: 'Consultar /api/Pago/Consulta',
    sequence: 1
  });

  const payload: JsonObject = {
    FechaDesde: String(input.FechaDesde ?? isoNowMinus(7)),
    FechaHasta: String(input.FechaHasta ?? isoNowPlus(1)),
    idReferenciaOperacion: String(input.idReferenciaOperacion ?? ''),
    estado: input.estado ?? undefined,
    nro_terminal: input.nro_terminal ?? undefined
  };

  const response = await siro.consultaPago(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  await updateRunStatus(run.id, 'completed', { response });
}

async function executeSiroPagosStringQR(run: any) {
  const input = asObject(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const env = getEnv();
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'string_qr',
    stepName: 'Crear /api/Pago/StringQR',
    sequence: 1
  });

  const payload: JsonObject = {
    Concepto: String(input.Concepto ?? 'PRUEBA STRING QR'),
    Importe: Number(input.Importe ?? 50),
    URL_OK: String(input.URL_OK ?? `${env.APP_BASE_URL}/api/webhooks/url-ok?run_id=${run.id}`),
    URL_ERROR: String(input.URL_ERROR ?? `${env.APP_BASE_URL}/api/webhooks/url-ok?run_id=${run.id}&kind=error`),
    IdReferenciaOperacion: String(input.IdReferenciaOperacion ?? buildIdReferenciaOperacion('STRING_QR')),
    nro_cliente_empresa: String(input.nro_cliente_empresa ?? buildNroClienteEmpresa(baseCliente)),
    nro_comprobante: String(input.nro_comprobante ?? buildNroComprobante({ conceptDigit: 1 }))
  };

  const response = await siro.createPagoStringQR(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'awaiting_external_event',
    responseJson: response
  });

  await updateRunStatus(run.id, 'waiting_webhook', {
    response
  });
}

async function executeSiroPagosStringQROffline(run: any) {
  const input = asObject(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'string_qr_offline',
    stepName: 'Crear /api/Pago/StringQROffline',
    sequence: 1
  });

  const payload: JsonObject = {
    vto_1: String(input.vto_1 ?? isoNowPlus(5)),
    importe_1: Number(input.importe_1 ?? 100),
    vto_2: String(input.vto_2 ?? isoNowPlus(10)),
    importe_2: Number(input.importe_2 ?? 120),
    vto_3: String(input.vto_3 ?? isoNowPlus(15)),
    importe_3: Number(input.importe_3 ?? 140),
    nro_cliente_empresa: String(input.nro_cliente_empresa ?? buildNroClienteEmpresa(baseCliente)),
    nro_comprobante: String(input.nro_comprobante ?? buildNroComprobante({ conceptDigit: 2 }))
  };

  const response = await siro.createPagoStringQROffline(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  await updateRunStatus(run.id, 'completed', { response });
}

async function executeSiroPagosQREstatico(run: any) {
  const input = asObject(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const env = getEnv();
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step1 = await createRunStep({
    runId: run.id,
    stepCode: 'qr_estatico_string',
    stepName: 'Crear /api/Pago/StringQREstatico',
    sequence: 1
  });

  const terminal = String(input.nro_terminal ?? String(Date.now()).slice(-10));

  const response1 = await siro.createPagoStringQREstatico({
    nro_terminal: terminal,
    descripcion_terminal: String(input.descripcion_terminal ?? 'CAJA API')
  });

  await finishRunStep({
    stepId: step1.id,
    status: 'success',
    responseJson: response1
  });

  const step2 = await createRunStep({
    runId: run.id,
    stepCode: 'qr_estatico_peticion',
    stepName: 'Crear /api/Pago/QREstatico',
    sequence: 2
  });

  const response2 = await siro.createPagoQREstatico({
    nro_terminal: terminal,
    importe: Number(input.importe ?? 100),
    idReferenciaOperacion: String(input.idReferenciaOperacion ?? buildIdReferenciaOperacion('QR_ESTATICO')),
    URL_OK: String(input.URL_OK ?? `${env.APP_BASE_URL}/api/webhooks/url-ok?run_id=${run.id}`),
    URL_ERROR: String(input.URL_ERROR ?? `${env.APP_BASE_URL}/api/webhooks/url-ok?run_id=${run.id}&kind=error`),
    nro_cliente_empresa: String(input.nro_cliente_empresa ?? buildNroClienteEmpresa(baseCliente)),
    nro_comprobante: String(input.nro_comprobante ?? buildNroComprobante({ conceptDigit: 3 }))
  });

  await finishRunStep({
    stepId: step2.id,
    status: 'awaiting_external_event',
    responseJson: response2
  });

  await updateRunStatus(run.id, 'waiting_webhook', {
    terminal,
    response2
  });
}

async function executeSiroPagosComprobante(run: any) {
  const input = asObject(run.input_json);
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'pago_comprobante',
    stepName: 'Crear /api/Pago/Comprobante',
    sequence: 1
  });

  const response = await siro.createPagoComprobante(input);

  await finishRunStep({
    stepId: step.id,
    status: 'awaiting_external_event',
    responseJson: response
  });

  await updateRunStatus(run.id, 'waiting_webhook', { response });
}

async function executeSiroApiPagosUpload(run: any) {
  const input = asObject(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_pagos_upload',
    stepName: 'Subir /siro/Pagos',
    sequence: 1
  });

  const formato = String(input.formato ?? 'basico').toLowerCase();
  const amount = Number(input.importe ?? 100);

  const generatedBase =
    formato === 'full'
      ? generateBaseFullPagoMisCuentas({ baseCliente, amount, mensaje: 'PRUEBA FULL PMC' })
      : generateBaseBasicoLinkPagos({ baseCliente, amount, mensaje: 'PRUEBA BASICO LINK' });

  const payload: JsonObject = {
    base_pagos: String(input.base_pagos ?? generatedBase),
    confirmar_automaticamente: input.confirmar_automaticamente ?? true
  };

  const response = await siro.postPagosUpload(payload);

  await finishRunStep({
    stepId: step.id,
    status: 'success',
    responseJson: response
  });

  await updateRunStatus(run.id, 'completed', { response });
}

async function executeSiroApiPagosEstadoTransaccion(run: any) {
  const input = asObject(run.input_json);
  const siro = new SiroClient(run.environment as TargetEnvironment);
  const nroTransaccion = Number(input.nro_transaccion);

  if (!nroTransaccion) {
    throw new Error('nro_transaccion es obligatorio.');
  }

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_estado_transaccion',
    stepName: 'Consultar /siro/Pagos/{nro_transaccion}',
    sequence: 1
  });

  const response = await siro.getPagosByTransaccion(nroTransaccion);

  await finishRunStep({ stepId: step.id, status: 'success', responseJson: response });
  await updateRunStatus(run.id, 'completed', { response });
}

async function executeSiroApiPagosConsulta(run: any) {
  const input = asObject(run.input_json);
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_pagos_consulta',
    stepName: 'Consultar /siro/Pago/Consulta',
    sequence: 1
  });

  const payload: JsonObject = {
    fecha_desde: String(input.fecha_desde ?? isoNowMinus(7)),
    fecha_hasta: String(input.fecha_hasta ?? isoNowPlus(1)),
    obtener_informacion_base: input.obtener_informacion_base ?? true
  };

  const response = await siro.postPagoConsulta(payload);

  await finishRunStep({ stepId: step.id, status: 'success', responseJson: response });
  await updateRunStatus(run.id, 'completed', { response });
}

async function executeSiroApiListadosProceso(run: any) {
  const input = asObject(run.input_json);
  const siro = new SiroClient(run.environment as TargetEnvironment);
  const env = getEnv();

  const step = await createRunStep({
    runId: run.id,
    stepCode: 'siro_listados_proceso',
    stepName: 'Consultar /siro/Listados/Proceso',
    sequence: 1
  });

  const payload: JsonObject = {
    fecha_proceso_desde: String(input.fecha_proceso_desde ?? isoNowMinus(7)),
    fecha_proceso_hasta: String(input.fecha_proceso_hasta ?? isoNowPlus(1)),
    cuit_admin: String(input.cuit_admin ?? env.SIRO_ADMIN_CUIT),
    nro_empresa: String(input.nro_empresa ?? env.SIRO_CONVENIO_ID)
  };

  const response = await siro.postListadosProceso(payload);

  await finishRunStep({ stepId: step.id, status: 'success', responseJson: response });
  await updateRunStatus(run.id, 'completed', { response });
}

async function executeSiroApiAdminConvenios(run: any) {
  const siro = new SiroClient(run.environment as TargetEnvironment);

  const step1 = await createRunStep({
    runId: run.id,
    stepCode: 'siro_administradores',
    stepName: 'Consultar /siro/Administradores',
    sequence: 1
  });

  const adminResponse = await siro.getAdministradores();
  await finishRunStep({ stepId: step1.id, status: 'success', responseJson: adminResponse });

  const step2 = await createRunStep({
    runId: run.id,
    stepCode: 'siro_convenios',
    stepName: 'Consultar /siro/Convenios',
    sequence: 2
  });

  const convenioResponse = await siro.getConvenios();
  await finishRunStep({ stepId: step2.id, status: 'success', responseJson: convenioResponse });

  await updateRunStatus(run.id, 'completed', {
    administradores: adminResponse,
    convenios: convenioResponse
  });
}

async function executeSiroApiAdhesionesCiclo(run: any) {
  const input = asObject(run.input_json);
  const profile = await getProfileByUserId(run.user_id);
  const baseCliente = getProfileBaseCliente(profile);
  const siro = new SiroClient(run.environment as TargetEnvironment);
  const env = getEnv();

  const nroCpe = String(input.numeroClienteEmpresa ?? buildNroClienteEmpresa(baseCliente));
  const numeroAdhesion = String(input.numeroAdhesion ?? profile?.cbu ?? '0000003100000000000000');
  const tipoAdhesion = String(input.tipoAdhesion ?? 'DD');

  const step1 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_alta',
    stepName: 'POST /siro/Adhesiones',
    sequence: 1
  });

  const altaResponse = await siro.postAdhesionAlta({
    numeroAdhesion,
    numeroClienteEmpresa: nroCpe,
    tipoAdhesion
  });
  await finishRunStep({ stepId: step1.id, status: 'success', responseJson: altaResponse });

  const step2 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_por_cpe',
    stepName: 'GET /siro/Adhesiones/{nro_cpe}',
    sequence: 2
  });
  const cpeResponse = await siro.getAdhesionByCpe(nroCpe);
  await finishRunStep({ stepId: step2.id, status: 'success', responseJson: cpeResponse });

  const step3 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_vigentes',
    stepName: 'GET /siro/Adhesiones/Vigentes',
    sequence: 3
  });
  const vigentesResponse = await siro.getAdhesionesVigentes({
    cuit_admin: env.SIRO_ADMIN_CUIT,
    nro_empresa: env.SIRO_CONVENIO_ID,
    nro_pag: 1
  });
  await finishRunStep({ stepId: step3.id, status: 'success', responseJson: vigentesResponse });

  const step4 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_modificar',
    stepName: 'POST /siro/Adhesiones/Modificar',
    sequence: 4
  });
  const modificarResponse = await siro.postAdhesionModificar({
    numeroAdhesionActual: numeroAdhesion,
    numeroAdhesionNuevo: numeroAdhesion,
    numeroClienteEmpresa: nroCpe,
    tipoAdhesionActual: tipoAdhesion,
    tipoAdhesionNuevo: tipoAdhesion
  });
  await finishRunStep({ stepId: step4.id, status: 'success', responseJson: modificarResponse });

  const step5 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_desactivar',
    stepName: 'POST /siro/Adhesiones/Desactivar/{nro_cpe}',
    sequence: 5
  });
  const desactivarResponse = await siro.postAdhesionDesactivar(nroCpe, {
    numeroAdhesion,
    tipoAdhesion
  });
  await finishRunStep({ stepId: step5.id, status: 'success', responseJson: desactivarResponse });

  const step6 = await createRunStep({
    runId: run.id,
    stepCode: 'adhesion_bajas',
    stepName: 'GET /siro/Adhesiones/Bajas',
    sequence: 6
  });
  const bajasResponse = await siro.getAdhesionesBajas({
    cuit_admin: env.SIRO_ADMIN_CUIT,
    nro_empresa: env.SIRO_CONVENIO_ID,
    nro_pag: 1,
    fechaBajaDesde: isoNowMinus(7),
    fechaBajaHasta: isoNowPlus(1)
  });
  await finishRunStep({ stepId: step6.id, status: 'success', responseJson: bajasResponse });

  await updateRunStatus(run.id, 'completed', {
    alta: altaResponse,
    cpe: cpeResponse,
    vigentes: vigentesResponse,
    modificar: modificarResponse,
    desactivar: desactivarResponse,
    bajas: bajasResponse
  });
}

export async function executeRunByDefinition(run: any) {
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
      message: 'Ejecucion finalizada'
    });
  } catch (error) {
    await markRunFailed(run.id, error instanceof Error ? error.message : 'Error desconocido');
  }
}
