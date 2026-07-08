# Issues — Semana 1 (fundação)

Copie cada item como issue no GitHub.

## #1 [P0] Criar projeto Supabase staging

- Criar projeto em supabase.com (separado do legado `gzsnxnjmvovqyzjslblh`)
- Anotar `project-ref`, URL e anon key em `.env.local`
- **Aceite:** dashboard staging acessível

## #2 [P0] Aplicar migrations 001–007

```bash
npx supabase login
npx supabase link --project-ref SEU_REF_STAGING
npm run db:push
```

- **Aceite:** tabelas `organizations`, `subscriptions`, `org_data` visíveis no Table Editor

## #3 [P0] Testar RLS

- Criar 2 usuários em orgs diferentes
- Confirmar isolamento de `org_data`
- **Aceite:** checklist em `docs/RUNBOOK.md` marcado

## #4 [P1] Validar trigger handle_new_user

- Criar usuário em Authentication → Users
- Verificar org + trial + org_data criados
- **Aceite:** 4 registros criados automaticamente

## #5 [P0] npm install + dev server

```bash
npm install
npm run dev
```

- **Aceite:** http://localhost:3000 mostra landing CEO Brain SaaS
