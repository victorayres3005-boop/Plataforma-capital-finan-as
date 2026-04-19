// Prompt Gemini para extração de relatório de faturamento mensal.
export const PROMPT_FATURAMENTO = `Você receberá um relatório de faturamento mensal (planilha Excel/XLSX, relatório de NF-e, extrato bancário, declaração contábil ou tabela PDF). Extraia TODOS os valores mensais e retorne APENAS JSON válido, sem markdown.

Schema:
{"meses":[{"mes":"01/2024","valor":"1.234.567,89"}],"somatoriaTotal":"","totalMesesExtraidos":0,"faturamentoZerado":false,"dadosAtualizados":true,"ultimoMesComDados":"","anoMaisAntigo":"","anoMaisRecente":"","fmm12m":"","mediaAno":""}

═══ REGRA CRÍTICA ANTI-CONFUSAO DE SEPARADORES ═══
ATENÇÃO: o separador brasileiro usa PONTO para milhar e VÍRGULA para decimal.
NUNCA confunda com formato americano (vírgula para milhar, ponto para decimal).

CORRETOS (formato brasileiro):
- R$ 3.506.158,22  (três milhões e meio)
- R$ 850.000,00    (oitocentos e cinquenta mil)
- R$ 42.300,50     (quarenta e dois mil trezentos)

ERRADOS (interpretação americana do brasileiro):
- 3,506,158.22 (NÃO USE — formato americano)
- 3506158.22   (NÃO USE — sem separador de milhar)

REGRA DE OURO: se você vê "3.506.158,22" em um documento brasileiro:
- São 3 milhões 506 mil 158 reais e 22 centavos
- NÃO é "3.506.158,22 milhões" (isso seria 3 trilhões)
- NÃO é 3,506 (três mil e quinhentos)

VALIDAÇÃO DE ORDEM DE GRANDEZA:
- Um faturamento mensal normal de PME fica entre R$ 50.000 e R$ 50.000.000 (50K a 50M)
- Um faturamento mensal > R$ 100.000.000 (100 milhões) é EXCEPCIONAL — confira o documento
- Um faturamento mensal < R$ 10.000 (10 mil) pode ser um erro de parse
- Se o valor extraído parecer 10x ou 100x maior que o razoável, REINTERPRETE o separador

EXEMPLO PRÁTICO de armadilha:
- Documento: "3.506.158,22"
- Interpretação CERTA: 3506158.22 reais (3,5 milhões)
- Interpretação ERRADA: 3506158220 (confundindo com "3,506,158.22")
- Interpretação ERRADA: 350615822 (removendo tudo sem entender separador)

Ao extrair, SEMPRE pergunte: "este valor faz sentido para um faturamento mensal?"
Se você viu "FATURAMENTO: 3.506.158,22" em uma planilha mensal de PME, são 3,5M, não 3,5B.

FORMATO NUMÉRICO BRASILEIRO (OBRIGATÓRIO):
- Separador de MILHAR = ponto (.)  —  Separador DECIMAL = vírgula (,)
- CORRETO: "1.234.567,89" | "3.506.158,22" | "850.000,00" | "42.300,50"
- ERRADO: "1234567.89" | "1,234,567.89" | "3506158.22" | "R$ 1.234,00"
- NUNCA use prefixo "R$"
- Se o documento usar formato americano (ponto decimal), CONVERTA para brasileiro

Regras de extração:
- Extraia TODOS os meses presentes em TODAS as páginas — tabelas, rodapés, cabeçalhos, resumos anuais
- Se for planilha Excel, extraia valores BRUTOS das células numéricas (não formatos de exibição) e converta para brasileiro
- mes: formato MM/YYYY obrigatório (ex: "01/2024", "12/2023")
- Formatos aceitos no documento (converta para MM/YYYY na saída):
  * "Jan/25", "Janeiro 2025", "JAN/2025" → "01/2025"
  * "01-2024", "2024-01", "01.2024" → "01/2024"
  * "01/24" (ano curto) → "01/2024" (assuma século atual)
- valor: formato brasileiro sem "R$"
- DEDUPLICAÇÃO: se um mês aparecer duplicado, use o MAIOR valor (ex: se há JAN/2024 = 1.000.000 e JAN/2024 = 1.050.000, use 1.050.000)
- NÃO inclua meses futuros (posteriores ao mês atual) sem dados reais
- NÃO inclua meses com valor zero A MENOS QUE o zero seja o faturamento real daquele mês (não um campo vazio)
- Se houver linha "Total Geral" / "Acumulado" / "Subtotal": use como somatoriaTotal, NÃO adicione ao array meses
- Ordene meses cronologicamente na saída (mais antigo primeiro)

Campos derivados:
- somatoriaTotal: soma de todos os meses extraídos em formato brasileiro (ou valor da linha Total do documento)
- totalMesesExtraidos: contagem numérica de entradas em meses[]
- faturamentoZerado: true se TODOS os valores = 0
- dadosAtualizados: false se o ultimoMesComDados for anterior a 6 meses da data atual
- ultimoMesComDados: último mês com valor positivo (formato MM/YYYY)
- anoMaisAntigo / anoMaisRecente: apenas o ano (ex: "2022", "2024")

Campos derivados (IMPORTANTE — conceitos):
- fmm12m: FATURAMENTO MÉDIO MENSAL dos últimos 12 meses
  = soma dos últimos 12 meses / 12
  = valor em torno de R$ 100k a R$ 10M para PME
  Se encontrar um campo "FMM" ou "Faturamento Médio Mensal" no documento, use ESSE valor.
  Se NÃO encontrar, deixe fmm12m="" (o backend calcula).

- mediaAno: FATURAMENTO ANUAL TOTAL (soma dos 12 meses)
  = valor em torno de R$ 1M a R$ 100M para PME
  Se encontrar "Total Anual" ou "Soma do Exercício", use esse valor.
  Se NÃO encontrar, deixe mediaAno="" (o backend calcula).

ATENÇÃO: se o documento tem apenas meses individuais (sem totais), deixe AMBOS vazios. O backend calculará a partir do array meses[]. NÃO confunda fmm (média) com mediaAno (soma) — a diferença é 12x.

NÃO invente dados. Campos ausentes = "" ou 0 ou false.`;
