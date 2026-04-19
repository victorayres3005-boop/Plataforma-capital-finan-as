// Prompt Gemini para extração de Balanço Patrimonial.
export const PROMPT_BALANCO = `Você receberá um Balanço Patrimonial. Pode estar em formato SPED ECD (com códigos de conta como 1.01, 2.03, etc.), balanço simplificado, relatório gerencial, planilha Excel ou PDF contábil. Retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema EXATO (respeite todos os campos):
{"anos":[{"ano":"2024","ativoTotal":"0,00","ativoCirculante":"0,00","caixaEquivalentes":"0,00","contasAReceber":"0,00","estoques":"0,00","outrosAtivosCirculantes":"0,00","ativoNaoCirculante":"0,00","imobilizado":"0,00","intangivel":"0,00","outrosAtivosNaoCirculantes":"0,00","passivoTotal":"0,00","passivoCirculante":"0,00","fornecedores":"0,00","emprestimosCP":"0,00","outrosPassivosCirculantes":"0,00","passivoNaoCirculante":"0,00","emprestimosLP":"0,00","outrosPassivosNaoCirculantes":"0,00","patrimonioLiquido":"0,00","capitalSocial":"0,00","reservas":"0,00","lucrosAcumulados":"0,00","liquidezCorrente":"0,00","liquidezGeral":"0,00","endividamentoTotal":"0,00","capitalDeGiroLiquido":"0,00"}],"periodoMaisRecente":"","tendenciaPatrimonio":"estavel","observacoes":""}

═══ REGRA ABSOLUTA: LER VALORES COM ATENÇÃO ═══
O Gemini costuma errar valores de Balanço. Você DEVE:

1. LER o documento número por número, sem chutar
2. Preservar EXATAMENTE a quantidade de dígitos que aparece
3. NUNCA mover vírgulas ou pontos
4. Se o documento mostra "R$ 3.506.158,22", você escreve "3.506.158,22"
5. NÃO some zeros a mais. NÃO corte zeros.
6. Valores de PME brasileira:
   - Ativo Total: R$ 500k a R$ 500M (raramente >1B)
   - Patrimônio Líquido: raramente >R$ 100M em valor absoluto
   - Se você extrair R$ 10 bilhões de ativo, PARE e releia o documento

═══ CUIDADO COM DIVISÃO ENTRE AC/PC ═══
NCG (Necessidade de Capital de Giro) = Ativo Circulante - Passivo Circulante
Se o AC ou PC estiver 10x maior que o real, o NCG fica 10x errado.

Valores de Ativo Circulante para PME: R$ 50k a R$ 100M
Se extrair Ativo Circulante > R$ 1 bilhão para uma PME, PROVAVELMENTE errou o separador.

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

VALIDAÇÃO DE ORDEM DE GRANDEZA para PME:
- Ativo Total: tipicamente R$ 500k a R$ 500M
- Patrimônio Líquido: pode ser negativo, mas raramente > R$ 100M
- Capital Social: geralmente R$ 10k a R$ 10M
Se extrair um Ativo Total > R$ 1 bilhão para uma PME, PROVAVELMENTE errou o separador.

FORMATO NUMÉRICO BRASILEIRO (OBRIGATÓRIO):
- Separador de MILHAR = ponto (.) — Separador DECIMAL = vírgula (,)
- Exemplos corretos: "1.234.567,89", "850.000,00", "-45.320,10"
- ERRADO: "1234567.89", "1,234,567.89"
- NUNCA use prefixo "R$"
- Valores negativos: prefixe com sinal de menos (ex: "-120.500,00" para patrimônio líquido negativo ou prejuízos acumulados)

REGRAS DE EXTRAÇÃO:
- O documento pode conter 2 ou 3 anos de dados lado a lado (ex: 2022, 2023, 2024). Extraia TODOS em ordem cronológica crescente no array "anos"
- SPED ECD: use os valores da coluna "Saldo Final" (não "Saldo Inicial" ou "Movimentação"). Identifique contas pelo código (1.01, 2.03, etc.)
- Se um campo não existir no documento, use "0,00"

MAPEAMENTO DE CONTAS (SPED ECD e Balanço padrão):
- ativoTotal → "ATIVO TOTAL" / "TOTAL DO ATIVO" / soma de ativoCirculante + ativoNaoCirculante. VALIDAÇÃO: ativoTotal deve ser aproximadamente igual a passivoCirculante + passivoNaoCirculante + patrimonioLiquido
- ativoCirculante → grupo 1.01 / "Ativo Circulante"
- caixaEquivalentes → "Caixa e Equivalentes de Caixa" / "Disponibilidades" / conta 1.01.01
- contasAReceber → "Contas a Receber" / "Clientes" / "Duplicatas a Receber" / conta 1.01.03
- estoques → "Estoques" / conta 1.01.04
- outrosAtivosCirculantes → demais ativos circulantes não listados acima (impostos a recuperar, adiantamentos, etc.)
- ativoNaoCirculante → grupo 1.02 / "Ativo Não Circulante" / "Ativo Realizável a Longo Prazo" + "Imobilizado" + "Intangível"
- imobilizado → "Imobilizado" / conta 1.02.03
- intangivel → "Intangível" / conta 1.02.04
- outrosAtivosNaoCirculantes → demais não circulantes (realizável a longo prazo, investimentos)
- passivoTotal → passivoCirculante + passivoNaoCirculante (NÃO inclui patrimônio líquido)
- passivoCirculante → grupo 2.01 / "Passivo Circulante"
- fornecedores → "Fornecedores" / conta 2.01.01
- emprestimosCP → "Empréstimos e Financiamentos CP" / conta 2.01.03
- outrosPassivosCirculantes → demais passivos circulantes (salários, impostos, provisões)
- passivoNaoCirculante → grupo 2.02 / "Passivo Não Circulante" / "Exigível a Longo Prazo"
- emprestimosLP → "Empréstimos e Financiamentos LP" / conta 2.02.01
- outrosPassivosNaoCirculantes → demais passivos não circulantes
- patrimonioLiquido → grupo 2.03 / "Patrimônio Líquido". ATENÇÃO: pode ser NEGATIVO se a empresa tem prejuízos acumulados maiores que o capital — nesse caso, prefixe com menos (ex: "-350.000,00")
- capitalSocial → conta 2.03.01 / "Capital Social Realizado"
- reservas → soma de "Reservas de Capital" + "Reservas de Lucros"
- lucrosAcumulados → "Lucros/Prejuízos Acumulados" — negativo se prejuízo (ex: "-200.000,00")

INDICADORES (CALCULE SEMPRE para cada ano):
1. liquidezCorrente = ativoCirculante / passivoCirculante
   - Resultado como número decimal com vírgula (ex: "1,50", "0,85", "2,30")
   - Se passivoCirculante = 0, use "999,99"
   - Exemplo: ativoCirculante = "500.000,00", passivoCirculante = "333.333,00" → liquidezCorrente = "1,50"

2. liquidezGeral = (ativoCirculante + realizávelLP) / (passivoCirculante + passivoNaoCirculante)
   - realizávelLP = parte do ativoNaoCirculante que é realizável a longo prazo (se não identificável, use ativoNaoCirculante - imobilizado - intangivel)
   - Se denominador = 0, use "999,99"

3. endividamentoTotal = ((passivoCirculante + passivoNaoCirculante) / ativoTotal) * 100
   - Resultado como PERCENTUAL com vírgula (ex: "45,20", "213,52", "78,00")
   - Exemplo: passivoCirculante = "800.000,00", passivoNaoCirculante = "200.000,00", ativoTotal = "468.350,00" → endividamentoTotal = "213,52"
   - Pode ser maior que 100% se empresa tem PL negativo

4. capitalDeGiroLiquido = ativoCirculante - passivoCirculante
   - Resultado em formato monetário brasileiro (ex: "166.667,00", "-50.000,00")
   - Pode ser negativo se passivo circulante > ativo circulante

CAMPOS ADICIONAIS:
- periodoMaisRecente: ano mais recente encontrado (ex: "2024")
- tendenciaPatrimonio: "crescimento" se patrimonioLiquido aumentou nos últimos 2 anos, "queda" se diminuiu, "estavel" se variação < 5%
- observacoes: informações relevantes (regime tributário, contador, notas explicativas relevantes)

VALIDAÇÕES CRUZADAS (obrigatórias — anote em observacoes se falhar):
1. Equação fundamental: ativoTotal ≈ passivoCirculante + passivoNaoCirculante + patrimonioLiquido (diferença < 1% é aceitável)
2. ativoCirculante + ativoNaoCirculante ≈ ativoTotal
3. passivoCirculante + passivoNaoCirculante ≈ passivoTotal
4. Se endividamentoTotal > 100, o patrimonioLiquido DEVE ser negativo — valide essa relação
5. Se alguma validação falhar, anote em observacoes: "Incoerência detectada: [descrição]"

EXEMPLO DE SAÍDA (para referência):
{"anos":[{"ano":"2023","ativoTotal":"468.350,00","ativoCirculante":"300.000,00","caixaEquivalentes":"50.000,00","contasAReceber":"150.000,00","estoques":"80.000,00","outrosAtivosCirculantes":"20.000,00","ativoNaoCirculante":"168.350,00","imobilizado":"120.000,00","intangivel":"10.000,00","outrosAtivosNaoCirculantes":"38.350,00","passivoTotal":"1.000.000,00","passivoCirculante":"800.000,00","fornecedores":"200.000,00","emprestimosCP":"400.000,00","outrosPassivosCirculantes":"200.000,00","passivoNaoCirculante":"200.000,00","emprestimosLP":"150.000,00","outrosPassivosNaoCirculantes":"50.000,00","patrimonioLiquido":"-531.650,00","capitalSocial":"100.000,00","reservas":"0,00","lucrosAcumulados":"-631.650,00","liquidezCorrente":"0,38","liquidezGeral":"0,34","endividamentoTotal":"213,52","capitalDeGiroLiquido":"-500.000,00"}],"periodoMaisRecente":"2023","tendenciaPatrimonio":"queda","observacoes":""}

NÃO invente dados — use APENAS valores presentes no documento.`;
