import { createReadStream, createWriteStream, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import readXlsxFile from 'read-excel-file/node';

export const OUTPUT_COLUMNS = [
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'situacao',
  'endereco',
  'bairro',
  'cidade',
  'estado',
  'cep',
  'telefone',
  'email',
  'cnae_codigo',
  'cnae_descricao',
  'regime_tributario',
  'regime_historico',
  'faturamento_est',
  'funcionarios',
  'socios',
  'total_dividas',
];

const HEADER_ALIASES = {
  cnpj: ['cnpj', 'cnpj completo', 'cnpj/cpf', 'numero cnpj', 'nº cnpj'],
  razao_social: ['razao', 'razão', 'razao social', 'razão social', 'nome empresarial', 'empresa'],
  nome_fantasia: ['fantasia', 'nome fantasia'],
  situacao: ['situacao cad.', 'situação cad.', 'situacao cadastral', 'situação cadastral', 'situacao', 'situação', 'status'],
  tipo_logradouro: ['tipo', 'tipo logradouro'],
  endereco: ['endereco', 'endereço', 'logradouro'],
  numero: ['numero', 'número'],
  complemento: ['complemento'],
  bairro: ['bairro'],
  cidade: ['cidade', 'municipio', 'município'],
  estado: ['uf', 'estado', 'sigla uf'],
  cep: ['cep'],
  telefone_1: ['telefone 1', 'telefone', 'fone'],
  telefone_2: ['telefone 2'],
  email: ['e-mail', 'email', 'e mail'],
  cnae_codigo: ['cnae principal', 'cnae', 'codigo cnae', 'código cnae'],
  cnae_descricao: ['texto cnae principal', 'descricao cnae', 'descrição cnae', 'atividade principal'],
  regime_tributario: ['regime tributario', 'regime tributário', 'regime'],
  regime_historico: ['regime historico', 'regime histórico', 'historico regime'],
  faturamento_est: ['faturamento estimado', 'faturamento', 'receita estimada'],
  funcionarios: ['quadro de funcionarios', 'quadro de funcionários', 'funcionarios', 'funcionários'],
  socio_tipo: ['identificador socio', 'identificador sócio', 'tipo socio', 'tipo sócio'],
  socio: ['nome do socio', 'nome do sócio', 'socios', 'sócios', 'qsa'],
  socio_cargo: [
    'cargo do socio',
    'cargo do sócio',
    'qualificacao do socio',
    'qualificação do sócio',
    'funcao do socio',
    'função do sócio',
    'qualificacao qsa',
    'qualificação qsa',
  ],
  total_dividas: ['total dividas', 'total dívidas', 'dividas', 'dívidas'],
};

const MAX_PARTNERS_PER_COMPANY = 5;

const projectDir = resolve(fileURLToPath(new URL('..', import.meta.url)));

function compact(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildHeaderMap(headers) {
  const normalized = headers.map(normalizeHeader);
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = aliases.map(normalizeHeader).map((alias) => normalized.indexOf(alias)).find((candidate) => candidate >= 0);
    if (index != null) map[field] = headers[index];
  }
  return map;
}

function digitsOnly(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
}

export function isValidCnpj(value) {
  const cnpj = digitsOnly(value);
  if (!cnpj || cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (length) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * factor;
      factor -= 1;
      if (factor < 2) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(cnpj[12]) && calculateDigit(13) === Number(cnpj[13]);
}

export function normalizeEmail(value) {
  const email = compact(value)?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeAddress({ tipo, endereco, numero, complemento }) {
  const street = [compact(tipo), compact(endereco)].filter(Boolean).join(' ');
  if (!street) return null;
  const withNumber = compact(numero) ? `${street}, ${compact(numero)}` : street;
  return compact(complemento) ? `${withNumber} - ${compact(complemento)}` : withNumber;
}

function canonicalRegime(value) {
  const normalized = normalizeHeader(value).toUpperCase();
  if (!normalized) return null;
  if (/\bMEI\b/.test(normalized)) return 'MEI';

  const matches = new Set();
  if (normalized.includes('SIMPLES')) matches.add('Simples Nacional');
  if (normalized.includes('PRESUMID')) matches.add('Lucro Presumido');
  if (normalized.includes('LUCRO REAL') || normalized === 'REAL') matches.add('Lucro Real');
  if (normalized.includes('ARBITRAD')) matches.add('Lucro Arbitrado');
  if (normalized.includes('IMUNE') || normalized.includes('ISENT')) matches.add('Imune / Isento');
  return matches.size === 1 ? [...matches][0] : null;
}

export function normalizeRegime(value, existingHistory = null) {
  const original = compact(value);
  const suppliedHistory = compact(existingHistory);
  if (!original) return { current: null, history: suppliedHistory, ambiguous: false };

  const segments = original.split(/[;|\n]+/).map(compact).filter(Boolean);
  const dated = segments
    .map((segment) => ({ segment, year: Number(segment.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0) }))
    .filter(({ year }) => year > 0)
    .sort((a, b) => b.year - a.year);

  if (dated.length > 0) {
    const current = canonicalRegime(dated[0].segment);
    return { current, history: suppliedHistory ?? original, ambiguous: !current };
  }

  const current = canonicalRegime(original);
  return {
    current,
    history: suppliedHistory ?? (current ? null : original),
    ambiguous: !current,
  };
}

export function normalizePartner(value) {
  const partner = compact(value)
    ?.replace(/^(PF|PJ)\s*-\s*/i, '')
    .replace(/[\s-]+$/g, '')
    .trim();
  return partner || null;
}

export function normalizePartners(value, typeValue = null) {
  const names = compact(value)?.replace(/[\s-]+$/g, '').split('-').map(compact).filter(Boolean) ?? [];
  const types = compact(typeValue)?.replace(/[\s-]+$/g, '').split('-').map(compact).filter(Boolean) ?? [];

  return names
    .map((name, index) => normalizePartner(`${types[index] ? `${types[index]}-` : ''}${name}`))
    .filter(Boolean);
}

export function partnerRolePriority(value) {
  const role = normalizeHeader(value).toUpperCase();
  if (!role) return 0;
  if (/\b(PRESIDENTE|CEO|CHIEF EXECUTIVE)\b/.test(role)) return 100;
  if (/\b(DIRETOR|DIRETORA|DIRETORIA)\b/.test(role)) return 90;
  if (/\b(ADMINISTRADOR|ADMINISTRADORA|ADMINISTRACAO)\b/.test(role)) return 80;
  if (/\b(GESTOR|GESTORA|GERENTE)\b/.test(role)) return 70;
  return 0;
}

export function normalizePartnerEntries(value, typeValue = null, roleValue = null, startOrder = 0) {
  const names = normalizePartners(value, typeValue);
  const roles = compact(roleValue)?.replace(/[\s-]+$/g, '').split('-').map(compact).filter(Boolean) ?? [];
  return names.map((name, index) => ({
    name,
    role: roles[index] ?? null,
    priority: partnerRolePriority(roles[index]),
    order: startOrder + index,
  }));
}

export function selectTopPartners(entries, maximum = MAX_PARTNERS_PER_COMPANY) {
  const unique = new Map();
  for (const entry of entries) {
    const key = normalizeHeader(entry.name);
    const current = unique.get(key);
    if (!current || entry.priority > current.priority) unique.set(key, entry);
  }
  return [...unique.values()]
    .sort((a, b) => b.priority - a.priority || a.order - b.order)
    .slice(0, maximum);
}

export function parseDebtAmount(value) {
  let text = compact(value);
  if (!text || /^R\$\s*$/i.test(text)) return null;
  text = text.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma >= 0) {
    text = text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    text = text.replace(',', '.');
  }

  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function formatDebt(value) {
  const amount = parseDebtAmount(value);
  if (amount == null) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function normalizeRecord(raw, headerMap, context, stats) {
  const get = (field) => {
    const header = headerMap[field];
    return header == null ? null : raw[header];
  };

  const cnpjOriginal = compact(get('cnpj'));
  const cnpj = digitsOnly(cnpjOriginal);
  if (!isValidCnpj(cnpj)) {
    return {
      rejected: {
        arquivo: context.file,
        linha: context.rowNumber,
        cnpj_original: cnpjOriginal,
        motivo: 'CNPJ ausente ou inválido',
      },
    };
  }

  const cepOriginal = compact(get('cep'));
  const cepDigits = digitsOnly(cepOriginal);
  const cep = !cepOriginal || cepDigits?.length === 8 ? cepDigits : null;
  if (cepOriginal && !cep) stats.warnings.cepInvalid += 1;

  const emailOriginal = compact(get('email'));
  const email = normalizeEmail(emailOriginal);
  if (emailOriginal && !email) stats.warnings.emailInvalid += 1;

  const regime = normalizeRegime(get('regime_tributario'), get('regime_historico'));
  if (regime.ambiguous) stats.warnings.regimeAmbiguous += 1;

  if (headerMap.socio_cargo) stats.partnerRoleFiles.add(context.file);
  const partners = normalizePartnerEntries(
    get('socio'),
    get('socio_tipo'),
    get('socio_cargo'),
    stats.partnerOrder,
  );
  stats.partnerOrder += partners.length;
  const selectedPartners = selectTopPartners(partners);
  const row = {
    cnpj,
    razao_social: compact(get('razao_social')),
    nome_fantasia: compact(get('nome_fantasia')),
    situacao: compact(get('situacao'))?.toUpperCase() ?? null,
    endereco: normalizeAddress({
      tipo: get('tipo_logradouro'),
      endereco: get('endereco'),
      numero: get('numero'),
      complemento: get('complemento'),
    }),
    bairro: compact(get('bairro')),
    cidade: compact(get('cidade')),
    estado: compact(get('estado'))?.toUpperCase().slice(0, 2) ?? null,
    cep,
    telefone: digitsOnly(get('telefone_1')) ?? digitsOnly(get('telefone_2')),
    email,
    cnae_codigo: digitsOnly(get('cnae_codigo')),
    cnae_descricao: compact(get('cnae_descricao')),
    regime_tributario: regime.current,
    regime_historico: regime.history,
    faturamento_est: compact(get('faturamento_est')),
    funcionarios: compact(get('funcionarios')),
    socios: selectedPartners.map(({ name }) => name).join('; ') || null,
    total_dividas: formatDebt(get('total_dividas')),
  };

  return { row, partners };
}

function completeness(row) {
  return OUTPUT_COLUMNS.reduce((score, column) => score + (row[column] ? 1 : 0), 0);
}

function mergeCompany(companies, incoming, stats) {
  const existing = companies.get(incoming.row.cnpj);
  if (!existing) {
    companies.set(incoming.row.cnpj, {
      row: incoming.row,
      score: completeness(incoming.row),
      partners: new Map(incoming.partners.map((partner) => [normalizeHeader(partner.name), partner])),
    });
    return;
  }

  stats.duplicates += 1;
  for (const partner of incoming.partners) {
    const key = normalizeHeader(partner.name);
    const current = existing.partners.get(key);
    if (!current || partner.priority > current.priority) existing.partners.set(key, partner);
  }
  const incomingScore = completeness(incoming.row);
  const preferred = incomingScore > existing.score ? incoming.row : existing.row;
  const fallback = incomingScore > existing.score ? existing.row : incoming.row;
  const merged = {};

  for (const column of OUTPUT_COLUMNS) {
    merged[column] = preferred[column] ?? fallback[column] ?? null;
    if (preferred[column] && fallback[column] && preferred[column] !== fallback[column]) {
      stats.conflictingValues += 1;
    }
  }

  const preferredDebt = parseDebtAmount(preferred.total_dividas) ?? -1;
  const fallbackDebt = parseDebtAmount(fallback.total_dividas) ?? -1;
  merged.total_dividas = preferredDebt >= fallbackDebt ? preferred.total_dividas : fallback.total_dividas;
  existing.row = merged;
  existing.score = Math.max(existing.score, incomingScore, completeness(merged));
}

function detectCsv(filePath) {
  const sample = readFileSync(filePath).subarray(0, 64 * 1024);
  const utf8 = sample.toString('utf8');
  const encoding = utf8.includes('\ufffd') ? 'latin1' : 'utf8';
  const firstLine = (encoding === 'utf8' ? utf8 : sample.toString('latin1')).split(/\r?\n/, 1)[0] ?? '';
  const candidates = [';', ',', '\t'].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  candidates.sort((a, b) => b.count - a.count);
  return { delimiter: candidates[0].count > 0 ? candidates[0].delimiter : ';', encoding };
}

async function processCsv(filePath, companies, rejected, stats) {
  const { delimiter, encoding } = detectCsv(filePath);
  let rowNumber = 1;
  let headerMap;
  const parser = createReadStream(filePath).pipe(parse({
    bom: true,
    columns: true,
    delimiter,
    encoding,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    max_record_size: 0, // sem limite — evita erro em campos grandes
  }));

  for await (const raw of parser) {
    rowNumber += 1;
    stats.rowsRead += 1;
    headerMap ??= buildHeaderMap(Object.keys(raw));
    const normalized = normalizeRecord(raw, headerMap, { file: basename(filePath), rowNumber }, stats);
    if (normalized.rejected) {
      stats.rejected += 1;
      rejected.push(normalized.rejected);
    } else {
      mergeCompany(companies, normalized, stats);
    }
  }
}

async function processSpreadsheet(filePath, companies, rejected, stats) {
  const rows = await readXlsxFile(filePath);
  if (rows.length === 0) return;
  const cellText = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
  const headers = rows[0].map(cellText);
  const headerMap = buildHeaderMap(headers);
  for (let rowNumber = 2; rowNumber <= rows.length; rowNumber += 1) {
    const values = rows[rowNumber - 1];
    const raw = Object.fromEntries(headers.map((header, index) => [header, cellText(values[index])]));
    stats.rowsRead += 1;
    const normalized = normalizeRecord(
      raw,
      headerMap,
      { file: basename(filePath), rowNumber },
      stats,
    );
    if (normalized.rejected) {
      stats.rejected += 1;
      rejected.push(normalized.rejected);
    } else {
      mergeCompany(companies, normalized, stats);
    }
  }
}

function listInputFiles(inputPath) {
  const supported = new Set(['.csv', '.xls', '.xlsx']);
  const walk = (current) => {
    if (statSync(current).isFile()) return supported.has(extname(current).toLowerCase()) ? [current] : [];
    return readdirSync(current, { withFileTypes: true })
      .flatMap((entry) => walk(join(current, entry.name)));
  };
  return walk(inputPath).sort((a, b) => a.localeCompare(b));
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function writeCsv(filePath, columns, rows) {
  const output = createWriteStream(filePath, { encoding: 'utf8' });
  output.write(`\ufeff${columns.map(csvCell).join(';')}\r\n`);
  for (const row of rows) {
    const line = `${columns.map((column) => csvCell(row[column])).join(';')}\r\n`;
    if (!output.write(line)) await once(output, 'drain');
  }
  output.end();
  await once(output, 'finish');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') args.input = argv[++index];
    else if (argv[index] === '--output') args.output = argv[++index];
    else if (argv[index] === '--help' || argv[index] === '-h') args.help = true;
    else throw new Error(`Argumento desconhecido: ${argv[index]}`);
  }
  return args;
}

export async function runCleaner({ input, output } = {}) {
  const inputPath = resolve(input ?? join(projectDir, 'data', 'raw', 'sergipe'));
  const outputPath = resolve(output ?? join(projectDir, 'data', 'output', basename(inputPath)));
  const files = listInputFiles(inputPath);
  if (files.length === 0) throw new Error(`Nenhum arquivo CSV, XLS ou XLSX encontrado em ${inputPath}`);

  await mkdir(outputPath, { recursive: true });
  const companies = new Map();
  const rejected = [];
  const stats = {
    rowsRead: 0,
    duplicates: 0,
    rejected: 0,
    conflictingValues: 0,
    partnerOrder: 0,
    partnerRoleFiles: new Set(),
    companiesPartnersTruncated: 0,
    partnersOmitted: 0,
    managerialPartnersSelected: 0,
    warnings: {
      cepInvalid: 0,
      emailInvalid: 0,
      regimeAmbiguous: 0,
    },
  };

  for (const filePath of files) {
    const extension = extname(filePath).toLowerCase();
    console.log(`Processando ${basename(filePath)}...`);
    if (extension === '.csv') await processCsv(filePath, companies, rejected, stats);
    else if (extension === '.xlsx') await processSpreadsheet(filePath, companies, rejected, stats);
    else throw new Error(`Formato .xls antigo não suportado com segurança: salve ${basename(filePath)} como .xlsx`);
  }

  const cleanRows = [...companies.values()]
    .map((company) => {
      const allPartners = [...company.partners.values()];
      const selectedPartners = selectTopPartners(allPartners);
      if (allPartners.length > MAX_PARTNERS_PER_COMPANY) {
        stats.companiesPartnersTruncated += 1;
        stats.partnersOmitted += allPartners.length - MAX_PARTNERS_PER_COMPANY;
      }
      stats.managerialPartnersSelected += selectedPartners.filter(({ priority }) => priority > 0).length;
      return {
        ...company.row,
        socios: selectedPartners.map(({ name }) => name).join('; ') || null,
      };
    })
    .sort((a, b) => a.cnpj.localeCompare(b.cnpj));

  const debtAmounts = cleanRows.map((row) => parseDebtAmount(row.total_dividas)).filter((amount) => amount > 0);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run; nenhum dado foi enviado ao Supabase',
    input: inputPath,
    output: outputPath,
    files: files.map((filePath) => basename(filePath)),
    rowsRead: stats.rowsRead,
    uniqueCompanies: cleanRows.length,
    duplicatesMerged: stats.duplicates,
    rejectedRows: stats.rejected,
    conflictingValuesResolved: stats.conflictingValues,
    warnings: stats.warnings,
    partnerSelection: {
      maximumPerCompany: MAX_PARTNERS_PER_COMPANY,
      companiesTruncated: stats.companiesPartnersTruncated,
      partnersOmitted: stats.partnersOmitted,
      managerialPartnersSelected: stats.managerialPartnersSelected,
      filesWithRoleColumn: [...stats.partnerRoleFiles].sort(),
      fallbackWhenRoleMissing: 'ordem original da fonte',
    },
    debt: {
      companiesWithDebt: debtAmounts.length,
      totalBRL: Number(debtAmounts.reduce((sum, amount) => sum + amount, 0).toFixed(2)),
    },
    columns: OUTPUT_COLUMNS,
  };

  await writeCsv(join(outputPath, 'empresas-tratadas.csv'), OUTPUT_COLUMNS, cleanRows);
  await writeCsv(
    join(outputPath, 'registros-rejeitados.csv'),
    ['arquivo', 'linha', 'cnpj_original', 'motivo'],
    rejected,
  );
  writeFileSync(join(outputPath, 'relatorio.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Concluído: ${cleanRows.length.toLocaleString('pt-BR')} empresas únicas.`);
  console.log(`Saída: ${outputPath}`);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Uso: npm run clean -- [--input caminho] [--output caminho]');
    return;
  }
  await runCleaner(args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Erro: ${error.message}`);
    process.exitCode = 1;
  });
}
