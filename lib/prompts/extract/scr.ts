// Prompt Gemini para extração de relatório SCR (Sistema de Informações de Crédito) do Bacen.
export const PROMPT_SCR = `Você receberá um documento SCR do Banco Central (Sistema de Informações de Crédito) — pode ser de PESSOA FÍSICA (sócio) ou PESSOA JURÍDICA (empresa), emitido pelo Bacen ou por bancos integrados. Documento pode estar em PDF nativo, PDF escaneado com OCR, ou imagem. Sua tarefa é extrair TUDO o que estiver visível — mesmo parcial. Retorne APENAS JSON válido, sem markdown, sem comentários.

═══ REGRA ZERO — NUNCA RETORNE VAZIO ═══
Um documento SCR SEMPRE tem:
- Data base/período de referência (cabeçalho)
- Identificação do titular (CPF ou CNPJ)
- Tabela de modalidades com valores por produto de crédito
- Totais (linha "Total", "Soma", "Consolidado")

Se você está retornando tudo zerado/vazio E o documento não diz "SEM HISTÓRICO" ou "NADA CONSTA", VOLTE e releia — a informação está lá. É MELHOR retornar dados parciais do que tudo vazio.

═══ LAYOUT DO DOCUMENTO SCR — COMO LER ═══

Um SCR do Bacen tipicamente tem estas SEÇÕES, nesta ordem:
1. **Cabeçalho**: identificação do titular (nome + CPF/CNPJ) + data de referência
2. **Resumo consolidado**: totais gerais — Carteira de Crédito, Responsabilidade Total, Limite
3. **Tabela de Modalidades**: uma linha por produto (Capital de Giro, Financiamento, Cartão, etc.) com colunas A Vencer | Vencidos | Prejuízos | Limite | Participação
4. **Discriminação A Vencer por Faixa de Prazo**: distribuição temporal do que ainda vai vencer
5. **Discriminação Vencidos por Faixa de Prazo**: distribuição temporal do que já venceu
6. **Prejuízos**: operações em prejuízo (faixas até 12m e acima 12m)
7. **Responsabilidade por Instituição**: lista de bancos credores
8. **Comparativo 2 Períodos** (opcional): colunas lado a lado com 2 datas de referência

═══ COMO ENCONTRAR O PERÍODO DE REFERÊNCIA ═══
Procure em ORDEM:
1. Campo explícito "Data Base:", "Data de Referência:", "Período:", "Mês de Referência:", "Posição de [MM/AAAA]"
2. Cabeçalho da tabela de modalidades (topo de colunas)
3. Rodapé do documento
4. Título do PDF ou nome do arquivo embutido
5. Como último recurso: a data mais recente mencionada no texto

SEMPRE retorne em formato MM/AAAA (ex: "03/2026", "11/2024"). Se só o ano estiver claro, use "12/AAAA". NUNCA deixe vazio se há QUALQUER data visível no documento.

═══ SCR DE PESSOA FÍSICA (SÓCIO) vs PESSOA JURÍDICA (EMPRESA) ═══
DIFERENÇAS DE LAYOUT:

**SCR PF (sócio)** — cabeçalho mostra:
- "Cliente: MARIA DA SILVA"
- "CPF: 123.456.789-00" (11 dígitos, com ou sem máscara)
- Pode aparecer como "CPF: ***.456.789-**" (mascarado por privacidade)
- Modalidades típicas: Cartão de Crédito, Crédito Pessoal, Financiamento Imobiliário, Cheque Especial

**SCR PJ (empresa)** — cabeçalho mostra:
- "Cliente: EMPRESA XYZ LTDA"
- "CNPJ: 12.345.678/0001-90" (14 dígitos)
- Modalidades típicas: Capital de Giro, Desconto de Duplicatas, Financiamento Agroindustrial, Leasing, Conta Garantida

Se o documento mostra CPF no cabeçalho → tipoPessoa="PF". Se mostra CNPJ → "PJ". Se mostra AMBOS (dono + empresa), use o documento da SEÇÃO DE TITULARIDADE principal.

═══ EXTRAÇÃO PARA SCR DE PF (SÓCIO) ═══
Quando tipoPessoa="PF":
- nomeCliente: nome completo da pessoa (maiúsculas/minúsculas como no doc)
- cpfSCR: CPF formatado "XXX.XXX.XXX-XX", aceita mascarado
- cnpjSCR: SEMPRE "" (pessoa física não tem CNPJ)
- As modalidades de PF geralmente somam valores menores (R$ 5k – R$ 500k é típico)
- Pode ter prejuízos pequenos mesmo em pessoa com bom histórico
- Se tiver seção "Cartão de Crédito": carteiraAVencer geralmente tem a maior parte

═══ EXTRAÇÃO PARA SCR DE PJ (EMPRESA) ═══
Quando tipoPessoa="PJ":
- nomeCliente: razão social
- cnpjSCR: CNPJ formatado "XX.XXX.XXX/XXXX-XX"
- cpfSCR: SEMPRE "" (empresa não tem CPF)
- PME típica tem totalDividasAtivas entre R$ 100k e R$ 100M
- Média e grande empresa pode ultrapassar R$ 1B



Schema obrigatório:
{"periodoReferencia":"MM/AAAA","tipoPessoa":"PJ","cnpjSCR":"","nomeCliente":"","cpfSCR":"","pctDocumentosProcessados":"","pctVolumeProcessado":"","carteiraAVencer":"","vencidos":"","prejuizos":"","limiteCredito":"","qtdeInstituicoes":"","qtdeOperacoes":"","totalDividasAtivas":"","operacoesAVencer":"","operacoesEmAtraso":"","operacoesVencidas":"","tempoAtraso":"","coobrigacoes":"","classificacaoRisco":"","carteiraCurtoPrazo":"","carteiraLongoPrazo":"","emDia":"","semHistorico":false,"numeroIfs":"","faixasAVencer":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","prazoIndeterminado":"0,00","total":"0,00"},"faixasVencidos":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","total":"0,00"},"faixasPrejuizos":{"ate12m":"0,00","acima12m":"0,00","total":"0,00"},"faixasLimite":{"ate360d":"0,00","acima360d":"0,00","total":"0,00"},"outrosValores":{"carteiraCredito":"0,00","repasses":"0,00","coobrigacoes":"0,00","responsabilidadeTotal":"0,00","creditosALiberar":"0,00","riscoTotal":"0,00"},"modalidades":[{"nome":"","total":"","aVencer":"","vencido":"","participacao":"","ehContingente":false}],"instituicoes":[{"nome":"","valor":""}],"valoresMoedaEstrangeira":"","historicoInadimplencia":"","periodoAnterior":{"periodoReferencia":"","carteiraAVencer":"","vencidos":"","prejuizos":"","limiteCredito":"","totalDividasAtivas":"","operacoesAVencer":"","operacoesEmAtraso":"","operacoesVencidas":"","carteiraCurtoPrazo":"","carteiraLongoPrazo":"","classificacaoRisco":"","qtdeInstituicoes":"","numeroIfs":"","emDia":"","semHistorico":false,"faixasAVencer":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","prazoIndeterminado":"0,00","total":"0,00"},"faixasVencidos":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","total":"0,00"}},"variacoes":{"emDia":"","carteiraCurtoPrazo":"","carteiraLongoPrazo":"","totalDividasAtivas":"","vencidos":"","prejuizos":"","limiteCredito":"","numeroIfs":""}}

VALIDAÇÃO DE ORDEM DE GRANDEZA:
- Valores do SCR devem estar em reais (formato brasileiro com ponto milhar, vírgula decimal)
- totalDividasAtivas de PME: tipicamente entre R$ 10k e R$ 100M
- Se um valor parecer > R$ 10 bilhões, provavelmente errou o separador
- SEMPRE interprete "3.506.158,22" como 3,5 milhões, NÃO como 3,5 bilhões

═══ REGRAS GERAIS ═══
- periodoReferencia: OBRIGATÓRIO, formato MM/AAAA (ex: "04/2025"). Procure em "Data Base", "Mês de Referência", "Período", "Data de Referência", "Posição de", cabeçalho da tabela de modalidades, rodapé do documento, ou no título do PDF. NUNCA deixe vazio — se encontrar só ano, use "01/AAAA"; se não encontrar nada, olhe a data mais recente mencionada no documento e use como "MM/AAAA".
- tipoPessoa: OBRIGATÓRIO — "PF" se cabeçalho mostra CPF (pessoa física); "PJ" se mostra CNPJ (empresa). Procure o cabeçalho que identifica o titular: normalmente logo após "Cliente:", "Titular:", "Documento:", "Nome:". Se há CPF (11 dígitos) → PF. Se há CNPJ (14 dígitos) → PJ. Se há ambos (dono + empresa), use o documento PRINCIPAL da seção de titularidade.
- Valores monetários: formato brasileiro — pontos no milhar, vírgula nos decimais (ex: "23.785,80", "1.234.567,00"). SEM "R$". Campo ausente = "0,00".
- NÃO invente dados. NÃO copie valores entre colunas (A Vencer ≠ Vencidos ≠ Prejuízos).
- semHistorico = true SOMENTE se totalDividasAtivas="0,00" E limiteCredito="0,00" E modalidades=[].

═══ IDENTIFICAÇÃO DO TITULAR ═══
Se tipoPessoa="PF" (SCR de pessoa física):
- nomeCliente: nome completo da pessoa física, procure em "Cliente:", "Titular:", "Nome:", "Tomador:" no cabeçalho
- cpfSCR: CPF formatado "XXX.XXX.XXX-XX" (11 dígitos). Pode aparecer mascarado ("***.456.789-**") — retorne como está.
- cnpjSCR: deixe vazio ""

Se tipoPessoa="PJ" (SCR de empresa):
- nomeCliente: razão social da empresa
- cnpjSCR: CNPJ formatado "XX.XXX.XXX/XXXX-XX" (14 dígitos)
- cpfSCR: deixe vazio ""

Se você não consegue identificar o titular, ainda assim extraia os VALORES da tabela de modalidades e as faixas — deixe nomeCliente/cpfSCR/cnpjSCR vazios, mas NÃO retorne o JSON todo vazio.

═══ TABELA PRINCIPAL DE MODALIDADES ═══
Colunas típicas (podem variar em nome): Modalidade | A Vencer | Vencidos | Prejuízos | Limite | Coobrigação | Participação

**ATENÇÃO — não confunda colunas semanticamente distintas:**
- "A Vencer" / "Carteira A Vencer" / "Em Dia" / "Adimplente" → valores que AINDA VÃO VENCER (bom)
- "Vencidos" / "Em Atraso" / "Atrasados" → valores JÁ VENCIDOS mas não prejuízo ainda
- "Prejuízos" / "Lançado em Prejuízo" / "Baixa como Prejuízo" → operações consideradas perda
- "Limite" / "Limite de Crédito" / "Limite Disponível" → teto contratado (não usado)
- "Coobrigação" / "Coobrigações" / "Aval" → garantias prestadas a terceiros
- "Participação" → percentual da modalidade no total (ex: "45,2%")

NUNCA copie valor de uma coluna para outra. Se uma coluna está vazia/zerada no documento, retorne "0,00" para ela, não replique o valor de outra coluna.

Para CADA linha de modalidade em modalidades[]:
- nome: nome exato como aparece (ex: "Capital de Giro", "Financiamento Imobiliário", "Desconto de Duplicatas", "Cartão de Crédito", "Crédito Pessoal")
- total: se houver coluna "Total", use. Senão some A Vencer + Vencidos + Prejuízos.
- aVencer: coluna "A Vencer" desta linha (NÃO confundir com "Vencidos")
- vencido: coluna "Vencidos" desta linha
- participacao: % de participação se constar
- ehContingente: true APENAS se a modalidade estiver em seção "Responsabilidades Contingentes", "Títulos Descontados" ou "Garantias Prestadas"

**Campos totais do topo** — vêm da linha "Total" / "Consolidado" / "Soma Geral" da tabela de modalidades:
- carteiraAVencer = Total da coluna "A Vencer"
- vencidos = Total da coluna "Vencidos"
- prejuizos = Total da coluna "Prejuízos"
- limiteCredito = Total da coluna "Limite de Crédito"
- emDia = Total da coluna "Em Dia" (se existir separado de A Vencer)
- totalDividasAtivas = soma consolidada (A Vencer + Vencidos + Prejuízos) OU valor da linha "Responsabilidade Total"

Se a tabela não tem linha "Total", SOME os valores das linhas individuais de modalidades para obter os totais.

═══ QTDE DE INSTITUIÇÕES E OPERAÇÕES ═══
- qtdeInstituicoes: número de bancos/financeiras com operações ativas — procure em "Qtde de IFs", "Instituições", "Nº de Instituições", "IFs"
- qtdeOperacoes: número de contratos ativos — "Qtde de Operações", "Nº de Operações", "Contratos Ativos"
- numeroIfs: mesmo que qtdeInstituicoes (campo legado, pode repetir)

Se o documento mostra uma LISTA de instituições (tabela no final), conte as linhas únicas para qtdeInstituicoes.

═══ FAIXAS A VENCER ═══
Seção: "Discriminação A Vencer por Faixa de Prazo" ou similar.
Preenche APENAS faixasAVencer — NÃO misture com faixasVencidos.

Mapeamento:
- "Até 30 dias" / "1 a 30 dias" → ate30d
- "31 a 60 dias" → d31_60
- "61 a 90 dias" → d61_90
- "91 a 180 dias" → d91_180
- "181 a 360 dias" → d181_360
- "Acima de 360 dias" / "Superior a 360 dias" → acima360d
- "Prazo Indeterminado" → prazoIndeterminado
- "Total" → total

Derivados:
- carteiraCurtoPrazo = soma das faixas até 360d (ate30d + d31_60 + d61_90 + d91_180 + d181_360)
- carteiraLongoPrazo = acima360d

FALLBACK OBRIGATÓRIO — se a seção "Discriminação A Vencer por Faixa de Prazo" NÃO existir no documento:
- NUNCA retorne carteiraCurtoPrazo = "0,00" quando carteiraAVencer > 0
- Regra: se não há faixas mas há valor a vencer, assuma que TODO o carteiraAVencer é curto prazo
  → carteiraCurtoPrazo = carteiraAVencer
  → carteiraLongoPrazo = "0,00"
- Se o documento mostrar "Limite acima de 360 dias" ou "Longo prazo" separadamente em outra seção, use esse valor para carteiraLongoPrazo e subtraia de carteiraCurtoPrazo.
- Só retorne ambos como "0,00" quando carteiraAVencer também for "0,00".

═══ FAIXAS VENCIDOS ═══
Seção: "Discriminação Vencido por Faixa de Prazo" ou "Discriminação dos Vencidos".
Preenche APENAS faixasVencidos — NÃO reutilize valores de faixasAVencer.
NÃO tem "Prazo Indeterminado" (não existe nesta tabela).

Mapeamento (idêntico a A Vencer, sem prazoIndeterminado):
- "1 a 30 dias" / "Até 30 dias" → ate30d
- "31 a 60 dias" → d31_60
- ... (mesma lógica)

VALIDAÇÃO: faixasVencidos.total deve ser IGUAL a vencidos (campo principal).
Se a seção não existir (empresa sem vencidos), todos os campos de faixasVencidos = "0,00".

═══ DOIS PERÍODOS (MUITO IMPORTANTE) ═══
Muitos SCRs mostram COMPARATIVO entre 2 datas base. Os formatos mais comuns:

**Formato A — Duas colunas lado a lado:**
Tabela com colunas "03/2026 | 03/2025 | Variação" ou "Atual | Anterior | Var %" ou "Posição Atual | Posição Anterior".
→ Coluna da ESQUERDA (data mais recente) = campos principais do JSON.
→ Coluna da DIREITA (data mais antiga) = objeto periodoAnterior.

**Formato B — Duas tabelas separadas:**
Uma tabela de modalidades para cada data base. A tabela mais recente vem primeiro no documento OU tem data mais nova no cabeçalho.
→ Tabela mais recente = campos principais. Tabela antiga = periodoAnterior.

**Formato C — Comparativo textual:**
"Em 03/2026 o total era R$ X, contra R$ Y em 03/2025"
→ Extraia ambos e preencha periodoAnterior.

**Como decidir qual é o MAIS RECENTE:**
1. Compare as datas base: a maior é a mais recente
2. Se só tem "Atual" e "Anterior" como labels, "Atual" é o mais recente
3. Em caso de dúvida: a coluna da esquerda geralmente é a mais recente em relatórios brasileiros

Se houver 2 períodos, periodoAnterior DEVE incluir:
periodoReferencia (OBRIGATÓRIO — a data mais antiga no formato MM/AAAA), carteiraAVencer, vencidos, prejuizos, limiteCredito, totalDividasAtivas, operacoesAVencer, operacoesEmAtraso, operacoesVencidas, carteiraCurtoPrazo, carteiraLongoPrazo, classificacaoRisco, qtdeInstituicoes, numeroIfs, emDia, semHistorico, faixasAVencer (completo), faixasVencidos (completo)

variacoes — calcule variação % de cada campo principal:
Fórmula: ((atual - anterior) / |anterior|) * 100
Formato: "+7,6%" | "-6,5%" | "0,0%" | "" (se anterior=0 ou ausente)
- Crescimento de dívida = positivo (RUIM para risco)
- Redução de dívida = negativo (BOM para risco)

Se APENAS 1 período disponível: deixe periodoAnterior com campos vazios, NÃO duplique os valores atuais.

═══ COMO DIFERENCIAR FAIXAS A VENCER DE FAIXAS VENCIDOS ═══
O Bacen usa SEÇÕES separadas:

**Seção "Discriminação A Vencer por Faixa de Prazo"** (ou "Cronograma A Vencer", "Desembolsos Futuros"):
- Preenche APENAS faixasAVencer
- Tem faixa "Prazo Indeterminado" (= recebíveis sem data certa, tipo rotativo de cartão)
- A soma deve bater com carteiraAVencer

**Seção "Discriminação Vencidos por Faixa de Prazo"** (ou "Atrasos por Faixa", "Vencidos por Faixa"):
- Preenche APENAS faixasVencidos
- NÃO tem "Prazo Indeterminado" (se está vencido, já está há X dias)
- A soma deve bater com vencidos

**ERRO COMUM**: confundir as duas tabelas. Se uma linha diz "31-60 dias: R$ 5.000", você precisa saber se é SOBRE O FUTURO (a vencer) ou SOBRE O PASSADO (vencido há 31-60 dias). A seção onde a linha aparece determina isso.

Mapeamento (idêntico para ambas as tabelas, faixasVencidos não tem prazoIndeterminado):
- "Até 30 dias" / "1 a 30 dias" / "0-30d" → ate30d
- "31 a 60 dias" / "31-60d" → d31_60
- "61 a 90 dias" / "61-90d" → d61_90
- "91 a 180 dias" / "91-180d" → d91_180
- "181 a 360 dias" / "181-360d" → d181_360
- "Acima de 360 dias" / "Superior a 360 dias" / ">360d" → acima360d
- "Prazo Indeterminado" (só em A Vencer) → prazoIndeterminado
- "Total" → total

═══ MOEDA ESTRANGEIRA ═══
valoresMoedaEstrangeira: se o documento mencionar exposições em USD, EUR ou outras moedas (ex: "US$ 50.000,00 em financiamento"), descreva aqui em uma linha. Senão "".

═══ REGRA DE MÚTUA EXCLUSIVIDADE (IMPORTANTE) ═══
Um valor NUNCA pode aparecer ao mesmo tempo em faixasAVencer E em faixasVencidos.
Se você está em dúvida sobre uma linha e não tem CERTEZA se é "a vencer" ou "vencido",
coloque em faixasAVencer (o cenário mais comum) e deixe faixasVencidos com zeros.
Nunca copie os mesmos números nas duas estruturas.

═══ VALIDAÇÃO ANTES DE RETORNAR ═══
Antes de produzir o JSON final, confira:
1. totalDividasAtivas ≈ carteiraAVencer + vencidos + prejuizos (margem ~5%)
2. faixasAVencer.total ≈ soma das faixas individuais
3. faixasVencidos.total ≈ soma das faixas individuais
4. Se totalDividasAtivas > "0,00" então semHistorico DEVE ser false
5. periodoReferencia NUNCA pode ficar vazio — use a data mais recente que encontrar

NÃO invente dados.`;
