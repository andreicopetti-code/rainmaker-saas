# Billing — Fase 1 (Stripe test mode)

Guia para fechar o fluxo comercial **hoje** no ambiente local + staging Supabase.

## Pré-requisitos

- Conta [Stripe](https://dashboard.stripe.com) em **modo teste**
- Projeto Supabase staging: `zwevbdomvopddxvjildi`
- Node 20+

## 1. Chaves no `.env.local`

Edite [`apps/web/.env.local`](../apps/web/.env.local):

```env
NEXT_PUBLIC_SUPABASE_URL=https://zwevbdomvopddxvjildi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # Dashboard → Settings → API → service_role

STRIPE_SECRET_KEY=sk_test_...          # Stripe → Developers → API keys
STRIPE_PRICE_PRO_MONTHLY=              # preenchido pelo script abaixo
STRIPE_WEBHOOK_SECRET=                 # opcional em dev (ver passo 4)

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Onde pegar a service_role:** Supabase Dashboard → Project Settings → API → `service_role` (secret).

**Sem `SUPABASE_SERVICE_ROLE_KEY`:** checkout funciona, mas webhook e sync pós-pagamento falham.

## 2. Criar produto e preço no Stripe

Na raiz do repositório:

```powershell
npm run billing:setup
```

O script:
- Cria produto **CEO Brain** e preço **R$ 99/mês** (BRL) no Stripe test
- Grava `stripe_price_monthly_id` na tabela `plans`
- Mostra as linhas para colar no `.env.local`

Reinicie o dev server após salvar o `.env.local`:

```powershell
npm run dev
```

## 3. Testar checkout

1. Login como **admin** da org (ex.: `andreicopetti@gmail.com`)
2. Abra http://localhost:3000/billing
3. Clique **Assinar agora**
4. Cartão de teste: `4242 4242 4242 4242` · qualquer validade/CVC
5. Após pagamento → retorno para `/billing?success=1&session_id=...`
6. Status deve mudar para **Assinatura ativa** e o funil volta a liberar

## 4. Webhook (opcional em dev, obrigatório em prod)

O app confirma a assinatura no retorno do Checkout (`confirmCheckoutSession`).  
Para cancelamentos e falhas de pagamento, configure o webhook:

### Local (Stripe CLI)

Instale: https://stripe.com/docs/stripe-cli

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copie o `whsec_...` exibido para `STRIPE_WEBHOOK_SECRET` no `.env.local` e reinicie o dev server.

### Produção

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://SEU_DOMINIO/api/stripe/webhook`
- Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

## 5. Customer Portal

Stripe Dashboard → **Settings → Billing → Customer portal** → Activate.

Permite ao admin cancelar cartão, ver faturas e cancelar assinatura (**Gerenciar assinatura** no app).

## 6. Testar trial expirado

No SQL Editor do Supabase:

```sql
UPDATE organizations
SET subscription_status = 'trial',
    trial_ends_at = now() - interval '1 day'
WHERE slug = 'ceo-brain';
```

- Rotas protegidas redirecionam para `/billing`
- Após assinar, `subscription_status` vira `active`

## 7. Checklist “Fase 1 fechada”

- [ ] `STRIPE_SECRET_KEY` + `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`
- [ ] `npm run billing:setup` executado sem erro
- [ ] Checkout teste concluído → status **Assinatura ativa**
- [ ] Funil acessível após assinatura
- [ ] Portal do cliente abre (Stripe portal ativado)
- [ ] (Prod) Webhook configurado no Stripe live

## Arquivos principais

| Arquivo | Função |
|---------|--------|
| `apps/web/src/app/billing/actions.ts` | Checkout, portal, confirmação |
| `apps/web/src/lib/billing/checkout-sync.ts` | Sync org após pagamento |
| `apps/web/src/app/api/stripe/webhook/route.ts` | Eventos Stripe |
| `apps/web/src/lib/supabase/middleware.ts` | Bloqueio trial expirado |
| `scripts/setup-stripe-billing.mjs` | Setup automático test mode |
