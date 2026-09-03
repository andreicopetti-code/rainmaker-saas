import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Fonte canônica: CEO Brain/Empresas */
export const EMPRESAS_ROOT = resolve(toolDir, '..', '..', '..', 'Empresas');

/** slug prepare (--state) → pasta dentro de Empresas/ */
const STATE_SLUG_TO_DIR = {
  acre: 'AC',
  ac: 'AC',
  amapa: 'AP',
  ap: 'AP',
  sergipe: 'SE',
  se: 'SE',
  'sp-capital': join('SP', 'SP Capital'),
  'sp1': join('SP', 'SP1'),
  'sp2': join('SP', 'SP2'),
  al: 'AL',
  am: 'AM',
  ba: 'BA',
  ce: 'CE',
  df: 'DF',
  es: 'ES',
  go: 'GO',
  ma: 'MA',
  mg: 'MG',
  ms: 'MS',
  mt: 'MT',
  pa: 'PA',
  pb: 'PB',
  pe: 'PE',
  pi: 'PI',
  pr: 'PR',
  rj: 'RJ',
  rn: 'RN',
  ro: 'RO',
  rs: 'RS',
  sc: 'SC',
  sp: 'SP',
  to: 'TO',
};

/**
 * @param {string} state slug normalizado (ex.: sergipe, sp-capital, mg)
 */
export function resolveEmpresasInput(state) {
  const key = String(state ?? '').trim().toLowerCase();
  const rel = STATE_SLUG_TO_DIR[key];
  if (!rel) {
    throw new Error(
      `Estado "${state}" não mapeado. Use slug conhecido (ex.: sergipe, mg, sp-capital) ou --input com caminho manual.`,
    );
  }
  const input = resolve(EMPRESAS_ROOT, rel);
  if (!existsSync(input)) {
    throw new Error(`Pasta de entrada não encontrada: ${input}`);
  }
  return input;
}
