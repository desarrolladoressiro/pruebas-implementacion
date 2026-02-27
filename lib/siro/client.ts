import { getEnv } from '@/lib/env';
import { SIRO_ENV_CONFIG } from '@/lib/siro/config';
import { JsonObject, TargetEnvironment } from '@/lib/types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface SiroTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface TokenCache {
  value: string;
  expiresAtEpochMs: number;
}

export class SiroClient {
  private environment: TargetEnvironment;
  private tokenCache: TokenCache | null = null;

  constructor(environment: TargetEnvironment) {
    this.environment = environment;
  }

  private getCredentials() {
    const env = getEnv();

    if (this.environment === 'homologacion') {
      return {
        usuario: env.SIRO_HOMO_USER,
        password: env.SIRO_HOMO_PASSWORD
      };
    }

    return {
      usuario: env.SIRO_PROD_USER,
      password: env.SIRO_PROD_PASSWORD
    };
  }

  private async getToken() {
    const now = Date.now();

    if (this.tokenCache && this.tokenCache.expiresAtEpochMs - now > 60_000) {
      return this.tokenCache.value;
    }

    const envConfig = SIRO_ENV_CONFIG[this.environment];
    const credentials = this.getCredentials();

    const token = await this.rawRequest<SiroTokenResponse>({
      url: envConfig.sessionUrl,
      method: 'POST',
      body: {
        Usuario: credentials.usuario,
        Password: credentials.password
      },
      includeAuth: false
    });

    this.tokenCache = {
      value: token.access_token,
      expiresAtEpochMs: now + token.expires_in * 1000
    };

    return token.access_token;
  }

  private async rawRequest<T>({
    url,
    method,
    body,
    query,
    includeAuth,
    timeoutMs = 25_000
  }: {
    url: string;
    method: HttpMethod;
    body?: JsonObject;
    query?: JsonObject;
    includeAuth: boolean;
    timeoutMs?: number;
  }): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (includeAuth) {
      const token = await this.getToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const finalUrl = query
      ? `${url}?${new URLSearchParams(
          Object.entries(query).reduce<Record<string, string>>((acc, [key, value]) => {
            if (value !== undefined && value !== null) {
              acc[key] = String(value);
            }
            return acc;
          }, {})
        ).toString()}`
      : url;

    const response = await fetch(finalUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        `SIRO request failed (${response.status}) ${method} ${finalUrl} - ${JSON.stringify(payload)}`
      );
    }

    return payload as T;
  }

  private async siroPagosRequest<T>(
    path: string,
    method: HttpMethod,
    body?: JsonObject,
    query?: JsonObject
  ) {
    const baseUrl = SIRO_ENV_CONFIG[this.environment].siroPagosBaseUrl;
    return this.rawRequest<T>({
      url: `${baseUrl}${path}`,
      method,
      body,
      query,
      includeAuth: true
    });
  }

  private async siroApiRequest<T>(
    path: string,
    method: HttpMethod,
    body?: JsonObject,
    query?: JsonObject
  ) {
    const baseUrl = SIRO_ENV_CONFIG[this.environment].siroApiBaseUrl;
    return this.rawRequest<T>({
      url: `${baseUrl}${path}`,
      method,
      body,
      query,
      includeAuth: true
    });
  }

  async createPago(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago', 'POST', payload);
  }

  async createPagoStringQR(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago/StringQR', 'POST', payload);
  }

  async createPagoComprobante(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago/Comprobante', 'POST', payload);
  }

  async createPagoStringQREstatico(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago/StringQREstatico', 'POST', payload);
  }

  async createPagoQREstatico(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago/QREstatico', 'POST', payload);
  }

  async getPagoByHashResultado(hash: string, idResultado: string) {
    return this.siroPagosRequest<JsonObject>(`/api/Pago/${hash}/${idResultado}`, 'GET');
  }

  async consultaPago(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago/Consulta', 'POST', payload);
  }

  async createPagoStringQROffline(payload: JsonObject) {
    return this.siroPagosRequest<JsonObject>('/api/Pago/StringQROffline', 'POST', payload);
  }

  async getAdministradores() {
    return this.siroApiRequest<JsonObject>('/siro/Administradores', 'GET');
  }

  async getConvenios() {
    return this.siroApiRequest<JsonObject>('/siro/Convenios', 'GET');
  }

  async postListadosProceso(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Listados/Proceso', 'POST', payload);
  }

  async postPagosUpload(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Pagos', 'POST', payload);
  }

  async getPagosByTransaccion(nroTransaccion: number) {
    return this.siroApiRequest<JsonObject>(`/siro/Pagos/${nroTransaccion}`, 'GET');
  }

  async postPagoConsulta(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Pago/Consulta', 'POST', payload);
  }

  async postAdhesionAlta(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Adhesiones', 'POST', payload);
  }

  async getAdhesionByCpe(nroCpe: string) {
    return this.siroApiRequest<JsonObject>(`/siro/Adhesiones/${nroCpe}`, 'GET');
  }

  async getAdhesionesBajas(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Adhesiones/Bajas', 'GET', undefined, payload);
  }

  async getAdhesionesVigentes(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Adhesiones/Vigentes', 'GET', undefined, payload);
  }

  async postAdhesionDesactivar(nroCpe: string, payload: JsonObject) {
    return this.siroApiRequest<JsonObject>(`/siro/Adhesiones/Desactivar/${nroCpe}`, 'POST', payload);
  }

  async postAdhesionModificar(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Adhesiones/Modificar', 'POST', payload);
  }
}
