# Checklist — Pronto para assinar

Estado do **CEO Brain SaaS** com base no código em `ceo_brain_cursor` (jul/2026).  
Ambiente atual de desenvolvimento: **staging** Supabase `zwevbdomvopddxvjildi` + Stripe **test mode** + `localhost`.

Legenda: ✅ feito · ⚠️ parcial · ❌ pendente

---

## Resumo executivo

| Área | Status | Comentário |
|------|--------|------------|
| Billing / Stripe (mensal) | ⚠️ | Checkout, webhook, portal, cancel→Free OK; **sem anual** |
| Planos e limites | ✅ | Core enforced no app + RPCs |
| Equipe e convites | ⚠️ | Convites, limites, rename OK; falta remover membro |
| Negócios (funil) | ✅ | Dono, RLS, lixeira |
| Auth / onboarding | ✅ | Trial 14d Regional 1 |
| Módulos principais | ✅ | Funil, agenda, contatos, dashboard, CEO IA, e-mails, empresas |
| Add-ons | ⚠️ | UF extra + packs OK; 1 slot UF extra por design |
| Segurança | ⚠️ | RLS sólido; middleware fail-open em erro de billing |
| Produção | ❌ | Sem projeto prod, deploy ou Stripe live documentados |
| QA automatizado | ❌ | Scripts manuais apenas |

**Veredicto:** o produto **já é o SaaS real** (não protótipo), mas **não está pronto para abrir assinaturas em produção** sem fechar infra + hardening abaixo.

---

## 1. Billing e Stripe

| Item | Status | Onde |
|------|--------|------|
| Checkout planos pagos (mensal) | ✅ | `apps/web/src/app/billing/actions.ts` → `createCheckoutSession` |
| Confirmação pós-pagamento | ✅ | `lib/billing/checkout-sync.ts`, `BillingPanel.tsx` |
| Webhooks Stripe | ✅ | `apps/web/src/app/api/stripe/webhook/route.ts` |
| Customer Portal (cancelar / faturas) | ✅ | `createPortalSession` |
| Sync plano ← price Stripe | ✅ | `lib/billing/sync.ts` → `resolvePlanIdFromStripePrice` |
| Cancelamento → plano Free | ✅ | `applyDowngradeToFree()` em `sync.ts` |
| Setup Stripe test mode | ✅ | `npm run billing:setup` → `scripts/setup-stripe-billing.mjs` |
| Checkout add-ons (UF + packs) | ✅ | `createAddonCheckoutSession`, `lib/billing/addon-sync.ts` |
| Upgrade/downgrade in-app | ⚠️ | Só via Portal Stripe quando já ativo |
| **Billing anual** | ❌ | `price_annual` na UI/docs; checkout usa só mensal |
| Stripe **live** + webhook prod | ❌ | Só documentado test mode (`docs/BILLING_SETUP.md`) |

### Smoke test manual (staging)

Rodar o script interativo (Fase 1):

```powershell
npm run smoke:subscription
```

Ver guia completo: [`docs/SMOKE_TEST.md`](./SMOKE_TEST.md)

- [ ] Admin assina Regional 1 com cartão `4242…`
- [ ] Funil liberado após pagamento
- [ ] Portal abre e cancelamento → status Free + acesso mantido
- [ ] Add-on pack fichas incrementa saldo
- [ ] Add-on +1 UF incrementa slots (com plano pago)

---

## 2. Planos e limites

Fonte de verdade: `packages/shared/src/constants/plans.ts` + `plans.features` no banco.

| Limite | Status | Enforcement |
|--------|--------|-------------|
| `max_deals` | ✅ | `funil/actions.ts`, `empresas/actions.ts` |
| `max_members` | ✅ | RPC `get_org_member_limit`, `team-actions.ts` |
| Fichas CNPJ (dia/mês) | ✅ | RPC `consume_cnpj_credit`, `get_cnpj_daily_usage` |
| Pack fichas (crédito extra) | ✅ | `organization_addon_state.ficha_credit_balance` |
| IA mensal | ✅ | `ceo/actions.ts` + `usage_counters` |
| UFs permitidas | ✅ | `organization_allowed_ufs`, `lib/billing/org-uf-access.ts` |
| `emails_enabled` | ✅ | Gate em `emails/page.tsx` |
| `ceo_brain_enabled` | ✅ | Gate em `ceo/page.tsx` |
| Preview CNPJ sem UF | ✅ | `searchCnpjPreview` aberto; ficha completa bloqueada por UF |
| Escolha de UFs | ✅ | `OrganizationUfSelector`, `configuracoes/actions.ts` |
| `import_enabled` | ❌ | Feature no plano; import **não** bloqueado por plano |
| Quota envio e-mail | ❌ | Contador existe; limite por plano não enforced |
| Limite deals atômico (race) | ⚠️ | COUNT no app; sem RPC única |

