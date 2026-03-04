import { getEnv } from '@/lib/env';
import { addRunArtifact, appendRunEvent } from '@/lib/runs/repository';
import { TargetEnvironment } from '@/lib/types';

export type PaymentChannel = 'td' | 'tc' | 'qr' | 'debin' | 'link' | 'pmc';

interface BrowserSimulationOptions {
  runId: string;
  stepId: string;
  paymentUrl: string;
  environment: TargetEnvironment;
  channel: PaymentChannel;
  input: Record<string, any>;
  profile?: Record<string, any> | null;
}

interface BrowserSimulationResult {
  finalUrl: string;
  callbackQuery: Record<string, string>;
  idResultado?: string;
  idReferenciaOperacion?: string;
  cpe?: string;
}

function toRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
}

async function clickFirst(page: any, selectors: string[]) {
  const jitter = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const target = locator.nth(index);
      const visible = await target.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ timeout: 10_000 });
      await page.waitForTimeout(jitter(90, 260));
      return true;
    }
  }
  return false;
}

async function fillFirst(page: any, selectors: string[], value: string) {
  const jitter = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const target = locator.nth(index);
      const visible = await target.isVisible().catch(() => false);
      const enabled = await target.isEnabled().catch(() => false);
      if (!visible || !enabled) {
        continue;
      }

      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(jitter(60, 180));
      await target.fill('', { timeout: 10_000 });
      await target.type(value, { delay: jitter(55, 120) });
      await page.waitForTimeout(jitter(100, 280));
      return true;
    }
  }
  return false;
}

async function selectFirst(page: any, selectors: string[], optionValue: string) {
  const jitter = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const target = locator.nth(index);
      const visible = await target.isVisible().catch(() => false);
      const enabled = await target.isEnabled().catch(() => false);
      if (!visible || !enabled) {
        continue;
      }

      await target.selectOption(optionValue, { timeout: 10_000 });
      await page.waitForTimeout(jitter(90, 240));
      return true;
    }
  }
  return false;
}

async function getFirstVisibleLocator(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (visible) {
        return candidate;
      }
    }
  }
  return null;
}

async function getInputValueFirstVisible(page: any, selectors: string[]) {
  const locator = await getFirstVisibleLocator(page, selectors);
  if (!locator) {
    return '';
  }
  return String((await locator.inputValue().catch(() => '')) ?? '').trim();
}

async function failIfPaymentErrorModal(page: any, channel: PaymentChannel) {
  if (channel !== 'td' && channel !== 'tc') {
    return;
  }

  const modalTitle = page.locator('h6.modal-title').filter({ hasText: 'Error' });
  const isVisible = await modalTitle.first().isVisible().catch(() => false);
  if (!isVisible) {
    return;
  }

  const modalBody = page.locator('.modal-body');
  const errorText = String((await modalBody.first().innerText().catch(() => '')) ?? '').trim();
  throw new Error(
    `El flujo fue rechazado por popup de error en Boton de Pagos.${errorText ? ` Detalle: ${errorText}` : ''}`
  );
}

function urlHasIdResultado(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.has('IdResultado')
      || parsed.searchParams.has('id_resultado')
      || parsed.searchParams.has('idResultado')
    );
  } catch {
    return false;
  }
}

async function waitCardProcessingRedirect({
  page,
  channel,
  maxWaitMs = 180_000
}: {
  page: any;
  channel: PaymentChannel;
  maxWaitMs?: number;
}) {
  const processingText = page.getByText(/Procesando.*Espere por favor/i).first();
  const phaseStart = Date.now();
  let processingDetected = false;

  while (Date.now() - phaseStart < 15_000) {
    await failIfPaymentErrorModal(page, channel);
    if (urlHasIdResultado(page.url())) {
      return;
    }

    if (await processingText.isVisible().catch(() => false)) {
      processingDetected = true;
      break;
    }

    await page.waitForTimeout(500);
  }

  if (!processingDetected) {
    throw new Error('No se detecto el cartel "Procesando... Espere por favor" luego de presionar Pagar.');
  }

  const waitStart = Date.now();
  while (Date.now() - waitStart < maxWaitMs) {
    await failIfPaymentErrorModal(page, channel);
    if (urlHasIdResultado(page.url())) {
      return;
    }
    await page.waitForTimeout(1_000);
  }

  throw new Error('Timeout esperando redireccion URL_OK en canal de tarjeta (3 minutos).');
}

function parseQueryFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return Object.fromEntries(parsed.searchParams.entries());
  } catch {
    return {};
  }
}

function pickQueryValue(query: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = String(query[key] ?? '').trim();
    if (value.length > 0) {
      return value;
    }
  }

  const lowerCaseMap = Object.entries(query).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});

  for (const key of keys) {
    const value = String(lowerCaseMap[key.toLowerCase()] ?? '').trim();
    if (value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function extractCpeFromText(text: string) {
  const normalized = normalizeWhitespace(text);
  const explicitMatch = normalized.match(/c[oó]digo\s+de\s+pago\s+electr[oó]nico[:\s]*([0-9]{10,25})/i);
  if (explicitMatch?.[1]) {
    return explicitMatch[1];
  }

  const candidateMatches = normalized.match(/\b\d{16,25}\b/g) ?? [];
  if (candidateMatches.length === 0) {
    return undefined;
  }

  return candidateMatches.sort((a, b) => b.length - a.length)[0];
}

function requireSecureValue(value: unknown, envKey: string) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error(`Falta variable de entorno segura en produccion: ${envKey}`);
  }
  return text;
}

function requireProfileDni(profile: Record<string, any> | null | undefined) {
  const dni = String(profile?.dni ?? '').trim();
  if (!dni) {
    throw new Error('En produccion para TD/TC el DNI debe estar cargado en el perfil del usuario.');
  }
  return dni;
}

