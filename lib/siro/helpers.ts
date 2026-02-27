import { getEnv } from '@/lib/env';

function padLeft(input: string | number, length: number) {
  return String(input).padStart(length, '0');
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
  sequence
}: {
  conceptDigit?: number;
  sequence?: number;
}) {
  const now = new Date();
  const mm = padLeft(now.getMonth() + 1, 2);
  const aa = padLeft(now.getFullYear() % 100, 2);
  const concept = padLeft(conceptDigit ?? 0, 1);
  const seq = padLeft(sequence ?? Number(now.getMilliseconds()), 4);

  const first15 = `AUTO${padLeft(now.getDate(), 2)}${padLeft(now.getHours(), 2)}${padLeft(now.getMinutes(), 2)}${padLeft(now.getSeconds(), 2)}${padLeft(now.getTime() % 100000, 5)}`.slice(0, 15);

  return `${first15}${concept}${mm}${aa}${seq.slice(-1)}`.slice(0, 20);
}

export function buildIdReferenciaOperacion(prefix: string) {
  const now = new Date();
  return `${prefix}_${now.getTime()}`;
}

export function isoNowMinus(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isoNowPlus(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
