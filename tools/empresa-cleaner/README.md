# Limpador de empresas

Transforma arquivos CSV ou XLSX da Empresaqui no formato canônico usado pelo CEO Brain.
Arquivos `.xls` antigos devem ser abertos no Excel e salvos como `.xlsx`.

## Executar

Na raiz do projeto:

```powershell
npm run empresas:clean
```

Para executar o fluxo completo de um estado, incluindo a planilha XLSX segura
para visualização:

```powershell
npm run empresas:prepare -- --state sergipe
```

No Cursor, o mesmo fluxo pode ser acionado com:

```text
/preparar-empresas sergipe
```

Por padrão, o comando lê **`Empresas/<UF>/`** (fonte canônica na pasta CEO Brain) e grava em
`data/output/<estado>`. Também é possível informar caminhos manualmente:

```powershell
npm run empresas:clean -- --input "C:\caminho\entrada" --output "C:\caminho\saida"
```

## Resultados

- `empresas-tratadas.csv`: uma linha por CNPJ no perfil de ingestão (inclui `regime_historico` e `data_inicio`).
- `empresas-tratadas.xlsx`: cópia para Excel com identificadores preservados como texto.
- `registros-rejeitados.csv`: linhas que não possuem CNPJ válido.
- `relatorio.json`: contagens, alertas e duplicidades.

Cada empresa mantém no máximo cinco sócios. Quando a fonte possui cargo ou
qualificação societária, presidente, diretor, administrador, gestor e gerente
têm prioridade. Sem essa coluna, são preservados os cinco primeiros da fonte.

O campo `regime_historico` remove a palavra `ANO` (ex.: `2024 Lucro Real; 2023 Lucro Real`).

O limpador não acessa nem altera o Supabase. A importação será uma etapa separada,
depois da conferência dos resultados.
