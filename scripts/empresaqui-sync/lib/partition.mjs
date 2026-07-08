import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionKey } from './state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUNICIPIOS_DIR = resolve(__dirname, '../config/municipios');
export const EXPORT_LIMIT = 100_000;

/** @type {Record<string, number>} IBGE id por UF */
const UF_IBGE = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

/**
 * @param {string} uf
 * @returns {Promise<{ id: number, nome: string }[]>}
 */
export async function loadMunicipios(uf) {
  const code = uf.toUpperCase();
  if (!UF_IBGE[code]) throw new Error(`UF inválida: ${uf}`);

  if (!existsSync(MUNICIPIOS_DIR)) mkdirSync(MUNICIPIOS_DIR, { recursive: true });
  const cachePath = resolve(MUNICIPIOS_DIR, `${code.toLowerCase()}.json`);

  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }

  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF_IBGE[code]}/municipios`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE fetch failed: ${res.status}`);

  /** @type {{ id: number, nome: string }[]} */
  const data = await res.json();
  const list = data.map((m) => ({ id: m.id, nome: m.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  writeFileSync(cachePath, JSON.stringify(list, null, 2), 'utf8');
  return list;
}

/**
 * @param {number} count
 * @param {string} uf
 * @param {{ id: number, nome: string }[] | null} municipios
 */
export function planPartitions(count, uf, municipios) {
  if (count <= EXPORT_LIMIT) {
    return [{ key: partitionKey(uf, ''), uf, municipio: undefined, ibge: undefined }];
  }

  if (!municipios?.length) {
    throw new Error(
      `Contagem ${count.toLocaleString('pt-BR')} > ${EXPORT_LIMIT.toLocaleString('pt-BR')}: informe municípios (partição automática).`,
    );
  }

  return municipios.map((m) => ({
    key: partitionKey(uf, m.nome, m.id),
    uf,
    municipio: m.nome,
    ibge: m.id,
  }));
}
