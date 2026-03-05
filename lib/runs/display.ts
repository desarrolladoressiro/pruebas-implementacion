const DEFINITION_LABELS: Record<string, string> = {
  siro_pagos_crear_intencion: 'SIRO Pagos - Crear intencion de pago (/api/Pago)',
  siro_pagos_consulta_intencion: 'SIRO Pagos - Consultar intenciones (/api/Pago/Consulta)',
  siro_pagos_string_qr: 'SIRO Pagos - Generar QR dinamico (/api/Pago/StringQR)',
  siro_pagos_string_qr_offline: 'SIRO Pagos - Generar QR offline (/api/Pago/StringQROffline)',
  siro_pagos_qr_estatico: 'SIRO Pagos - Cobro con QR estatico (/api/Pago/QREstatico)',
  siro_pagos_comprobante: 'SIRO Pagos - Pago por comprobante (/api/Pago/Comprobante)',
  siro_api_pagos_upload: 'API SIRO - Cargar base de pagos (/siro/Pagos)',
  siro_api_pagos_estado_transaccion: 'API SIRO - Consultar estado de carga (/siro/Pagos/{nro_transaccion})',
  siro_api_pagos_consulta: 'API SIRO - Consultar bases (/siro/Pagos/Consulta)',
  siro_api_listados_proceso: 'API SIRO - Ver listados de proceso (/siro/Listados/Proceso)',
  siro_api_admin_convenios: 'API SIRO - Consultar administradores y convenios (/siro/Admininstradores - /siro/Convenios)',
  siro_api_adhesiones_ciclo: 'API SIRO - Ciclo de adhesiones (/siro/Adhesiones - ...)'
};

const STEP_LABELS: Record<string, string> = {
  create_intencion: 'Crear intencion de pago',
  playwright_pago: 'Completar pago en sitio web',
  espera_url_ok: 'Esperar confirmacion del pago',
  consulta_intencion: 'Consultar intenciones de pago',
  string_qr: 'Generar QR dinamico',
  string_qr_offline: 'Generar QR offline',
  qr_estatico_string: 'Generar datos de QR estatico',
  qr_estatico_peticion: 'Crear cobro con QR estatico',
  pago_comprobante: 'Crear pago por comprobante',
  siro_pagos_upload: 'Cargar base de pagos',
  siro_estado_transaccion_post_upload: 'Consultar estado de carga',
  siro_estado_transaccion: 'Consultar estado de transaccion',
  siro_pagos_consulta: 'Consultar bases de pagos',
  siro_listados_proceso: 'Consultar listados de proceso',
  siro_administradores: 'Consultar administradores',
  siro_convenios: 'Consultar convenios',
  adhesion_alta: 'Dar de alta adhesion',
  adhesion_por_cpe: 'Consultar adhesion por cliente',
  adhesion_vigentes: 'Consultar adhesiones vigentes',
  adhesion_modificar: 'Modificar adhesion',
  adhesion_desactivar: 'Desactivar adhesion',
  adhesion_bajas: 'Consultar adhesiones dadas de baja',
  pago_hash_resultado_webhook: 'Verificar estado del pago (notificacion)',
  pago_hash_resultado_browser: 'Verificar estado del pago (flujo web)',
  pago_consulta_webhook: 'Consultar pago por referencia (notificacion)',
  pago_consulta_browser: 'Consultar pago por referencia (flujo web)',
  siro_web_xlistpend_webhook: 'Revisar transacciones en SIRO WEB (notificacion)',
  siro_web_xlistpend_browser: 'Revisar transacciones en SIRO WEB (flujo web)'
};

const ARTIFACT_LABELS: Record<string, string> = {
  '00-landing': '01 - Pantalla inicial de pago',
  '00-after-mail-comprobante': '02 - Correo de comprobante cargado',
  '01-after-confirm': '03 - Medio de pago confirmado',
  '02-before-pagar-card-form': '04 - Formulario de tarjeta completo',
  '02-after-submit-card': '05 - Pago con tarjeta enviado',
  '02-after-generate-debin': '04 - Solicitud DEBIN generada',
  '02-qr-screen': '04 - Codigo QR listo para pagar',
  '02-channel-screen': '04 - Pantalla del medio de pago',
  '99-error': '99 - Captura ante error',
  '00-login': '01 - Inicio de sesion SIRO WEB',
  '01-post-login': '02 - Acceso a SIRO WEB confirmado',
  '02-reporte-transacciones-linea-selected': '03 - Reporte de transacciones seleccionado',
  '03-reporte-generado': '04 - Reporte generado',
  '04-reporte-excel-generado': '05 - Exportacion a Excel solicitada'
};

