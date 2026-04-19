// Prompt Gemini para extração de relatório de Curva ABC de clientes.
export const PROMPT_CURVA_ABC = `Você receberá um relatório de Curva ABC de clientes (de ERP, planilha ou sistema contábil). Colunas típicas: Cliente, Peso (kg), Valor Total, Ticket Médio, % Participação, % Acumulado, Classe ABC.

Retorne APENAS JSON válido, sem markdown, sem texto adicional:

{"clientes":[{"posicao":1,"nome":"","cnpjCpf":"","valorFaturado":"0,00","percentualReceita":"0.00","percentualAcumulado":"0.00","classe":"A"}],"totalClientesNaBase":0,"totalClientesExtraidos":0,"periodoReferencia":"","receitaTotalBase":"0,00","concentracaoTop3":"0.00","concentracaoTop5":"0.00","concentracaoTop10":"0.00","totalClientesClasseA":0,"receitaClasseA":"0,00","maiorCliente":"","maiorClientePct":"0.00","alertaConcentracao":false}

FORMATOS NUMÉRICOS (ATENÇÃO à mistura):
- valorFaturado / receitaTotalBase / receitaClasseA: formato BRASILEIRO com vírgula decimal (ex: "4.664.989,95")
- percentualReceita / percentualAcumulado / concentracaoTopN / maiorClientePct: número com PONTO decimal, SEM % (ex: "36.35", NÃO "36,35%")

Regras de extração:
1. Extraia TODOS os clientes em ordem decrescente de valorFaturado
2. posicao: ranking iniciando em 1
3. nome: nome do cliente preservando acentos
4. cnpjCpf: se o documento separar por coluna, use o formato identificado. Se o nome vier com CPF/CNPJ no início (ex: "59.580.931 MARIA LUIZA DA SILVA"), SEPARE:
   * cnpjCpf = "59.580.931" (apenas os dígitos/pontos)
   * nome = "MARIA LUIZA DA SILVA"
   Se não houver CPF/CNPJ identificável, cnpjCpf = ""
5. classe: "A" | "B" | "C" exatamente como no documento
6. periodoReferencia: período dos dados (ex: "Jan-Dez/2024", "2024", "Últimos 12 meses") se constar, senão ""

Campos calculados:
7. totalClientesNaBase: total de clientes na base de dados (linha "Total Geral" / "Total de Clientes" — exclui a própria linha de total)
8. totalClientesExtraidos: contagem do array "clientes" retornado (pode ser menor que totalClientesNaBase se o doc truncar a lista)
9. receitaTotalBase: valor da linha "Total Geral" do documento
10. concentracaoTop3: soma dos percentualReceita dos 3 primeiros clientes (ex: "52.10")
11. concentracaoTop5: idem para os 5 primeiros
12. concentracaoTop10: idem para os 10 primeiros
13. totalClientesClasseA: quantidade de clientes com classe "A"
14. receitaClasseA: soma dos valorFaturado de clientes classe A
15. maiorCliente: nome do cliente na posição 1
16. maiorClientePct: percentualReceita do cliente na posição 1
17. alertaConcentracao: true SE maiorClientePct > 30 (concentração crítica)

NÃO invente dados.`;
