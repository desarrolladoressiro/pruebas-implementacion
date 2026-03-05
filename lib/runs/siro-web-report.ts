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

async function fillFirst(page: any, selectors: string[], value: string) {
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
      await target.fill(value, { timeout: 10_000 });
      return true;
    }
  }
  return false;
}

async function hasAnyVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const visible = await locator.nth(index).isVisible().catch(() => false);
      if (visible) {
        return true;
      }
    }
  }
  return false;
}

function listScopes(page: any) {
  return [page, ...(page.frames?.() ?? [])];
}

async function findScopeWithAnyVisible(page: any, selectors: string[]) {
  const scopes = listScopes(page);
  for (const scope of scopes) {
    const visible = await hasAnyVisible(scope, selectors);
    if (visible) {
      return scope;
    }
  }
  return null;
}

async function clickFirstAnywhere(page: any, selectors: string[]) {
  const scopes = listScopes(page);
  for (const scope of scopes) {
    const clicked = await clickFirst(scope, selectors);
    if (clicked) {
      return true;
    }
  }
  return false;
}

async function triggerToolbarExportAnywhere(page: any) {
  const scopes = listScopes(page);
  for (const scope of scopes) {
    const clicked = await clickFirst(scope, ['#ReportToolbar1_Menu_DXI7_I', '#ReportToolbar1_Menu_DXI7_Img']);
    if (clicked) {
      return true;
    }
  }

  for (const scope of scopes) {
    const triggered = await scope.evaluate(() => {
      const g = window as any;
      try {
        g.__cfRLUnblockHandlers = true;
      } catch {}

      const target = document.getElementById('ReportToolbar1_Menu_DXI7_I') as HTMLElement | null;
      if (target) {
        target.click();
        return true;
      }

      if (typeof g.aspxMIClick === 'function') {
        try {
          g.aspxMIClick(new MouseEvent('click', { bubbles: true, cancelable: true }), 'ReportToolbar1_Menu', '7');
          return true;
        } catch {}
      }

      return false;
    }).catch(() => false);

    if (triggered) {
      return true;
    }
  }

  return false;
}

function compactHtmlSnippet(html: string, maxLength = 3000) {
  return html.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function waitForAnyVisible(
  page: any,
  selectors: string[],
  timeoutMs: number
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const scope = await findScopeWithAnyVisible(page, selectors);
    if (scope) {
      return scope;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

function maskEndpoint(endpoint: string) {
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return endpoint.slice(0, 32);
  }
}

function parseFilenameFromHeader(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const utf8 = raw.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8).replace(/["']/g, '');
  const basic = raw.match(/filename="?([^\";]+)"?/i)?.[1];
  if (basic) return basic.trim();
  return undefined;
}

function isDownloadLikeResponse(response: any) {
  const headers = response.headers?.() ?? {};
  const contentType = String(headers['content-type'] ?? '').toLowerCase();
  const disposition = String(headers['content-disposition'] ?? '').toLowerCase();
  return (
    disposition.includes('attachment')
    || contentType.includes('application/pdf')
    || contentType.includes('application/vnd.ms-excel')
    || contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    || contentType.includes('text/csv')
    || contentType.includes('application/octet-stream')
  );
}

async function waitForDownloadResponse(
  page: any,
  trigger: () => Promise<void>,
  timeoutMs: number
) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse((candidate: any) => isDownloadLikeResponse(candidate), { timeout: timeoutMs }),
      trigger()
    ]);
    return response;
  } catch {
    return null;
  }
}

async function readDownloadedResponseBuffer(page: any, response: any) {
  try {
    return Buffer.from(await response.body());
  } catch {
    const request = response.request?.();
    if (!request) {
      return null;
    }

    const method = String(request.method?.() ?? 'GET').toUpperCase();
    const url = String(response.url?.() ?? request.url?.() ?? '');
    if (!url) {
      return null;
    }

    const originalHeaders = (request.headers?.() ?? {}) as Record<string, string>;
    const headers = Object.fromEntries(
      Object.entries(originalHeaders).filter(([key]) => {
        const lower = key.toLowerCase();
        return lower !== 'content-length' && lower !== 'host';
      })
    );

    const postDataBuffer = request.postDataBuffer?.() ?? undefined;
    const apiResponse = await page.context().request.fetch(url, {
      method,
      headers,
      data: postDataBuffer,
      timeout: 60_000
    });
    if (!apiResponse.ok()) {
      return null;
    }
    return Buffer.from(await apiResponse.body());
  }
}

