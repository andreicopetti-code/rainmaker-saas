# Configurar Supabase Staging

## Opção recomendada: projeto staging novo

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → nome `ceo-brain-staging`
3. Anote:
   - **Project ref** (ex: `abcdefghijklmnop`)
   - **URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (só servidor, nunca no frontend)

4. Copie `.env.example` para `apps/web/.env.local` e preencha.

## Aplicar migrations via CLI

```powershell
cd "c:\Users\Andrei Copetti\Documents\02_EMPRESAS_E_PROJETOS\CEO Brain\ceo_brain_cursor"

# Login (abre o browser)
npx supabase login

# Vincular ao staging
npx supabase link --project-ref SEU_PROJECT_REF_STAGING

# Aplicar SQL
npm run db:push
```

Confirme com:

```powershell
npx supabase migration list
```

## Aplicar manualmente (SQL Editor)

Se preferir não usar CLI, abra o **SQL Editor** no dashboard e execute cada arquivo em ordem:

1. `supabase/migrations/20260624000001_extensions_enums.sql`
2. `...000002_organizations.sql`
3. `...000003_subscriptions.sql`
4. `...000004_org_data.sql`
5. `...000005_usage.sql`
6. `...000006_rls.sql`
7. `...000007_triggers.sql`

## Validar após aplicar

```sql
-- Deve listar as tabelas
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'organizations', 'organization_members', 'subscriptions',
    'org_data', 'usage_counters', 'invite_tokens'
  );
```

Crie um usuário em **Authentication → Users** e verifique:

```sql
select * from public.organizations;
select * from public.subscriptions;
select * from public.org_data;
```

## Projeto legado (cuidado)

O HTML em `legacy/ceo_brain.html` usa:

- **Project ref:** `gzsnxnjmvovqyzjslblh`
- **URL:** `https://gzsnxnjmvovqyzjslblh.supabase.co`

**Não aplique migrations no legado** até validar em staging. O projeto legado pode já ter tabelas com schemas diferentes (`empresas`, `user_data`).

Se quiser evoluir o legado in-place:

1. Faça backup no dashboard
2. Rode migrations em horário de baixo uso
3. A migration `000002` usa `IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS` para compatibilidade

## Troubleshooting

| Erro | Solução |
|------|---------|
| `type already exists` | Normal em re-run; enums usam `duplicate_object` handler |
| `relation empresas already exists` | OK — `CREATE TABLE IF NOT EXISTS` |
| `policy already exists` | Migrations 006 fazem `DROP POLICY IF EXISTS` antes |
| Trigger não dispara | Verifique se usuário foi criado via Auth API, não só insert em `auth.users` |