function resolveCardData(
  channel: PaymentChannel,
  input: Record<string, any>,
  profile: Record<string, any> | null | undefined,
  environment: TargetEnvironment
) {
  const env = getEnv();
  const isCredit = channel === 'tc';
  const isProduction = environment === 'produccion';

  if (isProduction) {
    return {
      cardNumber: isCredit
        ? requireSecureValue(env.PROD_CARD_CREDIT_NUMBER, 'PROD_CARD_CREDIT_NUMBER')
        : requireSecureValue(env.PROD_CARD_DEBIT_NUMBER, 'PROD_CARD_DEBIT_NUMBER'),
      month: isCredit
        ? requireSecureValue(env.PROD_CARD_CREDIT_MM, 'PROD_CARD_CREDIT_MM')
        : requireSecureValue(env.PROD_CARD_DEBIT_MM, 'PROD_CARD_DEBIT_MM'),
      year: isCredit
        ? requireSecureValue(env.PROD_CARD_CREDIT_YY, 'PROD_CARD_CREDIT_YY')
        : requireSecureValue(env.PROD_CARD_DEBIT_YY, 'PROD_CARD_DEBIT_YY'),
      cvv: isCredit
        ? requireSecureValue(env.PROD_CARD_CREDIT_CVV, 'PROD_CARD_CREDIT_CVV')
        : requireSecureValue(env.PROD_CARD_DEBIT_CVV, 'PROD_CARD_DEBIT_CVV'),
      dni: requireProfileDni(profile),
      email: requireSecureValue(env.PROD_PAYER_EMAIL, 'PROD_PAYER_EMAIL'),
      firstName: requireSecureValue(env.PROD_PAYER_FIRST_NAME, 'PROD_PAYER_FIRST_NAME'),
      lastName: requireSecureValue(env.PROD_PAYER_LAST_NAME, 'PROD_PAYER_LAST_NAME'),
      phone: requireSecureValue(env.PROD_PAYER_PHONE, 'PROD_PAYER_PHONE'),
      address: requireSecureValue(env.PROD_PAYER_ADDRESS, 'PROD_PAYER_ADDRESS'),
      city: requireSecureValue(env.PROD_PAYER_CITY, 'PROD_PAYER_CITY'),
      province: requireSecureValue(env.PROD_PAYER_PROVINCE, 'PROD_PAYER_PROVINCE'),
      zip: requireSecureValue(env.PROD_PAYER_ZIP, 'PROD_PAYER_ZIP'),
      birthDay: String(input.birth_day ?? '15'),
      birthMonth: String(input.birth_month ?? '06'),
      birthYear: String(input.birth_year ?? '1990')
    };
  }

  const cardPrefix = isCredit ? 'credit' : 'debit';
  const cardNumber =
    String(input.card_number ?? input[`${cardPrefix}_card_number`] ?? '')
    || (isCredit ? env.TEST_CARD_CREDIT_NUMBER : env.TEST_CARD_DEBIT_NUMBER);
  const month =
    String(input.card_expiration_month ?? input[`${cardPrefix}_card_mm`] ?? '')
    || (isCredit ? env.TEST_CARD_CREDIT_MM : env.TEST_CARD_DEBIT_MM);
  const year =
    String(input.card_expiration_year ?? input[`${cardPrefix}_card_yy`] ?? '')
    || (isCredit ? env.TEST_CARD_CREDIT_YY : env.TEST_CARD_DEBIT_YY);
  const cvv =
    String(input.security_code ?? input[`${cardPrefix}_card_cvv`] ?? '')
    || (isCredit ? env.TEST_CARD_CREDIT_CVV : env.TEST_CARD_DEBIT_CVV);

  return {
    cardNumber,
    month,
    year,
    cvv,
    dni: String(input.dni ?? profile?.dni ?? env.TEST_PAYER_DNI),
    email: String(input.email ?? profile?.email ?? env.TEST_PAYER_EMAIL),
    firstName: String(input.first_name ?? env.TEST_PAYER_FIRST_NAME),
    lastName: String(input.last_name ?? env.TEST_PAYER_LAST_NAME),
    phone: String(input.phone ?? env.TEST_PAYER_PHONE),
    address: String(input.address ?? env.TEST_PAYER_ADDRESS),
    city: String(input.city ?? env.TEST_PAYER_CITY),
    province: String(input.province ?? env.TEST_PAYER_PROVINCE),
    zip: String(input.zip ?? env.TEST_PAYER_ZIP),
    birthDay: String(input.birth_day ?? '15'),
    birthMonth: String(input.birth_month ?? '06'),
    birthYear: String(input.birth_year ?? '1990')
  };
}

async function hasAutoFilledPersonalData(page: any) {
  const values = await Promise.all([
    getInputValueFirstVisible(page, ['#card_data input[name="Mail"]', '#card_data #txtMail', 'input[name="Mail"]']),
    getInputValueFirstVisible(page, ['#txtNombres', 'input[name="Nombres"]']),
    getInputValueFirstVisible(page, ['#txtApellidos', 'input[name="Apellidos"]']),
    getInputValueFirstVisible(page, ['#txtTelefono', 'input[name="Telefono"]']),
    getInputValueFirstVisible(page, ['#txtDiaNac']),
    getInputValueFirstVisible(page, ['#txtMesNac']),
    getInputValueFirstVisible(page, ['#txtAnioNac']),
    getInputValueFirstVisible(page, ['#txtDireccion', 'input[name="Direccion"]']),
    getInputValueFirstVisible(page, ['#txtCiudad', 'input[name="Localidad"]']),
    getInputValueFirstVisible(page, ['#txtCodigoPostal', 'input[name="CodigoPostal"]'])
  ]);

  const provinceLocator = await getFirstVisibleLocator(page, ['#cboProvincia', 'select[name="Provincia"]']);
  const provinceValue = provinceLocator
    ? String((await provinceLocator.inputValue().catch(() => '')) ?? '').trim()
    : '';

  return values.every((value) => value.length > 0) && provinceValue.length > 0;
}

