# Staging — ceobrain-saas

| Campo | Valor |
|-------|-------|
| **Projeto** | ceobrain-saas |
| **Ref** | `zwevbdomvopddxvjildi` |
| **URL** | https://zwevbdomvopddxvjildi.supabase.co |
| **Região** | sa-east-1 |

## Schema (fonte da verdade)

O staging **já tinha** schema relacional SaaS (não usar migrations blob do `migrations_archive/`).

### Tabelas principais

- `organizations` — org + subscription_status + trial + Stripe
- `organization_members` — admin / member / viewer
- `profiles` — perfil do usuário
- `plans` — planos com features JSON
- `funnels` — funil com `stages[]`
- `opportunities` — deals (Kanban)
- `contacts` — contatos
- `activity_logs` — auditoria
- `usage_counters`, `ai_requests`, `cnpj_queries` — quotas (adicionado hoje)

### Funções RLS

- `is_member_of(org_id)`
- `is_admin_of(org_id)`
- `get_user_organization(user_id)`

### Onboarding

Trigger `on_auth_user_created` → `handle_new_user()`:

1. Cria `profiles`
2. Cria `organizations` (trial 14d)
3. Cria `organization_members` (admin)
4. Cria `funnels` padrão

## Migrations aplicadas hoje

1. `enable_plans_rls` — RLS leitura em `plans`
2. `usage_counters_and_onboarding` — usage + onboarding completo

Arquivos locais espelhados em `supabase/migrations/202606250000*.sql`

## Legado

| Projeto | Ref | Uso |
|---------|-----|-----|
| ceo-brain | `gzsnxnjmvovqyzjslblh` | HTML monolítico |
| ceobrain-saas | `zwevbdomvopddxvjildi` | **SaaS Next.js** |

## Validar

```sql
SELECT name, subscription_status, trial_ends_at FROM organizations;
SELECT name, stages FROM funnels;
SELECT * FROM usage_counters LIMIT 5;
```

## App local

```bash
npm install
npm run dev
# http://localhost:3000/login
```

Credenciais em `apps/web/.env.local`.
