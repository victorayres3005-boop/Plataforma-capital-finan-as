---
tags: [capital-financas, glossario, dominio]
---

> Hub: [[CAPITAL]]


# Glossário — termos do domínio

Termos de análise de crédito FIDC e KYC que aparecem no código, no relatório e nas conversas com Victor.

## FIDC e operação

| Termo | Significado |
|---|---|
| **FIDC** | Fundo de Investimento em Direitos Creditórios — fundo que compra recebíveis com desconto (antecipação) |
| **Cedente** | Empresa que vende seus recebíveis ao FIDC. **A empresa analisada na plataforma.** |
| **Sacado** | Devedor original do recebível (cliente do cedente que assinou a duplicata/NF). |
| **Operação** | Compra de recebíveis pelo FIDC. Tem `modalidade` (clean, comissária, lastreada, recomprada), prazo, taxa, limite. |
| **Antecipação** | Pagamento antecipado de recebíveis pelo FIDC ao cedente, com deságio (taxa). |
| **Recompra** | Cedente recompra recebível inadimplente do FIDC (covenant comum). |
| **Tranche** | Porção do recebível: `tranche LG` (Limite Global) vs `tranche checagem`. Relatório de visita usa `tranche_checagem` como padrão. |
| **TAC** | Taxa de Abertura de Crédito (cobrada do cedente uma vez por operação). |
| **Concentração por sacado** | Limite de % do faturamento que um único sacado pode representar. Risco se >X%. |
| **Limite Convencional** | Total que o FIDC compra de recebíveis "normais". |
| **Limite Comissária** | Limite específico para operações comissárias (FIDC vende com cobrança). |

## Indicadores financeiros

| Termo | Significado | Fonte |
|---|---|---|
| **FMM** | Faturamento Médio Mensal — média dos últimos 12 meses do cedente | calculado em TS |
| **Alavancagem** | Endividamento total / FMM. >5x = alta. **Eliminatório se acima do parâmetro da política.** | TS, override Gemini |
| **Liquidez Corrente** | AC / PC — capacidade de pagar dívidas de curto prazo | TS, override Gemini |
| **Margem Líquida** | Lucro / Receita | TS, override Gemini |
| **Endividamento** | Dívida total / Patrimônio Líquido | TS, override Gemini |
| **Comprometimento de Faturamento** | (Vencidos + Prejuízos SCR) / FMM | TS |

⚠️ **Indicadores são determinísticos** desde 2026-04-23: calculados em TypeScript no `analyze`, sobrescrevem o Gemini.

## SCR Bacen

| Termo | Significado |
|---|---|
| **Carteira Total** | Soma de todas as operações ativas do cedente no SFN |
| **Vencidos** | Operações com atraso (não em prejuízo ainda) |
| **Prejuízo (B)** | Seção específica do SCR Bacen — operações que viraram perda. **>0 é eliminatório.** |
| **Curto Prazo** | até 360d. Soma de buckets `ate30d + d31_60 + d61_90 + d91_180 + d181_360` |
| **Longo Prazo** | acima de 360d. Soma de `acima360d + indeterminado` |
| **Classificação Risco** | Rating do Bacen (AA-H). Pior = mais provisão exigida do banco. |
| **SCR Total** | `carteira + vencidos + prejuízos` (via `lib/scrTotal.ts`, único desde 2026-05-04) |
| **Modalidades** | Tipo de operação (capital de giro, conta garantida, financiamento BNDES, etc.) |
| **Comparativo anual** | SCR atual vs **mesmo mês 12 meses atrás** (NÃO mês anterior). YoY mais relevante. |

## KYC e compliance

| Termo | Significado |
|---|---|
| **PEP** | Pessoa Exposta Politicamente. Vem do BDC `owners_kyc.IsCurrentlyPEP`. |
| **Sancionado** | Sócio em listas de sanções (OFAC, ONU, etc.). Vem do BDC. |
| **PGFN** | Procuradoria-Geral da Fazenda Nacional. BDC `government_debtors` lista dívidas ativas. |
| **CCF** | Cadastro de Cheques sem Fundo. Tabela bancos com qtd e valor. |
| **RJ** | Recuperação Judicial. **Eliminatório.** Detecção via `temRJ`, `distribuicao.tipo`, ou substring na razão social. |
| **Falência** | `processos.temFalencia`. Eliminatório. |
| **QSA** | Quadro de Sócios e Administradores (Receita Federal) |
| **Ownership** | Filtro BDC: só sócios/quotistas/acionistas/titulares/diretores. Exclui Procurador, Contador, Representante Legal. |
| **Validação Identidade** | Derivada do `scoreClasse` Assertiva PF (F=reprovado, E=alerta, resto=ok). |

