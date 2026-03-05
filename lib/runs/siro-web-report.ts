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
  expectedIdReferenciaOperacion?: string | null;
}

interface DownloadedReportResult {
  ok: boolean;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  finalUrl?: string;
  pdfFileName?: string;
  xlsFileName?: string;
  expectedIdReferenciaOperacion?: string | null;
  idReferenciaOperacionEncontrado?: boolean;
  idReferenciaOperacionEncontradoEn?: 'page' | 'xls' | 'page_and_xls' | 'none';
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
  try {
    const bytes = await page.screenshot({
      fullPage: true,
      type: 'png',
      timeout: 60_000,
      animations: 'disabled'
    });
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
  } catch (error) {
    await appendRunEvent({
      runId,
      stepId,
      level: 'warn',
      message: 'SIRO WEB: no se pudo guardar screenshot (se continua ejecucion)',
      payload: {
        name,
        error: error instanceof Error ? error.message : String(error),
        page_url: String(page.url?.() ?? '')
      }
    }).catch(() => undefined);
  }
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

async function triggerToolbarExportAnywhereById(page: any, menuId: string) {
  const cellId = `${menuId}_DXI7_I`;
  const imgId = `${menuId}_DXI7_Img`;
  const scopes = listScopes(page);
  for (const scope of scopes) {
    const clicked = await clickFirst(scope, [`#${cellId}`, `#${imgId}`]);
    if (clicked) {
      return true;
    }
  }

  for (const scope of scopes) {
    const triggered = await scope.evaluate(({ cell, menu }: { cell: string; menu: string }) => {
      const g = window as any;
      try {
        g.__cfRLUnblockHandlers = true;
      } catch {}
      const target = document.getElementById(cell) as HTMLElement | null;
      if (target) {
        target.click();
        return true;
      }
      if (typeof g.aspxMIClick === 'function') {
        try {
          g.aspxMIClick(new MouseEvent('click', { bubbles: true, cancelable: true }), menu, '7');
          return true;
        } catch {}
      }
      return false;
    }, { cell: cellId, menu: menuId }).catch(() => false);
    if (triggered) {
      return true;
    }
  }

  return false;
}

function compactHtmlSnippet(html: string, maxLength = 3000) {
  return html.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function bufferContainsText(buffer: Buffer, text: string) {
  if (!text) return false;
  const target = text.toLowerCase();
  return buffer.toString('utf8').toLowerCase().includes(target)
    || buffer.toString('latin1').toLowerCase().includes(target);
}

async function pageContainsTextAnywhere(page: any, text: string) {
  if (!text) return false;
  const scopes = listScopes(page);
  for (const scope of scopes) {
    const bodyText = await scope.locator('body').innerText().catch(() => '');
    if (String(bodyText ?? '').toLowerCase().includes(text.toLowerCase())) {
      return true;
    }
  }
  return false;
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

function isFontFilename(filename: string | undefined) {
  const lower = String(filename ?? '').toLowerCase();
  return lower.endsWith('.ttf') || lower.endsWith('.otf') || lower.endsWith('.woff') || lower.endsWith('.woff2');
}

function isDownloadLikeResponse(response: any, expected: 'pdf' | 'xls') {
  const headers = response.headers?.() ?? {};
  const contentType = String(headers['content-type'] ?? '').toLowerCase();
  const disposition = String(headers['content-disposition'] ?? '');
  const dispositionLower = disposition.toLowerCase();
  const url = String(response.url?.() ?? '').toLowerCase();
  const request = response.request?.();
  const method = String(request?.method?.() ?? '').toUpperCase();
  const filename = parseFilenameFromHeader(disposition);
  const pdfByFilename = String(filename ?? '').toLowerCase().endsWith('.pdf');
  const xlsByFilename = String(filename ?? '').toLowerCase().endsWith('.xls')
    || String(filename ?? '').toLowerCase().endsWith('.xlsx');

  if (isFontFilename(filename)) {
    return false;
  }

  if (contentType.includes('font/') || contentType.includes('application/font') || contentType.includes('application/x-font')) {
    return false;
  }

  // Prioridad: captura de export PDF del reporte (endpoint dxrep_fake por POST).
  const fromReportPost = url.includes('dxrep_fake') && method === 'POST';
  const isPdf = contentType.includes('application/pdf') || pdfByFilename;
  const isXls = contentType.includes('application/vnd.ms-excel')
    || contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    || contentType.includes('application/octet-stream') && xlsByFilename
    || xlsByFilename;
  const isAttachment = dispositionLower.includes('attachment');

  if (expected === 'pdf') {
    return (fromReportPost && isPdf) || (isAttachment && isPdf);
  }
  return (fromReportPost && isXls) || (isAttachment && isXls);
}

async function waitForDownloadResponse(
  page: any,
  trigger: () => Promise<void>,
  timeoutMs: number,
  expected: 'pdf' | 'xls'
) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse((candidate: any) => isDownloadLikeResponse(candidate, expected), { timeout: timeoutMs }),
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

async function persistFileArtifact({
  runId,
  stepId,
  fileName,
  fileBuffer
}: {
  runId: string;
  stepId: string;
  fileName: string;
  fileBuffer: Buffer;
}) {
  const mimeType = mimeTypeByFilename(fileName);
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  await addRunArtifact({
    runId,
    stepId,
    artifactType: 'file',
    storagePath: `inline/${runId}/${Date.now()}_${fileName}`,
    metadata: {
      source: 'siro_web_reportes',
      report_name: 'transacciones_en_linea',
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: fileBuffer.length,
      data_url: dataUrl
    }
  });
  return { fileName, fileSizeBytes: fileBuffer.length, mimeType };
}

async function captureReportExportFile({
  page,
  runId,
  stepId,
  expected,
  expectedText,
  trigger,
  timeoutMs
}: {
  page: any;
  runId: string;
  stepId: string;
  expected: 'pdf' | 'xls';
  expectedText?: string;
  trigger: () => Promise<void>;
  timeoutMs: number;
}) {
  const download = await waitForDownload(page, trigger, timeoutMs);
  if (download) {
    const suggested = download.suggestedFilename() || `transacciones_linea_${Date.now()}.${expected}`;
    if (!isFontFilename(suggested)) {
      const tempPath = join(tmpdir(), `${Date.now()}_${suggested}`);
      await download.saveAs(tempPath);
      const fileBuffer = await readFile(tempPath);
      const lower = suggested.toLowerCase();
      if (expected === 'pdf' && lower.endsWith('.pdf')) {
        const saved = await persistFileArtifact({ runId, stepId, fileName: suggested, fileBuffer });
        return { ...saved, containsExpectedText: bufferContainsText(fileBuffer, String(expectedText ?? '')) };
      }
      if (expected === 'xls' && (lower.endsWith('.xls') || lower.endsWith('.xlsx'))) {
        const saved = await persistFileArtifact({ runId, stepId, fileName: suggested, fileBuffer });
        return { ...saved, containsExpectedText: bufferContainsText(fileBuffer, String(expectedText ?? '')) };
      }
    }
  }

  const response = await waitForDownloadResponse(page, trigger, timeoutMs, expected);
  if (!response) {
    return null;
  }

  const headers = response.headers?.() ?? {};
  const disposition = String(headers['content-disposition'] ?? '');
  const responseUrl = String(response.url?.() ?? '');
  const suggested =
    parseFilenameFromHeader(disposition)
    ?? responseUrl.split('/').pop()
    ?? `transacciones_linea_${Date.now()}.${expected}`;
  const fileBuffer = await readDownloadedResponseBuffer(page, response);
  if (!fileBuffer || fileBuffer.length === 0 || isFontFilename(suggested)) {
    return null;
  }

  const saved = await persistFileArtifact({ runId, stepId, fileName: suggested, fileBuffer });
  return { ...saved, containsExpectedText: bufferContainsText(fileBuffer, String(expectedText ?? '')) };
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
  const expectedIdReferenciaOperacion = trimToOptional(options.expectedIdReferenciaOperacion);

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

    await clickFirstAnywhere(page, ['#btnAceptar']);
    await page.waitForTimeout(2_500);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '03-reporte-generado'
    });

    const foundInPage = expectedIdReferenciaOperacion
      ? await pageContainsTextAnywhere(page, expectedIdReferenciaOperacion)
      : false;

    const pdfFile = await captureReportExportFile({
      page,
      runId: options.runId,
      stepId: options.stepId,
      expected: 'pdf',
      expectedText: expectedIdReferenciaOperacion,
      trigger: async () => {
        await triggerToolbarExportAnywhereById(page, 'ReportToolbar1_Menu');
      },
      timeoutMs: 45_000
    });
    if (!pdfFile) {
      throw new Error('No se pudo descargar el PDF de Transacciones en Linea desde SIRO WEB.');
    }

    await appendRunEvent({
      runId: options.runId,
      stepId: options.stepId,
      level: 'info',
      message: 'SIRO WEB: PDF de Transacciones en Linea descargado',
      payload: pdfFile
    });

    await clickFirstAnywhere(page, ['#BtnExcel']);
    await page.waitForTimeout(2_000);
    await saveScreenshotArtifact({
      page,
      runId: options.runId,
      stepId: options.stepId,
      name: '04-reporte-excel-generado'
    });

    const xlsFile = await captureReportExportFile({
      page,
      runId: options.runId,
      stepId: options.stepId,
      expected: 'xls',
      expectedText: expectedIdReferenciaOperacion,
      trigger: async () => {
        await triggerToolbarExportAnywhereById(page, 'ReportToolbar2_Menu');
      },
      timeoutMs: 45_000
    });
    if (!xlsFile) {
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'warn',
        message: 'SIRO WEB: no se pudo descargar XLS de Transacciones en Linea',
        payload: {
          finalUrl: String(page.url?.() ?? '')
        }
      });
    } else {
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: 'info',
        message: 'SIRO WEB: XLS de Transacciones en Linea descargado',
        payload: xlsFile
      });
    }

    const foundInXls = Boolean(xlsFile?.containsExpectedText);
    const expectedPresent = expectedIdReferenciaOperacion
      ? foundInPage || foundInXls
      : undefined;
    const foundLocation =
      expectedIdReferenciaOperacion
        ? (foundInPage && foundInXls
          ? 'page_and_xls'
          : foundInPage
            ? 'page'
            : foundInXls
              ? 'xls'
              : 'none')
        : undefined;

    if (expectedIdReferenciaOperacion) {
      await appendRunEvent({
        runId: options.runId,
        stepId: options.stepId,
        level: expectedPresent ? 'info' : 'warn',
        message: expectedPresent
          ? 'SIRO WEB: idReferenciaOperacion encontrado en reporte'
          : 'SIRO WEB: idReferenciaOperacion NO encontrado en reporte',
        payload: {
          expectedIdReferenciaOperacion,
          foundInPage,
          foundInXls,
          foundIn: foundLocation ?? 'none'
        }
      });
    }

    return {
      ok: true,
      fileName: pdfFile.fileName,
      fileSizeBytes: pdfFile.fileSizeBytes,
      mimeType: pdfFile.mimeType,
      finalUrl: String(page.url?.() ?? ''),
      pdfFileName: pdfFile.fileName,
      xlsFileName: xlsFile?.fileName,
      expectedIdReferenciaOperacion: expectedIdReferenciaOperacion ?? null,
      idReferenciaOperacionEncontrado: expectedPresent,
      idReferenciaOperacionEncontradoEn: foundLocation
    };

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
