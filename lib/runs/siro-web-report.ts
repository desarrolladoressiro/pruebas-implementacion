import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addRunArtifact, appendRunEvent } from '@/lib/runs/repository';
import { getEnv } from '@/lib/env';
import { TargetEnvironment } from '@/lib/types';

interface DownloadTransaccionesLineaReportOptions {
  runId: string;
  stepId: string;
  environment: TargetEnvironment;
}

interface DownloadedReportResult {
  ok: boolean;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  finalUrl?: string;
}

function trimToOptional(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : undefined;
}

function resolveSiroWebCredentials(environment: TargetEnvironment) {
  const env = getEnv();
  const url = trimToOptional(env.SIRO_WEB_URL) ?? 'https://www.bancoroela.com.ar/siroweb/';

  const isProd = environment === 'produccion';
  const user = isProd
    ? trimToOptional(env.SIRO_WEB_USER_PRODUCCION)
      ?? trimToOptional(env.SIRO_WEB_USER_PROD)
      ?? trimToOptional(env.SIRO_WEB_USER)
      ?? trimToOptional(env.SIRO_PROD_USER)
    : trimToOptional(env.SIRO_WEB_USER_HOMOLOGACION)
      ?? trimToOptional(env.SIRO_WEB_USER_HOMO)
      ?? trimToOptional(env.SIRO_WEB_USER)
      ?? trimToOptional(env.SIRO_HOMO_USER);
  const password = isProd
    ? trimToOptional(env.SIRO_WEB_PASSWORD_PRODUCCION)
      ?? trimToOptional(env.SIRO_WEB_PASSWORD_PROD)
      ?? trimToOptional(env.SIRO_WEB_PASSWORD)
      ?? trimToOptional(env.SIRO_PROD_PASSWORD)
    : trimToOptional(env.SIRO_WEB_PASSWORD_HOMOLOGACION)
      ?? trimToOptional(env.SIRO_WEB_PASSWORD_HOMO)
      ?? trimToOptional(env.SIRO_WEB_PASSWORD)
      ?? trimToOptional(env.SIRO_HOMO_PASSWORD);

  if (!user || !password) {
    throw new Error(
      `Faltan credenciales de SIRO WEB para ${environment}. Definir SIRO_WEB_USER/SIRO_WEB_PASSWORD o las variables por entorno.`
    );
  }

  return { url, user, password };
}

function mimeTypeByFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function saveScreenshotArtifact({
  page,
  runId,
  stepId,
  name
}: {
  page: any;
  runId: string;
  stepId: string;
  name: string;
}) {
  const bytes = await page.screenshot({ fullPage: true, type: 'png' });
  const base64 = Buffer.from(bytes).toString('base64');
  const storagePath = `inline/${runId}/${Date.now()}_siro_web_${name}.png`;

  await addRunArtifact({
    runId,
    stepId,
    artifactType: 'screenshot',
    storagePath,
    metadata: {
      name,
      source: 'siro_web_reportes',
      page_url: String(page.url?.() ?? ''),
      mime_type: 'image/png',
      data_url: `data:image/png;base64,${base64}`
    }
  });
}

async function waitForDownload(
  page: any,
  trigger: () => Promise<void>,
  timeoutMs: number
) {
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: timeoutMs }),
      trigger()
    ]);
    return download;
  } catch {
    return null;
  }
}

async function clickFirst(page: any, selectors: string[]) {
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
      return true;
    }
  }
  return false;
}

export async function downloadSiroWebTransaccionesLineaReport(
  options: DownloadTransaccionesLineaReportOptions
): Promise<DownloadedReportResult> {
  const env = getEnv();
  const credentials = resolveSiroWebCredentials(options.environment);

  let chromium: any;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('No se encontro la dependencia "playwright". Instala el paquete antes de ejecutar SIRO WEB.');
  }

  const browser = await chromium.launch({
    headless: env.PLAYWRIGHT_HEADLESS === 'true',
    slowMo: Number(env.PLAYWRIGHT_SLOW_MO_MS || 0)
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1024 }
  });
  const page = await context.newPage();

  try {
    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: 'SIRO WEB: inicio de sesion y navegacion a Reportes > Transacciones en Linea',
      payload: {
        baseUrl: credentials.url,
        environment: options.environment
      }
    });

    await page.goto(credentials.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(800);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '00-login'
    });

    await page.locator('#txtUsuario').first().fill(credentials.user);
    await page.locator('#txtContrasena').first().fill(credentials.password);
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => undefined),
      page.locator('#btnAceptar').first().click({ timeout: 10_000 })
    ]);
    await page.waitForTimeout(1_000);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '01-post-login'
    });

    await page.goto(new URL('frmConsultarMovimientosSiro.aspx', credentials.url).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await page.waitForSelector('#cboTipoListado', { timeout: 30_000 });
    await page.selectOption('#cboTipoListado', 'XLISTPEND');
    await page.waitForTimeout(2_000);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '02-reporte-transacciones-linea-selected'
    });

    await clickFirst(page, ['#BtnExcel', '#btnAceptar']);
    await page.waitForTimeout(2_500);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '03-reporte-generado'
    });

    const download =
      (await waitForDownload(
        page,
        async () => {
          await clickFirst(page, ['#ReportToolbar1_Menu_DXI7_I', '#ReportToolbar1_Menu_DXI7_Img']);
        },
        45_000
      )) ??
      (await waitForDownload(
        page,
        async () => {
          await clickFirst(page, ['#BtnExcel']);
        },
        20_000
      ));

    if (!download) {
      throw new Error('No se pudo descargar el reporte de Transacciones en Linea desde SIRO WEB.');
    }

    const suggested = download.suggestedFilename() || `transacciones_linea_${Date.now()}.bin`;
    const tempPath = join(tmpdir(), `${Date.now()}_${suggested}`);
    await download.saveAs(tempPath);
    const fileBuffer = await readFile(tempPath);
    const mimeType = mimeTypeByFilename(suggested);
    const base64 = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    await addRunArtifact({
      runId: options.runId,
      stepId: options.stepId,
      artifactType: 'file',
      storagePath: `inline/${options.runId}/${Date.now()}_${suggested}`,
      metadata: {
        source: 'siro_web_reportes',
        report_name: 'transacciones_en_linea',
        file_name: suggested,
        mime_type: mimeType,
        size_bytes: fileBuffer.length,
        data_url: dataUrl
      }
    });

    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: 'SIRO WEB: reporte de Transacciones en Linea descargado y adjuntado',
      payload: {
        fileName: suggested,
        sizeBytes: fileBuffer.length,
        mimeType
      }
    });

    return {
      ok: true,
      fileName: suggested,
      fileSizeBytes: fileBuffer.length,
      mimeType,
      finalUrl: String(page.url?.() ?? '')
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
