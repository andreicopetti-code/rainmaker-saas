/**
 * Atualiza env vars Production/Preview do Vercel com valores prod/live.
 * Segredos vêm de scripts/empresaqui-sync/.env — não imprime valores.
 *
 * Uso: node scripts/update-vercel-prod-env.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const o = {};
  for (const line of readFileSync(path, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    o[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return o;
}

const sync = loadEnv(resolve(ROOT, 'scripts/empresaqui-sync/.env'));
const anonPath = resolve(ROOT, 'scripts/.prod-anon.tmp');
const ANON = existsSync(anonPath)
  ? readFileSync(anonPath, 'utf8').trim()
  : process.env.PROD_SUPABASE_ANON_KEY || '';

const updates = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    value: sync.PROD_SUPABASE_URL || 'https://gzvsxqxfzvpjqbpabwak.supabase.co',
    envs: ['production', 'preview'],
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: ANON,
    envs: ['production', 'preview'],
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    value: sync.PROD_SUPABASE_SERVICE_ROLE_KEY,
    envs: ['production', 'preview'],
  },
  {
    name: 'STRIPE_SECRET_KEY',
    value: sync.STRIPE_SECRET_KEY_LIVE,
    envs: ['production'],
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    value: sync.STRIPE_WEBHOOK_SECRET_LIVE,
    envs: ['production', 'preview'],
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    value: 'https://www.rainmaker.ia.br',
    envs: ['production'],
  },
  {
    name: 'STRIPE_PRICE_PRO_MONTHLY',
    value: 'price_1TvORqIgjM3hgPUN1Rjfh4z1',
    envs: ['production'],
  },
];

for (const u of updates) {
  if (!u.value) {
    console.error(`❌ Falta valor para ${u.name}`);
    process.exit(1);
  }
}

function updateOne(name, environment, value) {
  return spawnSync(
    'npx',
    [
      'vercel',
      'env',
      'update',
      name,
      environment,
      '--yes',
      '--sensitive',
      '--value',
      value,
    ],
    { cwd: ROOT, encoding: 'utf8', shell: true },
  );
}

console.log('Atualizando Vercel Production/Preview…\n');

for (const u of updates) {
  for (const env of u.envs) {
    process.stdout.write(`→ ${u.name} (${env}) … `);
    const r = updateOne(u.name, env, u.value);
    if (r.status === 0) {
      console.log('ok');
    } else {
      console.log('FALHOU');
      console.error((r.stderr || r.stdout || '').slice(0, 500));
      process.exit(1);
    }
  }
}

console.log('\n✅ Variáveis atualizadas.');