### Matriz de planos (referência)

| Plano | Usuários | Deals | Fichas | IA/mês |
|-------|----------|-------|--------|--------|
| Free | 1 | 30 | 3/mês | 30 |
| Regional 1 | 3 | 500 | 20/dia | 200 |
| Regional 3 | 8 | 2.000 | 50/dia | 500 |
| Nacional | 15 | 99.999 | 80/dia | 1.000 |

---

## 3. Equipe

| Item | Status | Onde |
|------|--------|------|
| Convidar membro (admin) | ✅ | `team-actions.ts` → `createTeamInvite` |
| Convite pendente conta no limite | ✅ | membros + pendentes ≥ `max_members` |
| Aceitar convite | ✅ | `/convite/[token]`, `acceptTeamInvite` |
| Revogar convite | ✅ | `revokeTeamInvite` |
| Renomear equipe | ✅ | `updateOrganizationName`, `OrganizationTeamPanel` |
| Admin vs membro (billing, convites) | ✅ | `role === 'admin'` |
| Membro só vê próprios negócios | ✅ | RLS + `funil/page.tsx` |
| Desativar org pessoal ao aceitar convite | ✅ | `acceptTeamInvite` |
| Remover membro / mudar role | ❌ | — |
| E-mail transacional de convite | ❌ | Só copiar link |
| Papel `viewer` | ❌ | Enum existe; não usado |

### QA virtual (sem criar usuários)

```powershell
npm run test:member-limits
npm run test:member-limits -- --seed-pending 1    # bloqueia botão Convidar
npm run test:member-limits -- --cleanup-seed
npm run test:member-limits -- --apply-plan free   # testa limite na UI
```

---

## 4. Negócios (oportunidades)

| Item | Status | Onde |
|------|--------|------|
| Dono automático ao cadastrar | ✅ | `owner_id` em `createOpportunity` |
| Admin reatribui responsável | ✅ | `OpportunityModal` + `resolveDealOwnerId` |
| RLS visibilidade | ✅ | `20260706240000_opportunity_owner_visibility.sql` |
| Soft delete / lixeira 30d | ✅ | RPCs + `TrashPanel.tsx` |
| Restaurar / apagar definitivo | ✅ | `restore_opportunity`, `hard_delete_opportunity` |

---

## 5. Auth e onboarding

| Item | Status | Onde |
|------|--------|------|
| Cadastro → org + funil + admin | ✅ | `handle_new_user()` |
| Trial 14 dias (limites Regional 1) | ✅ | `20260702143000_pricing_plans_matrix.sql` |
| Trial expirado → `/billing` | ✅ | `get_billing_access`, `middleware.ts` |
| Plano Free após cancelamento | ✅ | `20260706210000_billing_access_free_plan.sql` |
| Login / registro / reset senha | ✅ | `app/login`, `register`, `auth/*` |
| Wizard onboarding (UF, plano) | ⚠️ | Usuário cai direto no funil |
| Cadastro direto no Free | ❌ | Sempre trial Regional 1 |

---

## 6. Módulos do produto

| Módulo | Rota | Status |
|--------|------|--------|
| Funil (Kanban) | `/funil` | ✅ |
| Agenda | `/agenda` | ✅ |
| Contatos | `/contatos` | ✅ |
| Dashboard | `/dashboard` | ✅ |
| CEO Brain IA | `/ceo` | ✅ (requer `GROQ_API_KEY`) |
| E-mails | `/emails` | ✅ (requer plano + `RESEND_API_KEY`) |
| Empresas / CNPJ | `/empresas` | ✅ |
| Configurações | `/configuracoes` | ✅ |
| Preços | `/precos` | ✅ |
| Billing | `/billing` | ✅ |

