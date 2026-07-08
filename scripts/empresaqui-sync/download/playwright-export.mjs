#!/usr/bin/env node
/**
 * Download via Playwright: login → filtros → pesquisa → EXPORTAR → CSV EXCEL (PADRÃO).
 *
 * Exporta runDownload() para sync.mjs.
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  AUTH_STATE_PATH,
  DOWNLOADS_DIR,
  getEmpresaquiCredentials,
} from '../lib/env.mjs';
import { waitForEnter } from '../lib/pause.mjs';
import { slugify } from '../lib/normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELECTORS_PATH = resolve(__dirname, '../config/selectors.json');

/** @typedef {{ key: string, uf: string, municipio?: string, ibge?: number }} Partition */

/** Nome de arquivo a partir da URL da pesquisa (sem --municipio). */
export function slugFromSearchUrl(url) {
  const id = url.match(/[?&]idArquivos=([^&]+)/i)?.[1];
  if (id) return `arquivo-${id}`;
  const mun = url.match(/[?&]Municipio=([^&]+)/i)?.[1];
  if (mun) {
    const codes = mun.split(';').filter(Boolean).slice(0, 5).join('-');
    return `mun-${codes}`;
  }
  const uf = url.match(/[?&]Uf=([A-Z]{2})/i)?.[1];
  return uf ? `pesquisa-${uf.toLowerCase()}` : 'pesquisa';
}

function loadSelectors() {
  return JSON.parse(readFileSync(SELECTORS_PATH, 'utf8'));
}

function loadFilters() {
  return JSON.parse(readFileSync(resolve(__dirname, '../config/filters.default.json'), 'utf8'));
}

/**
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function tryClick(page, selector) {
  const parts = selector.split(',').map((s) => s.trim());
  for (const sel of parts) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.click({ timeout: 15000 });
      return true;
    }
  }
  return false;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function tryFill(page, selector, value) {
  const parts = selector.split(',').map((s) => s.trim());
  for (const sel of parts) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.fill(value, { timeout: 15000 });
      return true;
    }
  }
  return false;
}

/**
 * @param {import('playwright').Page} page
 */
async function dismissCookies(page) {
  const dismiss = page.getByRole('button', { name: /dismiss cookie/i });
  if (await dismiss.count()) {
    await dismiss.first().click({ timeout: 3000 }).catch(() => {});
  }
}

/**
 * Navega sem networkidle (Empresaqui mantém conexões abertas).
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {ReturnType<typeof loadSelectors>} cfg
 */
async function safeGoto(page, url, cfg) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: cfg.timeouts.navigationMs,
    });
  } catch (err) {
    if (!String(err.message).toLowerCase().includes('timeout')) throw err;
    console.log('  ⚠️  Página lenta — continuando...');
  }
  console.log('  ⏳  Aguardando conteúdo da página...');
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});

  const hasContent = await page.evaluate(() => (document.body?.innerText ?? '').length > 300);
  if (!hasContent) {
    console.log('  🔄  Página vazia — recarregando...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: cfg.timeouts.navigationMs }).catch(() => {});
    await page.waitForTimeout(3000);
  }
}

/**
 * Aguarda login ou página de resultados com conteúdo real (não só URL).
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 */
async function waitForPageReady(page, cfg) {
  const ms = cfg.timeouts.navigationMs;
  try {
    await page.waitForFunction(() => {
      const t = document.body?.innerText ?? '';
      const path = location.pathname;
      if (path.includes('/acesso/login')) {
        return /email|password|acessar|robô/i.test(t);
      }
      if (path.includes('/acesso/empresas')) {
        return /exportar|gerou.*resultados|empresas encontradas|pesquisa por filtros/i.test(t)
          || t.length > 800;
      }
      return t.length > 200;
    }, { timeout: ms });
  } catch {
    console.log('  ⚠️  Conteúdo demorou — verifique login ou loading no browser');
  }
  console.log(`  📍  Página: ${page.url().slice(0, 70)}...`);
}

/**
 * Resolve href relativo do app (ex.: "empresas") sem cair em /empresas público.
 * @param {string} href
 * @param {string} currentUrl
 */
function resolveAppUrl(href, currentUrl) {
  const u = new URL(currentUrl);
  if (u.pathname !== '/' && !u.pathname.endsWith('/')) {
    u.pathname = `${u.pathname}/`;
  }
  return new URL(href, u.href).href;
}

/** @param {string} url */
function isPublicEmpresasUrl(url) {
  return /^https?:\/\/[^/]+\/empresas\/?$/i.test(url);
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} field
 * @param {string} value
 */
