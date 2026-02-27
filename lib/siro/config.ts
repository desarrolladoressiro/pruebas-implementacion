import { TargetEnvironment } from '@/lib/types';

export interface SiroEnvironmentConfig {
  sessionUrl: string;
  siroPagosBaseUrl: string;
  siroApiBaseUrl: string;
}

export const SIRO_ENV_CONFIG: Record<TargetEnvironment, SiroEnvironmentConfig> = {
  homologacion: {
    sessionUrl: 'https://apisesionh.bancoroela.com.ar/auth/Sesion',
    siroPagosBaseUrl: 'https://siropagosh.bancoroela.com.ar',
    siroApiBaseUrl: 'https://apisiroh.bancoroela.com.ar'
  },
  produccion: {
    sessionUrl: 'https://apisesion.bancoroela.com.ar/auth/Sesion',
    siroPagosBaseUrl: 'https://siropagos.bancoroela.com.ar',
    siroApiBaseUrl: 'https://apisiro.bancoroela.com.ar'
  }
};
