/**
 * Copia public.empresas: staging (ceobrain-saas) → prod (ceobrain-prod).
 *
 * Setup (sem colar secrets no chat):
 * 1. apps/web/.env.local continua com as keys do STAGING (fonte)
 * 2. Em scripts/empresaqui-sync/.env adicione:
 *      PROD_SUPABASE_URL=https://gzvsxqxfzvpjqbpabwak.supabase.co
 *      PROD_SUPABASE_SERVICE_ROLE_KEY=<service_role do ceobrain-prod>
 *
 * Uso:
 *   node scripts/copy-empresas-staging-to-prod.mjs
 *   node scripts/copy-empresas-staging-to-prod.mjs 120000   # retomar após id
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const webEnv = loadEnvFile(resolve(ROOT, 'apps/web/.env.local'));
const syncEnv = loadEnvFile(resolve(ROOT, 'scripts/empresaqui-sync/.env'));
const env = { ...webEnv, ...syncEnv, ...process.env };

const SOURCE_URL =
  env.SOURCE_SUPABASE_URL ||
  webEnv.NEXT_PUBLIC_SUPABASE_URL ||
  'https://zwevbdomvopddxvjildi.supabase.co';
const SOURCE_KEY =
  env.SOURCE_SUPABASE_SERVICE_ROLE_KEY || webEnv.SUPABASE_SERVICE_ROLE_KEY;

const DEST_URL =
  env.PROD_SUPABASE_URL || 'https://gzvsxqxfzvpjqbpabwak.supabase.co';
const DEST_KEY = env.PROD_SUPABASE_SERVICE_ROLE_KEY;

const COLS = [
  'id',
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'estado',
  'situacao',
  'porte',
  'regime_tributario',
  'regime_historico',
  'cnae_codigo',
  'cnae_descricao',
  'telefone',
  'email',
  'endereco',
  'bairro',
  'cidade',
  'cep',
  'faturamento_est',
  'funcionarios',
  'data_inicio',
  'socios',
  'total_dividas',
  'created_at',
  'segmento',
].join(',');

const BATCH = 1000;

async function fetchBatch(lastId) {
  const filter = lastId > 0 ? `&id=gt.${lastId}` : '';
  const url = `${SOURCE_URL}/rest/v1/empresas?select=${COLS}&order=id${filter}&limit=${BATCH}`;
  const res = await fetch(url, {
    headers: {
      apikey: SOURCE_KEY,
      Authorization: `Bearer ${SOURCE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function upsertBatch(rows) {
  const url = `${DEST_URL}/rest/v1/empresas`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: DEST_KEY,
      Authorization: `Bearer ${DEST_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Upsert failed: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  if (!SOURCE_KEY) {
    console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local (staging).');
    process.exit(1);
  }
  if (!DEST_KEY) {
    console.error(
      '❌ Falta PROD_SUPABASE_SERVICE_ROLE_KEY em scripts/empresaqui-sync/.env',
    );
    process.exit(1);
  }

  console.log(`Fonte:  ${SOURCE_URL}`);
  console.log(`Destino: ${DEST_URL}\n`);

  const startId = parseInt(process.argv[2] || '0', 10);
  console.log(`🚀 Copiando empresas (cursor após id=${startId.toLocaleString('pt-BR')})...\n`);

  let lastId = startId;
  let total = 0;
  const start = Date.now();

  while (true) {
    const rows = await fetchBatch(lastId);
    if (rows.length === 0) break;

    await upsertBatch(rows);
    total += rows.length;
    lastId = rows[rows.length - 1].id;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const rate = (total / ((Date.now() - start) / 1000)).toFixed(0);
    process.stdout.write(
      `\r  ✓  ${total.toLocaleString('pt-BR')}  |  último id: ${lastId}  |  ${rate} reg/s  |  ${elapsed}s`,
    );

    if (rows.length < BATCH) break;
  }

  console.log(`\n\n✅ Concluído: ${total.toLocaleString('pt-BR')} empresas.`);
}

main().catch((err) => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
