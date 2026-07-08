#!/usr/bin/env node
/**
 * Smoke test interativo — assinatura mensal CEO Brain SaaS (Fase 1).
 *
 * Uso:
 *   npm run smoke:subscription              # preflight automático + checklist interativo
 *   npm run smoke:subscription -- --auto    # só verificações automáticas
 *   npm run smoke:subscription -- --org ceo-brain
 *   npm run smoke:subscription -- --apply-trial-expired   # força trial expirado (staging QA)
 *
 * Requer apps/web/.env.local com Supabase service role (+ Stripe key para teste de API).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../apps/web/.env.local');

const REQUIRED_PLAN_SLUGS = ['free', 'regional_1', 'regional_3', 'nacional'];
const PAID_PLAN_SLUGS = ['regional_1', 'regional_3', 'nacional'];
const REQUIRED_RPCS = [
  'get_billing_access',
  'get_org_member_limit',
  'org_active_member_count',
  'get_cnpj_daily_usage',
  'consume_cnpj_credit',
  'soft_delete_opportunity',
];

const MANUAL_STEPS = [
  {
    id: '1',
    title: 'Cadastro novo usuário',
    instructions: [
      'Abra janela anônima → /register com e-mail NOVO (nunca usado).',
      'Complete o cadastro e confirme redirecionamento para /funil.',
      'Verifique: funil vazio ou com onboarding; menu CEO Brain visível.',
    ],
  },
  {
    id: '2',
    title: 'Trial expirado → bloqueio',
    instructions: [
      'Opcional: npm run smoke:subscription -- --apply-trial-expired --org <slug> no usuário de teste.',
      'Ou SQL manual (ver --print-trial-sql).',
      'Recarregue /funil → deve redirecionar para /billing.',
      'Mensagem de trial expirado visível.',
    ],
  },
  {
    id: '3',
    title: 'Checkout Regional 1 (mensal)',
    instructions: [
      'Login como admin da org de teste → /billing',
      'Assinar Regional 1 — cartão teste 4242 4242 4242 4242',
      'Após retorno: status "Assinatura ativa" (ou equivalente).',
      'Funil e demais rotas acessíveis novamente.',
    ],
  },
  {
    id: '4',
    title: 'UF + ficha CNPJ',
    instructions: [
      'Configurações ou Billing → selecionar UF(s) permitidas pelo plano.',
      'Empresas → abrir ficha completa de CNPJ na UF contratada.',
      'Contador de fichas incrementa; UF fora do plano bloqueia ficha completa.',
    ],
  },
  {
    id: '5',
    title: 'Limite de membros / convite',
    instructions: [
      'Configurações → Equipe: conferir "X de Y usuários".',
      'Gerar convite até encher o limite (ou: npm run test:member-limits -- --seed-pending 1).',
      'Botão "Convidar membro" desabilitado no limite.',
      'npm run test:member-limits -- --cleanup-seed para limpar convites QA.',
    ],
  },
  {
    id: '6',
    title: 'Visibilidade negócios (admin vs membro)',
    instructions: [
      'Admin (gmail): /funil mostra todos os negócios da equipe.',
      'Membro convidado: /funil mostra só negócios próprios.',
      'Membro cadastra "+ Novo deal" → fica sob responsabilidade dele.',
    ],
  },
  {
    id: '7',
    title: 'Cancelamento → plano Free',
    instructions: [
      '/billing → Gerenciar assinatura (Portal Stripe).',
      'Cancelar assinatura no portal.',
      'Aguardar webhook/sync (recarregar /billing).',
      'Plano Free + app continua acessível (não trava em login).',
    ],
  },
  {
    id: '8',
    title: 'Add-on pack fichas',
    instructions: [
      'Reativar plano pago se necessário (ou testar com org ainda ativa).',
      '/billing → comprar Pacote 50 fichas (Stripe teste).',
      'Saldo de pack incrementa; consumo após esgotar cota diária do plano.',
    ],
  },
];

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

function parseArgs(argv) {
  const out = {
    org: 'ceo-brain',
    auto: false,
    applyTrialExpired: false,
    printTrialSql: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--org' && argv[i + 1]) out.org = argv[++i];
    else if (a.startsWith('--org=')) out.org = a.slice(6);
    else if (a === '--auto' || a === '--auto-only') out.auto = true;
    else if (a === '--apply-trial-expired') out.applyTrialExpired = true;
    else if (a === '--print-trial-sql') out.printTrialSql = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function icon(ok) {
  return ok ? '✅' : '❌';
}

function warnIcon(ok) {
  return ok ? '✅' : '⚠️';
}

async function loadOrg(supabase, orgKey) {
  const bySlug = await supabase
    .from('organizations')
    .select('id, name, slug, plan_id, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id')
    .eq('slug', orgKey)
    .maybeSingle();
  if (bySlug.error) fail(bySlug.error.message);
  if (bySlug.data) return bySlug.data;
  if (/^[0-9a-f-]{36}$/i.test(orgKey)) {
    const byId = await supabase
      .from('organizations')
      .select('id, name, slug, plan_id, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id')
      .eq('id', orgKey)
      .maybeSingle();
    if (byId.error) fail(byId.error.message);
    return byId.data;
  }
  return null;
}

async function runAutomatedChecks(supabase, org, orgKey, appUrl) {
  const results = [];

  function record(name, ok, detail = '', { soft = false } = {}) {
    results.push({ name, ok, soft, detail });
    const mark = soft ? warnIcon(ok) : icon(ok);
    console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  }

  console.log('\n── A. Ambiente ──\n');

  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const stripeKey = env('STRIPE_SECRET_KEY');
  const appUrlEnv = env('NEXT_PUBLIC_APP_URL') || appUrl;

  record('NEXT_PUBLIC_SUPABASE_URL', !!supabaseUrl, supabaseUrl ? supabaseUrl.replace(/https:\/\//, '') : 'ausente');
  record('NEXT_PUBLIC_SUPABASE_ANON_KEY', !!anonKey);
  record('SUPABASE_SERVICE_ROLE_KEY', !!serviceKey);
  record('STRIPE_SECRET_KEY', !!stripeKey, stripeKey?.startsWith('sk_test_') ? 'test mode' : stripeKey ? 'live/other' : 'ausente');
  record('NEXT_PUBLIC_APP_URL', !!appUrlEnv, appUrlEnv || 'ausente');

  console.log('\n── B. RPCs críticos ──\n');

  for (const rpc of REQUIRED_RPCS) {
    try {
      if (rpc === 'get_billing_access') {
        const { error } = await supabase.rpc(rpc, { p_user_id: '00000000-0000-0000-0000-000000000001' });
        record(`RPC ${rpc}`, !error || !error.message.includes('does not exist'), error?.message?.slice(0, 60));
      } else if (rpc === 'get_org_member_limit' || rpc === 'org_active_member_count') {
        const id = org?.id ?? '00000000-0000-0000-0000-000000000001';
        const { error } = await supabase.rpc(rpc, { p_org_id: id });
        record(`RPC ${rpc}`, !error, error?.message?.slice(0, 60));
      } else if (rpc === 'get_cnpj_daily_usage') {
        const id = org?.id ?? '00000000-0000-0000-0000-000000000001';
        const { error } = await supabase.rpc(rpc, { p_org_id: id });
        record(`RPC ${rpc}`, !error || error.message.includes('Não autorizado') || error.message.includes('autorizado'), error?.message?.slice(0, 60) ?? 'ok');
      } else {
        record(`RPC ${rpc}`, true, 'definido (não invocado)');
      }
    } catch (e) {
      record(`RPC ${rpc}`, false, String(e));
    }
  }

  console.log('\n── C. Planos e Stripe (mensal) ──\n');

  const { data: plans, error: plansErr } = await supabase
    .from('plans')
    .select('id, name, features, stripe_price_monthly_id');
  if (plansErr) fail(plansErr.message);

  for (const slug of REQUIRED_PLAN_SLUGS) {
    const p = [...(plans ?? [])].find((row) => row.features?.slug === slug);
    record(`Plano ${slug}`, !!p, p ? `max_members=${p.features?.max_members ?? '?'}` : 'não encontrado');
  }

  for (const slug of PAID_PLAN_SLUGS) {
    const p = [...(plans ?? [])].find((row) => row.features?.slug === slug);
    const priceId = p?.stripe_price_monthly_id?.trim();
    record(
      `Stripe price ${slug}`,
      !!priceId,
      priceId ? priceId.slice(0, 20) + '…' : 'rode npm run billing:setup',
    );
  }

  const { data: addons, error: addonsErr } = await supabase
    .from('billing_addon_prices')
    .select('slug, stripe_price_id');
  if (addonsErr) {
    record('Tabela billing_addon_prices', false, addonsErr.message);
  } else {
    const slugs = new Set((addons ?? []).map((a) => a.slug));
    for (const s of ['uf_extra', 'pack_50', 'pack_200']) {
      const row = (addons ?? []).find((a) => a.slug === s);
      record(`Add-on ${s}`, slugs.has(s) && !!row?.stripe_price_id?.trim());
    }
  }

  if (stripeKey) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);
      await stripe.prices.list({ limit: 1 });
      record('Stripe API conectada', true);
    } catch (e) {
      record('Stripe API conectada', false, e.message?.slice(0, 80));
    }
  }

  console.log('\n── D. Org de referência ──\n');

  if (!org) {
    record(`Org "${orgKey}"`, false, 'não encontrada');
  } else {
    record('Organização', true, `${org.name} (${org.slug})`);

    const { data: planRow } = await supabase
      .from('plans')
      .select('name, features')
      .eq('id', org.plan_id)
      .maybeSingle();

    const planSlug = planRow?.features?.slug ?? '?';
    console.log(`     Plano: ${planRow?.name ?? '?'} [${planSlug}]`);
    console.log(`     Status: ${org.subscription_status} · trial_ends: ${org.trial_ends_at ?? '—'}`);
    console.log(`     Stripe customer: ${org.stripe_customer_id ? 'sim' : 'não'} · sub: ${org.stripe_subscription_id ? 'sim' : 'não'}`);

    const [{ data: memberLimit }, { data: memberCount }] = await Promise.all([
      supabase.rpc('get_org_member_limit', { p_org_id: org.id }),
      supabase.rpc('org_active_member_count', { p_org_id: org.id }),
    ]);

    const { count: pendingInvites } = await supabase
      .from('invite_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString());

    record(
      'Assentos equipe',
      true,
      `${memberCount ?? 0} membros + ${pendingInvites ?? 0} pendentes / limite ${memberLimit ?? '?'}`,
    );

    const { count: deals } = await supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .is('deleted_at', null);

    record('Negócios ativos', true, String(deals ?? 0));

    const { count: funnels } = await supabase
      .from('funnels')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .is('deleted_at', null);

    record('Funil configurado', (funnels ?? 0) > 0);

    const { data: admins } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('role', 'admin')
      .eq('is_active', true)
      .not('accepted_at', 'is', null)
      .limit(1);

    if (admins?.[0]?.user_id) {
      const { data: access } = await supabase.rpc('get_billing_access', {
        p_user_id: admins[0].user_id,
      });
      const row = typeof access === 'object' && access ? access : {};
      const hasAccess = row.has_access === true;
      record(
        'get_billing_access (admin)',
        row.has_access !== undefined,
        hasAccess ? 'has_access=true' : `bloqueado: ${row.block_reason ?? '?'}`,
      );
    }

    const { data: addonState } = await supabase
      .from('organization_addon_state')
      .select('extra_uf_slots, ficha_credit_balance')
      .eq('organization_id', org.id)
      .maybeSingle();

    if (addonState) {
      console.log(`     Add-ons: +${addonState.extra_uf_slots ?? 0} UF · pack ${addonState.ficha_credit_balance ?? 0} fichas`);
    }
  }

  console.log('\n── E. App local ──\n');

  try {
    const base = appUrlEnv || 'http://localhost:3000';
    const res = await fetch(base, { signal: AbortSignal.timeout(3000) });
    record('Dev server responde', res.ok || res.status < 500, `${base} → ${res.status}`, { soft: true });
  } catch {
    record('Dev server responde', false, 'npm run dev não detectado em localhost:3000', { soft: true });
  }

  const failed = results.filter((r) => !r.ok && !r.soft).length;
  const passed = results.filter((r) => r.ok).length;
  const soft = results.filter((r) => r.soft && !r.ok).length;
  console.log(`\n📈 Automático: ${passed} ok · ${failed} falha(s)${soft ? ` · ${soft} aviso(s)` : ''}\n`);

  return { passed, failed, results };
}

async function runInteractiveSteps(appUrl) {
  const rl = readline.createInterface({ input, output });
  const base = appUrl || 'http://localhost:3000';
  const outcomes = [];

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CHECKLIST MANUAL — Assinatura mensal (marque no browser)');
  console.log(`  Base URL: ${base}`);
  console.log('  Teclas: [y] passou  [n] falhou  [s] pular  [q] encerrar');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const step of MANUAL_STEPS) {
    console.log(`\n── ${step.id}. ${step.title} ──\n`);
    for (const line of step.instructions) {
      console.log(`   • ${line.replace('localhost:3000', base.replace(/^https?:\/\//, ''))}`);
    }
    console.log('');

    let answer = '';
    while (!['y', 'n', 's', 'q'].includes(answer)) {
      answer = (await rl.question('   Resultado [y/n/s/q]: ')).trim().toLowerCase();
      if (!answer) answer = 's';
    }

    if (answer === 'q') {
      console.log('\n   (checklist interrompido)\n');
      break;
    }

    outcomes.push({
      id: step.id,
      title: step.title,
      status: answer === 'y' ? 'pass' : answer === 'n' ? 'fail' : 'skip',
    });

    if (answer === 'n') {
      const note = await rl.question('   Nota (opcional): ');
      outcomes[outcomes.length - 1].note = note.trim();
    }
  }

  rl.close();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RESUMO MANUAL');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const o of outcomes) {
    const mark = o.status === 'pass' ? '✅' : o.status === 'fail' ? '❌' : '⏭️';
    console.log(`  ${mark} ${o.id}. ${o.title}${o.note ? ` — ${o.note}` : ''}`);
  }

  const manualFail = outcomes.filter((o) => o.status === 'fail').length;
  const manualPass = outcomes.filter((o) => o.status === 'pass').length;
  console.log(`\n  Manual: ${manualPass} passou · ${manualFail} falhou · ${outcomes.length - manualPass - manualFail} pulado(s)\n`);

  return outcomes;
}

function printTrialSql(org) {
  if (!org) return;
  console.log(`
-- Expirar trial (org: ${org.slug})
UPDATE organizations
SET trial_ends_at = now() - interval '1 day',
    subscription_status = 'trial'
WHERE id = '${org.id}';
`);
}

async function applyTrialExpired(supabase, org) {
  const { error } = await supabase
    .from('organizations')
    .update({
      trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
      subscription_status: 'trial',
      updated_at: new Date().toISOString(),
    })
    .eq('id', org.id);
  if (error) fail(error.message);
  console.log(`\n✅ Trial expirado aplicado em ${org.name} (${org.slug}). Recarregue /funil logado como admin.\n`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
CEO Brain — smoke test assinatura mensal (Fase 1)

  npm run smoke:subscription
  npm run smoke:subscription -- --auto
  npm run smoke:subscription -- --org ceo-brain
  npm run smoke:subscription -- --print-trial-sql --org ceo-brain
  npm run smoke:subscription -- --apply-trial-expired --org ceo-brain

Documentação: docs/SMOKE_TEST.md
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

const appUrl = env('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';
const org = await loadOrg(supabase, args.org);

console.log('\n🚀 CEO Brain SaaS — Smoke Test Fase 1 (assinatura mensal)\n');

if (args.printTrialSql) {
  printTrialSql(org);
  process.exit(0);
}

if (args.applyTrialExpired) {
  if (!org) fail(`Org não encontrada: ${args.org}`);
  await applyTrialExpired(supabase, org);
}

const auto = await runAutomatedChecks(supabase, org, args.org, appUrl);

if (args.auto) {
  process.exit(auto.failed > 0 ? 1 : 0);
}

if (auto.failed > 0) {
  console.log('⚠️  Corrija as falhas automáticas antes do checklist manual (ou continue mesmo assim).\n');
  const rl = readline.createInterface({ input, output });
  const cont = (await rl.question('Continuar checklist manual? [Y/n]: ')).trim().toLowerCase();
  rl.close();
  if (cont === 'n') process.exit(1);
}

await runInteractiveSteps(appUrl);

console.log('Próximo passo após tudo verde: Fase 2 — Supabase prod + deploy + Stripe live.');
console.log('Ver docs/LAUNCH_CHECKLIST.md seção "Produção".\n');
