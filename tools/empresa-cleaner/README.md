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

Por padrão, o comando lê `data/raw/sergipe` e grava os resultados em
`data/output/sergipe`. Também é possível informar outros caminhos:

```powershell
npm run empresas:clean -- --input "C:\caminho\entrada" --output "C:\caminho\saida"
```

## Resultados

- `empresas-tratadas.csv`: uma linha por CNPJ, com `total_dividas` na última coluna.
- `empresas-tratadas.xlsx`: cópia para Excel com identificadores preservados como texto.
- `registros-rejeitados.csv`: linhas que não possuem CNPJ válido.
- `relatorio.json`: contagens, alertas, duplicidades e resumo das dívidas.

Cada empresa mantém no máximo cinco sócios. Quando a fonte possui cargo ou
qualificação societária, presidente, diretor, administrador, gestor e gerente
têm prioridade. Sem essa coluna, são preservados os cinco primeiros da fonte.

O limpador não acessa nem altera o Supabase. A importação será uma etapa separada,
depois da conferência dos resultados.
