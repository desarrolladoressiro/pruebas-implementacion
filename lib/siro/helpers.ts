import { getEnv } from '@/lib/env';

function padLeft(input: string | number, length: number) {
  return String(input).padStart(length, '0');
}

function toIsoWithFixedOffset(date: Date, offsetMinutes: number) {
  const offsetMs = offsetMinutes * 60 * 1000;
  const adjusted = new Date(date.getTime() + offsetMs);

  const year = adjusted.getUTCFullYear();
  const month = padLeft(adjusted.getUTCMonth() + 1, 2);
  const day = padLeft(adjusted.getUTCDate(), 2);
  const hours = padLeft(adjusted.getUTCHours(), 2);
  const minutes = padLeft(adjusted.getUTCMinutes(), 2);
  const seconds = padLeft(adjusted.getUTCSeconds(), 2);
  const millis = padLeft(adjusted.getUTCMilliseconds(), 3);

  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = padLeft(Math.floor(absOffset / 60), 2);
  const offsetMins = padLeft(absOffset % 60, 2);
  const sign = offsetMinutes >= 0 ? '+' : '-';

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetMins}`;
}

export function normalizeBaseCliente(baseCliente: string) {
  const digits = baseCliente.replace(/\D/g, '');

  if (digits.length === 9) {
    return digits;
  }

  if (digits.length === 8) {
    return `0${digits}`;
  }

  throw new Error('El baseCliente debe tener 8 o 9 digitos.');
}

export function buildNroClienteEmpresa(baseCliente: string) {
  const env = getEnv();
  const convenio = env.SIRO_CONVENIO_ID.replace(/\D/g, '');
  if (convenio.length !== 10) {
    throw new Error('SIRO_CONVENIO_ID debe tener 10 digitos.');
  }

  return `${normalizeBaseCliente(baseCliente)}${convenio}`;
}

export function buildNroComprobante({
  conceptDigit,
  sequence,
  base
}: {
  conceptDigit?: number;
  sequence?: number;
  base?: string;
}) {
  const cleanedBase = String(base ?? '').trim().replace(/\s+/g, '');
  const first15 =
    cleanedBase.length > 0
      ? cleanedBase.slice(0, 15).padEnd(15, '0')
      : (() => {
          const now = new Date();
          const seq = padLeft(sequence ?? Number(now.getMilliseconds()), 4);
          return `AUTO${padLeft(now.getDate(), 2)}${padLeft(now.getHours(), 2)}${padLeft(now.getMinutes(), 2)}${padLeft(now.getSeconds(), 2)}${seq}${padLeft(now.getTime() % 10000, 4)}`.slice(0, 15);
        })();

  const randomSuffix = padLeft(Math.floor(Math.random() * 100000), 5);
  return `${first15}${randomSuffix}`;
}

export function buildIdReferenciaOperacion(prefix: string) {
  const now = new Date();
  return `${prefix}_${now.getTime()}`;
}

export function isoNowMinus(days: number) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return toIsoWithFixedOffset(date, -180);
}

export function isoNowPlus(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return toIsoWithFixedOffset(date, -180);
}
