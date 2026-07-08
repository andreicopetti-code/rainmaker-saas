/**
 * Migração: empresas do projeto legado (ceo-brain) → novo projeto (ceobrain-saas)
 *
 * Como usar:
 * 1. Preencha NEW_SERVICE_ROLE_KEY abaixo (pegue em ceobrain-saas → Settings → API → service_role)
 * 2. Execute: node scripts/migrate-empresas.mjs
 *
 * O script lê em lotes de 1.000 do legado e insere no novo projeto com upsert.
 * Pode ser interrompido e reexecutado com segurança (idempotente pelo CNPJ).
 */

// ── Configuração ──────────────────────────────────────────────────────────
const LEGACY_URL  = 'https://gzsnxnjmvovqyzjslblh.supabase.co';
const LEGACY_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6c254bmptdm92cXl6anNsYmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNzk1MzIsImV4cCI6MjA5Mzg1NTUzMn0.s-ouLkoljtNPhl-5mTtkfp3r_V53jaTtPXnzc9rbmGw';

const NEW_URL      = 'https://zwevbdomvopddxvjildi.supabase.co';
const NEW_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3ZXZiZG9tdm9wZGR4dmppbGRpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIzNjI2OCwiZXhwIjoyMDk3ODEyMjY4fQ.7Ppxj7jJUoLH6KrbrB1p8yDgL6aB-1bLbZ76P_h89u4';

// ── Helpers ───────────────────────────────────────────────────────────────
const COLS = [
  'id','cnpj','razao_social','nome_fantasia','estado','situacao','porte',
  'regime_tributario','regime_historico','cnae_codigo','cnae_descricao',
  'telefone','email','endereco','bairro','cidade','cep',
  'faturamento_est','funcionarios','data_inicio','socios',
  'total_dividas','created_at','segmento',
].join(',');

const BATCH = 1000;

// Paginação por cursor (id > lastId) — evita OFFSET lento em tabelas grandes
async function fetchBatch(lastId) {
  const filter = lastId > 0 ? `&id=gt.${lastId}` : '';
  const url = `${LEGACY_URL}/rest/v1/empresas?select=${COLS}&order=id${filter}&limit=${BATCH}`;
  const res = await fetch(url, {
    headers: { apikey: LEGACY_ANON, Authorization: `Bearer ${LEGACY_ANON}` },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function upsertBatch(rows) {
  const url = `${NEW_URL}/rest/v1/empresas`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: NEW_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${NEW_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upsert failed: ${res.status} ${body}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
// Para retomar de onde parou, passe o offset como argumento:
//   node scripts/migrate-empresas.mjs 356000
async function main() {
  if (NEW_SERVICE_ROLE_KEY === 'COLE_AQUI_A_SERVICE_ROLE_KEY') {
    console.error('❌  Preencha NEW_SERVICE_ROLE_KEY no script antes de executar.');
    process.exit(1);
  }

  // Passe o último ID migrado como argumento para retomar:
  //   node scripts/migrate-empresas.mjs 406000
  const startId = parseInt(process.argv[2] || '0', 10);
  console.log(`🚀  Iniciando migração (cursor após id=${startId.toLocaleString('pt-BR')})...\n`);

  let lastId = startId;
  let total  = 0;
  const start = Date.now();

  while (true) {
    const rows = await fetchBatch(lastId);
    if (rows.length === 0) break;

    await upsertBatch(rows);
    total  += rows.length;
    lastId  = rows[rows.length - 1].id;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const rate    = (total / ((Date.now() - start) / 1000)).toFixed(0);
    process.stdout.write(`\r  ✓  ${total.toLocaleString('pt-BR')} registros migrados  |  último id: ${lastId}  |  ${rate} reg/s  |  ${elapsed}s`);

    if (rows.length < BATCH) break;
  }

  console.log(`\n\n✅  Migração concluída! ${total.toLocaleString('pt-BR')} empresas importadas.`);
}

main().catch(err => {
  console.error('\n❌  Erro:', err.message);
  process.exit(1);
});