async function saveScreenshotArtifact({
  page,
  runId,
  stepId,
  channel,
  name
}: {
  page: any;
  runId: string;
  stepId: string;
  channel: PaymentChannel;
  name: string;
}) {
  const bytes = await page.screenshot({ fullPage: true, type: 'png' });
  const base64 = Buffer.from(bytes).toString('base64');
  const storagePath = `inline/${runId}/${Date.now()}_${channel}_${name}.png`;

  await addRunArtifact({
    runId,
    stepId,
    artifactType: 'screenshot',
    storagePath,
    metadata: {
      channel,
      name,
      page_url: String(page.url?.() ?? ''),
      mime_type: 'image/png',
      data_url: `data:image/png;base64,${base64}`
    }
  });
}

async function runCardPaymentFlow({
  page,
  channel,
  input,
  profile,
  environment
}: {
  page: any;
  channel: PaymentChannel;
  input: Record<string, any>;
  profile?: Record<string, any> | null;
  environment: TargetEnvironment;
}) {
  const card = resolveCardData(channel, input, profile, environment);

  if (channel === 'td') {
    // En débito suele pedirse marca en la segunda pantalla.
    await clickFirst(page, [
      '[id="105"]',
      '[id="31"]',
      '[id="106"]',
      '[id="108"]',
      '.img-outline'
    ]);
    await failIfPaymentErrorModal(page, channel);
  }

  await fillFirst(page, ['#numeroTarjetaTxt', 'input[name="card_number"]'], card.cardNumber);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#mesCbx', 'input[name="card_expiration_month"]'], card.month);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#anioCbx', 'input[name="card_expiration_year"]'], card.year);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#codigoSeguridadTxt', 'input[name="security_code"]'], card.cvv);
  await failIfPaymentErrorModal(page, channel);
  await selectFirst(page, ['select[name="SelectedDocumento"]', '#cboTipoDoc'], 'DNI');
  await fillFirst(page, ['#nroDocTxt', 'input[name="DNI"]'], card.dni);
  await failIfPaymentErrorModal(page, channel);
  // Algunas implementaciones autocompletan datos al perder foco del DNI.
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
  }).catch(() => undefined);
  await page.waitForTimeout(5_000);

  const cardEmailSelectors = ['#card_data input[name="Mail"]', '#card_data #txtMail', 'input[name="Mail"]'];
  const autoFilledPersonalData = await hasAutoFilledPersonalData(page);
  if (autoFilledPersonalData) {
    await clickFirst(page, [
      '#MY_btnConfirmarPago',
      'input[type="submit"][value="Pagar"]',
      'button[type="submit"]'
    ]);
    await page.waitForTimeout(600);
    await failIfPaymentErrorModal(page, channel);
    await waitCardProcessingRedirect({ page, channel });
    return;
  }

  await fillFirst(page, cardEmailSelectors, card.email);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtNombres', 'input[name="Nombres"]'], card.firstName);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtApellidos', 'input[name="Apellidos"]'], card.lastName);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtTelefono', 'input[name="Telefono"]'], card.phone);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtDiaNac'], card.birthDay);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtMesNac'], card.birthMonth);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtAnioNac'], card.birthYear);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtDireccion', 'input[name="Direccion"]'], card.address);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtCiudad', 'input[name="Localidad"]'], card.city);
  await failIfPaymentErrorModal(page, channel);
  await selectFirst(page, ['#cboProvincia', 'select[name="Provincia"]'], card.province);
  await failIfPaymentErrorModal(page, channel);
  await fillFirst(page, ['#txtCodigoPostal', 'input[name="CodigoPostal"]'], card.zip);
  await failIfPaymentErrorModal(page, channel);

  await clickFirst(page, [
    '#MY_btnConfirmarPago',
    'input[type="submit"][value="Pagar"]',
    'button[type="submit"]'
  ]);
  await page.waitForTimeout(600);
  await failIfPaymentErrorModal(page, channel);
  await waitCardProcessingRedirect({ page, channel });
}

