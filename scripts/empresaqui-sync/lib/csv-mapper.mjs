import { normalizeCnpj, normalizeCep, trimOrNull, parseDate } from './normalize.mjs';

/**
 * Aliases de cabeçalho Empresaqui → coluna public.empresas.
 * Ajuste após inspecionar o CSV real (sync.mjs --inspect-csv arquivo.csv).
 */
const HEADER_ALIASES = {
  cnpj: ['cnpj', 'cnpj completo', 'cnpj/cpf', 'numero cnpj', 'nº cnpj'],
  razao_social: ['razao social', 'razão social', 'nome empresarial', 'empresa', 'razao'],
  nome_fantasia: ['nome fantasia', 'fantasia'],
  estado: ['uf', 'estado', 'sigla uf'],
  situacao: ['situacao', 'situação', 'situacao cadastral', 'situação cadastral', 'situacao cad.', 'status'],
  porte: ['porte', 'porte da empresa'],
  regime_tributario: ['regime tributario', 'regime tributário', 'regime'],
  regime_historico: ['regime historico', 'regime histórico', 'historico regime'],
  cnae_codigo: ['cnae', 'codigo cnae', 'código cnae', 'cnae principal', 'cod cnae', 'cnae codigo'],
  cnae_descricao: ['descricao cnae', 'descrição cnae', 'atividade principal', 'descricao atividade', 'texto cnae principal', 'cnae descricao'],
  telefone: ['telefone', 'tel', 'telefone 1', 'fone'],
  email: ['email', 'e-mail', 'e mail'],
  endereco: ['endereco', 'endereço', 'logradouro', 'endereco completo'],
  bairro: ['bairro'],
  cidade: ['cidade', 'municipio', 'município'],
  cep: ['cep'],
  faturamento_est: ['faturamento', 'faturamento estimado', 'faturamento_est', 'faturamento presunto', 'receita estimada'],
  funcionarios: ['funcionarios', 'funcionários', 'qtd funcionarios', 'numero funcionarios', 'quadro de funcionarios'],
  data_inicio: ['data abertura', 'data de abertura', 'inicio atividade', 'início atividade', 'data inicio'],
  socios: ['socios', 'sócios', 'quadro societario', 'quadro societário', 'qsa'],
  total_dividas: ['dividas', 'dívidas', 'total dividas', 'total dívidas', 'dividas ativas', 'total_dividas'],
  segmento: ['segmento', 'setor', 'segmento de mercado'],
};

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ');
}

/**
 * @param {string[]} headers
 * @returns {Record<string, string>}
 */
export function buildHeaderMap(headers) {
  const normalized = headers.map(normalizeHeader);
  /** @type {Record<string, string>} */
  const map = {};

  for (const [col, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(normalizeHeader(alias));
      if (idx !== -1) {
        map[col] = headers[idx];
        break;
      }
    }
  }

  return map;
}

/**
 * @param {Record<string, string>} row — chaves = cabeçalhos originais
 * @param {Record<string, string>} headerMap
 */
export function mapRowToEmpresa(row, headerMap) {
  /** @param {string} col */
  const get = (col) => {
    const key = headerMap[col];
    return key != null ? row[key] : undefined;
  };

  const cnpj = normalizeCnpj(get('cnpj'));
  if (!cnpj) return null;

  return {
    cnpj,
    razao_social: trimOrNull(get('razao_social')),
    nome_fantasia: trimOrNull(get('nome_fantasia')),
    estado: trimOrNull(get('estado'))?.toUpperCase()?.slice(0, 2) ?? null,
    situacao: trimOrNull(get('situacao')),
    porte: trimOrNull(get('porte')),
    regime_tributario: trimOrNull(get('regime_tributario')),
    regime_historico: trimOrNull(get('regime_historico')),
    cnae_codigo: trimOrNull(get('cnae_codigo')),
    cnae_descricao: trimOrNull(get('cnae_descricao')),
    telefone: trimOrNull(get('telefone')),
    email: trimOrNull(get('email')),
    endereco: trimOrNull(get('endereco')),
    bairro: trimOrNull(get('bairro')),
    cidade: trimOrNull(get('cidade')),
    cep: normalizeCep(get('cep')),
    faturamento_est: trimOrNull(get('faturamento_est')),
    funcionarios: trimOrNull(get('funcionarios')),
    data_inicio: parseDate(get('data_inicio')),
    socios: trimOrNull(get('socios')),
    total_dividas: trimOrNull(get('total_dividas')),
    segmento: trimOrNull(get('segmento')),
  };
}

/**
 * @param {Record<string, string>[]} rows
 * @param {Record<string, string>} headerMap
 */
export function mapRowsToEmpresas(rows, headerMap) {
  const out = [];
  let skipped = 0;
  for (const row of rows) {
    const mapped = mapRowToEmpresa(row, headerMap);
    if (mapped) out.push(mapped);
    else skipped += 1;
  }
  return { empresas: out, skipped };
}

/** Imprime mapeamento para debug */
export function printHeaderInspection(headers) {
  const map = buildHeaderMap(headers);
  console.log('Cabeçalhos detectados:', headers);
  console.log('Mapeamento → public.empresas:');
  for (const col of Object.keys(HEADER_ALIASES)) {
    console.log(`  ${col}: ${map[col] ?? '(não encontrado)'}`);
  }
}
