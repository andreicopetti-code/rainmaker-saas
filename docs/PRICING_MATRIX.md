# Matriz de preços — CEO Brain

Fonte de verdade no código: [`packages/shared/src/constants/plans.ts`](../packages/shared/src/constants/plans.ts)

Página pública: `/precos`  
Checkout: `/billing?plan=regional_1|regional_3|nacional`

---

## Planos principais

| Slug | Nome | R$/mês | R$/ano | UFs | Fichas | Deals | Usuários | IA/mês | E-mail |
|------|------|--------|--------|-----|--------|-------|----------|--------|--------|
| `free` | Free | 0 | 0 | Preview | 3/mês | 30 | 1 | 30 | Não |
| `regional_1` | Regional 1 | 99 | 990 | 1 | 20/dia | 500 | 3 | 200 | Sim |
| `regional_3` | Regional 3 | 249 | 2490 | 3 | 50/dia | 2.000 | 8 | 500 | Sim |
| `nacional` | Nacional | 399 | 3990 | 27 (+DF) | 80/dia | 99.999 | 15 | 1.000 | Sim |

**Trial:** 14 dias com limites do **Regional 1** (novos cadastros).

**Ficha completa:** desbloqueio de sócios, regime, contatos etc. na base Empresas. Preview CNPJ = dados básicos sem consumir ficha (Free).

---

## Complementos (add-ons)

| Slug | Nome | Preço | Tipo | Regra |
|------|------|-------|------|-------|
| `uf_extra` | +1 UF | R$ 49/mês | Recorrente | Só com plano pago; não abre UF no Free |
| `pack_50` | Pacote 50 fichas | R$ 29 | Único | Crédito extra nas UFs já contratadas |
| `pack_200` | Pacote 200 fichas | R$ 89 | Único | Idem |

Pacotes **não** substituem upgrade de plano para novas UFs.

---

## Stripe (test mode)

```powershell
npm run billing:setup
```

Cria preços mensais BRL para `regional_1`, `regional_3`, `nacional` e produtos add-on.  
Grava `stripe_price_monthly_id` na tabela `plans` (match por `features.slug`).

Migration: `20260702143000_pricing_plans_matrix.sql`

---

## Implementação pendente (pós-matriz)

> **Atualizado:** vários itens abaixo já foram implementados. Ver checklist completo em [`docs/LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

Estes limites **ainda** não estão 100% fechados ou a doc estava desatualizada:

- [x] ~~Bloqueio por UF em ficha completa~~ — `getEmpresaDetail` + seletor de UFs (`OrganizationUfSelector`)
- [x] ~~Escolha de UFs no upgrade~~ — Configurações / Billing
- [x] ~~`max_deals` / `max_members`~~ — funil + equipe + RPCs
- [x] ~~IA mensal via `usage_counters`~~ — `ceo/actions.ts`
- [x] ~~Checkout de add-ons~~ — `createAddonCheckoutSession` + webhook
- [x] ~~Downgrade Free após cancelamento~~ — `applyDowngradeToFree()`
- [ ] Preview CNPJ bloqueado por UF — **intencionalmente aberto** (só ficha completa consome)
- [ ] Billing **anual** (checkout)
- [ ] Limite de **envios de e-mail** por plano
- [ ] Gate `import_enabled` por plano
- [ ] Infra **produção** (Supabase prod, Stripe live, deploy)

---

## Env vars legado

| Variável | Uso |
|----------|-----|
| `STRIPE_PRICE_PRO_MONTHLY` | Fallback price ID → Regional 1 |
| `STRIPE_SECRET_KEY` | Obrigatório |
| `SUPABASE_SERVICE_ROLE_KEY` | Sync pós-checkout |

Novos planos usam `plans.stripe_price_monthly_id` no banco.
