#!/usr/bin/env node
/**
 * Orquestrador Empresaqui → public.empresas
 *
 * Uso:
 *   node scripts/empresaqui-sync/sync.mjs --uf RS
 *   node scripts/empresaqui-sync/sync.mjs --uf RS --municipio "Porto Alegre"
 *   node scripts/empresaqui-sync/sync.mjs --uf RS --dry-run
 *   node scripts/empresaqui-sync/sync.mjs --ingest-only downloads/2026-07-06/RS
 *   node scripts/empresaqui-sync/sync.mjs --inspect-csv arquivo.csv
 *   node scripts/empresaqui-sync/sync.mjs --save-session
 *   node scripts/empresaqui-sync/sync.mjs --search-url "https://..."
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDownload, slugFromSearchUrl } from './download/playwright-export.mjs';
import { loadMunicipios, planPartitions, EXPORT_LIMIT } from './lib/partition.mjs';
import {
  loadState,
  saveState,
  updatePartition,
  pendingPartitions,
  partitionKey,
} from './lib/state.mjs';
import { getSupabaseConfig, DOWNLOADS_DIR, AUTH_STATE_PATH } from './lib/env.mjs';
import { upsertEmpresasBatched } from './lib/supabase-upsert.mjs';
import { parseEmpresaquiFile } from './ingest/parse-file.mjs';
import { buildHeaderMap, mapRowsToEmpresas, printHeaderInspection } from './lib/csv-mapper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const getVal = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  /** @type {string[]} */
  const csvFiles = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--csv' && argv[i + 1]) csvFiles.push(argv[i + 1]);
  }

  return {
    uf: (getVal('--uf') || 'RS').toUpperCase(),
    municipio: getVal('--municipio'),
    dryRun: flags.has('--dry-run'),
    ingestOnly: flags.has('--ingest-only'),
    inspectCsv: getVal('--inspect-csv'),
    discover: flags.has('--discover'),
    headed: flags.has('--headed'),
    manualLogin: flags.has('--manual-login'),
    saveSession: flags.has('--save-session'),
    searchUrl: getVal('--search-url'),
    autoExport: flags.has('--auto-export'),
    manualDownload: flags.has('--manual-download'),
    csvFiles,
    resume: flags.has('--resume'),
    downloadOnly: flags.has('--download-only'),
    noResume: flags.has('--no-resume'),
    startPart: (() => {
      const v = getVal('--start-part');
      return v ? Math.max(0, parseInt(v, 10) - 1) : undefined;
    })(),
    endPart: (() => {
      const v = getVal('--end-part');
      return v ? parseInt(v, 10) : undefined;
    })(),
    skipDownload: flags.has('--skip-download'),
    path: argv.find((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--')),
  };
}

function todayRunId() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} filePath
 * @param {{ dryRun?: boolean }} opts
 */
async function ingestSingleFile(filePath, opts) {
  const { headers, rows } = parseEmpresaquiFile(filePath);
  const headerMap = buildHeaderMap(headers);
  const { empresas, skipped } = mapRowsToEmpresas(rows, headerMap);

  if (opts.dryRun) {
    console.log(`  (dry-run) ${empresas.length} empresas mapeadas, ${skipped} ignoradas`);
    return empresas.length;
  }

  const supabase = getSupabaseConfig();
  return upsertEmpresasBatched(empresas, {
    ...supabase,
    onProgress: (n) => process.stdout.write(`\r  ↑  ${n.toLocaleString('pt-BR')} upserted`),
  });
}