async function runDebinFlow({
  page,
  input,
  profile
}: {
  page: any;
  input: Record<string, any>;
  profile?: Record<string, any> | null;
}) {
  const env = getEnv();
  const dni = String(input.dni ?? profile?.dni ?? env.TEST_PAYER_DNI);
  const cbu = String(input.debin_cbu ?? env.TEST_DEBIN_CBU);
  const alias = String(input.debin_alias ?? env.TEST_DEBIN_ALIAS);
  const accountType = String(input.debin_account_type ?? 'cbu').toLowerCase();

  if (accountType === 'alias') {
    await clickFirst(page, ['#RdAlias', 'input[name="gridIndCuenta"][value="Alias"]']);
    await fillFirst(page, ['#AliasComprador', 'input[name="AliasComprador"]'], alias);
  } else {
    await clickFirst(page, ['#RdCBU', 'input[name="gridIndCuenta"][value="CBU"]']);
    await fillFirst(page, ['#CBUComprador', 'input[name="CBUComprador"]'], cbu);
  }

  await fillFirst(page, ['#CuitComprador', '#CUITComprador', 'input[name="CUITComprador"]'], dni);
  await clickFirst(page, ['button[type="submit"]', 'button:has-text("Generar")']);
}

async function runPmcFlow({
  page,
  input,
  profile
}: {
  page: any;
  input: Record<string, any>;
  profile?: Record<string, any> | null;
}) {
  const env = getEnv();
  const bankCode = String(input.pmc_bank_code ?? profile?.preferred_bank ?? env.TEST_PMC_BANK_CODE);
  const dni = String(input.dni ?? profile?.dni ?? env.TEST_PAYER_DNI);

  await selectFirst(page, ['#cboBanco', 'select[name="SelectedBanco"]'], bankCode);
  await fillFirst(page, ['#textCUIT', 'input[name="DNI"]'], dni);
}

function channelSelectors(channel: PaymentChannel) {
  switch (channel) {
    case 'td':
      return ['#SelectedMetodoPagoD', 'input[name="SelectedMetodoPago"][value="D"]'];
    case 'tc':
      return ['#SelectedMetodoPagoC', 'input[name="SelectedMetodoPago"][value="C"]'];
    case 'qr':
      return ['#SelectedMetodoPagoQ', 'input[name="SelectedMetodoPago"][value="Q"]'];
    case 'debin':
      return ['#SelectedMetodoPagoN', 'input[name="SelectedMetodoPago"][value="N"]'];
    case 'link':
      return ['#SelectedMetodoPagoL', 'input[name="SelectedMetodoPago"][value="L"]'];
    case 'pmc':
      return ['#SelectedMetodoPagoB', 'input[name="SelectedMetodoPago"][value="B"]'];
    default:
      return [];
  }
}

