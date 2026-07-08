#!/usr/bin/env node
/**
 * Simula limites de membros por plano sem criar usuários ou negócios.
 *
 * Uso:
 *   npm run test:member-limits
 *   npm run test:member-limits -- --org ceo-brain
 *   npm run test:member-limits -- --scenario members=2,pending=1
 *   npm run test:member-limits -- --apply-plan regional_1   # troca plano no DB (staging QA)
 *   npm run test:member-limits -- --seed-pending 2          # convites fake QA (bloqueio do botão)
 *   npm run test:member-limits -- --cleanup-seed            # remove convites fake QA
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL em apps/web/.env.local
 */

import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../apps/web/.env.local');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

const fileEnv = loadEnvFile(envPath);
function env(name) {
  return process.env[name] || fileEnv[name] || '';
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const QA_TOKEN_PREFIX = 'qa-seed-';

function parseArgs(argv) {
  const out = {
    org: 'ceo-brain',
    scenario: null,
    applyPlan: null,
    restore: false,
    seedPending: null,
    cleanupSeed: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--org' && argv[i + 1]) out.org = argv[++i];
    else if (a.startsWith('--org=')) out.org = a.slice(6);
    else if (a === '--scenario' && argv[i + 1]) out.scenario = argv[++i];
    else if (a.startsWith('--scenario=')) out.scenario = a.slice(11);
    else if (a === '--apply-plan' && argv[i + 1]) out.applyPlan = argv[++i];
    else if (a.startsWith('--apply-plan=')) out.applyPlan = a.slice(13);
    else if (a === '--seed-pending' && argv[i + 1]) out.seedPending = Number(argv[++i]);
    else if (a.startsWith('--seed-pending=')) out.seedPending = Number(a.slice(15));
    else if (a === '--cleanup-seed') out.cleanupSeed = true;
    else if (a === '--restore') out.restore = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  if (out.seedPending != null && (!Number.isFinite(out.seedPending) || out.seedPending < 1)) {
    fail('--seed-pending precisa ser um inteiro >= 1');
  }
  return out;
}

function parseScenario(raw) {
  if (!raw) return null;
  const parts = Object.fromEntries(
    raw.split(',').map((p) => {
      const [k, v] = p.split('=').map((s) => s.trim());
      return [k, Number(v)];
    }),
  );
  if (!Number.isFinite(parts.members) || !Number.isFinite(parts.pending)) {
    fail('Formato de --scenario: members=2,pending=1');
  }
  return { members: parts.members, pending: parts.pending };
}

/** Mesma regra de createTeamInvite */
function canCreateInvite(memberCount, pendingCount, memberLimit) {
  return memberCount + pendingCount < memberLimit;
}

/** Mesma regra de acceptTeamInvite */
function canAcceptInvite(memberCount, memberLimit) {
  return memberCount < memberLimit;
}

function statusIcon(ok) {
  return ok ? '✓' : '✗';
}

function printMatrix(plans, members, pending, label) {
  console.log(`\n📊 Matriz virtual — ${label}`);
  console.log(`   Assentos em uso: ${members} membro(s) + ${pending} convite(s) pendente(s)\n`);
  console.log('   Plano          Limite  Convite?  Aceitar?  Vagas livres');
  console.log('   ─────────────  ──────  ────────  ────────  ────────────');

  for (const plan of plans) {
    const limit = plan.maxMembers;
    const inviteOk = canCreateInvite(members, pending, limit);
    const acceptOk = canAcceptInvite(members, limit);
    const free = Math.max(0, limit - members - pending);
    console.log(
      `   ${plan.slug.padEnd(14)} ${String(limit).padStart(6)}  ${statusIcon(inviteOk).padEnd(8)}  ${statusIcon(acceptOk).padEnd(8)}  ${free}`,
    );
  }
  console.log('');
}

async function countPendingInvites(supabase, orgId) {
  const { count, error } = await supabase
    .from('invite_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString());
  if (error) fail(error.message);
  return count ?? 0;
}

async function cleanupSeedInvites(supabase, orgId) {
  const { data, error } = await supabase
    .from('invite_tokens')
    .delete()
    .eq('organization_id', orgId)
    .like('token', `${QA_TOKEN_PREFIX}%`)
    .select('id');
  if (error) fail(error.message);
  return data?.length ?? 0;
}

async function seedPendingInvites(supabase, orgId, count) {
  const removed = await cleanupSeedInvites(supabase, orgId);
  if (removed > 0) {
    console.log(`   Removidos ${removed} convite(s) QA anterior(es).`);
  }

  const { data: adminMember, error: adminErr } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminErr) fail(adminErr.message);
  if (!adminMember?.user_id) fail('Nenhum admin ativo encontrado na org para created_by.');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = Array.from({ length: count }, () => ({
    organization_id: orgId,
    token: `${QA_TOKEN_PREFIX}${randomBytes(16).toString('hex')}`,
    created_by: adminMember.user_id,
    expires_at: expiresAt,
    used: false,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('invite_tokens')
    .insert(rows)
    .select('id, token');
  if (insertErr) fail(insertErr.message);

  return inserted ?? [];
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
CEO Brain — teste virtual de limite de membros

  npm run test:member-limits
  npm run test:member-limits -- --org ceo-brain
  npm run test:member-limits -- --scenario members=1,pending=2
  npm run test:member-limits -- --apply-plan regional_3
  npm run test:member-limits -- --apply-plan regional_1

  # Convites fake (prefixo qa-seed-) para testar bloqueio na UI
  npm run test:member-limits -- --seed-pending 2
  npm run test:member-limits -- --cleanup-seed

Convite bloqueado quando: membros + pendentes >= limite
Aceite bloqueado quando: membros >= limite
Convites QA usam token qa-seed-* e não devem ser enviados a usuários reais.
`);
  process.exit(0);
}

const SUPABASE_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE = env('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE) {
  fail('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('\n🧪 CEO Brain — limite de membros (simulação)\n');

let org = null;
const bySlug = await supabase
  .from('organizations')
  .select('id, name, slug, plan_id')
  .eq('slug', args.org)
  .maybeSingle();
if (bySlug.error) fail(bySlug.error.message);
org = bySlug.data;

if (!org && /^[0-9a-f-]{36}$/i.test(args.org)) {
  const byId = await supabase
    .from('organizations')
    .select('id, name, slug, plan_id')
    .eq('id', args.org)
    .maybeSingle();
  if (byId.error) fail(byId.error.message);
  org = byId.data;
}

if (!org) fail(`Organização não encontrada: ${args.org}`);

const { data: planRows, error: plansErr } = await supabase
  .from('plans')
  .select('id, name, features')
  .order('price_monthly', { ascending: true });

if (plansErr) fail(plansErr.message);

const plans = (planRows ?? [])
  .map((p) => {
    const features = p.features ?? {};
    const slug = features.slug ?? p.name?.toLowerCase().replace(/\s+/g, '_') ?? '?';
    const maxMembers = Number(features.max_members ?? 1);
    return { id: p.id, name: p.name, slug, maxMembers };
  })
  .filter((p) => Number.isFinite(p.maxMembers));

if (args.applyPlan) {
  const target = plans.find((p) => p.slug === args.applyPlan);
  if (!target) fail(`Plano desconhecido: ${args.applyPlan}`);

  if (args.restore) {
    console.log('↩ --restore ignorado: use --apply-plan com o slug desejado para voltar ao plano.');
  }

  const { error: updErr } = await supabase
    .from('organizations')
    .update({ plan_id: target.id, subscription_status: 'active', updated_at: new Date().toISOString() })
    .eq('id', org.id);

  if (updErr) fail(updErr.message);

  const { data: newLimit } = await supabase.rpc('get_org_member_limit', { p_org_id: org.id });
  console.log(`✅ Plano aplicado: ${target.name} (${target.slug}) — limite ${newLimit}`);
  console.log('   Recarregue Configurações → Equipe no browser para validar a UI.\n');
}

if (args.cleanupSeed && args.seedPending == null) {
  const removed = await cleanupSeedInvites(supabase, org.id);
  const pending = await countPendingInvites(supabase, org.id);
  console.log(`🧹 Removidos ${removed} convite(s) QA (${QA_TOKEN_PREFIX}*).`);
  console.log(`   Convites pendentes restantes na org: ${pending}\n`);
}

if (args.seedPending != null) {
  console.log(`🌱 Criando ${args.seedPending} convite(s) fake QA…`);
  const inserted = await seedPendingInvites(supabase, org.id, args.seedPending);
  console.log(`   Inseridos: ${inserted.length}`);
  for (const row of inserted) {
    console.log(`   · ${row.token.slice(0, 24)}… (não compartilhar — só ocupa vaga)`);
  }
  console.log('');
}

const [{ data: memberCountRpc }, pendingCount] = await Promise.all([
  supabase.rpc('org_active_member_count', { p_org_id: org.id }),
  countPendingInvites(supabase, org.id),
]);

const realMembers = memberCountRpc ?? 0;
const realPending = pendingCount;

const { data: currentPlanRow } = await supabase
  .from('plans')
  .select('name, features')
  .eq('id', org.plan_id)
  .maybeSingle();

const currentSlug = currentPlanRow?.features?.slug ?? '?';
const { data: currentLimitRpc } = await supabase.rpc('get_org_member_limit', { p_org_id: org.id });

console.log(`Org: ${org.name} (${org.slug})`);
console.log(`Plano atual: ${currentPlanRow?.name ?? '?'} [${currentSlug}]`);
console.log(`RPC get_org_member_limit: ${currentLimitRpc}`);
console.log(`Membros ativos (RPC): ${realMembers}`);
console.log(`Convites pendentes: ${realPending}`);
console.log(
  `Convidar agora? ${canCreateInvite(realMembers, realPending, currentLimitRpc ?? 1) ? 'SIM' : 'NÃO'}`,
);

if (args.seedPending != null) {
  console.log('\n👉 Abra Configurações → Equipe e recarregue a página.');
  console.log('   O botão "Convidar membro" deve refletir o bloqueio acima.');
  console.log('   Depois rode: npm run test:member-limits -- --cleanup-seed\n');
}

if (args.cleanupSeed || args.seedPending != null) {
  printMatrix(plans, realMembers, realPending, 'estado real após seed/cleanup');
} else {
  printMatrix(plans, realMembers, realPending, 'estado real da org');

  const virtualScenarios = [
    { members: 1, pending: 0, label: 'só admin' },
    { members: 2, pending: 0, label: 'admin + 1 membro' },
    { members: 3, pending: 0, label: 'admin + 2 membros (Regional 1 cheio)' },
    { members: 2, pending: 1, label: '2 membros + 1 convite pendente' },
    { members: 1, pending: 2, label: '1 membro + 2 convites pendentes' },
  ];

  for (const s of virtualScenarios) {
    printMatrix(plans, s.members, s.pending, s.label);
  }

  const custom = parseScenario(args.scenario);
  if (custom) {
    printMatrix(plans, custom.members, custom.pending, `cenário custom (${args.scenario})`);
  }
}

if (!args.cleanupSeed && args.seedPending == null) {
  console.log('Dica: use --apply-plan free|regional_1|regional_3|nacional para testar a UI sem Stripe.');
  console.log('      use --scenario members=2,pending=1 para simular outro cenário.');
  console.log('      use --seed-pending 2 e depois --cleanup-seed para testar bloqueio na UI.\n');
}