---

## 7. Add-ons

| Add-on | Status | Notas |
|--------|--------|-------|
| +1 UF (`uf_extra`) | ✅ | Recorrente; bloqueado no Free |
| Pack 50 / 200 fichas | ✅ | Pagamento único; crédito consumível |
| Múltiplos +1 UF (qty) | ⚠️ | Contador `extra_uf_slots`; não escala por qty Stripe |

---

## 8. Segurança

| Item | Status | Notas |
|------|--------|-------|
| RLS em tabelas sensíveis | ✅ | org, members, opportunities, invites, usage… |
| RPCs SECURITY DEFINER críticos | ✅ | delete, trash, CNPJ, billing access |
| Middleware auth | ✅ | Rotas protegidas |
| Billing gate | ⚠️ | Fail-open se RPC falhar (`check-access.ts`) |
| Rate limiting API | ❌ | — |
| Headers CSP / segurança | ❌ | — |

---

## 9. Produção (blockers de go-live)

| Item | Status | Ação |
|------|--------|------|
| Projeto Supabase **produção** | ❌ | Criar projeto; `db push` migrations |
| Deploy (Vercel/host) | ❌ | Configurar + `NEXT_PUBLIC_APP_URL` |
| Stripe **live** | ❌ | Keys live, webhook prod, portal ativo |
| Resend domínio verificado | ❌ | E-mails transacionais |
| Groq / IA produção | ⚠️ | Key + limites monitorados |
| Backup antes de migration prod | ❌ | Ver `docs/RUNBOOK.md` |
| CI/CD / testes automáticos | ❌ | — |
| Monitoramento / alertas | ❌ | — |

### Variáveis de ambiente (prod)

Ver `.env.example`. Mínimo:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` (domínio real)
- `GROQ_API_KEY`, `RESEND_API_KEY` (se módulos ativos)

---

## 10. Documentação vs código

| Documento | Status |
|-----------|--------|
| `docs/PRICING_MATRIX.md` seção "pendente" | **Desatualizada** — ver tabela abaixo |
| `docs/RUNBOOK.md` | Parcial — referências a schema antigo |
| `README.md` | Parcial — ainda "em construção" |
| Este checklist | Atualizado com o código |

### Itens que `PRICING_MATRIX.md` ainda marca pendente mas **já estão feitos**

- Limites `max_deals` / `max_members`
- Checkout de add-ons
- Downgrade Free após cancelamento
- IA via `usage_counters`
- Bloqueio UF em ficha completa (+ seletor de UFs)

### Ainda pendentes (não estavam na doc ou continuam abertos)

- Billing anual
- Limite envio e-mail
- `import_enabled` por plano
- Infra produção

---

## Ordem sugerida para abrir assinaturas

1. **Smoke test Fase 1** — `npm run smoke:subscription` (ver `docs/SMOKE_TEST.md`)
2. **Fechar falhas** do smoke test em staging
3. **Criar Supabase prod** + aplicar `supabase/migrations/*`
3. **Deploy** + env prod + Stripe live + webhook
4. **Decidir billing anual** — implementar checkout ou remover da página `/precos`
5. **Hardening** — middleware billing fail-closed ou alerta; revisar edge cases (org com mais membros que Free permite)
6. **Atualizar docs** — README, PRICING_MATRIX, RUNBOOK
7. **Conta piloto real** — 1 cliente interno antes de marketing

---

## O que já vale como “produto definitivo”

Estas entregas **fazem parte do SaaS assinável** (não são experimentos descartáveis):

- Multi-tenant (org + membros + RLS)
- Matriz de planos e limites
- Stripe billing lifecycle
- Equipes, convites, limite de assentos
- Funil com ownership e visibilidade por papel
- Módulos Empresas, CEO IA, e-mails (com gates de plano)

O que falta é sobretudo **infra produção**, **polish comercial** (anual, e-mails de convite) e **QA automatizado** — não reescrever o core.

---

*Gerado a partir do repositório `ceo_brain_cursor`. Revisar após cada sprint antes do go-live.*