async function typeIntoField(page, field, value) {
  await field.click({ timeout: 10000 });
  await field.fill('');
  await field.pressSequentially(value, { delay: 25 });
  await field.dispatchEvent('input');
  await field.dispatchEvent('change');
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 */
async function fillAndSubmitLogin(page, cfg) {
  const { email, password } = getEmpresaquiCredentials();
  if (!email?.trim() || !password?.trim()) {
    throw new Error('Preencha EMPRESAQUI_EMAIL e EMPRESAQUI_PASSWORD em scripts/empresaqui-sync/.env');
  }

  const emailField = page.getByPlaceholder('Email');
  const passField = page.getByPlaceholder('Password');

  if (!(await emailField.count()) || !(await passField.count())) {
    throw new Error('Campos de login não encontrados — ajuste config/selectors.json');
  }

  await typeIntoField(page, emailField, email);
  await typeIntoField(page, passField, password);
  await passField.blur();

  const btn = page.locator('#BotaoCad').or(page.getByRole('button', { name: 'Acessar' }));

  const enabled = await page.waitForFunction(() => {
    const b = document.querySelector('#BotaoCad')
      ?? [...document.querySelectorAll('button')].find((x) => /acessar/i.test(x.textContent ?? ''));
    return b && !/** @type {HTMLButtonElement} */ (b).disabled;
  }, { timeout: 20000 }).then(() => true).catch(() => false);

  if (enabled) {
    await btn.first().click({ timeout: 15000 });
  } else {
    await passField.press('Enter');
  }

  await page.waitForURL((u) => !u.pathname.includes('/acesso/login'), {
    timeout: cfg.timeouts.navigationMs,
  });
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  console.log(`  📍  Pós-login: ${page.url()}`);
}

/**
 * @param {import('playwright').Page} page
 */
function isLoginPage(page) {
  return page.url().includes('/acesso/login');
}

/**
 * Login manual se a URL redirecionar para /acesso/login.
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @param {import('playwright').BrowserContext} context
 * @param {string} targetUrl
 */
async function ensureLoggedInForUrl(page, cfg, context, targetUrl) {
  await safeGoto(page, targetUrl, cfg);
  await dismissCookies(page);
  await waitForPageReady(page, cfg);

  if (!isLoginPage(page)) return;

  console.log('  ⚠️  Redirecionado para login — sessão expirada ou ausente');
  await manualLoginFlow(page, cfg, context);

  console.log('  🔗  Reabrindo resultados...');
  await safeGoto(page, targetUrl, cfg);
  await waitForPageReady(page, cfg);

  if (isLoginPage(page)) {
    throw new Error('Ainda na tela de login — conclua captcha + Acessar antes de pressionar ENTER');
  }
}
/**
 * Login manual — contorna captcha "Não sou um robô".
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @param {import('playwright').BrowserContext} context
 */
async function manualLoginFlow(page, cfg, context) {
  if (!isLoginPage(page)) {
    await safeGoto(page, `${cfg.baseUrl}${cfg.loginPath}`, cfg);
    await dismissCookies(page);
  }

  console.log('\n🤖  Login manual (captcha):');
  console.log('   1. No browser: preencha email/senha + "Não sou um robô" + Acessar');
  console.log('   2. Aguarde entrar no sistema (não precisa abrir a URL de resultados)');
  console.log('   3. Volte aqui e pressione ENTER\n');

  await waitForEnter('Pronto? Pressione ENTER para salvar a sessão...');

  await context.storageState({ path: AUTH_STATE_PATH });
  const url = page.url();
  console.log(`  ✓  Sessão salva em .auth/empresaqui.json`);
  console.log(`  📍  URL atual: ${url}`);
  return url;
}

/** Abre URL sem esperas longas (modo search-url). */
async function fastOpenUrl(page, url) {
  console.log('  🌐  Abrindo browser...');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch {
    console.log('  ⚠️  Página lenta — continue no browser');
  }
  console.log(`  📍  ${page.url().slice(0, 90)}`);
}

/** @param {string} dir */
function listCsvFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.csv$/i.test(f))
    .map((f) => resolve(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/**
 * CSV recentes em Downloads / pasta do projeto (salvar em Downloads funciona).
 * @param {string[]} dirs
 * @param {number} sinceMs
 */
function findRecentCsvFiles(dirs, sinceMs) {
  /** @type {{ path: string, mtime: number }[]} */
  const hits = [];
  for (const dir of dirs) {
    for (const f of listCsvFiles(dir)) {
      const mtime = statSync(f).mtimeMs;
      if (mtime >= sinceMs) hits.push({ path: f, mtime });
    }
  }
  return [...new Map(hits.map((h) => [h.path, h])).values()]
    .sort((a, b) => b.mtime - a.mtime)
    .map((h) => h.path);
}

/** @param {string[]} files @param {string} outDir */
function stageCsvFiles(files, outDir) {
  mkdirSync(outDir, { recursive: true });
  /** @type {string[]} */
  const staged = [];
  for (const f of files) {
    const dest = resolve(outDir, basename(f));
    if (resolve(f) !== resolve(dest)) {
      copyFileSync(f, dest);
      staged.push(dest);
    } else {
      staged.push(f);
    }
  }
  return staged;
}

/**
 * Export automático — blocos definidos pelos links do painel (não pela contagem).
 */
async function automatedBlockExport(page, cfg, context, targetUrl, destPath) {
  await fastOpenUrl(page, targetUrl);
  await dismissCookies(page);

  if (isLoginPage(page)) {
    console.log('  ⚠️  Sessão expirada — faça login + captcha no browser');
    await manualLoginFlow(page, cfg, context);
    await fastOpenUrl(page, targetUrl);
  }

  await waitForExportButton(page);
  const count = await readResultCount(page);
  console.log(`  📊  Resultados: ${count?.toLocaleString('pt-BR') ?? '?'}`);
  if (count && count > 200_000) {
    console.log('  ⚠️  Contagem alta — blocos serão lidos do menu EXPORTAR (não da contagem)');
  }

  await clickExportarButton(page);
  let labels = await resolveCsvLabelsFromPanel(page);
  if (!labels.length) {
    await page.waitForTimeout(2000);
    await clickExportarButton(page);
    labels = await resolveCsvLabelsFromPanel(page);
  }
  if (!labels.length) {
    await saveDebugScreenshot(page, destPath);
    await logExportCandidates(page);
    throw new Error('Links "BAIXAR CSV DE..." não apareceram após clicar EXPORTAR');
  }

  console.log(`  📤  Baixando ${labels.length} bloco(s):`);
  for (const l of labels) console.log(`      • ${l}`);

  /** @type {string[]} */
  const files = [];
  for (let i = 0; i < labels.length; i++) {
    if (i > 0) {
      await clickExportarButton(page);
      const fresh = await resolveCsvLabelsFromPanel(page);
      if (fresh[i]) labels[i] = fresh[i];
      else if (fresh.length > 1) labels[i] = fresh[1];
    }
    const link = page.getByText(new RegExp(labels[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first();
    await link.waitFor({ state: 'visible', timeout: 20000 });
    files.push(await downloadCsvByLocator(page, link, cfg, destPath, i));
    await page.waitForTimeout(2000);
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  return files.length === 1 ? files[0] : files;
}

/** Botão EXPORTAR verde ao lado de ABRIR FILTROS */
function exportButtonLocator(page) {
  return page.locator('button.btn-success, button.dropdown-toggle, button')
    .filter({ hasText: /^EXPORTAR/i })
    .first();
}

async function waitForExportButton(page) {
  console.log('  ⏳  Aguardando botão EXPORTAR...');
  await exportButtonLocator(page).waitFor({ state: 'visible', timeout: 180000 });
  console.log('  ✓  EXPORTAR visível');
}

async function clickExportarButton(page) {
  console.log('  🖱️  Clicando EXPORTAR...');
  await page.evaluate(() => window.scrollTo(0, 0));

  const tries = [
    () => exportButtonLocator(page),
    () => page.locator('button').filter({ hasText: /EXPORTAR/i }).first(),
    () => page.getByRole('button', { name: /exportar/i }).first(),
  ];

  for (const getLoc of tries) {
    const btn = getLoc();
    if (!(await btn.count())) continue;
    try {
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ force: true, timeout: 10000 });
      await page.waitForTimeout(2000);
      console.log('  ✓  EXPORTAR clicado');
      return;
    } catch { /* próximo seletor */ }
  }

  throw new Error('Não conseguiu clicar EXPORTAR');
}

/** @param {import('playwright').Locator} loc */
async function downloadCsvByLocator(page, loc, cfg, destPath, partIndex) {
  console.log(`  📥  Bloco ${partIndex + 1} — aguardando download (1–5 min)...`);

  const downloadPromise = page.waitForEvent('download', { timeout: cfg.timeouts.exportMs }).catch(() => null);
  const responsePromise = page.waitForResponse(
    (r) => {
      const h = `${r.headers()['content-type'] ?? ''} ${r.headers()['content-disposition'] ?? ''}`;
      return r.status() === 200 && /csv|excel|spreadsheet|octet-stream|attachment/i.test(h);
    },
    { timeout: cfg.timeouts.exportMs },
  ).catch(() => null);

  await loc.scrollIntoViewIfNeeded();
  await loc.click({ force: true, timeout: 30000 });

  const download = await downloadPromise;
  if (download) {
    const suggested = download.suggestedFilename() || `part${partIndex + 1}.csv`;
    const ext = suggested.includes('.') ? suggested.split('.').pop() : 'csv';
    const finalPath = destPath.replace(/\.csv$/i, `-part${partIndex + 1}.${ext}`);
    await download.saveAs(finalPath);
    console.log(`  ✓  Salvo: ${finalPath}`);
    return finalPath;
  }

  const response = await responsePromise;
  if (response) {
    const partPath = destPath.replace(/\.csv$/i, `-part${partIndex + 1}.csv`);
    writeFileSync(partPath, Buffer.from(await response.body()));
    console.log(`  ✓  Salvo: ${partPath}`);
    return partPath;
  }

  throw new Error(`Download bloco ${partIndex + 1} não iniciou`);
}

/** @deprecated use automatedBlockExport — mantido para --manual-download */
async function manualDownloadFlow(page, cfg, context, targetUrl, destPath) {
  await fastOpenUrl(page, targetUrl);
  await dismissCookies(page);

  if (isLoginPage(page)) {
    console.log('  ⚠️  Login necessário');
    await manualLoginFlow(page, cfg, context);
    await fastOpenUrl(page, targetUrl);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  PASSO 1 — Confirme no browser:');
  console.log('  • "Sua pesquisa gerou ... resultados" visível');
  console.log('  • NÃO clique em EXPORTAR (o script abre sozinho)');
  console.log('  • Pressione ENTER aqui');
  console.log('════════════════════════════════════════════════════════════\n');

  await waitForEnter('Resultados carregados? ENTER...');

  if (!(await openExportDropdown(page, cfg))) {
    await clickExportarButton(page);
  }

  let labels = await resolveCsvLabelsFromPanel(page);
  if (!labels.length) {
    await saveDebugScreenshot(page, destPath);
    throw new Error('Links CSV não encontrados no menu aberto');
  }

  console.log(`  🔎  ${labels.length} parte(s) a baixar:`);
  for (const l of labels) console.log(`      • ${l}`);

  /** @type {string[]} */
  const files = [];
  for (let i = 0; i < labels.length; i++) {
    if (i > 0) {
      if (!(await openExportDropdown(page, cfg))) {
        throw new Error('Não reabriu EXPORTAR para a 2ª parte');
      }
      const fresh = await resolveCsvLabelsFromPanel(page);
      if (fresh[i]) labels[i] = fresh[i];
      else if (fresh.length > 1) labels[i] = fresh[1];
    }
    files.push(await downloadCsvByLabel(page, labels[i], cfg, destPath, i));
    await page.waitForTimeout(2000);
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  return files.length === 1 ? files[0] : files;
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 */
async function ensureLoggedIn(page, cfg) {
  await dismissCookies(page);

  if (!page.url().includes('/acesso/login')) {
    return;
  }

  await fillAndSubmitLogin(page, cfg);
}

/**
 * @param {import('playwright').Page} page
 */
async function hasSearchUi(page) {
  if (await isPublicEmpresasPage(page)) return false;
  if (page.url().includes('/acesso/empresas')) return true;
  return (
    (await page.getByRole('button', { name: /pesquisar/i }).count()) > 0 ||
    (await page.getByPlaceholder(/municip/i).count()) > 0 ||
    (await page.getByPlaceholder(/cnae/i).count()) > 0 ||
    (await page.getByText(/cnae.*opcional/i).count()) > 0 ||
    (await page.locator('button, a, span').filter({ hasText: /^exportar$/i }).count()) > 0 ||
    (await page.getByText(/gerou.*resultados/i).count()) > 0
  );
}

/**
 * @param {import('playwright').Page} page
 */
async function isPublicEmpresasPage(page) {
  const title = await page.title();
  return /ramo de atuação|distribuição no país|empresas do brasil/i.test(title);
}

/**
 * @param {import('playwright').Page} page
 */
async function openSidebar(page) {
  const toggles = [
    page.locator('.sidebar-toggle, #sidebarToggle, [data-toggle="sidebar"], .navbar-toggler'),
    page.getByRole('button', { name: /menu/i }),
    page.locator('i.fa-bars, .fa-bars').locator('xpath=..'),
  ];
  for (const t of toggles) {
    if (await t.count()) {
      await t.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @param {string} [landingUrl]
 */
async function goToSearchPage(page, cfg, landingUrl) {
  if (await hasSearchUi(page)) return;

  const startUrl = landingUrl || page.url();
  await openSidebar(page);

  const filterLink = page.locator('a').filter({ hasText: /pesquisa por filtros|consulta por filtros/i }).first();
  if (await filterLink.count()) {
    const href = await filterLink.getAttribute('href');
    if (href) {
      const target = resolveAppUrl(href, startUrl);
      if (!isPublicEmpresasUrl(target)) {
        await safeGoto(page, target, cfg);
        if (await hasSearchUi(page)) return;
      }
    }
  }

  if (cfg.searchPath && !isPublicEmpresasUrl(`${cfg.baseUrl}${cfg.searchPath}`)) {
    await safeGoto(page, `${cfg.baseUrl}${cfg.searchPath}`, cfg);
    if (await hasSearchUi(page)) return;
  }

  const origin = new URL(startUrl).origin;
  const bases = [
    startUrl,
    page.url(),
    ...(cfg.appHomePaths || []).map((p) => `${origin}${p}`),
  ];

  for (const base of [...new Set(bases)]) {
    try {
      const target = resolveAppUrl('empresas', base);
      if (isPublicEmpresasUrl(target)) continue;
      await safeGoto(page, target, cfg);
      if (await hasSearchUi(page)) return;
    } catch { /* next */ }
  }

  throw new Error(
    `Página de filtros (app logado) não encontrada. ` +
    `Copie a URL de "Pesquisa por Filtros" → searchPath em config/selectors.json. ` +
    `URL atual: ${page.url()} | pós-login: ${startUrl}`,
  );
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @returns {Promise<string>} URL pós-login
 */
async function ensureSession(page, cfg) {
  await safeGoto(page, `${cfg.baseUrl}${cfg.loginPath}`, cfg);
  await dismissCookies(page);

  if (page.url().includes('/acesso/login')) {
    await fillAndSubmitLogin(page, cfg);
  } else {
    console.log(`  📍  Sessão ativa: ${page.url()}`);
  }

  return page.url();
}

/**
 * @param {import('playwright').Page} page
 */
async function logExportCandidates(page) {
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('a, button, span, div, label, input')]
      .map((el) => ({
        t: (el.textContent || (/** @type {HTMLInputElement} */ (el).value) || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        v: (/** @type {HTMLElement} */ (el)).offsetParent !== null,
      }))
      .filter((x) => x.t && /export|excel|xls|csv|baixar|imprimir/i.test(x.t))
      .slice(0, 20),
  );
  if (items.length) {
    console.log('  🔎  Elementos export no DOM:', JSON.stringify(items, null, 2));
  }
}

/**
 * Contagem — só "Sua pesquisa gerou X resultados" (ignora totais do site).
 * @param {import('playwright').Page} page
 */
async function readResultCount(page) {
  return page.evaluate(() => {
    /** @type {{ n: number, len: number } | null} */
    let best = null;
    for (const el of document.querySelectorAll('div, aside, section, p, span')) {
      const t = (el.innerText || '').replace(/\s+/g, ' ');
      if (!/sua pesquisa gerou\s*[\d.]+\s*resultados/i.test(t)) continue;
      if (/exibindo\s+\d+\s+a\s+\d+/i.test(t)) continue;
      if (t.length > 450) continue;
      const m = t.match(/sua pesquisa gerou\s*([\d.]+)\s*resultados/i);
      if (!m) continue;
      const n = parseInt(m[1].replace(/\./g, ''), 10);
      if (!best || t.length < best.len) best = { n, len: t.length };
    }
    return best?.n ?? null;
  });
}

/**
 * Detecta os links CSV corretos no painel aberto (ignora template gigante).
 * Parte 1: DE 0 A 100 MIL. Parte 2: DE 100 A X MIL com menor X (ex.: 135985).
 * @param {import('playwright').Page} page
 */
async function resolveCsvLabelsFromPanel(page) {
  return page.evaluate(() => {
    const lineRe = /BAIXAR CSV DE (\d+) A ([\d ]+) MIL/i;
    /** @type {{ label: string, start: number, end: number, top: number }[]} */
    const found = [];

    for (const el of document.querySelectorAll('a, button, span, li, label, div')) {
      const raw = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (raw.length > 80 || !/baixar csv de/i.test(raw)) continue;
      const m = raw.match(lineRe);
      if (!m) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) continue;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const label = m[0].toUpperCase();
      found.push({
        label,
        start: parseInt(m[1], 10),
        end: parseInt(m[2].replace(/\s/g, ''), 10),
        top: rect.top,
      });
    }

    const byLabel = new Map();
    for (const f of found) {
      const prev = byLabel.get(f.label);
      if (!prev || f.top < prev.top) byLabel.set(f.label, f);
    }
    const all = [...byLabel.values()].sort((a, b) => a.start - b.start);

    const first = all.find((x) => x.start === 0);
    if (!first) return [];

    const secondCandidates = all.filter((x) => x.start === 100);
    if (!secondCandidates.length) return [first.label];

    const second = secondCandidates.sort((a, b) => a.end - b.end)[0];
    return [first.label, second.label];
  });
}

/** @deprecated — use clickExportarButton */
async function openExportDropdown(page, cfg) {
  await clickExportarButton(page);
  const visible = await page.locator('a, button, span, li').filter({ hasText: /BAIXAR CSV DE/i }).first().isVisible().catch(() => false);
  return visible;
}

/**
 * Clica link CSV pelo texto exato e salva download.
 * @param {import('playwright').Page} page
 * @param {string} label
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @param {string} destPath
 * @param {number} partIndex
 */
async function downloadCsvByLabel(page, label, cfg, destPath, partIndex) {
  console.log(`  📥  Bloco ${partIndex + 1}: ${label}`);
  console.log('  ⏳  Gerando no servidor (1–5 min)...');

  const partPath = destPath.replace(/\.csv$/i, `-part${partIndex + 1}.csv`);

  const downloadPromise = page.waitForEvent('download', { timeout: cfg.timeouts.exportMs }).catch(() => null);
  const responsePromise = page.waitForResponse(
    (r) => {
      const cd = r.headers()['content-disposition'] ?? '';
      const ct = r.headers()['content-type'] ?? '';
      return /csv|excel|spreadsheet|octet-stream/i.test(ct + cd) && r.status() === 200;
    },
    { timeout: cfg.timeouts.exportMs },
  ).catch(() => null);

  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loc = page.getByText(new RegExp(escaped, 'i')).first();
  if (!(await loc.count())) {
    throw new Error(`Link não visível: ${label}`);
  }
  await loc.scrollIntoViewIfNeeded();
  await loc.click({ timeout: 30000 });

  const download = await downloadPromise;
  if (download) {
    const suggested = download.suggestedFilename() || `part${partIndex + 1}.csv`;
    const ext = suggested.includes('.') ? suggested.split('.').pop() : 'csv';
    const finalPath = destPath.replace(/\.csv$/i, `-part${partIndex + 1}.${ext}`);
    await download.saveAs(finalPath);
    console.log(`  ✓  Salvo: ${finalPath}`);
    return finalPath;
  }

  const response = await responsePromise;
  if (response) {
    writeFileSync(partPath, Buffer.from(await response.body()));
    console.log(`  ✓  Salvo: ${partPath}`);
    return partPath;
  }

  throw new Error(`Download não iniciou para: ${label} — confira "Enviar CSV por E-mail" = NÃO`);
}

/**
 * Export manual-first — confiável para --search-url.
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @param {string} destPath
 */
async function triggerExportManual(page, cfg, destPath) {
  console.log('\n⏸️  EXPORTAR (passo manual)');
  console.log('   1. No browser: clique **EXPORTAR** no topo');
  console.log('   2. Aguarde "BAIXAR CSV DE 0 A 100 MIL" no painel');
  console.log('   3. NÃO clique nos CSVs — volte aqui e pressione ENTER\n');
  await waitForEnter('Menu EXPORTAR aberto? Pressione ENTER...');

  let labels = await resolveCsvLabelsFromPanel(page);
  if (!labels.length) {
    await saveDebugScreenshot(page, destPath);
    throw new Error('Nenhum link CSV visível — abra EXPORTAR e rode de novo');
  }

  console.log(`  🔎  Baixando ${labels.length} arquivo(s):`);
  for (const l of labels) console.log(`      • ${l}`);

  /** @type {string[]} */
  const files = [];
  for (let i = 0; i < labels.length; i++) {
    if (i > 0) {
      console.log('\n⏸️  Reabra EXPORTAR para a 2ª parte e pressione ENTER...');
      await waitForEnter('EXPORTAR aberto? ENTER...');
      labels = await resolveCsvLabelsFromPanel(page);
      if (!labels[i]) {
        throw new Error(`2ª parte não encontrada — labels: ${labels.join(', ')}`);
      }
    }
    files.push(await downloadCsvByLabel(page, labels[i], cfg, destPath, i));
    await page.waitForTimeout(2000);
  }

  return files.length === 1 ? files[0] : files;
}

/** @param {number | null | undefined} count */
function expectedCsvPartCount(count) {
  if (!count || count <= 100_000) return 1;
  return Math.ceil(count / 100_000);
}

/** @param {import('playwright').Page} page */
async function isExportMenuOpen(page) {
  const labels = await scrapeVisibleExportLabels(page);
  return labels.length > 0;
}

/**
 * Labels CSV visíveis só dentro do painel EXPORTAR (não a página inteira).
 * @param {import('playwright').Page} page
 */
async function scrapeVisibleExportLabels(page) {
  return page.evaluate(() => {
    const lineRe = /^BAIXAR CSV DE (\d+) A ([\d ]+) MIL$/i;

    function findPanel() {
      for (const el of document.querySelectorAll('div, section, form, aside, ul')) {
        const head = (el.innerText || '').slice(0, 600).replace(/\s+/g, ' ');
        if (/PERSONALIZAR COLUNAS|DOWNLOAD CSV EM PARTES DE 100 MIL/i.test(head)) {
          return el;
        }
      }
      for (const el of document.querySelectorAll('a, button, span, li')) {
        const t = (el.innerText || '').trim().replace(/\s+/g, ' ');
        if (!/^BAIXAR CSV DE 0 A 100 MIL$/i.test(t)) continue;
        let p = el.parentElement;
        for (let i = 0; i < 12 && p; i++) {
          if (/personalizar colunas|download csv em partes/i.test(p.innerText || '')) return p;
          p = p.parentElement;
        }
        return el.parentElement;
      }
      return null;
    }

    const root = findPanel();
    if (!root) return [];

    /** @type {{ label: string, top: number }[]} */
    const items = [];
    for (const el of root.querySelectorAll('a, button, span, li, label')) {
      const raw = (el.innerText || '').trim().replace(/\s+/g, ' ');
      const m = raw.match(lineRe);
      if (!m) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) continue;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      items.push({ label: m[0].toUpperCase(), top: rect.top });
    }

    const byLabel = new Map();
    for (const it of items) {
      const prev = byLabel.get(it.label);
      if (!prev || it.top < prev.top) byLabel.set(it.label, it);
    }
    return [...byLabel.values()]
      .sort((a, b) => parseInt(a.label.match(/DE (\d+)/)?.[1] ?? '0', 10) - parseInt(b.label.match(/DE (\d+)/)?.[1] ?? '0', 10))
      .map((x) => x.label);
  });
}

/**
 * Escolhe só as partes necessárias (ex.: 135.985 → 2 links, não a lista template).
 * @param {string[]} allLabels
 * @param {number | null | undefined} resultCount
 */
function pickCsvLabelsForCount(allLabels, resultCount) {
  const maxParts = expectedCsvPartCount(resultCount);
  if (allLabels.length <= maxParts) return allLabels.slice(0, maxParts);

  const parsed = allLabels.map((l) => {
    const m = l.match(/DE (\d+) A ([\d ]+) MIL/i);
    return {
      label: l,
      start: parseInt(m?.[1] ?? '0', 10),
      end: parseInt((m?.[2] ?? '0').replace(/\s/g, ''), 10),
    };
  });

  /** @type {string[]} */
  const picked = [];
  const first = parsed.find((p) => p.start === 0);
  if (first) picked.push(first.label);

  if (maxParts > 1) {
    const rest = parsed.filter((p) => p.start >= 100);
    const best = rest.sort((a, b) => {
      if (resultCount) {
        const da = Math.abs(a.end - resultCount);
        const db = Math.abs(b.end - resultCount);
        if (da !== db) return da - db;
      }
      return a.start - b.start;
    })[0];
    if (best) picked.push(best.label);
  }

  return picked.slice(0, maxParts);
}

/**
 * @param {import('playwright').Page} page
 * @param {number | null | undefined} resultCount
 */
async function findCsvExportParts(page, resultCount) {
  const visible = await scrapeVisibleExportLabels(page);
  const labels = pickCsvLabelsForCount(visible, resultCount);

  if (visible.length > labels.length) {
    console.log(`  ℹ️  Painel tem ${visible.length} links template — usando ${labels.length} parte(s) necessária(s)`);
  }
  if (labels.length) {
    console.log(`  🔎  CSV a baixar: ${labels.join(' | ')}`);
  }

  /** @type {import('playwright').Locator[]} */
  const parts = [];
  const panel = page.locator('div, section, form, aside').filter({
    hasText: /personalizar colunas|download csv em partes de 100 mil/i,
  }).first();

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inPanel = panel.getByText(new RegExp(escaped, 'i')).first();
    const loc = (await panel.count()) && (await inPanel.count()) ? inPanel : page.getByText(new RegExp(escaped, 'i')).first();
    if ((await loc.count()) && (await loc.isVisible())) {
      parts.push(loc);
    }
  }
  return parts;
}

/**
 * Clica no link CSV e aguarda download.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} part
 * @param {string} label
 * @param {ReturnType<typeof loadSelectors>} cfg
 * @param {string} destPath
 * @param {number} partIndex
 */
async function downloadCsvPart(page, part, label, cfg, destPath, partIndex) {
  console.log(`  📥  Clicando: ${label}`);
  console.log('  ⏳  Gerando CSV no servidor (1–3 min por parte)...');

  const downloadPromise = page.waitForEvent('download', { timeout: cfg.timeouts.exportMs });
  await part.scrollIntoViewIfNeeded();
  await part.click({ timeout: 20000 });

  const download = await downloadPromise;
  const suggested = download.suggestedFilename() || `part${partIndex + 1}.csv`;
  const ext = suggested.includes('.') ? suggested.split('.').pop() : 'csv';
  const partPath = destPath.replace(/\.csv$/i, `-part${partIndex + 1}.${ext}`);
  await download.saveAs(partPath);
  console.log(`  ✓  Salvo: ${partPath}`);
  return partPath;
}

/** @deprecated — use clickExportarButton */
async function clickExportButton(page) {
  try {
    await clickExportarButton(page);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {string} destPath
 */
async function saveDebugScreenshot(page, destPath) {
  const debugPath = destPath.replace(/\.csv$/i, '_debug-export.png');
  await page.screenshot({ path: debugPath, fullPage: true });
  console.log(`  📸  Debug: ${debugPath}`);
}

/**
 * @param {import('playwright').Page} page
 * @param {{ uf: string, municipio?: string, situacao?: string[] }} filters
 * @param {ReturnType<typeof loadSelectors>} cfg
 */
async function applyFilters(page, filters, cfg) {
  if (!(await hasSearchUi(page))) {
    await goToSearchPage(page, cfg);
  }

  // Estado / UF
  const estadoField = page.getByPlaceholder(/estado|uf/i).or(page.getByLabel(/estado|uf/i));
  if (await estadoField.count()) {
    await estadoField.first().click();
    await estadoField.first().fill(filters.uf);
    const ufOption = page.locator('[role="option"], .dropdown-item, li, a').filter({ hasText: new RegExp(`^${filters.uf}$|${filters.uf}\\b`, 'i') }).first();
    if (await ufOption.count()) await ufOption.click({ timeout: 5000 }).catch(() => {});
  } else {
    await tryFill(page, cfg.selectors.ufSelect, filters.uf);
  }

  // Município (autocomplete) — selecionar opção da lista (ex.: ACEGUÁ/RS)
  if (filters.municipio) {
    const munField = page.getByPlaceholder(/municip/i).or(page.getByLabel(/municip/i));
    if (await munField.count()) {
      await munField.first().click();
      await munField.first().fill('');
      await munField.first().fill(filters.municipio);
      await page.waitForTimeout(1500);
      const munOption = page.locator('[role="option"], .dropdown-item, li, a, .autocomplete-item, .ui-menu-item')
        .filter({ hasText: new RegExp(`${filters.municipio}|/${filters.uf}`, 'i') })
        .first();
      if (await munOption.count()) {
        await munOption.click({ timeout: 8000 });
      } else {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      }
    } else {
      await tryFill(page, cfg.selectors.municipioInput, filters.municipio);
    }
  }

  // Situação ATIVA
  if (filters.situacao?.includes('ATIVA')) {
    const ativaLabel = page.locator('label').filter({ hasText: /ATIVA/i }).first();
    if (await ativaLabel.count()) {
      await ativaLabel.click({ timeout: 5000 }).catch(() => {});
    }
  }

  // Pesquisar
  const pesquisar = page.getByRole('button', { name: /pesquisar/i });
  if (await pesquisar.count()) {
    await pesquisar.first().scrollIntoViewIfNeeded();
    await pesquisar.first().click({ timeout: 15000 });
  } else {
    const clicked = await tryClick(page, cfg.selectors.searchButton);
    if (!clicked) throw new Error('Botão Pesquisar não encontrado');
  }

  await waitForExportReady(page, cfg);
  await page.waitForLoadState('load', { timeout: cfg.timeouts.navigationMs }).catch(() => {});
}

/** Aguarda UI de resultados (EXPORTAR visível ou contagem) */
async function waitForExportReady(page, cfg) {
  const ms = cfg.timeouts.navigationMs;
  try {
    await page.waitForFunction(() => {
      const t = document.body?.innerText ?? '';
      return /exportar|gerou.*resultados|empresas encontradas|resultado da pesquisa/i.test(t);
    }, { timeout: ms });
  } catch {
    console.log('\n⏸️  Resultados demoraram — no browser, confirme que aparece "gerou X resultados".');
    await waitForEnter('Quando estiver pronto, pressione ENTER para exportar...');
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * @param {import('playwright').Page} page
 */
async function clickFirstVisible(page, locators) {
  for (const getLoc of locators) {
    const loc = getLoc().first();
    if (await loc.count()) {
      try {
        await loc.waitFor({ state: 'visible', timeout: 5000 });
        await loc.click({ timeout: 15000 });
        return true;
      } catch {
        try {
          await loc.click({ force: true, timeout: 15000 });
          return true;
        } catch { /* next */ }
      }
    }
  }
  return false;
}

async function openExportMenu(page, cfg, resultCount) {
  if ((await findCsvExportParts(page, resultCount)).length) return true;
  if (await isExportMenuOpen(page)) return true;

  if (isLoginPage(page)) {
    throw new Error('Ainda na tela de login — impossível exportar');
  }

  console.log('  📂  Abrindo menu EXPORTAR...');

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await clickExportButton(page)) {
      await page.waitForTimeout(2000);
      if ((await findCsvExportParts(page, resultCount)).length || await isExportMenuOpen(page)) return true;
    }

    const clicked = await clickFirstVisible(page, [
      () => page.getByRole('button', { name: /exportar/i }),
      () => page.locator('button, a, span').filter({ hasText: /^exportar(\s+excel)?$/i }),
      () => page.locator(cfg.selectors.exportButton),
    ]);
    if (clicked) {
      await page.waitForTimeout(2000);
      if ((await findCsvExportParts(page, resultCount)).length || await isExportMenuOpen(page)) return true;
    }
  }

  return false;
}

/** @param {number | null | undefined} resultCount */
async function ensureExportMenuOpen(page, cfg, resultCount) {
  const need = expectedCsvPartCount(resultCount);

  for (let attempt = 0; attempt < 2; attempt++) {
    let parts = await findCsvExportParts(page, resultCount);
    if (parts.length >= need) return;

    if (attempt === 0) {
      await openExportMenu(page, cfg, resultCount);
      continue;
    }

    console.log('\n⏸️  Abra o menu EXPORTAR no browser.');
    console.log(`   Precisamos de ${need} link(s) CSV (ex.: 0–100 mil e 100–135 mil).`);
    console.log('   Ignore a lista longa — o script baixa só os 2 corretos.');
    console.log('   Não clique nos CSVs — pressione ENTER aqui.\n');
    await waitForEnter('Menu EXPORTAR aberto? Pressione ENTER...');
  }

  const parts = await findCsvExportParts(page, resultCount);
  if (parts.length < need) {
    await logExportCandidates(page);
    throw new Error(
      `Encontrados ${parts.length}/${need} links CSV no painel — confirme que EXPORTAR está aberto`,
    );
  }
}

/**
 * @param {number | null | undefined} resultCount
 */
async function triggerExport(page, cfg, destPath, resultCount) {
  const need = expectedCsvPartCount(resultCount);
  console.log(`  📤  Export: ${need} parte(s)${resultCount ? ` (${resultCount.toLocaleString('pt-BR')} empresas)` : ''}`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);

  await ensureExportMenuOpen(page, cfg, resultCount);
  await page.waitForTimeout(800);

  let parts = await findCsvExportParts(page, resultCount);

  if (parts.length === 0) {
    await saveDebugScreenshot(page, destPath);
    await logExportCandidates(page);
    throw new Error('Links CSV não encontrados no menu — veja _debug-export.png');
  }

  /** @type {string[]} */
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await openExportMenu(page, cfg, resultCount);
      await page.waitForTimeout(800);
      parts = await findCsvExportParts(page, resultCount);
    }

    const part = parts[i];
    const label = ((await part.innerText()) ?? '').trim().replace(/\s+/g, ' ');
    const saved = await downloadCsvPart(page, part, label, cfg, destPath, i);
    files.push(saved);
    await page.waitForTimeout(3000);
  }
  return files.length === 1 ? files[0] : files;
}

/**
 * @param {Partition} partition
 * @param {{
 *   runId: string,
 *   headless?: boolean,
 *   discover?: boolean,
 *   manualLogin?: boolean,
 *   searchUrl?: string,
 *   saveSessionOnly?: boolean,
 *   autoExport?: boolean,
 *   manualDownload?: boolean,
 * }} opts
 * @returns {Promise<{ file: string | string[], count: number | null }>}
 */
export async function runDownload(partition, opts) {
  const cfg = loadSelectors();
  const defaultFilters = loadFilters();
  const filters = {
    ...defaultFilters,
    uf: partition.uf || defaultFilters.uf,
    municipio: partition.municipio ?? defaultFilters.municipio,
  };

  const outDir = resolve(DOWNLOADS_DIR, opts.runId, partition.uf);
  mkdirSync(outDir, { recursive: true });

  const slug = partition.municipio
    ? `${partition.ibge ?? '0000000'}-${slugify(partition.municipio)}`
    : opts.searchUrl
      ? slugFromSearchUrl(opts.searchUrl)
      : `uf-${partition.uf.toLowerCase()}`;
  const destPath = resolve(outDir, `${slug}.csv`);

  const authDir = dirname(AUTH_STATE_PATH);
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch({
    headless: opts.searchUrl || opts.manualLogin ? false : opts.headless !== false,
    downloadsPath: outDir,
  });
  const contextOpts = existsSync(AUTH_STATE_PATH)
    ? { storageState: AUTH_STATE_PATH }
    : {};

  const context = await browser.newContext({
    ...contextOpts,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(cfg.timeouts.navigationMs);

  try {
    // ── Modo manual: salvar sessão após captcha ─────────────────────────────
    if (opts.saveSessionOnly) {
      await manualLoginFlow(page, cfg, context);
      return { file: destPath, count: null };
    }

    // ── Modo manual: URL da pesquisa já pronta (fluxo recomendado) ───────────
    if (opts.searchUrl) {
      console.log(`  🔗  URL: ${opts.searchUrl.slice(0, 80)}...`);

      if (opts.manualDownload) {
        const saved = await manualDownloadFlow(page, cfg, context, opts.searchUrl, destPath);
        return { file: saved, count: await readResultCount(page) };
      }

      const saved = await automatedBlockExport(page, cfg, context, opts.searchUrl, destPath);
      return { file: saved, count: await readResultCount(page) };
    }

    // ── Modo automático (login sem captcha) ou manual-login + filtros ────────
    let landingUrl;

    if (opts.manualLogin) {
      landingUrl = await manualLoginFlow(page, cfg, context);
    } else {
      landingUrl = await ensureSession(page, cfg);
      await context.storageState({ path: AUTH_STATE_PATH });
    }

    await goToSearchPage(page, cfg, landingUrl);

    if (opts.discover) {
      await applyFilters(page, filters, cfg);
      const count = await readResultCount(page);
      const shot = resolve(outDir, `_discover-${slug}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log(`  📸  Screenshot: ${shot}`);
      console.log(`  🔍  Contagem detectada: ${count ?? 'n/d'}`);
      return { file: destPath, count };
    }

    await applyFilters(page, filters, cfg);
    const count = await readResultCount(page);

    const savedPath = await triggerExport(page, cfg, destPath, count);
    await new Promise((r) => setTimeout(r, cfg.timeouts.betweenExportsMs));

    return { file: savedPath, count };
  } finally {
    await context.close();
    await browser.close();
  }
}

/** CLI standalone */
async function main() {
  const uf = process.argv[2] || 'RS';
  const municipio = process.argv[3];
  const runId = new Date().toISOString().slice(0, 10);
  const discover = process.argv.includes('--discover');

  const partition = {
    key: municipio ? `${uf}:${municipio}` : `${uf}:__all__`,
    uf,
    municipio,
  };

  console.log(`⬇️  Download ${uf}${municipio ? ` / ${municipio}` : ''}...`);
  const { file, count } = await runDownload(partition, { runId, headless: !process.argv.includes('--headed'), discover });
  console.log(`✅  Salvo: ${file}${count != null ? ` (${count.toLocaleString('pt-BR')} empresas)` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
