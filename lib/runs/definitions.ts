import { TestDefinition } from '@/lib/types';

export const TEST_DEFINITIONS: TestDefinition[] = [
  {
    key: 'siro_pagos_crear_intencion',
    domain: 'api_siro_pagos',
    name: 'SIRO Pagos - Crear Intencion (/api/Pago)',
    description: 'Genera una intencion de pago y deja el flujo esperando callback URL_OK.',
    executor_code: 'siro_pagos_crear_intencion',
    enabled: true,
    default_input: {
      Concepto: 'PRUEBA AUTOMATIZADA API PAGO',
      Importe: 100,
      Detalle: [
        {
          Descripcion: 'SERVICIO',
          Importe: 100
        }
      ]
    }
  },
  {
    key: 'siro_pagos_consulta_intencion',
    domain: 'api_siro_pagos',
    name: 'SIRO Pagos - Consulta (/api/Pago/Consulta)',
    description: 'Consulta intenciones por idReferenciaOperacion y rango de fechas.',
    executor_code: 'siro_pagos_consulta_intencion',
    enabled: true,
    default_input: {}
  },
  {
    key: 'siro_pagos_string_qr',
    domain: 'api_siro_pagos',
    name: 'SIRO Pagos - String QR (/api/Pago/StringQR)',
    description: 'Crea intencion QR dinamico y devuelve string para generar imagen.',
    executor_code: 'siro_pagos_string_qr',
    enabled: true,
    default_input: {
      Concepto: 'PRUEBA STRING QR',
      Importe: 100
    }
  },
  {
    key: 'siro_pagos_string_qr_offline',
    domain: 'api_siro_pagos',
    name: 'SIRO Pagos - String QR Offline',
    description: 'Genera string QR offline con vencimientos e importes.',
    executor_code: 'siro_pagos_string_qr_offline',
    enabled: true,
    default_input: {
      importe_1: 100,
      importe_2: 120,
      importe_3: 140
    }
  },
  {
    key: 'siro_pagos_qr_estatico',
    domain: 'api_siro_pagos',
    name: 'SIRO Pagos - QR Estatico (String + Peticion)',
    description: 'Genera terminal QR estatico y crea peticion de cobro.',
    executor_code: 'siro_pagos_qr_estatico',
    enabled: true,
    default_input: {
      Importe: 100
    }
  },
  {
    key: 'siro_pagos_comprobante',
    domain: 'api_siro_pagos',
    name: 'SIRO Pagos - Comprobante (/api/Pago/Comprobante)',
    description: 'Genera intencion de pago sobre comprobante existente.',
    executor_code: 'siro_pagos_comprobante',
    enabled: true,
    default_input: {
      UsarVencimientosComprobante: false
    }
  },
  {
    key: 'siro_api_pagos_upload',
    domain: 'api_siro',
    name: 'API SIRO - Subir Base (/siro/Pagos)',
    description: 'Sube base de deuda y obtiene nro_transaccion.',
    executor_code: 'siro_api_pagos_upload',
    enabled: true,
    default_input: {
      formato: 'basico',
      importe: 100,
      confirmar_automaticamente: true,
      obtener_informacion_base: true,
      consultas_estado_max_intentos: 3,
      consultas_estado_intervalo_ms: 4000
    }
  },
  {
    key: 'siro_api_pagos_estado_transaccion',
    domain: 'api_siro',
    name: 'API SIRO - Estado Transaccion (/siro/Pagos/{nro_transaccion})',
    description: 'Consulta estado de procesamiento de base de deuda.',
    executor_code: 'siro_api_pagos_estado_transaccion',
    enabled: true,
    default_input: {
      nro_transaccion: 0,
      obtener_informacion_base: true
    }
  },
  {
    key: 'siro_api_pagos_consulta',
    domain: 'api_siro',
    name: 'API SIRO - Consulta Bases (/siro/Pago/Consulta)',
    description: 'Consulta bases en rango de fechas.',
    executor_code: 'siro_api_pagos_consulta',
    enabled: true,
    default_input: {
      obtener_informacion_base: true
    }
  },
  {
    key: 'siro_api_listados_proceso',
    domain: 'api_siro',
    name: 'API SIRO - Listados Proceso',
    description: 'Consulta rendicion de cobranzas por periodo.',
    executor_code: 'siro_api_listados_proceso',
    enabled: true,
    default_input: {}
  },
  {
    key: 'siro_api_admin_convenios',
    domain: 'api_siro',
    name: 'API SIRO - Administradores y Convenios',
    description: 'Consulta administradores y convenios habilitados.',
    executor_code: 'siro_api_admin_convenios',
    enabled: true,
    default_input: {}
  },
  {
    key: 'siro_api_adhesiones_ciclo',
    domain: 'api_siro',
    name: 'API SIRO - Ciclo de Adhesiones',
    description: 'Alta, consulta, vigentes/bajas, modificacion y desactivacion.',
    executor_code: 'siro_api_adhesiones_ciclo',
    enabled: true,
    default_input: {
      tipoAdhesion: 'VS'
    }
  }
];
