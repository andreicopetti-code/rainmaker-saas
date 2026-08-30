#!/usr/bin/env node
/**
 * Ingere CSV/XLSX de downloads/ e faz upsert em public.empresas.
 *
 * Uso:
 *   node scripts/empresaqui-sync/ingest/upsert-from-dir.mjs downloads/2026-07-06/RS/
 *   node scripts/empresaqui-sync/ingest/upsert-from-dir.mjs arquivo.csv
 */

import { readdirSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { parseEmpresaquiFile } from './parse-file.mjs';
import { buildHeaderMap, mapRowsToEmpresas, printHeaderInspection } from '../lib/csv-mapper.mjs';
import { getSupabaseConfig } from '../lib/env.mjs';
import { upsertEmpresasBatched } from '../lib/supabase-upsert.mjs';

const DATA_EXTS = new Set(['.csv', '.xlsx', '.xls']);

/** @param {string} dir */
function collectFiles(dir) {
  const st = statSync(dir);
  if (st.isFile()) return [dir];

  /** @type {string[]} */
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) files.push(...collectFiles(full));
    else if (DATA_EXTS.has(extname(name).toLowerCase())) files.push(full);
  }
  return files.sort();
}

async function ingestFile(filePath, supabase, { inspect = false, dryRun = false }) {
  console.log(`\n📄  ${filePath}`);
  const { headers, rows } = parseEmpresaquiFile(filePath);

  if (headers.length === 0) {
    console.warn('  ⚠️  Arquivo vazio ou sem cabeçalho — ignorado.');
    return { file: filePath, upserted: 0, skipped: 0 };
  }

  const headerMap = buildHeaderMap(headers);
  if (inspect) printHeaderInspection(headers);

  if (!headerMap.cnpj) {
    console.error('  ❌  Coluna CNPJ não identificada. Rode com --inspect ou ajuste lib/csv-mapper.mjs');
    throw new Error(`CNPJ não mapeado em ${filePath}`);
  }

  const { empresas, skipped } = mapRowsToEmpresas(rows, headerMap);
  console.log(`  → ${rows.length.toLocaleString('pt-BR')} linhas | ${empresas.length.toLocaleString('pt-BR')} válidas | ${skipped} sem CNPJ`);

  if (dryRun) return { file: filePath, upserted: 0, skipped, parsed: empresas.length };

  const start = Date.now();
  const upserted = await upsertEmpresasBatched(empresas, {
    ...supabase,
    onProgress: (n) => {
      process.stdout.write(`\r  ↑  ${n.toLocaleString('pt-BR')} upserted`);
    },
  });
  const sec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\r  ✓  ${upserted.toLocaleString('pt-BR')} registros upserted em ${sec}s`);
  return { file: filePath, upserted, skipped, parsed: empresas.length };
}

async function main() {
  const args = process.argv.slice(2);
  const inspect = args.includes('--inspect');
  const dryRun = args.includes('--dry-run');
  const preferProd = args.includes('--prod');
  const paths = args.filter((a) => !a.startsWith('--'));

  if (paths.length === 0) {
    console.error('Uso: node ingest/upsert-from-dir.mjs <dir|arquivo.csv> [--inspect] [--dry-run] [--prod]');
    process.exit(1);
  }

  const target = resolve(process.cwd(), paths[0]);
  const files = collectFiles(target);
  if (files.length === 0) {
    console.error(`Nenhum CSV/XLSX em ${target}`);
    process.exit(1);
  }

  const supabase = dryRun ? null : getSupabaseConfig({ preferProd });
  if (supabase) {
    const host = new URL(supabase.url).host;
    console.log(`Destino Supabase: ${host}${preferProd ? ' (prod)' : ''}`);
  }
  let totalUpserted = 0;

  for (const file of files) {
    const result = await ingestFile(file, supabase, { inspect: inspect && files[0] === file, dryRun });
    totalUpserted += result.upserted ?? 0;
  }

  console.log(`\n✅  Concluído: ${totalUpserted.toLocaleString('pt-BR')} upserts em ${files.length} arquivo(s).`);
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
