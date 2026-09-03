#!/usr/bin/env node
/**
 * Remove empresas por UF em public.empresas (prod ou staging).
 *
 * Uso:
 *   node scripts/empresaqui-sync/ingest/delete-by-estado.mjs SP --prod
 *   node scripts/empresaqui-sync/ingest/delete-by-estado.mjs SP --prod --dry-run
 */

import { getSupabaseConfig } from '../lib/env.mjs';

const UF = (process.argv[2] || '').trim().toUpperCase();
const dryRun = process.argv.includes('--dry-run');
const preferProd = process.argv.includes('--prod');
const BATCH = 10_000;

if (!/^[A-Z]{2}$/.test(UF)) {
  console.error('Uso: node delete-by-estado.mjs <UF> [--prod] [--dry-run]');
  process.exit(1);
}

const { url, serviceRoleKey } = getSupabaseConfig({ preferProd });
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

async function countByEstado() {
  const res = await fetch(
    `${url}/rest/v1/empresas?select=cnpj&estado=eq.${UF}&limit=1`,
    { headers: { ...headers, Prefer: 'count=exact' } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Count failed: ${res.status} ${body}`);
  }
  const range = res.headers.get('content-range') || '';
  const match = range.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function fetchCnpjBatch() {
  const res = await fetch(
    `${url}/rest/v1/empresas?select=cnpj&estado=eq.${UF}&order=cnpj.asc&limit=${BATCH}`,
    { headers },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fetch batch failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function deleteCnpjs(cnpjs) {
  const quoted = cnpjs.map((c) => `"${c}"`).join(',');
  const res = await fetch(`${url}/rest/v1/empresas?cnpj=in.(${quoted})`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Delete batch failed: ${res.status} ${body}`);
  }
}

async function main() {
  const target = preferProd ? 'prod' : 'staging';
  console.log(`[${target}] Contando empresas com estado=${UF}...`);
  const before = await countByEstado();
  console.log(`Encontradas: ${before.toLocaleString('pt-BR')}`);

  if (before === 0) {
    console.log('Nada a remover.');
    return;
  }

  if (dryRun) {
    console.log('--dry-run: nenhuma linha removida.');
    return;
  }

  let removed = 0;
  while (true) {
    const rows = await fetchCnpjBatch();
    if (!rows.length) break;
    await deleteCnpjs(rows.map((r) => r.cnpj));
    removed += rows.length;
    process.stdout.write(`\rRemovidas: ${removed.toLocaleString('pt-BR')} / ${before.toLocaleString('pt-BR')}`);
  }
  process.stdout.write('\n');

  const after = await countByEstado();
  console.log(`Concluído. Restantes com estado=${UF}: ${after.toLocaleString('pt-BR')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