const EVENT_MESSAGE_LABELS: Record<string, string> = {
  'Run encolada para ejecucion': 'Ejecucion en cola para iniciar',
  'Run reencolada manualmente': 'Ejecucion puesta nuevamente en cola',
  'Procesando seguimiento post-webhook desde worker': 'Iniciando verificacion posterior al pago',
  'Error en seguimiento post-webhook procesado por worker': 'Fallo la verificacion posterior al pago',
  'Seguimiento post-webhook finalizado': 'Verificacion posterior al pago finalizada',
  'Seguimiento post-webhook encolado para worker (API + SIRO WEB)': 'Verificacion posterior al pago en cola',
  'Navegacion Playwright omitida por configuracion': 'Se omitio la simulacion web por configuracion',
  'Ejecucion de pasos finalizada': 'Ejecucion finalizada',
  'Consultas de seguimiento de intencion de pago completadas': 'Verificaciones posteriores del pago finalizadas',
  'No se pudo descargar reporte de SIRO WEB - Transacciones en Linea': 'No se pudo descargar el reporte de transacciones de SIRO WEB',
  'Webhook URL_OK recibido': 'Notificacion de pago recibida',
  'SIRO WEB: inicio de sesion y navegacion a Reportes > Transacciones en Linea': 'SIRO WEB: inicio de sesion y acceso al reporte de transacciones',
  'SIRO WEB: no se detecto formulario de login; se continua directo al reporte': 'SIRO WEB: no se encontro login, se continua directo al reporte',
  'SIRO WEB: no se detecto pantalla de login ni de reporte': 'SIRO WEB: no se encontro pantalla de ingreso ni de reporte',
  'SIRO WEB: no se detecto selector de reporte (#cboTipoListado)': 'SIRO WEB: no se encontro el selector de reporte',
  'SIRO WEB: PDF de Transacciones en Linea descargado': 'SIRO WEB: PDF de transacciones descargado',
  'SIRO WEB: XLS de Transacciones en Linea descargado': 'SIRO WEB: Excel de transacciones descargado',
  'SIRO WEB: no se pudo descargar XLS de Transacciones en Linea': 'SIRO WEB: no se pudo descargar el Excel de transacciones',
  'SIRO WEB: idReferenciaOperacion encontrado en reporte': 'SIRO WEB: referencia de operacion encontrada en el reporte',
  'SIRO WEB: idReferenciaOperacion NO encontrado en reporte': 'SIRO WEB: referencia de operacion no encontrada en el reporte'
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Creado',
  queued: 'En cola',
  running: 'En ejecucion',
  waiting_webhook: 'Esperando confirmacion de pago',
  waiting_manual_action: 'Esperando accion manual',
  completed: 'Completado',
  failed: 'Fallido',
  faild: 'Fallido',
  cancelled: 'Cancelado',
  timed_out: 'Vencido',
  success: 'Completado',
  pending: 'Pendiente',
  skipped: 'Omitido',
  manual_wait: 'Pausa manual',
  awaiting_external_event: 'Esperando confirmacion'
};

function titleCaseWords(input: string) {
  return input
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function humanizeIdentifier(input: string) {
  const raw = String(input ?? '').trim();
  if (!raw) return '-';
  const cleaned = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return titleCaseWords(cleaned);
}

export function getDefinitionDisplayName(definitionKey: string) {
  return DEFINITION_LABELS[definitionKey] ?? humanizeIdentifier(definitionKey);
}

export function getStatusDisplayName(status: string) {
  const key = String(status ?? '').trim().toLowerCase();
  return STATUS_LABELS[key] ?? humanizeIdentifier(key);
}

export function getStatusClassName(status: string) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'success') {
    return 'badge badge-ok';
  }
  if (normalized === 'failed' || normalized === 'faild' || normalized === 'timed_out' || normalized === 'cancelled') {
    return 'badge badge-err';
  }
  return 'badge badge-warn';
}

export function getArtifactDisplayName(name: string) {
  const raw = String(name ?? '').trim();
  const base = raw.replace(/\.[a-z0-9]+$/i, '');
  if (ARTIFACT_LABELS[base]) {
    const extension = raw.slice(base.length);
    return `${ARTIFACT_LABELS[base]}${extension}`;
  }
  return humanizeIdentifier(base);
}

export function getStepDisplayName(stepName: string | null | undefined, stepCode: string | null | undefined) {
  const cleanedName = String(stepName ?? '').trim();
  if (cleanedName) {
    return cleanedName;
  }

  const code = String(stepCode ?? '').trim();
  if (!code) {
    return '-';
  }

  return STEP_LABELS[code] ?? humanizeIdentifier(code);
}

export function getEventDisplayMessage(message: string) {
  const raw = String(message ?? '').trim();
  if (!raw) return '-';

  if (EVENT_MESSAGE_LABELS[raw]) {
    return EVENT_MESSAGE_LABELS[raw];
  }

  if (raw.startsWith('Inicio de ejecucion ')) {
    return 'Inicio de ejecucion de prueba';
  }

  if (raw.startsWith('Navegacion web iniciada para canal ')) {
    const channel = raw.replace('Navegacion web iniciada para canal ', '').trim();
    return `Inicio de simulacion web de pago (${channel})`;
  }

  if (raw.startsWith('Navegacion web finalizada para canal ')) {
    const channel = raw.replace('Navegacion web finalizada para canal ', '').trim();
    return `Simulacion web de pago finalizada (${channel})`;
  }

  if (raw.startsWith('Error en navegacion de canal ')) {
    const channel = raw.replace('Error en navegacion de canal ', '').trim();
    return `Error durante la simulacion web de pago (${channel})`;
  }

  return raw;
}
