# Migração do ceo_brain.html para o SaaS

## Dados no HTML legado

O sync v40 grava em `user_data` com:

```json
{
  "cards": [],
  "columns": [],
  "agenda_events": [],
  "vendors": [],
  "goals": {},
  "automations": [],
  "automations_log": []
}
```

## Passos

1. Faça login no app legado e exporte JSON em **Configurações → Exportar**.
2. No SaaS, após criar conta, use **Importar** (quando disponível) ou:
3. Atualize `org_data.data` via API com o JSON exportado.

## SQL manual (admin)

```sql
update public.org_data
set data = '... JSON exportado ...'::jsonb,
    version = version + 1,
    updated_at = now()
where organization_id = 'UUID_DA_ORG';
```

## Mapeamento user_data → org_data

A migration `20260624000004_org_data.sql` copia registros de `user_data`
onde `organization_id` já está preenchido.
