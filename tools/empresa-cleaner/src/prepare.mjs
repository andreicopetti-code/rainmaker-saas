import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCleaner } from './clean.mjs';

const toolDir = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--state') args.state = argv[++index];
    else if (argv[index] === '--input') args.input = argv[++index];
    else if (argv[index] === '--output') args.output = argv[++index];
    else if (argv[index] === '--help' || argv[index] === '-h') args.help = true;
    else throw new Error(`Argumento desconhecido: ${argv[index]}`);
  }
  return args;
}

function normalizeState(value) {
  const state = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!state) throw new Error('Informe o estado com --state, por exemplo: --state sergipe');
  return state;
}

function createXlsx(csvPath, xlsxPath) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = join(toolDir, 'scripts', 'csv_to_xlsx.py');
  const result = spawnSync(python, [script, csvPath, xlsxPath], {
    cwd: toolDir,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw new Error(`Não foi possível executar Python: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Falha ao gerar XLSX; código ${result.status}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Uso: npm run prepare -- --state sergipe [--input caminho] [--output caminho]');
    return;
  }

  const state = normalizeState(args.state);
  const input = resolve(args.input ?? join(toolDir, 'data', 'raw', state));
  const output = resolve(args.output ?? join(toolDir, 'data', 'output', state));
  const report = await runCleaner({ input, output });

  const csvPath = join(output, 'empresas-tratadas.csv');
  const xlsxPath = join(output, 'empresas-tratadas.xlsx');
  createXlsx(csvPath, xlsxPath);
  if (!existsSync(xlsxPath) || statSync(xlsxPath).size === 0) {
    throw new Error('O arquivo XLSX não foi gerado corretamente');
  }

  console.log('');
  console.log(`Estado preparado: ${state}`);
  console.log(`Empresas únicas: ${report.uniqueCompanies.toLocaleString('pt-BR')}`);
  console.log(`CSV para banco: ${csvPath}`);
  console.log(`XLSX para conferência: ${xlsxPath}`);
  console.log('Supabase: nenhuma importação executada');
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