## Política V2 — 5 pilares

| Pilar | Peso | Tema |
|---|---|---|
| `perfil_empresa` | 15% | Idade, segmento, complexidade societária |
| `saude_financeira` | 15% | Alavancagem, liquidez, FMM, margem |
| `risco_compliance` | 25% | RJ, protestos, processos, sanções, SCR prejuízos |
| `socios_governanca` | 10% | Score sócios, IR, PEP, PGFN |
| `estrutura_operacao` | 35% | Tipo operação, lastro, sacados, garantias, prazo |

## Rating

| Letra | Faixa | Label |
|---|---|---|
| A | 90-100 | EXCELENTE |
| B | 80-89 | BOM |
| C | 70-79 | MODERADO |
| D | 60-69 | FRACO |
| E | 50-59 | RUIM |
| F | 0-49 | CRÍTICO |

⚠️ Rating + Decisão **escondidos no PDF/HTML** em calibração (`HIDE_AVALIACAO = true`). Tela do app sempre mostra.

## Documentos da análise (16 tipos)

| Slot | Tipo |
|---|---|
| `cnpj` | Cartão CNPJ Receita |
| `qsa` | Quadro Societário |
| `contrato` | Contrato Social |
| `dre` | Demonstração de Resultado |
| `balanco` | Balanço Patrimonial |
| `faturamento` | Notas/relatório de faturamento (12 meses) |
| `curva_abc` | Curva ABC de clientes |
| `scr` / `scrAnterior` | SCR Bacen empresa (atual / anterior) |
| `scr_socio` / `scr_socio_anterior` | SCR Bacen sócio PF |
| `ir_socio` | IR Pessoa Física do sócio |
| `relatorio_visita` | Relatório de visita do analista |
| `protestos` | Protestos (preferir Assertiva) |
| `processos` | Processos (preferir CredHub) |
| `grupoEconomico` | Empresas vinculadas (preferir BDC) |

## Bureaus

Termos resumidos — detalhe em bureaus:

| Sigla | Significado |
|---|---|
| **BDC** | BigDataCorp (KYC sócios + grupo + processos) |
| **Assertiva** | Score + protestos + faturamento estimado |
| **DataBox360** | SCR Bacen via API |
| **CredHub** | Score serasa + protestos/processos empresa |
| **Goalfy** | CRM de origem dos clientes |
| **DataJud** | API pública CNJ (chave gratuita) |
| **BrasilAPI** | Cartão CNPJ pública |

## Termos de UI / arquitetura

| Termo | Significado |
|---|---|
| **Coleção / Coleta** | `document_collections` row. Uma análise em andamento ou finalizada. |
| **ReviewStep** | Tela onde analista valida JSON extraído por seção. |
| **GenerateStep** | Tela onde gera PDF/HTML/share. |
| **ScoreForm** | Formulário V2 dos 5 pilares (preenche `score_operacoes`). |
| **HIDE_AVALIACAO** | Toggle bool em 3 arquivos que esconde rating no PDF/HTML em calibração. |
| **Sandbox detection** | DataBox360: valores idênticos entre períodos = sandbox → esconde colunas. |
| **`_slotHint`** | Persistido no SCR pra desempate de comparativo quando Gemini falha em `periodoReferencia`. |
| **VISUAL_ONLY_TYPES** | `["contrato", "relatorio_visita"]`. Resto vai pra modo texto. |
| **LARGE_TEXT_FALLBACK_VISUAL** | `["faturamento"]`. Texto grande cai em visual. **`curva_abc` foi REMOVIDA.** |

## Stakeholders

| Pessoa | Papel |
|---|---|
| **Victor** | Analista de crédito, usuário primário da plataforma. FIDC. |
| **Débora** | Cliente / stakeholder do projeto. |
| **Nayara** | Quem renova o `BDC_TOKEN` semanalmente. NAYARA@CAPITALFINANCAS.COM.BR |
| **Vitor** | Pessoa do Goalfy que pode configurar webhook na automação deles. |

## Termos de produto que não confundir

- **Conformidade** ≠ **Elegibilidade**
  - Elegibilidade binária: 9 critérios pass/fail (`pageChecklist`, sempre presente)
  - Conformidade: seção dedicada toggle `exibir_conformidade` (default false)
- **Score V2 (A-F)** ≠ **Rating IA (0-10)**
  - Score V2: 5 pilares ponderados, preenchido pelo analista
  - Rating IA: opinião 0-10 do Gemini (escondido em calibração)
- **Auto-score** ≠ **ScoreForm**
  - Auto-score: server-side em `autoPreencherScore()` se cliente não enviar
  - ScoreForm: formulário UI manual do analista
