// Prompt Gemini para extração de relatório de grupo econômico.
export const PROMPT_GRUPO_ECONOMICO = `Você receberá um relatório de grupo econômico (Credit Bureau, SERASA, Escavador, relatório próprio ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"empresas":[{"razaoSocial":"","cnpj":"","relacao":"","participacaoSocio":"","scrTotal":"","protestos":"","processos":"","situacaoCadastral":""}]}

Regras:
- Liste TODAS as empresas vinculadas ao grupo econômico — EXCETO a empresa principal que está sendo analisada
- INCLUA empresas com status "BAIXADA", "INAPTA" ou "SUSPENSA" — elas são importantes para análise de histórico do grupo (sinalize no campo situacaoCadastral)
- razaoSocial: nome completo exatamente como consta, preservando acentos
- cnpj: formato XX.XXX.XXX/XXXX-XX
- relacao: tipo de vínculo — use UM dos valores:
  * "Controladora" — empresa que controla a analisada
  * "Controlada" — empresa controlada pela analisada
  * "Coligada" — participação relevante sem controle
  * "via Sócio" — mesmo sócio PF em ambas
  * "via QSA" — sócio PJ em comum
  * "Participação" — outra forma de vínculo societário
- participacaoSocio: percentual % do sócio comum na empresa vinculada (ex: "50%") — senão ""
- scrTotal: exposição SCR total se constar, formato "R$ 1.200.000,00" — senão ""
- protestos: quantidade de protestos da empresa vinculada (ex: "2") — senão ""
- processos: quantidade de processos (ex: "5") — senão ""
- situacaoCadastral: "ATIVA" | "BAIXADA" | "INAPTA" | "SUSPENSA" | "NULA" — senão ""

Ordenação: coloque empresas ATIVAS primeiro, depois as baixadas/inaptas/suspensas.

Se não houver grupo econômico: retorne {"empresas":[]}.

NÃO invente dados.`;
