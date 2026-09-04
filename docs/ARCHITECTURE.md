# Arquitetura de hospedagem — RainMaker

Separar os dados operacionais dos clientes da base de inteligência comercial (dezenas de milhões de empresas).

## Princípio

CRM, usuários, agenda, oportunidades, IA e configurações ficam num banco transacional. A base de empresas (CNAE, sócios, telefones, endereços) fica noutro PostgreSQL. Isso reduz custo, isola carga e escala de forma independente.

```
Front-end (Next.js / Vercel)
        │
API (Supabase)
        ├── Banco SaaS (PostgreSQL)
        │      usuários, organizações, CRM, agenda, pipeline, IA
        └── Banco Empresas (PostgreSQL dedicado)
               empresas, CNAE, sócios, telefones, endereços
```

## Banco SaaS

Supabase PostgreSQL. Volume esperado: dezenas de MB até ~30 GB. Auth, RLS e dados transacionais.

## Banco de empresas

PostgreSQL dedicado. Pode chegar a centenas de GB. Não manter no mesmo banco do SaaS.

## Custo de referência (MVP)

- Supabase Pro: ~US$ 25/mês
- PostgreSQL dedicado (Hetzner/Contabo): €40–70/mês
- Object storage (Cloudflare R2): baixo no início

PDFs e documentos não vão no banco: só metadados no Postgres, arquivos em R2/S3.
