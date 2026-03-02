import { getEnv } from '@/lib/env';
import { SIRO_ENV_CONFIG } from '@/lib/siro/config';
import { JsonObject, TargetEnvironment } from '@/lib/types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type DomainRateKey = 'siro_pagos' | 'siro_api';

const RATE_LIMIT_RULES: Record<DomainRateKey, { maxRequests: number; windowMs: number }> = {
  siro_pagos: { maxRequests: 10, windowMs: 10_000 },
  siro_api: { maxRequests: 5, windowMs: 10_000 }
};

interface SiroTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface TokenCache {
  value: string;
  expiresAtEpochMs: number;
}

class SiroHttpError extends Error {
  status: number;
  payload: unknown;
  retryAfterMs: number | null;

  constructor(message: string, status: number, payload: unknown, retryAfterMs: number | null) {
    super(message);
    this.name = 'SiroHttpError';
    this.status = status;
    this.payload = payload;
    this.retryAfterMs = retryAfterMs;
  }
}

export class SiroClient {
  private environment: TargetEnvironment;
  private tokenCache: TokenCache | null = null;
  private static rateLimitWindows: Record<string, number[]> = {};

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
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const retryAfterMs = this.parseRetryAfterHeader(response.headers.get('retry-after'));
      throw new SiroHttpError(
        `SIRO request failed (${response.status}) ${method} ${finalUrl} - ${JSON.stringify(payload)}`,
        response.status,
        payload,
        retryAfterMs
      );
    }

    return payload as T;
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseRetryAfterHeader(retryAfterHeader: string | null) {
    if (!retryAfterHeader) {
      return null;
    }

    const asSeconds = Number(retryAfterHeader);
    if (Number.isFinite(asSeconds)) {
      return Math.max(250, asSeconds * 1000);
    }

    const parsedDate = Date.parse(retryAfterHeader);
    if (Number.isFinite(parsedDate)) {
      return Math.max(250, parsedDate - Date.now());
    }

    return null;
  }

  private async enforceRateLimit(domain: DomainRateKey) {
    const rule = RATE_LIMIT_RULES[domain];
    const key = `${this.environment}:${domain}`;

    while (true) {
      const now = Date.now();
      const currentWindow = (SiroClient.rateLimitWindows[key] ?? []).filter(
        (timestamp) => now - timestamp < rule.windowMs
      );

      if (currentWindow.length < rule.maxRequests) {
        currentWindow.push(now);
        SiroClient.rateLimitWindows[key] = currentWindow;
        return;
      }

      const oldestTimestamp = currentWindow[0];
      const waitMs = Math.max(100, rule.windowMs - (now - oldestTimestamp) + 50);
      await this.delay(waitMs);
    }
  }

  private async executeWithDomainPolicy<T>(
    domain: DomainRateKey,
    request: {
      url: string;
      method: HttpMethod;
      body?: JsonObject;
      query?: JsonObject;
      includeAuth: boolean;
      timeoutMs?: number;
    }
  ) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.enforceRateLimit(domain);

      try {
        return await this.rawRequest<T>(request);
      } catch (error) {
        const shouldRetry429 =
          error instanceof SiroHttpError && error.status === 429 && attempt < maxAttempts;

        if (!shouldRetry429) {
          throw error;
        }

        const backoffMs = error.retryAfterMs ?? attempt * 1_500;
        await this.delay(backoffMs);
      }
    }

    throw new Error('No se pudo ejecutar la solicitud SIRO luego de varios intentos.');
  }

  private async siroPagosRequest<T>(
    path: string,
    method: HttpMethod,
    body?: JsonObject,
    query?: JsonObject
  ) {
    const baseUrl = SIRO_ENV_CONFIG[this.environment].siroPagosBaseUrl;
    return this.executeWithDomainPolicy<T>('siro_pagos', {
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
    return this.executeWithDomainPolicy<T>('siro_api', {
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

  async getPagosByTransaccion(nroTransaccion: number, query?: JsonObject) {
    return this.siroApiRequest<JsonObject>(`/siro/Pagos/${nroTransaccion}`, 'GET', undefined, query);
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

  async postAdhesionDesactivar(nroCpe: string, payload?: JsonObject) {
    return this.siroApiRequest<JsonObject>(`/siro/Adhesiones/Desactivar/${nroCpe}`, 'POST', payload);
  }

  async postAdhesionModificar(payload: JsonObject) {
    return this.siroApiRequest<JsonObject>('/siro/Adhesiones/Modificar', 'POST', payload);
  }
}
