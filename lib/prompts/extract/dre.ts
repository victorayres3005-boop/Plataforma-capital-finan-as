// Prompt Gemini para extração de Demonstração de Resultado do Exercício (DRE).
export const PROMPT_DRE = `Você receberá uma Demonstração de Resultado do Exercício (DRE). Pode estar em formato SPED ECD/ECF, DRE simplificada, relatório gerencial, planilha Excel ou PDF contábil. Retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema EXATO (respeite todos os campos):
{"anos":[{"ano":"2024","receitaBruta":"0,00","deducoes":"0,00","receitaLiquida":"0,00","custoProdutosServicos":"0,00","lucroBruto":"0,00","margemBruta":"0,00","despesasOperacionais":"0,00","ebitda":"0,00","margemEbitda":"0,00","depreciacaoAmortizacao":"0,00","resultadoFinanceiro":"0,00","lucroAntesIR":"0,00","impostoRenda":"0,00","lucroLiquido":"0,00","margemLiquida":"0,00"}],"crescimentoReceita":"0,00","tendenciaLucro":"estavel","periodoMaisRecente":"","observacoes":""}

═══ REGRA ABSOLUTA: LER VALORES COM ATENÇÃO ═══
O Gemini costuma errar valores de DRE. Você DEVE:

1. LER o documento número por número, sem chutar
2. Preservar EXATAMENTE a quantidade de dígitos que aparece
3. NUNCA mover vírgulas ou pontos
4. Se o documento mostra "R$ 3.506.158,22", você escreve "3.506.158,22"
5. NÃO some zeros a mais. NÃO corte zeros.
6. Valores de PME brasileira:
   - Receita Bruta mensal: R$ 10k a R$ 50M (raramente >100M)
   - Receita Bruta ANUAL: R$ 100k a R$ 500M (raramente >1B)
   - Se você extrair R$ 10 bilhões de receita, PARE e releia o documento

═══ REGRA CRÍTICA ANTI-CONFUSAO DE SEPARADORES ═══
Separador brasileiro: PONTO para milhar, VÍRGULA para decimal.
- "3.506.158,22" = 3,5 milhões (NÃO 3,5 bilhões, NÃO 3 mil e quinhentos)
- "850.000,00" = 850 mil
- NUNCA use formato americano "3,506,158.22" na saída
Se o valor extraído parecer 10x/100x maior que o razoável, REINTERPRETE o separador.

REGRAS OBRIGATÓRIAS DE FORMATO:
1. TODOS os valores monetários DEVEM estar em formato brasileiro: ponto como separador de milhar, vírgula para decimais
   - CORRETO: "1.234.567,89", "456.789,00", "-12.345,67"
   - ERRADO: "1234567.89", "1,234,567.89", "R$ 1.234,00"
   - Sem prefixo "R$", sem espaços extras
2. Valores negativos: prefixar com sinal de menos: "-45.000,00" (custos, deduções, despesas e prejuízos)
3. Margens: número percentual SEM símbolo "%", com vírgula decimal: "12,5" ou "-3,2"
4. Se um campo não existir no documento, use "0,00"
5. NÃO arredonde — mantenha os centavos como aparecem no documento

REGRAS DE EXTRAÇÃO:
- Extraia dados ANUAIS consolidados. Se houver vários anos, extraia TODOS em ordem cronológica crescente (ex: 2022, 2023, 2024)
- Se o documento contiver dados MENSAIS ou TRIMESTRAIS (sem consolidação anual), SOME todos os meses/trimestres de cada ano para obter o total anual
- Exemplo: se Jan=100, Fev=150, ..., Dez=200, então receitaBruta do ano = soma de todos os 12 meses
- Se houver coluna "Acumulado" ou "Total do Período", prefira esse valor em vez de somar manualmente

Mapeamento de contas (SPED ECD/ECF e DRE padrão):
- receitaBruta → "RECEITA BRUTA" / "RECEITA OPERACIONAL BRUTA" / "FATURAMENTO BRUTO" / conta 3.01 / linha que antecede deduções
- deducoes → "DEDUÇÕES DA RECEITA" / "(-) Impostos sobre Vendas" / "(-) Devoluções e Abatimentos" / conta 3.02 — SEMPRE como valor negativo
- receitaLiquida → "RECEITA LÍQUIDA" / "RECEITA OPERACIONAL LÍQUIDA" / conta 3.03 — se não constar, calcule: receitaBruta + deducoes (deducoes é negativo)
- custoProdutosServicos → "CPV" / "CMV" / "CUSTO DOS PRODUTOS VENDIDOS" / "CUSTO DOS SERVIÇOS PRESTADOS" / conta 3.04 — SEMPRE como valor negativo
- lucroBruto → "LUCRO BRUTO" / "RESULTADO BRUTO" / conta 3.05 — se não constar, calcule: receitaLiquida + custoProdutosServicos
- despesasOperacionais → "DESPESAS OPERACIONAIS" / soma de "Despesas com Vendas" + "Despesas Administrativas" + "Despesas Gerais" — SEMPRE como valor negativo
- ebitda → "EBITDA" / "LAJIDA" — se não constar, calcule: lucroBruto + despesasOperacionais + depreciacaoAmortizacao (despesas são negativas, depreciação é negativa, então: lucroBruto - |despesas| - |depreciação| efetivamente)
  Alternativa simplificada quando depreciação = 0: ebitda = lucroBruto + despesasOperacionais
- depreciacaoAmortizacao → "DEPRECIAÇÃO E AMORTIZAÇÃO" / "D&A" / conta 3.06 — como valor negativo
- resultadoFinanceiro → "RESULTADO FINANCEIRO" / "RECEITAS FINANCEIRAS" menos "DESPESAS FINANCEIRAS" — negativo se despesa líquida
- lucroAntesIR → "LAIR" / "LUCRO ANTES DO IRPJ E CSLL" / "RESULTADO ANTES DOS TRIBUTOS"
- impostoRenda → "IRPJ" + "CSLL" / "PROVISÃO PARA IR E CSLL" — como valor negativo
- lucroLiquido → "LUCRO LÍQUIDO" / "PREJUÍZO DO EXERCÍCIO" / "RESULTADO LÍQUIDO" / conta 3.99

CÁLCULOS DE MARGEM (calcule SEMPRE, mesmo se o documento informar):
- margemBruta = (lucroBruto / receitaLiquida) * 100 → ex: se lucroBruto = "500.000,00" e receitaLiquida = "1.000.000,00", margemBruta = "50,0"
- margemEbitda = (ebitda / receitaLiquida) * 100
- margemLiquida = (lucroLiquido / receitaLiquida) * 100
- Se receitaLiquida = 0, todas as margens = "0,00"
- Margens negativas mantêm sinal: "-8,5"

Campos adicionais:
- crescimentoReceita: variação % da receitaBruta entre primeiro e último ano — fórmula: ((último - primeiro) / |primeiro|) * 100 — ex: "15,3" ou "-8,2"
- tendenciaLucro: "crescimento" se lucroLiquido aumentou nos últimos 2 anos, "queda" se diminuiu, "estavel" se variação absoluta < 5%
- periodoMaisRecente: ano mais recente encontrado (ex: "2024")
- observacoes: informações relevantes não capturadas (regime tributário, notas do contador, etc.)

TRATAMENTO POR REGIME TRIBUTÁRIO:
- Simples Nacional: DREs do Simples costumam ser simplificadas — lucroBruto pode não aparecer. Nesse caso calcule: lucroBruto = receitaLiquida - custoProdutosServicos. Se não há CPV/CMV separado, use "0,00" em custoProdutosServicos e lucroBruto = receitaLiquida.
- Lucro Presumido: pode omitir deduções detalhadas. Se apenas receitaBruta aparecer, receitaLiquida = receitaBruta - estimativa_imposto (use 0 se não especificado).
- Lucro Real: DRE completo — use o mapeamento padrão acima.
- MEI: DRE simplificada, geralmente apenas receitaBruta e lucroLiquido. Outros campos = "0,00".

VALIDAÇÕES DE COERÊNCIA (obrigatórias — marque em observacoes se alguma falhar):
- receitaLiquida ≈ receitaBruta + deducoes (deducoes negativo)
- lucroBruto ≈ receitaLiquida + custoProdutosServicos (custo negativo)
- ebitda ≈ lucroBruto + despesasOperacionais (despesas negativas)
- Se discrepância > 5%, anote em observacoes: "DRE com incoerência em X"

IMPORTANTE:
- NÃO invente dados — use APENAS valores presentes no documento
- Se o documento estiver ilegível ou vazio em algum campo, use "0,00"
- Preserve acentos e formatação textual em observacoes`;