async function connectBrowser(chromium: any, endpoint: string) {
  const lower = endpoint.toLowerCase();
  const timeout = 30_000;

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    const browser = await chromium.connectOverCDP(endpoint, { timeout });
    return { browser, mode: 'remote_cdp' as const };
  }

  try {
    const browser = await chromium.connect(endpoint, { timeout });
    return { browser, mode: 'remote_playwright' as const };
  } catch (connectError) {
    try {
      const browser = await chromium.connectOverCDP(endpoint, { timeout });
      return { browser, mode: 'remote_cdp' as const };
    } catch (cdpError) {
      const connectMessage = connectError instanceof Error ? connectError.message : String(connectError);
      const cdpMessage = cdpError instanceof Error ? cdpError.message : String(cdpError);
      throw new Error(
        `No se pudo conectar al navegador remoto (${maskEndpoint(endpoint)}). `
        + `connect: ${connectMessage} | connectOverCDP: ${cdpMessage}`
      );
    }
  }
}

export async function downloadSiroWebTransaccionesLineaReport(
  options: DownloadTransaccionesLineaReportOptions
): Promise<DownloadedReportResult> {
  const env = getEnv();
  const credentials = resolveSiroWebCredentials(options.environment);
  const remoteEndpoint = trimToOptional(env.PLAYWRIGHT_WS_ENDPOINT);

  let chromium: any;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('No se encontro la dependencia "playwright". Instala el paquete antes de ejecutar SIRO WEB.');
  }

  let browser: any;
  let context: any;
  let page: any;
  let closeContext = true;
  let executionMode = 'local_launch';

  if (remoteEndpoint) {
    const connected = await connectBrowser(chromium, remoteEndpoint);
    browser = connected.browser;
    executionMode = connected.mode;

    if (connected.mode === 'remote_cdp') {
      context = browser.contexts?.()[0];
      if (!context) {
        context = await browser.newContext({
          acceptDownloads: true,
          viewport: { width: 1440, height: 1024 }
        });
      } else {
        closeContext = false;
      }
    } else {
      context = await browser.newContext({
        acceptDownloads: true,
        viewport: { width: 1440, height: 1024 }
      });
    }
  } else {
    browser = await chromium.launch({
      headless: env.PLAYWRIGHT_HEADLESS === 'true',
      slowMo: Number(env.PLAYWRIGHT_SLOW_MO_MS || 0)
    });
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1024 }
    });
  }

  page = await context.newPage();

  try {
    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: 'SIRO WEB: inicio de sesion y navegacion a Reportes > Transacciones en Linea',
      payload: {
        baseUrl: credentials.url,
        environment: options.environment,
        executionMode,
        remoteBrowserEndpoint: remoteEndpoint ? maskEndpoint(remoteEndpoint) : null
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

    const userSelectors = ['#txtUsuario', 'input[name="txtUsuario"]', 'input[id*="Usuario"]', 'input[name*="Usuario"]'];
    const passSelectors = ['#txtContrasena', 'input[name="txtContrasena"]', 'input[type="password"]'];
    const submitSelectors = ['#btnAceptar', 'input[id*="Aceptar"]', 'button:has-text("Aceptar")', 'input[type="submit"]'];
    const reportSelectors = ['#cboTipoListado'];
    const resolvedAnyStateScope = await waitForAnyVisible(page, [...userSelectors, ...reportSelectors], 30_000);

    if (!resolvedAnyStateScope) {
      const currentUrl = String(page.url?.() ?? '');
      const pageTitle = await page.title().catch(() => '');
      const html = await page.content().catch(() => '');
      const frameUrls = (page.frames?.() ?? []).map((frame: any) => String(frame.url?.() ?? ''));
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'error',
        message: 'SIRO WEB: no se detecto pantalla de login ni de reporte',
        payload: {
          currentUrl,
          pageTitle,
          htmlSnippet: compactHtmlSnippet(String(html ?? '')),
          frameUrls
        }
      });
      throw new Error('No se detecto pantalla de login ni pantalla de reporte de SIRO WEB.');
    }

    const loginVisible = await hasAnyVisible(resolvedAnyStateScope, userSelectors);

    if (loginVisible) {
      const userFilled = await fillFirst(resolvedAnyStateScope, userSelectors, credentials.user);
      const passFilled = await fillFirst(resolvedAnyStateScope, passSelectors, credentials.password);
      if (!userFilled || !passFilled) {
        throw new Error('No se pudieron completar los campos de login de SIRO WEB (usuario/contrasena).');
      }

      const clicked = await clickFirst(resolvedAnyStateScope, submitSelectors);
      if (!clicked) {
        throw new Error('No se encontro boton para enviar login de SIRO WEB.');
      }

      await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => undefined);
      await page.waitForTimeout(1_000);
      await saveScreenshotArtifact({
        page,
        runId: options.runId,
        stepId: options.stepId,
        name: '01-post-login'
      });
    } else {
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'warn',
        message: 'SIRO WEB: no se detecto formulario de login; se continua directo al reporte',
        payload: {
          currentUrl: String(page.url?.() ?? '')
        }
      });
    }

    await page.goto(new URL('frmConsultarMovimientosSiro.aspx', credentials.url).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    const reportScope = await waitForAnyVisible(page, ['#cboTipoListado'], 30_000);
    if (!reportScope) {
      const currentUrl = String(page.url?.() ?? '');
      const pageTitle = await page.title().catch(() => '');
      const html = await page.content().catch(() => '');
      const frameUrls = (page.frames?.() ?? []).map((frame: any) => String(frame.url?.() ?? ''));
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'error',
        message: 'SIRO WEB: no se detecto selector de reporte (#cboTipoListado)',
        payload: {
          currentUrl,
          pageTitle,
          htmlSnippet: compactHtmlSnippet(String(html ?? '')),
          frameUrls
        }
      });
      throw new Error('No se detecto selector de reporte (#cboTipoListado).');
    }
    await reportScope.selectOption('#cboTipoListado', 'XLISTPEND');
    await page.waitForTimeout(2_000);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '02-reporte-transacciones-linea-selected'
    });

    await clickFirstAnywhere(page, ['#BtnExcel', '#btnAceptar']);
    await page.waitForTimeout(2_500);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '03-reporte-generado'
    });

    const toolbarClick = async () => {
      await triggerToolbarExportAnywhere(page);
    };

    const excelClick = async () => {
      await clickFirstAnywhere(page, ['#BtnExcel']);
    };

    const download =
      (await waitForDownload(
        page,
        toolbarClick,
        45_000
      )) ??
      (await waitForDownload(
        page,
        excelClick,
        20_000
      ));

    if (download) {
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
    }

    const responseFromToolbar = await waitForDownloadResponse(page, toolbarClick, 45_000);
    const responseFromExcel = responseFromToolbar ?? (await waitForDownloadResponse(page, excelClick, 20_000));

    if (responseFromExcel) {
      const headers = responseFromExcel.headers?.() ?? {};
      const disposition = String(headers['content-disposition'] ?? '');
      const responseUrl = String(responseFromExcel.url?.() ?? '');
      const suggested =
        parseFilenameFromHeader(disposition)
        ?? responseUrl.split('/').pop()
        ?? `transacciones_linea_${Date.now()}.bin`;
      const fileBuffer = await readDownloadedResponseBuffer(page, responseFromExcel);
      if (!fileBuffer || fileBuffer.length === 0) {
        await appendRunEvent({
          runId: options.runId,
          stepId: options.stepId,
          level: 'warn',
          message: 'SIRO WEB: se detecto respuesta de descarga pero no se pudo leer el body',
          payload: {
            responseUrl,
            contentType: String(headers['content-type'] ?? ''),
            contentDisposition: disposition
          }
        });
      } else {
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
        message: 'SIRO WEB: reporte capturado por respuesta HTTP y adjuntado',
        payload: {
          fileName: suggested,
          sizeBytes: fileBuffer.length,
          mimeType,
          responseUrl
        }
      });

      return {
        ok: true,
        fileName: suggested,
        fileSizeBytes: fileBuffer.length,
        mimeType,
        finalUrl: String(page.url?.() ?? '')
      };
      }
    }

    const finalHtml = compactHtmlSnippet(String(await page.content().catch(() => '') ?? ''));
    throw new Error(
      `No se pudo descargar el reporte de Transacciones en Linea desde SIRO WEB. `
      + `URL final: ${String(page.url?.() ?? '')}. HTML: ${finalHtml}`
    );
  } finally {
    if (closeContext) {
      await context.close().catch(() => undefined);
    } else {
      await page.close().catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
  }
}
