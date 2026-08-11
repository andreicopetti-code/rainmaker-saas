import { readFileSync, unlinkSync, existsSync } from 'node:fs';

const p = '.env.vercel.prod.check';
if (!existsSync(p)) {
  console.error('Arquivo de pull não encontrado');
  process.exit(1);
}

const o = {};
for (const line of readFileSync(p, 'utf8').split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  o[t.slice(0, i).trim()] = v;
}

function jwtRef(v) {
  try {
    const payload = JSON.parse(
      Buffer.from(v.split('.')[1], 'base64url').toString(),
    );
    return payload.ref || '?';
  } catch {
    return '?';
  }
}

const checks = [
  [
    'NEXT_PUBLIC_SUPABASE_URL',
    (v) => v === 'https://gzvsxqxfzvpjqbpabwak.supabase.co',
    'URL do ceobrain-prod',
  ],
  [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    (v) => v.startsWith('eyJ') && jwtRef(v) === 'gzvsxqxfzvpjqbpabwak',
    'anon do prod',
  ],
  [
    'SUPABASE_SERVICE_ROLE_KEY',
    (v) => v.startsWith('eyJ') && jwtRef(v) === 'gzvsxqxfzvpjqbpabwak',
    'service_role do prod',
  ],
  ['STRIPE_SECRET_KEY', (v) => v.startsWith('sk_live_'), 'sk_live_'],
  [
    'STRIPE_WEBHOOK_SECRET',
    (v) => v.startsWith('whsec_') && v.length > 20,
    'whsec live',
  ],
  [
    'NEXT_PUBLIC_APP_URL',
    (v) => v.includes('rainmaker.ia.br'),
    'domínio produção',
  ],
  [
    'STRIPE_PRICE_PRO_MONTHLY',
    (v) => v === 'price_1TvORqIgjM3hgPUN1Rjfh4z1',
    'price Regional 1 live',
  ],
];

console.log('=== Vercel Production ===\n');
let okCount = 0;
let bad = [];
for (const [k, fn, desc] of checks) {
  const v = o[k];
  if (v == null || v === '') {
    console.log(`FALTA   ${k} — ${desc}`);
    bad.push(k);
    continue;
  }
  const ok = fn(v);
  let hint = '';
  if (k === 'NEXT_PUBLIC_SUPABASE_URL') {
    hint = v.includes('zwevbdomvopddxvjildi')
      ? ' (ainda STAGING)'
      : v.includes('gzvsxqxfzvpjqbpabwak')
        ? ' (prod)'
        : ` (${v})`;
  }
  if (k === 'STRIPE_SECRET_KEY') hint = ` (${v.slice(0, 7)}…)`;
  if (k === 'STRIPE_PRICE_PRO_MONTHLY') {
    hint =
      v === 'price_1TvORqIgjM3hgPUN1Rjfh4z1'
        ? ' (live ok)'
        : ' (ainda price antigo/test)';
  }
  if (k === 'NEXT_PUBLIC_APP_URL') hint = ` = ${v}`;
  if (k.includes('SUPABASE') && k.includes('KEY')) {
    hint = ` (ref=${jwtRef(v)})`;
  }
  if (k === 'STRIPE_WEBHOOK_SECRET') hint = ` (${v.slice(0, 6)}… len=${v.length})`;
  console.log(`${ok ? 'OK     ' : 'AJUSTAR'} ${k}${hint}`);
  if (ok) okCount++;
  else bad.push(k);
}

console.log(`\n${okCount}/${checks.length} ok`);
if (bad.length) console.log('Pendentes:', bad.join(', '));

unlinkSync(p);
