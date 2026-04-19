// Prompt Gemini para extração de Cartão CNPJ.
// Mantém o prompt versionado isolado da lógica do handler em app/api/extract/route.ts.
export const PROMPT_CNPJ = `Você receberá um Cartão CNPJ emitido pela Receita Federal do Brasil (PDF, imagem ou texto extraído). Extraia os dados e retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema:
{"razaoSocial":"","nomeFantasia":"","cnpj":"","dataAbertura":"","situacaoCadastral":"","dataSituacaoCadastral":"","motivoSituacao":"","naturezaJuridica":"","cnaePrincipal":"","cnaeSecundarios":"","porte":"","capitalSocialCNPJ":"","endereco":"","telefone":"","email":"","tipoEmpresa":"","funcionarios":"","qsaDetectado":[{"nome":"","cpfCnpj":"","qualificacao":"","dataEntrada":""}]}

IMPORTANTE: se o Cartão CNPJ tiver seção "QUADRO DE SÓCIOS E ADMINISTRADORES" (QSA), extraia TAMBÉM todos os sócios em "qsaDetectado[]" preservando:
- nome completo como aparece
- cpfCnpj (mesmo se mascarado: "***.456.789-**")
- qualificacao com código (ex: "49-Sócio-Administrador")
- dataEntrada em DD/MM/YYYY se houver
Esse é um BONUS — mesmo sem QSA, preencha os outros campos. Se não encontrar QSA, qsaDetectado=[].

Regras de extração:
- razaoSocial e nomeFantasia: PRESERVE acentos, cedilha e pontuação exatamente como no documento (ex: "Alimentação & Cia Ltda")
- cnpj: formato XX.XXX.XXX/XXXX-XX obrigatório (com pontos, barra e hífen)
- dataAbertura e dataSituacaoCadastral: formato DD/MM/YYYY
- situacaoCadastral: exatamente como consta — valores possíveis: "ATIVA" | "BAIXADA" | "INAPTA" | "SUSPENSA" | "NULA"
- motivoSituacao: SOMENTE se houver motivo explícito após o status (ex: "Omissa no período", "Extinção por encerramento"). Para ATIVA, deixe "".
- naturezaJuridica: código + descrição (ex: "206-2 - Sociedade Empresária Limitada")
- cnaePrincipal: código + descrição (ex: "46.59-4-99 - Comércio atacadista de outros equipamentos")
- cnaeSecundarios: separe por " ; " — inclua código e descrição de cada um. Se vazio, "".
- porte: valores possíveis — "MICRO EMPRESA" | "EMPRESA DE PEQUENO PORTE" | "DEMAIS" | "MEI"
- capitalSocialCNPJ: em reais com formato brasileiro COM prefixo "R$" (ex: "R$ 220.000,00"). Separador de milhar ponto, decimal vírgula.
- endereco: concatene em UMA linha — logradouro + número + complemento + bairro + município + UF + CEP (ex: "Av. Paulista, 1578, Sala 12, Bela Vista, São Paulo/SP, CEP 01310-200")
- telefone: incluir DDD (ex: "(11) 3333-4444"). Múltiplos: separe por " / "
- email: apenas o endereço, sem "mailto:" (ex: "contato@empresa.com.br")
- tipoEmpresa: derive da natureza jurídica — "LTDA" | "S/A" | "MEI" | "EIRELI" | "SLU" | "SS" | "COOPERATIVA"
- funcionarios: número como string se constar, senão ""
- Campos ausentes: ""
- NÃO invente dados. NÃO preencha campos com "N/A" ou "Não informado" — use "" direto.`;
