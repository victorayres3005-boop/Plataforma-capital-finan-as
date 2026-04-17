# Test Fixtures

Snapshots de extração para regressão. Cada fixture é um par:

- `<slug>.input.json` — request de entrada (`docType`, `textContent` ou `imageBase64`)
- `<slug>.expected.json` — saída esperada (`data`, campos críticos, min/max de warnings)

## Como rodar

```bash
npm run test:extraction
```

Roda todas as fixtures contra `/api/extract` (ou direto contra as funções `fill*Defaults` + schemas para teste unitário rápido). Compara apenas campos marcados como `critical` em cada expected.

## Adicionar uma fixture nova

1. Processa um documento real via UI em modo dev
2. Copia o JSON da resposta de `/api/extract` (network tab)
3. Salva em `test-fixtures/<tipo>/<slug>.input.json` e `.expected.json`
4. Anonimiza CNPJs, CPFs, nomes (substitui por marcadores `___`)
5. Roda `npm run test:extraction` para confirmar que passa

## Por que não usar Jest?

O script é proposital simples (Node.js puro) para rodar rápido em CI e não
trazer dependências de teste pesadas. Se a suíte crescer acima de 50 fixtures,
vale migrar para Vitest.

## Estrutura

```
test-fixtures/
├── README.md              (este arquivo)
├── run.mjs                (runner — script principal)
├── cnpj/
│   ├── exemplo-01.input.json
│   └── exemplo-01.expected.json
├── scr/
├── relatorio_visita/
├── ir_socio/
└── faturamento/
```

## Estado atual

A infraestrutura está pronta mas a pasta começa vazia.  
Prioridade de fixtures a criar (ordem de valor):
1. `scr/fallback-curto-prazo.*` — valida o fallback de curto/longo prazo
2. `relatorio_visita/pleito-15-campos.*` — valida que todos os 15 campos de pleito são extraídos
3. `ir_socio/cpf-formatado.*` — valida normalização de CPF
4. `cnpj/padrao.*` — smoke test básico