/** @param {import('./lib/state.mjs').SyncState} state @param {boolean} dryRun */
async function runIngestPhase(state, dryRun) {
  let total = 0;
  for (const part of state.partitions) {
    if (part.status !== 'downloaded' && part.status !== 'failed') continue;
    if (!part.file) continue;

    console.log(`\n📥  Ingest ${part.key} ← ${part.file}`);

    try {
      const n = await ingestSingleFile(part.file, { dryRun });
      console.log(`\r  ✓  ${(n ?? 0).toLocaleString('pt-BR')} upserted`);
      updatePartition(state, part.key, { status: 'upserted' });
      total += n ?? 0;
    } catch (err) {
      updatePartition(state, part.key, { status: 'failed', error: err.message });
      console.error(`  ❌  ${err.message}`);
    }
  }
  return total;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Ingest direto de CSVs já baixados (sem browser)
  if (args.csvFiles.length > 0) {
    console.log(`📥  Ingest de ${args.csvFiles.length} arquivo(s)...`);
    let total = 0;
    for (const raw of args.csvFiles) {
      const file = resolve(process.cwd(), raw);
      console.log(`\n📥  ${file}`);
      total += await ingestSingleFile(file, { dryRun: args.dryRun }) ?? 0;
    }
    console.log(`\n✅  Concluído: ${total.toLocaleString('pt-BR')} upserts.`);
    return;
  }

  if (args.inspectCsv) {
    const file = resolve(process.cwd(), args.inspectCsv);
    const { headers } = parseEmpresaquiFile(file);
    printHeaderInspection(headers);
    return;
  }

  if (args.ingestOnly) {
    const target = args.path || resolve(DOWNLOADS_DIR, todayRunId());
    const { spawnSync } = await import('node:child_process');
    const script = resolve(__dirname, 'ingest/upsert-from-dir.mjs');
    const extra = args.dryRun ? ['--dry-run'] : [];
    const r = spawnSync(process.execPath, [script, target, ...extra], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }

  // ── Salvar sessão após login manual (captcha) ─────────────────────────────
  if (args.saveSession) {
    console.log('🔐  Modo save-session — login manual + captcha');
    await runDownload(
      { key: 'session', uf: args.uf, municipio: args.municipio },
      { runId: todayRunId(), saveSessionOnly: true },
    );
    console.log('\n✅  Sessão salva. Próximo passo: --search-url com a URL da pesquisa.');
    return;
  }

  // ── Export a partir de URL (pesquisa feita manualmente) ───────────────────
  if (args.searchUrl) {
    let searchUrl = args.searchUrl.trim();
    if (!/^https?:\/\//i.test(searchUrl) || searchUrl === 'SUA_URL') {
      console.error('\n❌  --search-url inválido.');
      console.error('   Cole a URL completa do browser após a pesquisa no Empresaqui.');
      console.error('   Deve começar com https://www.empresaqui.com.br/acesso/empresas?...\n');
      process.exit(1);
    }

    const ufFromUrl = searchUrl.match(/[?&]Uf=([A-Z]{2})/i)?.[1];
    const uf = (ufFromUrl || args.uf).toUpperCase();
    const searchSlug = slugFromSearchUrl(searchUrl);
    console.log(`📎  Modo search-url — UF ${uf} (${searchSlug})`);
    if (args.municipio) {
      console.log('  ℹ️  --municipio ignorado na pesquisa; a URL já define os filtros.');
    }

    const part = {
      key: partitionKey(uf, args.municipio || searchSlug),
      uf,
      municipio: args.municipio,
    };
    const { file, count } = await runDownload(part, {
      runId: todayRunId(),
      searchUrl,
      manualDownload: args.manualDownload,
      manualLogin: args.manualLogin || !existsSync(AUTH_STATE_PATH),
      discover: args.discover,
      resumeDownloads: !args.noResume,
      startPart: args.startPart,
      endPart: args.endPart,
    });

    if (args.discover) return;

    const files = Array.isArray(file) ? file : [file];
    console.log(`  ✓  ${files.length} arquivo(s)${count != null ? ` (${count.toLocaleString('pt-BR')} empresas)` : ''}`);
    for (const f of files) console.log(`      ${f}`);

    if (args.downloadOnly || args.dryRun) {
      console.log(`\n✅  Download concluído (${files.length} arquivo(s)). Ingest não executado.`);
      return;
    }

    if (!args.dryRun) {
      let total = 0;
      for (const f of files) {
        if (!f) continue;
        console.log(`\n📥  Ingest ${f}`);
        total += await ingestSingleFile(f, { dryRun: false }) ?? 0;
      }
      console.log(`\n✅  Sync concluído: ${total.toLocaleString('pt-BR')} upserts.`);
    }
    return;
  }

  const runId = todayRunId();
  const filters = JSON.parse(readFileSync(resolve(__dirname, 'config/filters.default.json'), 'utf8'));
  const uf = args.uf || filters.uf;

  let state = loadState();
  if (!state || state.uf !== uf || !args.resume) {
    /** @type {import('./lib/partition.mjs').planPartitions extends Function ? never : any} */
    let partitions;

    if (args.municipio) {
      partitions = [{
        key: partitionKey(uf, args.municipio),
        uf,
        municipio: args.municipio,
      }];
    } else {
      const municipios = await loadMunicipios(uf);
      partitions = planPartitions(EXPORT_LIMIT + 1, uf, municipios);
      console.log(`📋  UF ${uf}: particionando em ${partitions.length} municípios (>100k por export).`);
    }

    state = {
      runId,
      uf,
      startedAt: new Date().toISOString(),
      partitions: partitions.map((p) => ({
        ...p,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      })),
    };
    saveState(state);
  } else {
    console.log(`↩️  Retomando run ${state.runId} (${pendingPartitions(state).length} pendentes)`);
  }

  if (!args.skipDownload) {
    let queue = args.municipio
      ? state.partitions.filter((p) => p.municipio === args.municipio)
      : pendingPartitions(state).filter((p) => p.status !== 'upserted');

    if (args.discover) {
      queue = queue.slice(0, 1);
      console.log('🔍  Modo discover: apenas 1 partição (use --municipio para escolher qual).');
    }

    for (const part of queue) {
      if (part.status === 'upserted') continue;

      console.log(`\n🌐  Download ${part.key}${part.municipio ? ` (${part.municipio})` : ''}...`);
      updatePartition(state, part.key, { status: 'downloading' });

      try {
        const { file, count } = await runDownload(part, {
          runId: state.runId,
          headless: !args.headed,
          discover: args.discover,
          manualLogin: args.manualLogin,
        });

        if (args.discover) {
          console.log('  (discover) pulando export real');
          continue;
        }

        if (count != null && count > EXPORT_LIMIT) {
          console.warn(`  ⚠️  ${part.key}: ${count.toLocaleString('pt-BR')} > ${EXPORT_LIMIT.toLocaleString('pt-BR')} — subdivida manualmente (bairro/CNAE).`);
        }

        updatePartition(state, part.key, { status: 'downloaded', file, count });
        console.log(`  ✓  ${file}`);
      } catch (err) {
        updatePartition(state, part.key, { status: 'failed', error: err.message });
        console.error(`  ❌  ${err.message}`);
      }
    }
  }

  if (!args.discover && !args.dryRun) {
    const total = await runIngestPhase(state, false);
    console.log(`\n✅  Sync concluído: ${total.toLocaleString('pt-BR')} upserts.`);
  } else if (args.dryRun) {
    console.log('\n(dry-run) ingest ignorado.');
  }
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
