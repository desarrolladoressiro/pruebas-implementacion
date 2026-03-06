import { TestDefinition } from '@/lib/types';

export const TEST_DEFINITIONS: TestDefinition[] = [
  {
    key: 'siro_pagos_crear_intencion',
    domain: 'api_siro_pagos',
    name: 'Pagos SIRO - Crear intencion de pago',
    description: 'Crea una intencion de pago y espera la confirmacion del cobro.',
    executor_code: 'siro_pagos_crear_intencion',
    enabled: true,
    default_input: {
      Concepto: 'PRUEBA AUTOMATIZADA API PAGO',
      Importe: 51,
      canal: 'td',
      run_browser: true,
      Detalle: [
        {
          Descripcion: 'SERVICIO',
          Importe: 51
        }
      ]
    }
  },
  {
    key: 'siro_pagos_consulta_intencion',
    domain: 'api_siro_pagos',
    name: 'Pagos SIRO - Consultar intenciones',
    description: 'Busca intenciones de pago por referencia y fechas.',
    executor_code: 'siro_pagos_consulta_intencion',
    enabled: true,
    default_input: {}
  },
  {
    key: 'siro_pagos_string_qr',
    domain: 'api_siro_pagos',
    name: 'Pagos SIRO - Generar QR dinamico',
    description: 'Genera un codigo QR dinamico para cobrar.',
    executor_code: 'siro_pagos_string_qr',
    enabled: true,
    default_input: {
      Concepto: 'PRUEBA STRING QR',
      Importe: 5
    }
  },
  {
    key: 'siro_pagos_string_qr_offline',
    domain: 'api_siro_pagos',
    name: 'Pagos SIRO - Generar QR offline',
    description: 'Genera un codigo QR offline con importes y vencimientos.',
    executor_code: 'siro_pagos_string_qr_offline',
    enabled: true,
    default_input: {
      importe_1: 5,
      importe_2: 10,
      importe_3: 15
    }
  },
  {
    key: 'siro_pagos_qr_estatico',
    domain: 'api_siro_pagos',
    name: 'Pagos SIRO - Cobro con QR estatico',
    description: 'Prepara un QR estatico y crea la solicitud de cobro.',
    executor_code: 'siro_pagos_qr_estatico',
    enabled: true,
    default_input: {
      Importe: 5
    }
  },
  {
    key: 'siro_pagos_comprobante',
    domain: 'api_siro_pagos',
    name: 'Pagos SIRO - Pago por comprobante',
    description: 'Genera una intencion de pago usando un comprobante existente.',
    executor_code: 'siro_pagos_comprobante',
    enabled: true,
    default_input: {
      UsarVencimientosComprobante: false
    }
  },
  {
    key: 'siro_api_pagos_upload',
    domain: 'api_siro',
    name: 'API SIRO - Cargar base de pagos',
    description: 'Sube una base de pagos y devuelve el numero de transaccion.',
    executor_code: 'siro_api_pagos_upload',
    enabled: true,
    default_input: {
      formato: 'basico',
      importe: 5,
      confirmar_automaticamente: true,
      obtener_informacion_base: true,
      consultas_estado_max_intentos: 3,
      consultas_estado_intervalo_ms: 10000
    }
  },
  {
    key: 'siro_api_pagos_estado_transaccion',
    domain: 'api_siro',
    name: 'API SIRO - Consultar estado de carga',
    description: 'Consulta el estado de procesamiento de una carga.',
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
    name: 'API SIRO - Consultar bases',
    description: 'Consulta bases cargadas dentro de un rango de fechas.',
    executor_code: 'siro_api_pagos_consulta',
    enabled: true,
    default_input: {
      obtener_informacion_base: true
    }
  },
  {
    key: 'siro_api_listados_proceso',
    domain: 'api_siro',
    name: 'API SIRO - Ver listados de proceso',
    description: 'Consulta listados de cobranzas por periodo.',
    executor_code: 'siro_api_listados_proceso',
    enabled: true,
    default_input: {}
  },
  {
    key: 'siro_api_admin_convenios',
    domain: 'api_siro',
    name: 'API SIRO - Consultar administradores y convenios',
    description: 'Consulta administradores y convenios habilitados.',
    executor_code: 'siro_api_admin_convenios',
    enabled: true,
    default_input: {}
  },
  {
    key: 'siro_api_adhesiones_ciclo',
    domain: 'api_siro',
    name: 'API SIRO - Ciclo de adhesiones',
    description: 'Ejecuta alta, consulta, modificacion, desactivacion y bajas de adhesiones.',
    executor_code: 'siro_api_adhesiones_ciclo',
    enabled: true,
    default_input: {
      tipoAdhesion: 'VS'
    }
  }
];
