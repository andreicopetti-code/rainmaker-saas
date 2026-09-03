# Empresaqui → Supabase (ops)

Script interno para baixar CSV do [Empresaqui](https://www.empresaqui.com.br) e fazer upsert em `public.empresas`.

**Escopo:** apenas `scripts/empresaqui-sync/` — não altera `apps/web`.

## Pré-requisitos

1. Plano Empresaqui com exportação CSV/Excel
2. `apps/web/.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
3. Credenciais Empresaqui em `scripts/empresaqui-sync/.env` (ver `.env.example`)
4. Node ≥ 20, Chromium via Playwright

## Setup

```powershell
cd scripts/empresaqui-sync
npm install
npx playwright install chromium
cp .env.example .env
# Edite .env com EMPRESAQUI_EMAIL e EMPRESAQUI_PASSWORD
```

Ou na raiz do monorepo:

```powershell
npm run empresaqui:sync -- --uf RS --headed --discover
```

## Fluxo recomendado (captcha / pesquisa manual)

O Empresaqui usa **"Não sou um robô"** — automação completa de login costuma falhar.

### Opção A — URL da pesquisa (como você já fazia)

1. No browser: login + captcha + filtros + **Pesquisar**
2. Copie a **URL da página de resultados** (com export visível)
3. Export + upsert:

```powershell
npm run empresaqui:sync -- --search-url "COLE_A_URL_COMPLETA_AQUI"
```

A URL já traz UF, municípios e demais filtros — **não precisa** de `--municipio` nem `--uf`.

Na 1ª vez (sem sessão salva), o script abre o login → faça captcha → ENTER no terminal → export automático.

### SP — download em massa (80+ CSVs)

Com a pesquisa de SP aberta no browser (8M+ resultados), copie a URL e rode:

```powershell
# 1) Salvar sessão (1x, com captcha)
npm run empresaqui:save-session

# 2) Download automático de todos os blocos (um após o outro)
npm run empresaqui:sync -- --search-url "COLE_A_URL_DA_PESQUISA_SP" --download-only

# Retomar se interromper (pula arquivos já baixados)
npm run empresaqui:sync -- --search-url "COLE_A_URL" --download-only

# Baixar só um intervalo (ex.: blocos 1–5)
npm run empresaqui:sync -- --search-url "COLE_A_URL" --download-only --start-part 1 --end-part 5
```

Arquivos salvos em `scripts/empresaqui-sync/downloads/{data}/SP/` como `*-part1.csv`, `*-part2.csv`, …

Confira no painel EXPORTAR: **Enviar CSV por E-mail = NÃO**.

### Opção B — CSV já baixado

```powershell
npm run empresaqui:ingest -- scripts/empresaqui-sync/downloads/seu-arquivo.csv
```

### Opção C — Salvar sessão (1x)

```powershell
npm run empresaqui:save-session
```

Login + captcha manual → ENTER → sessão em `.auth/empresaqui.json`. Depois use `--search-url` sem login de novo.

## Fluxo automático (sem captcha)

1. **Filtros** (`config/filters.default.json`) → UF, situação, etc.
2. **Pesquisa** → lê contagem na UI
3. **Partição** → se UF > 100k, loop por município (IBGE cache em `config/municipios/`)
4. **EXPORTAR → CSV EXCEL (PADRÃO)** via Playwright
5. **Parse + upsert** em lotes de 1.000 (mesmo contrato de `scripts/migrate-empresas.mjs`)

## Comandos

```powershell
# Sync completo RS (497 municípios)
node scripts/empresaqui-sync/sync.mjs --uf RS

# Um município
node scripts/empresaqui-sync/sync.mjs --uf RS --municipio "Cachoeirinha"

# Descobrir seletores (screenshot + contagem, sem export)
node scripts/empresaqui-sync/sync.mjs --uf RS --discover --headed

# Só ingestão de CSVs já baixados
node scripts/empresaqui-sync/sync.mjs --ingest-only downloads/2026-07-06/RS

# Inspecionar cabeçalhos do CSV
node scripts/empresaqui-sync/sync.mjs --inspect-csv downloads/amostra.csv

# Retomar run interrompido
node scripts/empresaqui-sync/sync.mjs --uf RS --resume
```

## Ajuste de seletores

A UI do Empresaqui muda. Após `--discover --headed`:

1. Inspecione screenshots em `downloads/{data}/{uf}/_discover-*.png`
2. Atualize `config/selectors.json`
3. Reexecute com um município pequeno

## Estado e retomada

- `state/sync-state.json` — progresso por partição (`pending` → `downloaded` → `upserted`)
- `.auth/empresaqui.json` — sessão Playwright (gitignored)
- `downloads/` — CSVs brutos (gitignored)

## Mapeamento CSV

Aliases em `lib/csv-mapper.mjs`. Rode `--inspect-csv` no primeiro arquivo real e ajuste se necessário.

## Cron mensal (exemplo)

```cron
0 3 1 * * cd /path/repo && node scripts/empresaqui-sync/sync.mjs --uf RS >> logs/empresaqui-sync.log 2>&1
```
