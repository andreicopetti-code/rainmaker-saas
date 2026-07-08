/**
 * Upsert em public.empresas — mesmo contrato de scripts/migrate-empresas.mjs
 * Idempotente por cnpj (unique). Lotes de 1.000 via REST PostgREST.
 */

export const BATCH = 1000;

/** Colunas de negócio (sem id) para ingest Empresaqui */
export const EMPRESA_COLS = [
  'cnpj', 'razao_social', 'nome_fantasia', 'estado', 'situacao', 'porte',
  'regime_tributario', 'regime_historico', 'cnae_codigo', 'cnae_descricao',
  'telefone', 'email', 'endereco', 'bairro', 'cidade', 'cep',
  'faturamento_est', 'funcionarios', 'data_inicio', 'socios',
  'total_dividas', 'segmento',
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

  const res = await fetch(`${url}/rest/v1/empresas`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upsert failed: ${res.status} ${body}`);
  }
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ url: string, serviceRoleKey: string, includeId?: boolean, onProgress?: (n: number) => void }} cfg
 */
export async function upsertEmpresasBatched(rows, cfg) {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await upsertEmpresas(chunk, cfg);
    done += chunk.length;
    cfg.onProgress?.(done);
  }
  return done;
}
