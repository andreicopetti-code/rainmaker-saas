#!/usr/bin/env node
/**
 * Cria produtos/preços no Stripe para planos pagos + add-ons.
 * Grava stripe_price_monthly_id em public.plans (via features.slug).
 *
 * Uso:
 *   npm run billing:setup              # test + apps/web/.env.local
 *   npm run billing:setup -- --live    # live + ceobrain-prod
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webEnvPath = resolve(__dirname, '../apps/web/.env.local');
const syncEnvPath = resolve(__dirname, 'empresaqui-sync/.env');
const LIVE = process.argv.includes('--live');

const PAID_PLANS = [
  { slug: 'regional_1', name: 'CEO Brain — Regional 1', amount: 9900, desc: '1 UF · 20 fichas/dia · 3 usuários' },
  { slug: 'regional_3', name: 'CEO Brain — Regional 3', amount: 24900, desc: '3 UFs · 50 fichas/dia · 8 usuários' },
  { slug: 'nacional', name: 'CEO Brain — Nacional', amount: 39900, desc: 'Brasil + DF · 80 fichas/dia · 15 usuários' },
];

const ADDONS = [
  { slug: 'uf_extra', name: 'CEO Brain — +1 UF', amount: 4900, recurring: true },
  { slug: 'pack_50', name: 'CEO Brain — Pacote 50 fichas', amount: 2900, recurring: false },
  { slug: 'pack_200', name: 'CEO Brain — Pacote 200 fichas', amount: 8900, recurring: false },
];

const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
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

const fileEnv = { ...loadEnvFile(webEnvPath), ...loadEnvFile(syncEnvPath) };
function env(name) {
  return process.env[name] || fileEnv[name] || '';
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const STRIPE_SECRET_KEY = LIVE
  ? env('STRIPE_SECRET_KEY_LIVE') || env('STRIPE_SECRET_KEY')
  : env('STRIPE_SECRET_KEY');
const SUPABASE_URL = LIVE
  ? env('PROD_SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')
  : env('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE = LIVE
  ? env('PROD_SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  : env('SUPABASE_SERVICE_ROLE_KEY');

if (!STRIPE_SECRET_KEY) {
  fail(
    LIVE
      ? 'Defina STRIPE_SECRET_KEY_LIVE (sk_live_…) em scripts/empresaqui-sync/.env ou apps/web/.env.local'
      : 'Defina STRIPE_SECRET_KEY em apps/web/.env.local',
  );
}
if (LIVE && !STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  fail('Modo --live exige chave sk_live_…');
}
if (!LIVE && STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  fail('Chave live detectada sem --live. Use: npm run billing:setup -- --live');
}
if (!SUPABASE_URL || !SERVICE_ROLE) {
  fail('Defina URL e service_role do Supabase (prod: PROD_SUPABASE_* )');
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`\n🔧 CEO Brain — setup Stripe (${LIVE ? 'LIVE' : 'test'})`);
console.log(`   Supabase: ${SUPABASE_URL}\n`);

const { data: dbPlans, error: plansErr } = await supabase
  .from('plans')
  .select('id, name, features, stripe_price_monthly_id');

if (plansErr) fail(plansErr.message);

async function ensureRecurringPrice(planRow, catalog) {
  let priceId = planRow.stripe_price_monthly_id?.trim() || '';
  if (priceId) {
    try {
      await stripe.prices.retrieve(priceId);
      console.log(`✓ ${catalog.name}: ${priceId} (existente)`);
      return priceId;
    } catch {
      console.log(`⚠ ${catalog.name}: price inválido, recriando…`);
      priceId = '';
    }
  }

  const product = await stripe.products.create({
    name: catalog.name,
    description: catalog.desc,
    metadata: { app: 'ceo-brain', plan_slug: catalog.slug, plan_id: planRow.id },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: catalog.amount,
    currency: 'brl',
    recurring: { interval: 'month' },
    metadata: { plan_slug: catalog.slug, plan_id: planRow.id },
  });

  await supabase
    .from('plans')
    .update({ stripe_price_monthly_id: price.id })
    .eq('id', planRow.id);

  console.log(`✓ ${catalog.name}: ${price.id} (R$ ${catalog.amount / 100}/mês)`);
  return price.id;
}

const envLines = [];

for (const catalog of PAID_PLANS) {
  const row = (dbPlans ?? []).find((p) => p.features?.slug === catalog.slug);
  if (!row) {
    console.log(`⚠ Plano ${catalog.slug} não encontrado no banco — aplique a migration pricing_plans_matrix`);
    continue;
  }
  const priceId = await ensureRecurringPrice(row, catalog);
  if (catalog.slug === 'regional_1') {
    envLines.push(`STRIPE_PRICE_PRO_MONTHLY=${priceId}`);
  }
}

console.log('\n── Add-ons ──\n');

for (const addon of ADDONS) {
  const existing = await supabase
    .from('billing_addon_prices')
    .select('stripe_price_id')
    .eq('slug', addon.slug)
    .maybeSingle();

  let priceId = existing.data?.stripe_price_id?.trim() || '';
  if (priceId) {
    try {
      await stripe.prices.retrieve(priceId);
      console.log(`✓ ${addon.name}: ${priceId} (existente)`);
      envLines.push(`STRIPE_${addon.slug.toUpperCase()}_PRICE=${priceId}`);
      await supabase.from('billing_addon_prices').upsert({
        slug: addon.slug,
        stripe_price_id: priceId,
        billing: addon.recurring ? 'recurring' : 'one_time',
        updated_at: new Date().toISOString(),
      });
      continue;
    } catch {
      priceId = '';
    }
  }

  const product = await stripe.products.create({
    name: addon.name,
    metadata: { app: 'ceo-brain', addon_slug: addon.slug },
  });

  const priceParams = {
    product: product.id,
    unit_amount: addon.amount,
    currency: 'brl',
    metadata: { addon_slug: addon.slug },
  };

  const price = addon.recurring
    ? await stripe.prices.create({ ...priceParams, recurring: { interval: 'month' } })
    : await stripe.prices.create(priceParams);

  await supabase.from('billing_addon_prices').upsert({
    slug: addon.slug,
    stripe_price_id: price.id,
    billing: addon.recurring ? 'recurring' : 'one_time',
    updated_at: new Date().toISOString(),
  });

  console.log(`✓ ${addon.name}: ${price.id} (R$ ${addon.amount / 100}${addon.recurring ? '/mês' : ' único'})`);
  envLines.push(`STRIPE_${addon.slug.toUpperCase()}_PRICE=${price.id}`);
}

console.log('\n── Price IDs ──\n');
for (const line of envLines) console.log(line);

if (LIVE) {
  const webhookUrl = 'https://www.rainmaker.ia.br/api/stripe/webhook';
  console.log('\n── Webhook (live) ──\n');

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = existing.data.find((e) => e.url === webhookUrl);

  if (endpoint) {
    endpoint = await stripe.webhookEndpoints.update(endpoint.id, {
      enabled_events: WEBHOOK_EVENTS,
      description: 'RainMaker production',
    });
    console.log(`✓ Webhook já existia: ${endpoint.id}`);
    console.log('  (secret só aparece na criação — use o whsec_ já salvo na Vercel ou recrie o endpoint)');
  } else {
    endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: WEBHOOK_EVENTS,
      description: 'RainMaker production',
    });
    console.log(`✓ Webhook criado: ${endpoint.id}`);
    if (endpoint.secret) {
      console.log(`✓ STRIPE_WEBHOOK_SECRET=${endpoint.secret.slice(0, 12)}…`);
      const line = `\n# Stripe live webhook (gerado por billing:setup --live)\nSTRIPE_WEBHOOK_SECRET_LIVE=${endpoint.secret}\n`;
      if (existsSync(syncEnvPath)) {
        appendFileSync(syncEnvPath, line);
        console.log('  Gravado em scripts/empresaqui-sync/.env como STRIPE_WEBHOOK_SECRET_LIVE');
      }
    }
  }
}

console.log(
  LIVE
    ? '\nPróximo: colar STRIPE_SECRET_KEY (live) + STRIPE_WEBHOOK_SECRET (live) na Vercel Production e redeploy.\n'
    : '\nPróximo: npm run dev → /precos ou /billing\n',
);
