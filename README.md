# CEO Brain SaaS

Monorepo do CEO Brain — CRM de funil de vendas com IA, CNPJ e equipes.

## Estrutura

```
apps/web/           → Next.js (em construção)
packages/shared/    → Tipos e constantes compartilhados
supabase/           → Migrations e Edge Functions
legacy/             → Snapshot HTML original (referência)
```

## Pré-requisitos

- Node.js 20+
- npm 10+ (ou pnpm 9+)
- [Supabase CLI](https://supabase.com/docs/guides/cli) via `npx supabase`

## 1. Configurar ambiente

```bash
npm install
cp .env.example apps/web/.env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## 2. Staging Supabase

O projeto **ceobrain-saas** (`zwevbdomvopddxvjildi`) já está provisionado com schema relacional.

Guia completo: **[docs/STAGING.md](./docs/STAGING.md)**

```bash
cp .env.example apps/web/.env.local
# Preencha a anon key (dashboard → Settings → API)
npm run dev
```

Rotas: `/login` · `/register` · `/funil` (protegida)

## 3. Migrations locais

As migrations em `supabase/migrations/` espelham o staging. As migrations blob antigas estão em `supabase/migrations_archive/` (obsoletas).

### Opção A — Supabase CLI (recomendado)

```bash
# Login (uma vez)
npx supabase login

# Vincular ao projeto staging (ref = ID do projeto no dashboard)
npx supabase link --project-ref SEU_PROJECT_REF

# Aplicar migrations
pnpm db:push
```

### Opção B — SQL Editor manual

1. Abra [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto **staging**
2. SQL Editor → New query
3. Execute cada arquivo em `supabase/migrations/` **na ordem** (001 → 007)

## 3. Validar onboarding

Após as migrations, crie um usuário de teste em **Authentication → Users**.

O trigger `handle_new_user` deve criar automaticamente:

- `organizations`
- `organization_members` (admin)
- `subscriptions` (trial 14 dias)
- `org_data` (funil vazio)

## Scripts

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Next.js em desenvolvimento |
| `pnpm db:push` | Aplica migrations no projeto linkado |
| `pnpm db:status` | Lista migrations aplicadas |

## Projeto Supabase legado

O `ceo_brain.html` original aponta para:

- URL: `https://gzsnxnjmvovqyzjslblh.supabase.co`

Recomenda-se criar um **projeto staging separado** para o SaaS e manter o legado até a migração completa.

## Documentação

- [docs/RUNBOOK.md](./docs/RUNBOOK.md) — operações e checklist
- [docs/MIGRATION-FROM-HTML.md](./docs/MIGRATION-FROM-HTML.md) — migrar dados do HTML
