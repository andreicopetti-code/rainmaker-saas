# Smoke test — Assinatura mensal (Fase 1)

Validação ponta a ponta do CEO Brain SaaS **antes de produção**.

## Comando principal

```powershell
npm run smoke:subscription
```

Isso executa:

1. **Verificações automáticas** — env, RPCs, planos, Stripe prices, estado da org
2. **Checklist interativo** — 8 passos no browser (y/n/s/q)

## Variantes

```powershell
# Só automático (CI / pré-commit staging)
npm run smoke:subscription -- --auto

# Outra org de teste
npm run smoke:subscription -- --org org-843758a32f22

# SQL para expirar trial manualmente
npm run smoke:subscription -- --print-trial-sql --org ceo-brain

# Expirar trial no staging (passo 2 do smoke test)
npm run smoke:subscription -- --apply-trial-expired --org ceo-brain
```

## Pré-requisitos

- `apps/web/.env.local` com Supabase + `SUPABASE_SERVICE_ROLE_KEY`
- `npm run billing:setup` já executado (price IDs no banco)
- `npm run dev` rodando em `http://localhost:3000`
- Stripe em **test mode** (`sk_test_…`)

## Checklist manual (8 passos)

| # | Fluxo |
|---|--------|
| 1 | Cadastro novo usuário → funil |
| 2 | Trial expirado → `/billing` |
| 3 | Checkout Regional 1 mensal |
| 4 | UF + ficha CNPJ |
| 5 | Limite membros / convites |
| 6 | Admin vs membro no funil |
| 7 | Cancelamento → Free |
| 8 | Add-on pack fichas |

## Helpers relacionados

```powershell
npm run test:member-limits -- --seed-pending 1
npm run test:member-limits -- --cleanup-seed
```

## Critério de saída

- Automático: **0 falhas** em `--auto`
- Manual: **8/8 passou** (ou falhas documentadas e corrigidas)

Só então seguir para **Fase 2** (`docs/LAUNCH_CHECKLIST.md` → Produção).
