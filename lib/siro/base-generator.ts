import { buildNroClienteEmpresa } from '@/lib/siro/helpers';

function onlyAsciiUpper(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .toUpperCase();
}

function padRight(input: string, size: number, fill = ' ') {
  return input.slice(0, size).padEnd(size, fill);
}

function padLeftNum(input: string | number, size: number) {
  return String(input).replace(/\D/g, '').slice(0, size).padStart(size, '0');
}

function yymmdd(date: Date) {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function yyyymmdd(date: Date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function amountToCentsString(amount: number, size: number) {
  const cents = Math.round(amount * 100);
  return String(cents).padStart(size, '0').slice(-size);
}

function randomFiveDigits() {
  return String(Math.floor(Math.random() * 100000)).padStart(5, '0');
}

export function generateBaseBasicoLinkPagos({
  baseCliente,
  amount,
  conceptoDigit,
  mensaje,
  randomSuffix5
}: {
  baseCliente: string;
  amount: number;
  conceptoDigit?: number;
  mensaje?: string;
  randomSuffix5?: string;
}) {
  const cpe = buildNroClienteEmpresa(baseCliente);
  const now = new Date();
  const vto1 = yymmdd(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const mmaa = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear() % 100).padStart(2, '0')}`;

  const header = `${padRight('HRFACTURACION', 13)}${padRight('', 3)}${yymmdd(now)}00001${padRight('', 104)}`;

  const deudaId = padLeftNum(randomSuffix5 ?? randomFiveDigits(), 5);
  const detalle =
    `${padLeftNum(deudaId, 5)}` +
    `001` +
    `${padLeftNum(cpe, 19)}` +
    `${vto1}` +
    `${amountToCentsString(amount, 12)}` +
    `${'0'.repeat(6)}` +
    `${'0'.repeat(12)}` +
    `${'0'.repeat(6)}` +
    `${'0'.repeat(12)}` +
    `${padRight(onlyAsciiUpper(mensaje ?? 'PRUEBA AUTOMATIZADA SIRO'), 50)}`;

  const footer =
    `${padRight('TRFACTURACION', 13)}` +
    `${padLeftNum(3, 8)}` +
    `${amountToCentsString(amount, 18)}` +
    `${'0'.repeat(18)}` +
    `${'0'.repeat(18)}` +
    `${padRight('', 56)}`;

  return `${header}\n${detalle}\n${footer}`;
}

export function generateBaseFullPagoMisCuentas({
  baseCliente,
  amount,
  conceptoDigit,
  mensaje,
  randomSuffix5
}: {
  baseCliente: string;
  amount: number;
  conceptoDigit?: number;
  mensaje?: string;
  randomSuffix5?: string;
}) {
  const cpe = buildNroClienteEmpresa(baseCliente);
  const now = new Date();
  const vto1 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const vto2 = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const vto3 = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const first15 = padRight('FACTAUTO', 15, '0');
  const last5 = padLeftNum(randomSuffix5 ?? randomFiveDigits(), 5);
  const idFactura = `${first15}${last5}`;

  const header =
    `0` +
    `400` +
    `0000` +
    `${yyyymmdd(now)}` +
    `1` +
    `${'0'.repeat(263)}`;

  const msg = padRight(onlyAsciiUpper(mensaje ?? 'PRUEBA AUTOMATIZADA SIRO'), 40);
  const msgPantalla = padRight(msg.slice(0, 15), 15);

  const detalle =
    `5` +
    `${padLeftNum(cpe, 19)}` +
    `${padRight(idFactura, 20, '0')}` +
    `0` +
    `${yyyymmdd(vto1)}` +
    `${amountToCentsString(amount, 11)}` +
    `${yyyymmdd(vto2)}` +
    `${amountToCentsString(amount + 10, 11)}` +
    `${yyyymmdd(vto3)}` +
    `${amountToCentsString(amount + 20, 11)}` +
    `${'0'.repeat(19)}` +
    `${padRight(cpe, 19, ' ')}` +
    `${msg}` +
    `${msgPantalla}` +
    `${padRight('', 60)}` +
    `${'0'.repeat(29)}`;

  const footer =
    `9` +
    `400` +
    `0000` +
    `${yyyymmdd(now)}` +
    `${padLeftNum(1, 7)}` +
    `${'0'.repeat(7)}` +
    `${amountToCentsString(amount, 16)}` +
    `${'0'.repeat(234)}`;

  return `${header}\n${detalle}\n${footer}`;
}
