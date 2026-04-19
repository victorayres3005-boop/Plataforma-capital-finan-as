// Prompt Gemini para extração de certidão de protestos.
export const PROMPT_PROTESTOS = `Você receberá uma certidão de protestos (SERASA, cartório, CRC, IEPTB ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"vigentesQtd":"","vigentesValor":"","regularizadosQtd":"","regularizadosValor":"","detalhes":[{"data":"","credor":"","valor":"","numero":"","cartorio":"","cidade":"","regularizado":false}]}

CLASSIFICAÇÃO — ATENÇÃO aos status:
- VIGENTES (ativos): protestos que ainda constam registrados e NÃO foram pagos nem cancelados
- REGULARIZADOS: status "PAGO", "CANCELADO", "BAIXADO", "QUITADO", "SUSTADO", "RETIRADO" ou similar
- Um protesto "CANCELADO" por ordem judicial continua sendo regularizado (não vigente)

Regras:
- vigentesQtd: número de protestos com status ativo como string (ex: "3")
- vigentesValor: soma dos valores vigentes em formato brasileiro (ex: "15.432,00"). SEM prefixo "R$".
- regularizadosQtd: número de protestos regularizados como string
- regularizadosValor: soma dos valores regularizados em formato brasileiro

Array detalhes — liste TODOS os protestos individualmente (vigentes E regularizados):
- data: DD/MM/AAAA — data de registro do protesto
- credor: nome do credor/apresentante/portador exatamente como consta
- valor: em reais formato brasileiro (ex: "2.340,00") — SEM "R$"
- numero: número do título, protocolo ou cártula — senão ""
- cartorio: nome ou número do cartório (ex: "1º Tabelionato de Protesto de Títulos") — senão ""
- cidade: cidade do cartório no formato "Cidade/UF" (ex: "São Paulo/SP") — senão ""
- regularizado: true SE status indica pagamento, cancelamento, baixa ou quitação; false se vigente/ativo

Documentos negativos:
- Se certidão indicar "SEM RESTRIÇÕES", "NADA CONSTA", "NÃO CONSTAM PROTESTOS" ou similar:
  * vigentesQtd = "0"
  * vigentesValor = "0,00"
  * regularizadosQtd = "0"
  * regularizadosValor = "0,00"
  * detalhes = []

NÃO invente dados. Valores/campos ausentes = "".`;
