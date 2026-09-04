# RainMaker

CRM comercial com funil, CNPJ, equipes e copiloto de IA (**RM IA**).

Produção: [www.rainmaker.ia.br](https://www.rainmaker.ia.br)

O repositório no GitHub ainda se chama `ceobrain-saas`. O produto, a marca e este monorepo são **RainMaker**.

## Estrutura

```
apps/web/                 Next.js (app RainMaker)
packages/shared/          Tipos e constantes compartilhados
supabase/                 Migrations e Edge Functions
tools/empresa-cleaner/    Preparo de CSVs de empresas por UF
scripts/empresaqui-sync/  Sync/ingest da base Empresaqui
docs/                     Runbook, staging, billing, arquitetura
legacy/                   Snapshot HTML original (só referência de migração)
```

## Pré-requisitos

- Node.js 20+
- npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) via `npx supabase`

## Setup local

```bash
npm install
cp .env.example apps/web/.env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Rotas: `/login` · `/register` · `/funil` (protegida)

Staging: **[docs/STAGING.md](./docs/STAGING.md)** (projeto Supabase `zwevbdomvopddxvjildi`).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | App Next.js |
| `npm run db:push` | Aplica migrations no projeto linkado |
| `npm run db:status` | Lista migrations aplicadas |
| `npm run empresas:prepare` | Prepara CSVs de empresas por estado |

## Documentação

- [docs/RUNBOOK.md](./docs/RUNBOOK.md) — operações
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — hospedagem e bancos
- [docs/STAGING.md](./docs/STAGING.md) — staging Supabase
- [docs/MIGRATION-FROM-HTML.md](./docs/MIGRATION-FROM-HTML.md) — dados do HTML legado
