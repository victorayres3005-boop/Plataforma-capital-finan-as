// Prompt Gemini para extração de Quadro de Sócios e Administradores (QSA).
export const PROMPT_QSA = `Você receberá um documento com o Quadro de Sócios e Administradores (QSA). O documento pode ser:
(A) Cartão CNPJ da Receita Federal — contém seção "QUADRO DE SÓCIOS E ADMINISTRADORES" no final
(B) Contrato Social — contém cláusulas de sócios com participação em cotas
(C) Relatório CreditHub/Serasa — tabela de sócios
(D) Quadro Societário extraído de bureau de crédito
(E) Ata de reunião ou alteração contratual

Retorne APENAS JSON válido, sem markdown.

Schema OBRIGATÓRIO (preencha TODOS os campos que encontrar):
{"capitalSocial":"","quadroSocietario":[{"nome":"","cpfCnpj":"","qualificacao":"","participacao":"","dataEntrada":""}]}

═══ COMO ENCONTRAR OS SÓCIOS ═══

No CARTÃO CNPJ da Receita Federal, procure por:
- "QUADRO DE SÓCIOS E ADMINISTRADORES"
- "QSA"
- "Nome/Nome Empresarial" seguido de "Qualificação"
- Tabela com colunas: Nome | Qualificação | [CPF parcial]
- Os CPFs aparecem MASCARADOS no cartão CNPJ (ex: "***.456.789-**")

No CONTRATO SOCIAL, procure por:
- Cláusulas "Dos Sócios" / "Do Capital Social" / "Da Administração"
- Nome completo + CPF + quantidade de cotas + %
- "JOÃO DA SILVA, brasileiro, [...], CPF 123.456.789-00, titular de 500.000 cotas, representando 50% do capital"

No QSA de BUREAU, procure por tabelas com colunas:
- Sócio | CPF/CNPJ | Qualificação | Participação | Data de Entrada

═══ REGRAS DE EXTRAÇÃO (OBRIGATÓRIO) ═══

1. EXTRAIA TODOS os sócios encontrados, SEM EXCEÇÃO. Mesmo que faltem alguns campos.
2. Se o documento tem 2 sócios, retorne 2 objetos em quadroSocietario[]. Se tem 5, retorne 5.
3. NUNCA retorne quadroSocietario: [] se há QUALQUER menção a sócios no documento.
4. Se encontrar apenas o nome do sócio sem CPF, AINDA ASSIM inclua com cpfCnpj="".
5. Se encontrar "***.456.789-**", retorne como está (CPF mascarado é válido).

═══ CAMPOS ═══

nome: Nome completo EXATAMENTE como no documento, preservando acentos, cedilhas, maiúsculas/minúsculas.
  - CORRETO: "João da Silva Júnior" ou "JOAO DA SILVA JUNIOR" (copie o original)
  - Se o nome for empresa, use a razão social (ex: "Empresa Holding Ltda")

cpfCnpj: Documento do sócio.
  - CPF completo: "XXX.XXX.XXX-XX" (11 dígitos)
  - CNPJ completo: "XX.XXX.XXX/XXXX-XX" (14 dígitos)
  - CPF mascarado (cartão CNPJ): mantenha como "***.456.789-**" ou "***.XXX.XXX-**"
  - Se não encontrar, "" (vazio)

qualificacao: Função/tipo de participação
  - Formatos comuns: "49 - Sócio-Administrador", "22 - Sócio", "05 - Administrador", "10 - Diretor", "Sócio", "Sócio-Administrador", "Administrador"
  - Copie EXATAMENTE como aparece no documento (com código numérico se houver)

participacao: Percentual de participação no capital social
  - Formato: "50,00%" ou "33,33%" (com vírgula decimal e símbolo %)
  - Se o documento mostrar em cotas (ex: "500.000 cotas de R$1,00"), calcule o % sobre o capital total
  - Se não houver informação de participação, ""

dataEntrada: Data de entrada na sociedade
  - Formato DD/MM/AAAA
  - No cartão CNPJ aparece na coluna "Data de Entrada na Sociedade"
  - Se não houver, ""

capitalSocial: Valor total do capital social da empresa
  - Formato brasileiro com prefixo: "R$ 500.000,00"
  - Procure por "Capital Social", "Capital Integralizado"
  - Se não encontrar, ""

═══ EXCLUSÕES (NÃO inclua no QSA) ═══
- Testemunhas no contrato
- Advogados, contadores, despachantes
- Procuradores sem participação societária
- Cônjuges sem cotas
- Funcionários ou administradores contratados sem participação

═══ DEDUPLICAÇÃO ═══
Se o mesmo CPF aparecer mais de uma vez (ex: "Sócio" e também "Administrador"), inclua APENAS UMA VEZ usando a qualificação mais completa (prefira "Sócio-Administrador" a apenas "Sócio" ou "Administrador").

═══ VALIDAÇÃO ANTES DE RETORNAR ═══
Antes de produzir o JSON, confira CADA ITEM desta checklist:
1. Soma das participações ≈ 100% (tolerancia 1%). Se ultrapassar, revise duplicacao ou socio PJ estrangeiro.
2. Cada socio tem pelo menos NOME OU CPF/CNPJ (nunca ambos vazios).
3. CPF formato XXX.XXX.XXX-XX (11 digitos). CNPJ formato XX.XXX.XXX/XXXX-XX (14 digitos).
4. Qualificacoes usam os codigos RFB quando possivel (22, 49, 05, etc.) OU texto descritivo.
5. NUNCA retorne quadroSocietario=[] se o documento menciona socios — prefira entrada parcial.
- NÃO invente dados — campos ausentes = "" (string vazia)

═══ EXEMPLO DE SAÍDA ═══
{
  "capitalSocial": "R$ 500.000,00",
  "quadroSocietario": [
    {"nome":"João da Silva","cpfCnpj":"123.456.789-00","qualificacao":"49 - Sócio-Administrador","participacao":"60,00%","dataEntrada":"15/03/2010"},
    {"nome":"Maria Oliveira","cpfCnpj":"987.654.321-00","qualificacao":"22 - Sócio","participacao":"40,00%","dataEntrada":"15/03/2010"}
  ]
}

LEMBRE-SE: retornar quadroSocietario vazio quando há sócios no documento é o PIOR erro possível. Melhor retornar com campos incompletos do que vazio.`;
