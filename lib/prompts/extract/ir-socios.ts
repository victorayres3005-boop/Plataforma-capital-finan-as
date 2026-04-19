// Prompt Gemini para extração de Imposto de Renda de Pessoa Física (DIRPF) de sócios.
// Ver reference_ir_extraction.md para contexto do formato GRUPO+CÓDIGO (DIRPF 2020+).
export const PROMPT_IR_SOCIOS = `Você receberá um documento de Imposto de Renda de sócio: pode ser apenas o Recibo de Entrega (DIRPF), uma Declaração Completa ou extrato da Receita Federal. Retorne APENAS JSON válido, sem markdown.

Schema:
{"nomeSocio":"","cpf":"","anoBase":"","tipoDocumento":"recibo","numeroRecibo":"","dataEntrega":"","situacaoMalhas":false,"debitosEmAberto":false,"descricaoDebitos":"","rendimentosTributaveis":"0,00","rendimentosIsentos":"0,00","rendimentoTotal":"0,00","impostoDefinido":"0,00","valorQuota":"0,00","bensImoveis":"0,00","bensVeiculos":"0,00","aplicacoesFinanceiras":"0,00","outrosBens":"0,00","totalBensDireitos":"0,00","dividasOnus":"0,00","patrimonioLiquido":"0,00","impostoPago":"0,00","impostoRestituir":"0,00","temSociedades":false,"sociedades":[],"coerenciaComEmpresa":true,"observacoes":""}

═══ REGRA ABSOLUTA: LER VALORES COM ATENÇÃO ═══
O Gemini costuma errar valores de DIRPF. Você DEVE:
1. LER o documento número por número, sem chutar
2. Preservar EXATAMENTE a quantidade de dígitos que aparece
3. NUNCA mover vírgulas ou pontos
4. Se o documento mostra "R$ 45.000,00", você escreve "45.000,00" (são 45 mil, NÃO 45 milhões)
5. NÃO some zeros a mais. NÃO corte zeros.

═══ REGRA CRÍTICA ANTI-CONFUSAO DE SEPARADORES ═══
Separador brasileiro: PONTO para milhar, VÍRGULA para decimal.
- "R$ 45.000,00" = quarenta e cinco mil reais (NÃO 45 milhões, NÃO 45)
- "R$ 1.234.567,89" = um milhão duzentos e trinta e quatro mil
- "850.000,00" = oitocentos e cinquenta mil
NUNCA interprete como formato americano "1,234,567.89".

Valores típicos de Pessoa Física no Brasil:
- Rendimento tributável anual de um sócio de PME: R$ 30k a R$ 3M (raramente >R$ 5M)
- Salário mensal registrado em DIRPF (anualizado): R$ 24k a R$ 1M
- Patrimônio líquido declarado: R$ 50k a R$ 20M (raramente >R$ 50M)

Se rendimentoTotal > R$ 10.000.000 para pessoa física, provavelmente errou o separador.
Se bensImoveis > R$ 100.000.000 para PF, releia o documento — provavelmente errou.

Campos comuns em documentos de DIRPF (nomes típicos que você verá):
- "Total de Rendimentos Tributáveis Recebidos de PJ" → rendimentosTributaveis
- "Rendimentos Isentos e Não Tributáveis" → rendimentosIsentos
- "Total Geral dos Rendimentos" / "Rendimento Bruto" → rendimentoTotal
- "Imposto Devido" / "Total do Imposto Apurado" → impostoDefinido
- "Imposto Pago/Retido" / "IRRF" → impostoPago
- "Imposto a Restituir" / "Restituição" → impostoRestituir
- "Total de Bens e Direitos" → totalBensDireitos (use o valor total resumido, não some manualmente)
- "Dívidas e Ônus Reais" / "Total de Dívidas e Ônus Reais" → dividasOnus

═══ BENS E DIREITOS — COMO EXTRAIR CORRETAMENTE ═══

⚠️ FORMATO ATUAL DA DIRPF (2020+): A "Declaração de Bens e Direitos" lista cada item em uma tabela
com DUAS colunas numéricas iniciais: **GRUPO** (2 dígitos) e **CÓDIGO** (2 dígitos), seguidas de
DISCRIMINAÇÃO, SITUAÇÃO EM 31/12 do ano anterior e SITUAÇÃO EM 31/12 do ano-calendário.

Exemplo real que você verá:
  GRUPO  CÓDIGO  DISCRIMINAÇÃO                          31/12/2023      31/12/2024
  01     12      CASA ...                               640.000,00      640.000,00
  02     01      VEICULO VW FOX ...                      34.615,00       34.615,00
  02     01      VEICULO RAM RAMPAGE ...                      0,00      220.972,00
  02     01      VEICULO VOLVO CX90 ...                 199.847,00      199.847,00
  03     02      QUOTAS DE CAPITAL ...                  100.000,00      100.000,00
  04     01      SALDO POUPANÇA ...                          0,00          401,14
  06     01      CONTA CORRENTE ...                         10,00           10,00

⚠️ REGRA DE OURO: **USE SEMPRE A COLUNA MAIS RECENTE (31/12 do ano-calendário)**, NUNCA a do ano
anterior. Ignore completamente a penúltima coluna.

═══ MAPEAMENTO DOS GRUPOS ═══

→ **bensImoveis**: some TODOS os itens cujo **GRUPO = 01** (casa, apartamento, sala, terreno,
  imóvel rural, benfeitoria, imóvel no exterior — qualquer imóvel).

→ **bensVeiculos**: some TODOS os itens cujo **GRUPO = 02** (veículo terrestre, aeronave,
  embarcação, outros bens móveis registráveis — carros, motos, caminhões, jet-skis, barcos,
  aviões). **Se aparecem múltiplos carros, some TODOS, não pegue só o primeiro.**

→ **aplicacoesFinanceiras**: some TODOS os itens cujo **GRUPO = 03, 04, 05, 06 ou 07**
  (participações societárias, contas bancárias, aplicações, fundos, poupança, CDB, Tesouro,
  previdência, conta corrente). Inclui contas correntes e saldos em conta-poupança.

→ **outrosBens**: some os itens cujo **GRUPO = 08, 09, 10 ou superior** (créditos de empréstimo,
  joias, obras de arte, direitos autorais, bens intangíveis).

═══ FORMATO LEGADO (DIRPF antiga, pré-2019) ═══
Se o documento NÃO tiver colunas GRUPO/CÓDIGO separadas e usar código único de 2 dígitos
(ex: "12 - CASA"), use o mapeamento abaixo:
  - 11-19 → bensImoveis
  - 21-29 → bensVeiculos
  - 31-49 → aplicacoesFinanceiras
  - 51-99 → outrosBens

═══ COMO PREENCHER totalBensDireitos ═══

1º) PROCURE PRIMEIRO a seção "EVOLUÇÃO PATRIMONIAL" (geralmente na última página do PDF).
    Ela traz linhas como "Bens e direitos em 31/12/2024 — 1.202.758,23". ESSE é o total
    autoritativo. Use-o.

2º) Se não achar Evolução Patrimonial, use a linha "TOTAL" que aparece no fim da tabela
    de Bens e Direitos (última linha, após todos os itens).

3º) Se nem isso houver, SOME bensImoveis + bensVeiculos + aplicacoesFinanceiras + outrosBens.

❌ NUNCA pegue o valor do PRIMEIRO item da tabela como se fosse o total — isso é um erro
   recorrente. O total é SEMPRE uma linha separada, identificada como "TOTAL" ou
   "Bens e direitos em 31/12/YYYY".

═══ VERIFICAÇÃO DE CONSISTÊNCIA (auto-checagem obrigatória) ═══
Antes de devolver o JSON, CONFIRME:
  bensImoveis + bensVeiculos + aplicacoesFinanceiras + outrosBens ≈ totalBensDireitos
Se a diferença for > 5%, você ERROU alguma categoria. Releia a tabela item por item e
refaça as somas. Diferença grande geralmente significa que você esqueceu um grupo inteiro.

Regras críticas:
- nomeSocio e anoBase são OBRIGATÓRIOS — não retorne JSON sem eles
- anoBase: use o ANO-CALENDÁRIO, NÃO o ano do exercício
  Ex: "EXERCÍCIO 2025 — ANO-CALENDÁRIO 2024" → anoBase="2024"
  Ex: "DECLARAÇÃO 2024 (ano-base 2023)" → anoBase="2023"
- cpf: formato XXX.XXX.XXX-XX
- tipoDocumento: "recibo" se for apenas o recibo de entrega; "declaracao" se for declaração completa; "extrato" se for extrato da Receita
- numeroRecibo: número do recibo de transmissão (ex: "1234567890123456")
- dataEntrega: data de envio/transmissão em DD/MM/AAAA

Situação fiscal:
- situacaoMalhas: true se mencionar "retida em malha", "pendências", "intimação" ou similar
- debitosEmAberto: true se mencionar débitos, parcelamentos ativos ou pendências financeiras
- descricaoDebitos: descrição resumida dos débitos se debitosEmAberto=true, senão ""

RECIBO DE ENTREGA (DIRPF) — documento simples, geralmente 1 página:
- tipoDocumento = "recibo"
- Extraia APENAS: nomeSocio, cpf, anoBase, numeroRecibo, dataEntrega
- TODOS os valores monetários = "0,00" (o recibo não contém valores detalhados)
- temSociedades = false, sociedades = [] (não aparecem no recibo)
- situacaoMalhas e debitosEmAberto = false (não constam no recibo)

DECLARAÇÃO COMPLETA — extraia valores em formato brasileiro:
- rendimentosTributaveis: total de rendimentos tributáveis (salário, pró-labore, aluguéis, etc.)
- rendimentosIsentos: rendimentos isentos e não tributáveis (FGTS, lucros e dividendos, poupança, etc.)
- rendimentoTotal: soma dos dois anteriores
- impostoDefinido: imposto apurado/devido total (buscar "Imposto Devido", "Total do Imposto Apurado")
- valorQuota: valor de cada parcela se houver parcelamento, senão "0,00"
- impostoPago: total já recolhido (IRRF + carnê-leão + quotas pagas)
- impostoRestituir: valor a restituir se positivo, senão "0,00"

Patrimônio (declaração completa):
- bensImoveis, bensVeiculos, aplicacoesFinanceiras, outrosBens: valores de bens e direitos por categoria
- totalBensDireitos: total de bens e direitos
- dividasOnus: total de dívidas e ônus reais
- patrimonioLiquido: totalBensDireitos - dividasOnus

Sociedades:
- temSociedades: true se o sócio declarou participação em sociedades
- sociedades: lista de empresas onde o sócio tem participação [{"razaoSocial":"","cnpj":"","participacao":""}]
- coerenciaComEmpresa: true se as sociedades declaradas incluem a empresa que está sendo analisada

- observacoes: informações relevantes não capturadas acima
- NÃO invente dados`;
