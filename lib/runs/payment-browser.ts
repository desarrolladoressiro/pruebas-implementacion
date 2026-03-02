import { getEnv } from '@/lib/env';
import { addRunArtifact, appendRunEvent } from '@/lib/runs/repository';

export type PaymentChannel = 'td' | 'tc' | 'qr' | 'debin' | 'link' | 'pmc';

interface BrowserSimulationOptions {
  runId: string;
  stepId: string;
  paymentUrl: string;
  channel: PaymentChannel;
  input: Record<string, any>;
  profile?: Record<string, any> | null;
}

interface BrowserSimulationResult {
  finalUrl: string;
  callbackQuery: Record<string, string>;
}

function toRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
}

async function clickFirst(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if ((await locator.count()) > 0) {
      const target = locator.first();
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ timeout: 10_000 });
      return true;
    }
  }
  return false;
}

async function fillFirst(page: any, selectors: string[], value: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if ((await locator.count()) > 0) {
      const target = locator.first();
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.fill(value, { timeout: 10_000 });
      return true;
    }
  }
  return false;
}

async function selectFirst(page: any, selectors: string[], optionValue: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if ((await locator.count()) > 0) {
      await locator.first().selectOption(optionValue, { timeout: 10_000 });
      return true;
    }
  }
  return false;
}

function parseQueryFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return Object.fromEntries(parsed.searchParams.entries());
  } catch {
    return {};
  }
}

function resolveCardData(
  channel: PaymentChannel,
  input: Record<string, any>,
  profile: Record<string, any> | null | undefined
) {
  const env = getEnv();
  const isCredit = channel === 'tc';

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
      mime_type: 'image/png',
      data_url: `data:image/png;base64,${base64}`
    }
  });
}

async function runCardPaymentFlow({
  page,
  channel,
  input,
  profile
}: {
  page: any;
  channel: PaymentChannel;
  input: Record<string, any>;
  profile?: Record<string, any> | null;
}) {
  const card = resolveCardData(channel, input, profile);

  if (channel === 'td') {
    // En débito suele pedirse marca en la segunda pantalla.
    await clickFirst(page, ['#31', '#106', '#105', '#108', '.img-outline']);
  }

  await fillFirst(page, ['#numeroTarjetaTxt', 'input[name="card_number"]'], card.cardNumber);
  await fillFirst(page, ['#mesCbx', 'input[name="card_expiration_month"]'], card.month);
  await fillFirst(page, ['#anioCbx', 'input[name="card_expiration_year"]'], card.year);
  await fillFirst(page, ['#codigoSeguridadTxt', 'input[name="security_code"]'], card.cvv);
  await selectFirst(page, ['select[name="SelectedDocumento"]', '#cboTipoDoc'], 'DNI');
  await fillFirst(page, ['#nroDocTxt', 'input[name="DNI"]'], card.dni);
  await fillFirst(page, ['input[name="Mail"]', '#txtMail'], card.email);
  await fillFirst(page, ['#txtNombres', 'input[name="Nombres"]'], card.firstName);
  await fillFirst(page, ['#txtApellidos', 'input[name="Apellidos"]'], card.lastName);
  await fillFirst(page, ['#txtTelefono', 'input[name="Telefono"]'], card.phone);
  await fillFirst(page, ['#txtDiaNac'], card.birthDay);
  await fillFirst(page, ['#txtMesNac'], card.birthMonth);
  await fillFirst(page, ['#txtAnioNac'], card.birthYear);
  await fillFirst(page, ['#txtDireccion', 'input[name="Direccion"]'], card.address);
  await fillFirst(page, ['#txtCiudad', 'input[name="Localidad"]'], card.city);
  await selectFirst(page, ['#cboProvincia', 'select[name="Provincia"]'], card.province);
  await fillFirst(page, ['#txtCodigoPostal', 'input[name="CodigoPostal"]'], card.zip);

  await clickFirst(page, ['input[type="submit"][value="Pagar"]', 'button[type="submit"]']);
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

  await fillFirst(page, ['#CUITComprador', 'input[name="CUITComprador"]'], dni);
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

  const { chromium } = await import('playwright');

  const browser = await chromium.launch({
    headless: env.PLAYWRIGHT_HEADLESS === 'true',
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

    const email = String(input.email ?? profile.email ?? env.TEST_PAYER_EMAIL);
    await fillFirst(page, ['#txtMail', 'input[name="MailComprobante"]'], email);

    const selected = await clickFirst(page, channelSelectors(options.channel));
    if (!selected) {
      throw new Error(`No se pudo seleccionar el canal ${options.channel}.`);
    }

    if (options.channel === 'tc') {
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

    if (options.channel === 'td' || options.channel === 'tc') {
      await runCardPaymentFlow({
        page,
        channel: options.channel,
        input,
        profile
      });
      await page.waitForTimeout(2_000);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        channel: options.channel,
        name: '02-after-submit-card'
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
    } else if (options.channel === 'qr') {
      await page.waitForTimeout(1_500);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        channel: options.channel,
        name: '02-qr-screen'
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

    const finalUrl = page.url();
    const callbackQuery = parseQueryFromUrl(finalUrl);

    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: `Navegacion web finalizada para canal ${options.channel.toUpperCase()}`,
      payload: {
        finalUrl,
        callbackQuery
      }
    });

    return {
      finalUrl,
      callbackQuery
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
