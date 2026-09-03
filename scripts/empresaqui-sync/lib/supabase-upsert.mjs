/**
 * Upsert em public.empresas — mesmo contrato de scripts/migrate-empresas.mjs
 * Idempotente por cnpj (unique). Lotes de 1.000 via REST PostgREST.
 */

export const BATCH = Number(process.env.EMPRESAS_UPSERT_BATCH || 1000) || 1000;

/** Colunas de negócio (sem id) para ingest Empresaqui */
export const EMPRESA_COLS = [
  'cnpj', 'razao_social', 'nome_fantasia', 'situacao',
  'endereco', 'bairro', 'cidade', 'estado', 'cep',
  'telefone', 'email', 'cnae_codigo', 'cnae_descricao',
  'regime_historico', 'socios', 'data_inicio',
];

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ url: string, serviceRoleKey: string, includeId?: boolean }} cfg
 */
export async function upsertEmpresas(rows, { url, serviceRoleKey, includeId = false }) {
  if (rows.length === 0) return;

  const payload = includeId
    ? rows
    : rows.map((row) => {
        const out = {};
        for (const col of EMPRESA_COLS) {
          if (row[col] !== undefined) out[col] = row[col];
        }
        return out;
      });

  const maxAttempts = 6;
  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(`${url}/rest/v1/empresas?on_conflict=cnpj`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) return;

    const body = await res.text();
    lastError = `${res.status} ${body}`;
    const timedOut =
      body.includes('57014') ||
      body.includes('55P03') ||
      /statement timeout/i.test(body) ||
      /lock timeout/i.test(body);
    const retryable = timedOut || res.status === 502 || res.status === 503 || res.status === 504;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Upsert failed: ${lastError}`);
    }
    const waitMs = Math.min(60_000, 3_000 * 2 ** (attempt - 1));
    process.stdout.write(`\n  ↻  lock/timeout, nova tentativa ${attempt + 1}/${maxAttempts} em ${waitMs / 1000}s\n`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`Upsert failed: ${lastError}`);
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ url: string, serviceRoleKey: string, includeId?: boolean, onProgress?: (n: number) => void }} cfg
 */
export async function upsertEmpresasBatched(rows, cfg) {
  let done = 0;
  const pauseMs = Number(process.env.EMPRESAS_UPSERT_PAUSE_MS || 0) || 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await upsertEmpresas(chunk, cfg);
    done += chunk.length;
    cfg.onProgress?.(done);
    if (pauseMs > 0 && i + BATCH < rows.length) {
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  return done;
}
