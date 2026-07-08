# Runbook — CEO Brain SaaS

## Ambientes

| Ambiente | Supabase | Uso |
|----------|----------|-----|
| **staging** | Projeto novo ou branch | Desenvolvimento e testes |
| **prod** | Após validação | Clientes pagantes |
| **legado** | `gzsnxnjmvovqyzjslblh` | `ceo_brain.html` atual |

## Checklist pós-migration

- [ ] Tabelas criadas: `organizations`, `organization_members`, `subscriptions`, `org_data`
- [ ] RLS habilitado em todas as tabelas públicas sensíveis
- [ ] Novo usuário Auth → org + trial criados automaticamente
- [ ] Usuário A não lê `org_data` da org do usuário B
- [ ] `check_and_increment_usage` retorna `allowed: false` ao estourar limite

## Testar RPC de uso (SQL Editor)

```sql
select public.check_and_increment_usage(
  'ORG_UUID_AQUI'::uuid,
  'ai_request'::public.usage_kind,
  to_char(now(), 'YYYY-MM')
);
```

## Comandos úteis

```bash
npx supabase migration list
npx supabase db push
npx supabase db diff -f nova_migration
```

## Rollback

Supabase não faz rollback automático de migrations em produção. Antes de `db push` em prod:

1. Backup no dashboard (Database → Backups)
2. Testar em staging
3. Aplicar em janela de manutenção se necessário