export async function simulatePagoInBrowser(
  options: BrowserSimulationOptions
): Promise<BrowserSimulationResult> {
  const env = getEnv();
  const input = toRecord(options.input);
  const profile = toRecord(options.profile);

  let chromium: any;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('No se encontro la dependencia "playwright". Instala el paquete antes de ejecutar flujos web.');
  }

  const browser = await chromium.launch({
    // headless:
    //   input.playwright_headless !== undefined
    //     ? String(input.playwright_headless).toLowerCase() === 'true'
    //     : process.env.NODE_ENV === 'production'
    //       ? env.PLAYWRIGHT_HEADLESS === 'true'
    //       : false,
    headless: true,
    slowMo: Number(env.PLAYWRIGHT_SLOW_MO_MS || 0)
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 }
  });
  const page = await context.newPage();

  try {
    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: `Navegacion web iniciada para canal ${options.channel.toUpperCase()}`,
      payload: {
        url: options.paymentUrl
      }
    });

    await page.goto(options.paymentUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1_000);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      channel: options.channel,
      name: '00-landing'
    });
    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: 'Landing de Boton de Pagos cargada'
    });

    const email =
      options.environment === 'produccion'
        ? requireSecureValue(env.PROD_PAYER_EMAIL, 'PROD_PAYER_EMAIL')
        : String(input.email ?? profile.email ?? env.TEST_PAYER_EMAIL);
    const mailComprobanteFilled = await fillFirst(page, ['input[name="MailComprobante"]', '#divComprobantePago #txtMail'], email);
    if (options.environment === 'produccion' && !mailComprobanteFilled) {
      throw new Error('En produccion el campo de mail de comprobante es obligatorio y no se encontro en pantalla.');
    }

    const selected = await clickFirst(page, channelSelectors(options.channel));
    if (!selected) {
      throw new Error(`No se pudo seleccionar el canal ${options.channel}.`);
    }

    if (options.channel === 'tc') {
      await clickFirst(page, ['[id="1"]', '[id="2"]', '[id="3"]', '.filaPago .celdaPago']);
      await clickFirst(page, ['button.btnSeleccionarMetodoPago', '.btnSeleccionarMetodoPago']);
    }

    if (options.channel === 'pmc') {
      await runPmcFlow({ page, input, profile });
    }

    const confirmed = await clickFirst(page, [
      '#btnPost',
      'input[type="button"][value="Confirmar"]',
      'button:has-text("Confirmar")'
    ]);

    if (!confirmed) {
      throw new Error('No se encontro boton Confirmar para avanzar en el flujo.');
    }

    await page.waitForTimeout(1_500);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      channel: options.channel,
      name: '01-after-confirm'
    });
    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: 'Canal confirmado y flujo avanzado'
    });

    if (options.channel === 'td' || options.channel === 'tc') {
      await runCardPaymentFlow({
        page,
        channel: options.channel,
        input,
        profile,
        environment: options.environment
      });
      await page.waitForTimeout(2_000);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        channel: options.channel,
        name: '02-after-submit-card'
      });
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'info',
        message: 'Formulario de tarjeta enviado'
      });
    } else if (options.channel === 'debin') {
      await runDebinFlow({ page, input, profile });
      await page.waitForTimeout(2_000);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        channel: options.channel,
        name: '02-after-generate-debin'
      });
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'info',
        message: 'DEBIN generado en pantalla'
      });
    } else if (options.channel === 'qr') {
      await page.waitForTimeout(1_500);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        channel: options.channel,
        name: '02-qr-screen'
      });
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'info',
        message: 'QR visible para pago'
      });
    } else {
      await page.waitForTimeout(1_500);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        channel: options.channel,
        name: '02-channel-screen'
      });
    }

    const detailText = await page.locator('#detallePago').first().innerText().catch(() => '');
    const cpe = extractCpeFromText(String(detailText ?? ''));
    const finalUrl = page.url();
    const callbackQuery = parseQueryFromUrl(finalUrl);
    const idResultado = pickQueryValue(callbackQuery, ['IdResultado', 'id_resultado', 'idResultado']);
    const idReferenciaOperacion = pickQueryValue(callbackQuery, [
      'IdReferenciaOperacion',
      'idReferenciaOperacion',
      'id_referencia_operacion'
    ]);

    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: `Navegacion web finalizada para canal ${options.channel.toUpperCase()}`,
      payload: {
        finalUrl,
        callbackQuery,
        idResultado: idResultado ?? null,
        idReferenciaOperacion: idReferenciaOperacion ?? null,
        cpe: cpe ?? null
      }
    });

    return {
      finalUrl,
      callbackQuery,
      idResultado,
      idReferenciaOperacion,
      cpe
    };
  } catch (error) {
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      channel: options.channel,
      name: '99-error'
    }).catch(() => undefined);

    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'error',
      message: `Error en navegacion de canal ${options.channel.toUpperCase()}`,
      payload: {
        error: error instanceof Error ? error.message : String(error)
      }
    }).catch(() => undefined);

    throw error;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
