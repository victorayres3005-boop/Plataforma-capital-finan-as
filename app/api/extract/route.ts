export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, ProtestosData, ProcessosData, GrupoEconomicoData, CurvaABCData, DREData, BalancoData, IRSocioData, RelatorioVisitaData } from "@/types";
import { sanitizeDescricaoDebitos, sanitizeStr, sanitizeEnum, sanitizeMoney } from "@/lib/extract/sanitize";

export const runtime = "nodejs";

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS: string[] = [];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}



function hasReadableContent(text: string): boolean {
  const sample = text.substring(2000, Math.min(text.length, 8000));
  if (sample.length < 100) return text.trim().length >= 20;

  // Check 1: ratio de caracteres estranhos (fora ASCII 32-126 + acentuados PT-BR)
  const validChars = /[\x20-\x7EÀ-ÿçÇãÃõÕáéíóúâêîôûàèìòùäëïöü\n\r\t]/;
  let strangeCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (!validChars.test(sample[i])) strangeCount++;
  }
  if (strangeCount / sample.length > 0.3) {
    console.log(`[hasReadableContent] Failed: ${(strangeCount / sample.length * 100).toFixed(1)}% strange chars`);
    return false;
  }

  // Check 2: sequências longas sem espaço (encoding quebrado)
  const longSequences = sample.match(/\S{50,}/g);
  if (longSequences && longSequences.length >= 3) {
    console.log(`[hasReadableContent] Failed: ${longSequences.length} sequences with 50+ chars without spaces`);
    return false;
  }

  // Check 3: ratio de palavras reconhecíveis (PT-BR)
  const words = sample.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 0) {
    const recognizable = /^[a-zA-ZÀ-ÿçÇ0-9.,;:!?()\-/]+$/;
    const recognizedCount = words.filter(w => recognizable.test(w)).length;
    const ratio = recognizedCount / words.length;
    if (ratio < 0.4) {
      console.log(`[hasReadableContent] Failed: only ${(ratio * 100).toFixed(1)}% recognizable words (${recognizedCount}/${words.length})`);
      return false;
    }
  }

  // Check 4: palavras comuns em português (check original)
  const commonWords = /\b(de|do|da|dos|das|que|para|com|por|uma|não|são|será|social|capital|sócio|contrato|empresa|sociedade|cnpj|cpf|quotas|artigo|cláusula|objeto|prazo|foro|comarca|administra|faturamento|receita|valor|total|mês|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi;
  const matches = sample.match(commonWords);
  return (matches?.length || 0) >= 5;
}

// ─────────────────────────────────────────
// Extração de texto (PDF e DOCX)
// ─────────────────────────────────────────
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  try {
    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(buffer);
      return data.text ?? "";
    }
    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    }
    return "";
  } catch (err) {
    console.error(`[extractText] Failed for .${ext}:`, err);
    return "";
  }
}

// ─────────────────────────────────────────
// Extração de Excel (Faturamento)
// ─────────────────────────────────────────
async function extractExcel(buffer: Buffer): Promise<FaturamentoData> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const meses: { mes: string; valor: string }[] = [];

  // Tentar encontrar dados de faturamento na primeira sheet
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia");

  // Estratégia: procurar colunas com meses e valores
  const monthNames: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // pular cabeçalho
    const cells = row.values as (string | number | null)[];
    if (!cells || cells.length < 2) return;

    // Procurar uma célula com mês e outra com valor numérico
    let mesStr = "";
    let valorNum = 0;

    for (const cell of cells) {
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim().toLowerCase();

      // Verificar se é um mês
      if (!mesStr) {
        for (const [name, num] of Object.entries(monthNames)) {
          if (str.includes(name)) {
            // Tentar pegar o ano do texto
            const yearMatch = str.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
            mesStr = `${num}/${year}`;
            break;
          }
        }
        // Verificar formato MM/YYYY ou MM/YY
        const dateMatch = str.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
        if (dateMatch && !mesStr) {
          const m = dateMatch[1].padStart(2, "0");
          const y = dateMatch[2].length === 2 ? `20${dateMatch[2]}` : dateMatch[2];
          mesStr = `${m}/${y}`;
        }
      }

      // Verificar se é valor numérico
      if (typeof cell === "number" && cell > 0) {
        valorNum = cell;
      } else if (typeof cell === "string") {
        const numStr = cell.replace(/[R$\s.]/g, "").replace(",", ".");
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed) && parsed > 0 && parsed > valorNum) {
          valorNum = parsed;
        }
      }
    }

    if (mesStr && valorNum > 0) {
      meses.push({
        mes: mesStr,
        valor: valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      });
    }
  });

  // Ordenar meses por data crescente (mais antigo primeiro)
  const mesesOrdenados = [...meses].sort((a, b) => {
    const [ma, ya] = a.mes.split("/").map(Number);
    const [mb, yb] = b.mes.split("/").map(Number);
    return (ya - yb) || (ma - mb);
  });
  // Últimos 12 meses (independente de valor)
  const mesesFMM = mesesOrdenados.slice(-12);

  const parseBRVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;

  // somatoriaAno = soma dos ÚLTIMOS 12 meses (valor anualizado)
  const valoresAll = meses.map(m => parseBRVal(m.valor));
  const valores12 = mesesFMM.map(m => parseBRVal(m.valor));
  const soma = valores12.reduce((a, b) => a + b, 0);

  // FMM = soma / quantidade real de meses (não fixo em 12)
  const valoresFMM = mesesFMM.map(m => parseBRVal(m.valor));
  const media = mesesFMM.length > 0 ? valoresFMM.reduce((a, b) => a + b, 0) / mesesFMM.length : 0;

  // Meses zerados nos últimos 12
  const mesesZeradosExcel = mesesFMM
    .filter((_, i) => valoresFMM[i] === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  // Verificar alertas
  const faturamentoZerado = valoresAll.length === 0 || valoresAll.every(v => v === 0);
  const ultimoMes = mesesOrdenados.length > 0 ? mesesOrdenados[mesesOrdenados.length - 1].mes : "";

  // Verificar se dados estão atualizados (últimos 60 dias)
  let dadosAtualizados = true;
  if (ultimoMes) {
    const [m, y] = ultimoMes.split("/").map(Number);
    const lastDataDate = new Date(y, m - 1, 28); // último dia do mês dos dados
    const now = new Date();
    const diffDays = (now.getTime() - lastDataDate.getTime()) / (1000 * 60 * 60 * 24);
    dadosAtualizados = diffDays <= 75; // ~60 dias + margem
  }

  return {
    meses,
    somatoriaAno: soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    mediaAno: media.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    faturamentoZerado,
    dadosAtualizados,
    ultimoMesComDados: ultimoMes,
    mesesZerados: mesesZeradosExcel,
    quantidadeMesesZerados: mesesZeradosExcel.length,
    temMesesZerados: mesesZeradosExcel.length > 0,
  };
}

// ─────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────

const PROMPT_CNPJ = `Você receberá um Cartão CNPJ emitido pela Receita Federal do Brasil (PDF, imagem ou texto extraído). Extraia os dados e retorne APENAS JSON válido, sem markdown, sem texto adicional.

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

const PROMPT_QSA = `Você receberá um documento com o Quadro de Sócios e Administradores (QSA). O documento pode ser:
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

═══ VALIDAÇÃO ═══
- Soma das participações deve ser ≤ 100%
- Se ultrapassar, verifique duplicação ou sócio PJ estrangeiro
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

const PROMPT_CONTRATO = `Você receberá um CONTRATO SOCIAL, ESTATUTO SOCIAL, ATO CONSTITUTIVO, ALTERAÇÃO CONTRATUAL, CONSOLIDAÇÃO ou ADITIVO de uma empresa brasileira. O documento pode estar em PDF nativo, PDF escaneado com OCR ruidoso, ou imagem. Sua tarefa é extrair TUDO o que for possível — mesmo informação parcial. Retorne APENAS JSON válido, sem markdown, sem comentários, sem texto fora do JSON.

Schema OBRIGATÓRIO (preencha TODOS os campos que encontrar):
{"socios":[{"nome":"","cpf":"","participacao":"","qualificacao":"","cotas":""}],"capitalSocial":"","objetoSocial":"","dataConstituicao":"","temAlteracoes":false,"ultimaAlteracao":"","prazoDuracao":"","administracao":"","foro":"","sede":""}

═══ REGRA ZERO — NUNCA RETORNE VAZIO ═══
Contratos sociais SEMPRE têm pelo menos:
- Nome da empresa (na abertura, primeira página)
- Objeto social (o que a empresa faz)
- Capital social (valor das cotas)
- Ao menos 1 sócio (sem sócio não existe contrato)

Se você está retornando todos os campos vazios, VOLTE e olhe de novo — a informação ESTÁ no documento. Releia o cabeçalho, as cláusulas, o rodapé, as assinaturas. Se o OCR está ruidoso, extraia o que conseguir inferir com alta confiança — é MELHOR retornar campos parciais do que tudo vazio.

═══ ONDE ENCONTRAR CADA INFORMAÇÃO ═══

SÓCIOS — procure em QUALQUER destas seções:
1. Cláusula "Dos Sócios" / "Do Capital Social" / "Da Administração" / "Cláusula Primeira" / "CLÁUSULA 1ª"
2. Abertura do contrato (primeira página): "Fulano de Tal, brasileiro, [...], CPF 123.456.789-00, residente em [...]"
3. Tabela de distribuição de cotas
4. Página de assinaturas (finais): cada assinatura é normalmente de um sócio
5. Alterações/consolidações: olhe o quadro societário FINAL, não o original

Formatos comuns de sócio no corpo do contrato:
- "JOÃO DA SILVA, brasileiro, casado, empresário, portador do CPF nº 123.456.789-00, titular de 500.000 cotas, representando 50% do capital social"
- "Maria Oliveira, RG 12.345.678, CPF 987.654.321-00, residente na Rua X, titular de 50 (cinquenta) cotas de R$ 1.000,00 cada"
- Em tabelas: "Nome | CPF | Cotas | %"

CAPITAL SOCIAL — procure por:
- "Capital Social", "Capital Subscrito", "Capital Integralizado", "Cláusula do Capital"
- "R$ 100.000,00 (cem mil reais) dividido em 100.000 cotas de R$ 1,00 cada"
- Tabelas que somam o total de cotas
- SEMPRE formato "R$ VALOR,CC" — com prefixo "R$" e separador brasileiro

OBJETO SOCIAL — procure por:
- Cláusula "Do Objeto Social" / "Objeto" / "Atividade" / "Cláusula Segunda"
- Texto começando com "A sociedade tem por objeto..." ou "A empresa tem como atividade..."
- Lista de CNAEs descritos
- **É O CAMPO MAIS FÁCIL DE EXTRAIR — sempre tem, quase sempre na primeira página**
- Reescreva em Título Case, texto corrido, atividades separadas por vírgula, máx 300 caracteres
- Ex: "Comércio atacadista de produtos alimentícios, fabricação de alimentos congelados, transporte rodoviário de cargas"

DATA DE CONSTITUIÇÃO — procure por:
- "data da constituição", "constituída em", "fundada em"
- Data mais antiga mencionada no documento (NÃO a data da alteração atual)
- Cabeçalho do primeiro instrumento: "Instrumento Particular de Constituição [...] de 15/03/2010"
- Formato de saída: DD/MM/YYYY

ADMINISTRAÇÃO — procure por:
- Cláusula "Da Administração" / "Administradores"
- "A administração será exercida pelo sócio [nome]"
- "fica nomeado administrador [nome]"
- Ex de saída: "João da Silva (Administrador)" ou "João da Silva e Maria Oliveira (Administradores)"

FORO — procure por:
- Última cláusula do contrato (quase sempre a última)
- "Fica eleito o foro da Comarca de [Cidade/UF]"
- Ex de saída: "São Paulo/SP"

SEDE — procure por:
- Cláusula "Da Sede" / "Do Endereço" / primeira página após identificação da empresa
- Endereço completo: rua, número, bairro, cidade, UF, CEP
- Retorne em uma linha: "Rua das Flores, 123, Centro, São Paulo/SP, CEP 01234-567"

PRAZO DE DURAÇÃO — procure por:
- "Prazo indeterminado" (mais comum) → retorne "indeterminado"
- "Prazo de 10 anos" → retorne "10 anos"

═══ CONSOLIDAÇÕES E ALTERAÇÕES ═══
- Se o título do documento contém "Alteração", "Aditivo", "Consolidação", "Reforma" → temAlteracoes=true
- Extraia o QUADRO FINAL de sócios (após a alteração, não antes)
- dataConstituicao = data ORIGINAL de fundação (1º instrumento)
- ultimaAlteracao = data da alteração mais recente (DD/MM/YYYY)

═══ CAMPOS DOS SÓCIOS ═══
- nome: completo, preservando acentos/cedilhas, como aparece no documento
- cpf: formato XXX.XXX.XXX-XX. Se mascarado ("***.456.789-**"), retorne como está. Se ausente, "".
- participacao: percentual com vírgula ("50,00%") OU valor em cotas se não houver %. Se tem "500.000 cotas" de "1.000.000 cotas totais" → "50,00%".
- cotas: número absoluto ("500000") se mencionado, senão ""
- qualificacao: texto exato do contrato ("Sócio", "Sócio-Administrador", "Administrador", "Acionista", "Diretor")

═══ EXCLUSÕES — NÃO inclua como sócios ═══
- Testemunhas das assinaturas
- Advogados, contadores, despachantes, procuradores sem cotas
- Cônjuges mencionados sem participação ("casado com...")
- Funcionários, gerentes contratados, diretores não-sócios
- Notários, cartórios

═══ REGRAS DE EXTRAÇÃO ═══
1. EXTRAIA TODOS os sócios encontrados — mesmo que falte CPF ou %
2. NUNCA retorne socios: [] se há MENÇÃO a sócios no documento
3. Se encontrar só o nome sem CPF, inclua mesmo assim com cpf=""
4. Se o capital social está em cotas mas não em reais, calcule (cotas × valor unitário)
5. Se só uma parte é legível, retorne essa parte — nunca tudo vazio
6. Para scans com OCR ruim: foque nos campos MAIS ROBUSTOS primeiro (objeto social, capital social, nome de sócios maiúsculos)

═══ FALLBACK QUANDO O DOCUMENTO É DIFÍCIL ═══
Se o documento está muito degradado/ilegível:
- Prioridade 1: extraia objetoSocial (quase sempre é texto corrido legível)
- Prioridade 2: capitalSocial (valor monetário destacado)
- Prioridade 3: ao menos UM sócio (nome + CPF se visível)
- Prioridade 4: dataConstituicao (cabeçalho do primeiro instrumento)
- Deixe os outros campos vazios

RETORNAR TODOS OS CAMPOS VAZIOS É ERRO CRÍTICO. Um contrato social sempre tem ao menos objeto social ou nome de sócio visível. Volte e olhe de novo se isso aconteceu.

Campos ausentes: "" ou false. NÃO invente dados — mas extraia tudo o que está visível.`;

const PROMPT_FATURAMENTO = `Você receberá um relatório de faturamento mensal (planilha Excel/XLSX, relatório de NF-e, extrato bancário, declaração contábil ou tabela PDF). Extraia TODOS os valores mensais e retorne APENAS JSON válido, sem markdown.

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

const PROMPT_SCR = `Você receberá um documento SCR do Banco Central (Sistema de Informações de Crédito) — pode ser de PESSOA FÍSICA (sócio) ou PESSOA JURÍDICA (empresa), emitido pelo Bacen ou por bancos integrados. Documento pode estar em PDF nativo, PDF escaneado com OCR, ou imagem. Sua tarefa é extrair TUDO o que estiver visível — mesmo parcial. Retorne APENAS JSON válido, sem markdown, sem comentários.

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

NÃO invente dados.`;


const PROMPT_PROTESTOS = `Você receberá uma certidão de protestos (SERASA, cartório, CRC, IEPTB ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

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

const PROMPT_PROCESSOS = `Você receberá um relatório de processos judiciais (Credit Bureau, SERASA, Jusbrasil, Escavador, relatório de advogado ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"passivosTotal":"","ativosTotal":"","valorTotalEstimado":"","temRJ":false,"temRecuperacaoExtrajudicial":false,"distribuicao":[{"tipo":"","qtd":"","pct":""}],"bancarios":[{"banco":"","assunto":"","status":"","data":"","valor":"","numero":"","tribunal":""}],"fiscais":[{"contraparte":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"fornecedores":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"outros":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}]}

Totais:
- passivosTotal: processos onde a empresa é RÉ / EXECUTADA / REQUERIDA / PACIENTE — string numérica (ex: "12")
- ativosTotal: processos onde a empresa é AUTORA / EXEQUENTE / REQUERENTE / IMPETRANTE — string numérica
- valorTotalEstimado: valor total em reais com prefixo "R$" (ex: "R$ 450.000,00")

Flags críticos:
- temRJ: true se houver menção a "Recuperação Judicial", "RJ", "Deferimento de Processamento de RJ"
- temRecuperacaoExtrajudicial: true se "Recuperação Extrajudicial" ou "Homologação de Plano Extrajudicial"

Categorias (distribuicao — use EXATAMENTE estes tipos):
- "TRABALHISTA": reclamações trabalhistas, ações sindicais, execuções trabalhistas
- "BANCÁRIO": ações com bancos, financeiras, cooperativas de crédito como contraparte
- "FISCAL": execuções fiscais, dívida ativa, PGFN, Receita Federal, Fazenda Estadual/Municipal, INSS
- "FORNECEDOR": ações de cobrança movidas por fornecedores ou prestadores
- "CÍVEL": ações cíveis gerais (indenização, danos morais, contratos, responsabilidade civil, consumidor)
- "OUTROS": o que não se encaixa — criminais, ambientais, regulatórios, especiais

Detalhamento por array — NÃO duplique um processo entre arrays:
- bancarios[]: processos BANCÁRIOS individualizados
- fiscais[]: processos FISCAIS individualizados
- fornecedores[]: processos de FORNECEDOR individualizados
- outros[]: processos CÍVEIS + OUTROS individualizados
- TRABALHISTAS: NÃO liste individualmente por sigilo — apenas conte em distribuicao

Campos dos processos individuais:
- contraparte / banco: nome da parte adversa
- assunto: resumo em uma linha (ex: "Cobrança de duplicata", "Dano moral", "Execução de título")
- status: "EM ANDAMENTO" | "ARQUIVADO" | "JULGADO" | "EM RECURSO" | "SUSPENSO" | "DISTRIBUÍDO" | "TRANSITADO EM JULGADO"
- data: DD/MM/YYYY — data de distribuição
- valor: em reais formato brasileiro com "R$" (ex: "R$ 50.000,00") ou "" se indefinido
- numero: número CNJ completo (ex: "0000000-00.0000.0.00.0000") se disponível
- tribunal: sigla (ex: "TJSP", "TRT2", "TRF3", "STJ") se disponível

Documentos negativos:
- "NADA CONSTA" / "NÃO FORAM ENCONTRADOS PROCESSOS": passivosTotal="0", ativosTotal="0", distribuicao=[], arrays vazios

NÃO invente dados.`;

const PROMPT_GRUPO_ECONOMICO = `Você receberá um relatório de grupo econômico (Credit Bureau, SERASA, Escavador, relatório próprio ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

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

const PROMPT_CURVA_ABC = `Você receberá um relatório de Curva ABC de clientes (de ERP, planilha ou sistema contábil). Colunas típicas: Cliente, Peso (kg), Valor Total, Ticket Médio, % Participação, % Acumulado, Classe ABC.

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

const PROMPT_DRE = `Você receberá uma Demonstração de Resultado do Exercício (DRE). Pode estar em formato SPED ECD/ECF, DRE simplificada, relatório gerencial, planilha Excel ou PDF contábil. Retorne APENAS JSON válido, sem markdown, sem texto adicional.

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

const PROMPT_BALANCO = `Você receberá um Balanço Patrimonial. Pode estar em formato SPED ECD (com códigos de conta como 1.01, 2.03, etc.), balanço simplificado, relatório gerencial, planilha Excel ou PDF contábil. Retorne APENAS JSON válido, sem markdown, sem texto adicional.

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

const PROMPT_IR_SOCIOS = `Você receberá um documento de Imposto de Renda de sócio: pode ser apenas o Recibo de Entrega (DIRPF), uma Declaração Completa ou extrato da Receita Federal. Retorne APENAS JSON válido, sem markdown.

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
- "Bens Imóveis" / "Imóveis e Terrenos" → bensImoveis
- "Veículos Automotores Terrestres" → bensVeiculos
- "Aplicações Financeiras" / "Investimentos" → aplicacoesFinanceiras
- "Total de Bens e Direitos" → totalBensDireitos
- "Dívidas e Ônus Reais" → dividasOnus

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

const PROMPT_RELATORIO_VISITA = `Você receberá um Relatório de Visita (texto livre, formulário estruturado, template, ata ou PDF de inspeção presencial). Extraia os dados e retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema:
{"dataVisita":"","responsavelVisita":"","localVisita":"","duracaoVisita":"","estruturaFisicaConfirmada":true,"funcionariosObservados":0,"estoqueVisivel":false,"estimativaEstoque":"","operacaoCompativelFaturamento":true,"maquinasEquipamentos":false,"descricaoEstrutura":"","pontosPositivos":[],"pontosAtencao":[],"recomendacaoVisitante":"aprovado","nivelConfiancaVisita":"alto","presencaSocios":false,"sociosPresentes":[],"documentosVerificados":[],"observacoesLivres":"","pleito":"","modalidade":"","taxaConvencional":"","taxaComissaria":"","limiteTotal":"","limiteConvencional":"","limiteComissaria":"","limitePorSacado":"","ticketMedio":"","valorCobrancaBoleto":"","prazoRecompraCedente":"","prazoEnvioCartorio":"","prazoMaximoOp":"","cobrancaTAC":"","tranche":"","prazoTranche":"","folhaPagamento":"","endividamentoBanco":"","endividamentoFactoring":"","vendasCheque":"","vendasDuplicata":"","vendasOutras":"","prazoMedioFaturamento":"","prazoMedioEntrega":"","referenciasFornecedores":""}

ATENÇÃO: o campo de referências comerciais DEVE ser chamado "referenciasFornecedores" (NÃO "referenciaComercial" ou "referencias"). Use exatamente esse nome.

Regras gerais:
- dataVisita: formato DD/MM/YYYY
- recomendacaoVisitante: "aprovado" | "condicional" | "reprovado"
- nivelConfiancaVisita: "alto" | "medio" | "baixo"
- Campos ausentes: "" para strings, false para booleans, 0 para números, [] para arrays
- NÃO invente dados — se não há informação explícita, deixe vazio
- pontosPositivos e pontosAtencao: listas de strings curtas (1 frase cada)
- sociosPresentes: lista de nomes dos sócios presentes na visita
- documentosVerificados: lista de docs confirmados fisicamente ("Contrato Social", "Alvará", "Notas fiscais", etc.)
- observacoesLivres: bloco de texto com observações gerais do visitante (máximo 500 caracteres)
- descricaoEstrutura: descrição física do local (área, organização, condições — máximo 300 caracteres)

═══ REGRA CRÍTICA ANTI-CONFUSAO DE SEPARADORES (valores operacionais: taxas, limites, pleito, ticket) ═══
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

Se um limite ou pleito extraído parecer 10x ou 100x maior que o razoável, REINTERPRETE o separador.

Pleito e modalidade:
- pleito: valor em R$ sugerido pelo cedente (ex: "150000,00"). Buscar por "pleito", "valor solicitado", "limite sugerido", "crédito pleiteado"

═══ MODALIDADE — ATENÇÃO CRÍTICA ═══
A modalidade descreve COMO o FIDC opera com o cedente:

- "convencional": FIDC assume o risco total. Cedente cede os recebíveis e NÃO faz cobrança.
  Palavras-chave: "cessão plena", "risco do FIDC", "sem recompra", "convencional"

- "comissaria": Cedente mantém o relacionamento, faz a cobrança. FIDC desconta os títulos.
  Palavras-chave: "comissária", "cobrança pelo cedente", "recompra obrigatória", "mandato"

- "hibrida": O cedente opera em AMBAS as modalidades (algumas operações convencional, outras comissária).
  Palavras-chave: "híbrida", "mista", "ambas", "os dois formatos"
  Sinal decisivo: se o documento tem TANTO taxaConvencional QUANTO taxaComissaria, é hibrida.

REGRAS DE DEDUÇÃO:
- Se documento menciona APENAS "convencional" OU só taxaConvencional → "convencional"
- Se documento menciona APENAS "comissária" OU só taxaComissaria → "comissaria"
- Se documento menciona AMBAS ou "híbrida" → "hibrida"
- Se não há menção clara → "" (vazio, NUNCA invente)

Parâmetros operacionais (buscar em tabelas, campos rotulados ou seção de "parâmetros/condições"):
- taxaConvencional: taxa % para modalidade convencional (ex: "2,5%")
- taxaComissaria: taxa % para modalidade comissária (ex: "1,8%")
- limiteTotal: limite total aprovado em R$ (ex: "500000,00")
- limiteConvencional / limiteComissaria: limites por modalidade
- limitePorSacado: limite máximo por sacado em R$
- ticketMedio: valor médio por duplicata/título em R$
- valorCobrancaBoleto: valor cobrado por emissão/cobrança de boleto
- prazoRecompraCedente: prazo em dias para recompra pelo cedente
- prazoEnvioCartorio: dias até envio para cartório
- prazoMaximoOp: prazo máximo da operação em dias
- cobrancaTAC: valor ou "Sim"/"Não" para cobrança de TAC
- tranche: valor da tranche em R$
- prazoTranche: prazo da tranche em dias

Dados da empresa (coletados na visita):
- folhaPagamento: folha de pagamento mensal em R$
- endividamentoBanco: endividamento bancário total em R$ (use "—" se não há endividamento declarado)
- endividamentoFactoring: endividamento com factoring/FIDC em R$
- vendasCheque / vendasDuplicata / vendasOutras: % de vendas por forma de recebimento
- prazoMedioFaturamento: prazo médio em dias
- prazoMedioEntrega: prazo médio de entrega em dias
- referenciasFornecedores: lista de referências comerciais/fornecedores informadas na visita, separadas por vírgula ou ";" (ex: "Banco do Brasil, Fornecedor X, Cliente Y")`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }, maxOutputTokens = 2048): Promise<string> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (typeof content === "string") {
    parts.push({ text: prompt + "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
    parts.push({ text: prompt });
  }

  const startIdx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  const rotatedKeys = [...GEMINI_API_KEYS.slice(startIdx), ...GEMINI_API_KEYS.slice(0, startIdx)];
  const MAX_ATTEMPTS = 2; // 1 tentativa + 1 retry com backoff em 503/429
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  for (const apiKey of rotatedKeys) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model} attempt=${attempt + 1}/${MAX_ATTEMPTS}`);
          const controller = new AbortController();
          const fetchTimeout = setTimeout(() => controller.abort(), 25000);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens,
                responseMimeType: "application/json",
                ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
          });
          clearTimeout(fetchTimeout);

          // 429/503: erros transitorios — backoff exponencial e tenta de novo
          if (response.status === 429 || response.status === 503) {
            if (attempt < MAX_ATTEMPTS - 1) {
              const backoffMs = 1000 * Math.pow(2, attempt); // 1s, 2s
              console.log(`[Gemini] HTTP ${response.status} key=${apiKey.substring(0, 8)} model=${model}, backoff ${backoffMs}ms`);
              await sleep(backoffMs);
              continue;
            }
            console.log(`[Gemini] HTTP ${response.status} esgotou retries — skip para proximo model/key`);
            break;
          }

          // 404: modelo nao existe — nao adianta retry, pula direto
          if (response.status === 404) {
            console.error(`[Gemini] HTTP 404 model=${model} — modelo invalido, skip`);
            break;
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Gemini] HTTP ${response.status}:`, body.substring(0, 300));
            break;
          }

          const result = await response.json();
          // gemini-2.5-flash pode retornar "thinking" parts - pegar a última text part (não thought)
          const parts2 = result?.candidates?.[0]?.content?.parts || [];
          const textPart = [...parts2].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought);
          const text = textPart?.text || parts2?.[parts2.length - 1]?.text || parts2?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response, parts:`, JSON.stringify(parts2).substring(0, 200));
            break;
          }
          return text;
        } catch (err) {
          // AbortError (timeout) e erros de rede: retry uma vez
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (isAbort && attempt < MAX_ATTEMPTS - 1) {
            console.warn(`[Gemini] timeout key=${apiKey.substring(0, 8)} model=${model}, tentando de novo`);
            await sleep(500);
            continue;
          }
          console.error(`[Gemini] Error:`, err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada OpenRouter (fallback text-only)
// ─────────────────────────────────────────
async function callOpenRouter(prompt: string, textContent: string): Promise<string> {
  if (OPENROUTER_API_KEYS.length === 0) throw new Error("OPENROUTER_API_KEYS não configurada");
  for (const apiKey of OPENROUTER_API_KEYS) {
    for (const model of OPENROUTER_MODELS) {
      try {
        console.log(`[OpenRouter/extract] key=${apiKey.substring(0, 16)}... model=${model}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://plataformacapital.vercel.app",
            "X-Title": "Capital Financas",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt + "\n\n--- DOCUMENTO ---\n\n" + textContent }],
            temperature: 0.1,
            max_tokens: 8192,
          }),
        });
        if (!response.ok) { console.error(`[OpenRouter/extract] HTTP ${response.status}`); continue; }
        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content;
        if (!text) { console.error(`[OpenRouter/extract] Empty response`); continue; }
        console.log(`[OpenRouter/extract] Success model=${model}`);
        return text;
      } catch (err) {
        console.error(`[OpenRouter/extract] Error:`, err instanceof Error ? err.message : err);
      }
    }
  }
  throw new Error("OPENROUTER_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada AI — Gemini primário, OpenRouter fallback (texto)
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string },
  maxOutputTokens = 2048,
): Promise<string> {
  const content: string | { mimeType: string; base64: string } = imageContent ?? textContent;

  // Timeout global de 45s — evita que a função fique pendurada
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT_55s")), 55000)
  );

  const aiCall = async (): Promise<string> => {
    try {
      return await callGemini(prompt, content, maxOutputTokens);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (imageContent || OPENROUTER_API_KEYS.length === 0) throw err;
      console.warn(`[extract] Gemini falhou (${msg}), tentando OpenRouter...`);
      return await callOpenRouter(prompt, textContent);
    }
  };

  return Promise.race([aiCall(), timeoutPromise]);
}

// ─────────────────────────────────────────
// Parse JSON
// ─────────────────────────────────────────
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  // Remove markdown code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Tenta extrair JSON se resposta veio com texto antes/depois
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[parseJSON] Falha ao parsear resposta da IA:", (err as Error).message, "| raw (primeiros 500 chars):", raw.slice(0, 500));
    // Retorna objeto vazio ao invés de crash — fillXxxDefaults vai preencher campos padrão
    return {} as T;
  }
}

// ─────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────
function fillCNPJDefaults(data: Partial<CNPJData>): CNPJData {
  return {
    razaoSocial: data.razaoSocial || "", nomeFantasia: data.nomeFantasia || "",
    cnpj: data.cnpj || "", dataAbertura: data.dataAbertura || "",
    situacaoCadastral: data.situacaoCadastral || "", dataSituacaoCadastral: data.dataSituacaoCadastral || "",
    motivoSituacao: data.motivoSituacao || "", naturezaJuridica: data.naturezaJuridica || "",
    cnaePrincipal: data.cnaePrincipal || "", cnaeSecundarios: data.cnaeSecundarios || "",
    porte: data.porte || "", capitalSocialCNPJ: data.capitalSocialCNPJ || "",
    endereco: data.endereco || "", telefone: data.telefone || "", email: data.email || "",
  };
}

function fillQSADefaults(data: Partial<QSAData>): QSAData {
  // Nao injetar sócio vazio quando Gemini retorna array vazio — isso quebra
  // o enriquecimento via Credit Hub e polui o PDF com linhas em branco.
  const quadro = Array.isArray(data.quadroSocietario)
    ? data.quadroSocietario
        .filter(s => s && (s.nome || s.cpfCnpj)) // descarta entradas totalmente vazias
        .map(s => ({
          nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
          qualificacao: s.qualificacao || "", participacao: s.participacao || "",
        }))
    : [];
  return { capitalSocial: data.capitalSocial || "", quadroSocietario: quadro };
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData {
  // Mesma regra do QSA — nao inventar socio vazio quando Gemini falha.
  const socios = Array.isArray(data.socios)
    ? data.socios
        .filter(s => s && (s.nome || s.cpf))
        .map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }))
    : [];
  return {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
}

function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  const _mesAtualFiltro = new Date().getMonth() + 1;
  const _anoAtualFiltro = new Date().getFullYear();

  const meses = (Array.isArray(data.meses) ? data.meses : [])
    .filter(m => {
      if (!m.mes) return false;
      const [mesNum, anoNum] = m.mes.split("/").map(Number);
      if (!mesNum || !anoNum) return false;

      // Remove meses futuros — ano futuro, ou mesmo ano mas mês futuro
      if (anoNum > _anoAtualFiltro) return false;
      if (anoNum === _anoAtualFiltro && mesNum > _mesAtualFiltro) return false;

      return true; // mantém todos os meses passados, incluindo zeros sazonais
    });
  const parseBR = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenados = [...meses].sort((a, b) => {
    const [mesA, anoA] = (a.mes || "").split("/").map(Number);
    const [mesB, anoB] = (b.mes || "").split("/").map(Number);
    return (anoA - anoB) || (mesA - mesB);
  });

  const meses12 = ordenados.slice(-12);
  const soma12 = meses12.reduce((s, m) => s + parseBR(m.valor), 0);
  const fmm12m = meses12.length > 0 ? soma12 / meses12.length : 0;

  const porAno: Record<string, number[]> = {};
  for (const m of ordenados) {
    const parts = (m.mes || "").split("/");
    const anoRaw = parts[1] || "";
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    if (!ano) continue;
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(parseBR(m.valor));
  }

  const fmmAnual: Record<string, number> = {};
  for (const [ano, valores] of Object.entries(porAno)) {
    const somaAno = valores.reduce((s, v) => s + v, 0);
    fmmAnual[ano] = somaAno / valores.length;
  }

  const anosCompletos = Object.entries(porAno).filter(([, v]) => v.length === 12);
  const fmmMedio = anosCompletos.length > 0
    ? anosCompletos.reduce((s, [ano]) => s + fmmAnual[ano], 0) / anosCompletos.length
    : fmm12m;

  const anoAtual = String(new Date().getFullYear());
  const fmmAnoAtual = fmmAnual[anoAtual];
  let tendencia: "crescimento" | "estavel" | "queda" | "indefinido" = "indefinido";
  if (fmmAnoAtual && fmm12m > 0) {
    const delta = (fmmAnoAtual - fmm12m) / fmm12m;
    if (delta > 0.05) tendencia = "crescimento";
    else if (delta < -0.05) tendencia = "queda";
    else tendencia = "estavel";
  }

  // somatoriaAno = soma dos últimos 12 meses (valor anualizado, não total histórico)
  const soma12m = meses12.reduce((s, m) => s + parseBR(m.valor), 0);

  const mesesZerados = meses12
    .filter(m => parseBR(m.valor) === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  return {
    meses,
    somatoriaAno: fmtBR(soma12m),
    mediaAno: fmtBR(fmm12m),
    fmm12m: fmtBR(fmm12m),
    fmmAnual: Object.fromEntries(
      Object.entries(fmmAnual).map(([ano, v]) => [ano, fmtBR(v)])
    ),
    fmmMedio: fmtBR(fmmMedio),
    tendencia,
    faturamentoZerado: meses.length === 0 || meses.every(m => parseBR(m.valor) === 0),
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || (ordenados.length > 0 ? ordenados[ordenados.length - 1].mes : ""),
    mesesZerados,
    quantidadeMesesZerados: mesesZerados.length,
    temMesesZerados: mesesZerados.length > 0,
  };
}

function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  // Normaliza faixas key-por-key para evitar objetos vazios {} que passam pelo ||
  const f = data.faixasAVencer as Record<string, string> | undefined;
  const fv = data.faixasVencidos as Record<string, string> | undefined;
  const faixasAVencer: SCRData["faixasAVencer"] = {
    ate30d: f?.ate30d || "", d31_60: f?.d31_60 || "", d61_90: f?.d61_90 || "",
    d91_180: f?.d91_180 || "", d181_360: f?.d181_360 || "", acima360d: f?.acima360d || "",
    prazoIndeterminado: f?.prazoIndeterminado || "", total: f?.total || "",
  };
  const faixasVencidos: SCRData["faixasVencidos"] = {
    ate30d: fv?.ate30d || "", d31_60: fv?.d31_60 || "", d61_90: fv?.d61_90 || "",
    d91_180: fv?.d91_180 || "", d181_360: fv?.d181_360 || "", acima360d: fv?.acima360d || "",
    total: fv?.total || "",
  };

  return {
    // Identificação — preservar para roteamento PJ vs PF
    tipoPessoa: data.tipoPessoa || undefined,
    nomeCliente: data.nomeCliente || "",
    cpfSCR: data.cpfSCR || "",
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer: data.carteiraAVencer || "", vencidos: data.vencidos || "",
    prejuizos: data.prejuizos || "", limiteCredito: data.limiteCredito || "",
    qtdeInstituicoes: data.qtdeInstituicoes || "", qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas: data.totalDividasAtivas || "", operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "", operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "", coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo: data.carteiraCurtoPrazo || "", carteiraLongoPrazo: data.carteiraLongoPrazo || "",
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
    // Campos detalhados
    cnpjSCR: data.cnpjSCR || "",
    pctDocumentosProcessados: data.pctDocumentosProcessados || "",
    pctVolumeProcessado: data.pctVolumeProcessado || "",
    faixasAVencer,
    faixasVencidos,
    faixasPrejuizos: { ate12m: data.faixasPrejuizos?.ate12m || "", acima12m: data.faixasPrejuizos?.acima12m || "", total: data.faixasPrejuizos?.total || "" },
    faixasLimite: { ate360d: data.faixasLimite?.ate360d || "", acima360d: data.faixasLimite?.acima360d || "", total: data.faixasLimite?.total || "" },
    outrosValores: {
      carteiraCredito: data.outrosValores?.carteiraCredito || "",
      responsabilidadeTotal: data.outrosValores?.responsabilidadeTotal || "",
      riscoTotal: data.outrosValores?.riscoTotal || "",
      coobrigacaoAssumida: data.outrosValores?.coobrigacaoAssumida || "",
      coobrigacaoRecebida: data.outrosValores?.coobrigacaoRecebida || "",
      creditosALiberar: data.outrosValores?.creditosALiberar || "",
    },
    emDia: data.emDia || "",
    semHistorico: data.semHistorico ?? (!data.totalDividasAtivas && !data.carteiraAVencer && !data.vencidos && !data.prejuizos && !data.limiteCredito),
    numeroIfs: data.numeroIfs || "",
  };
}

function fillProtestosDefaults(data: Partial<ProtestosData>): ProtestosData {
  return {
    vigentesQtd: data.vigentesQtd || "", vigentesValor: data.vigentesValor || "",
    regularizadosQtd: data.regularizadosQtd || "", regularizadosValor: data.regularizadosValor || "",
    detalhes: Array.isArray(data.detalhes) ? data.detalhes : [],
  };
}

function fillProcessosDefaults(data: Partial<ProcessosData>): ProcessosData {
  return {
    passivosTotal: data.passivosTotal || "", ativosTotal: data.ativosTotal || "",
    valorTotalEstimado: data.valorTotalEstimado || "", temRJ: data.temRJ || false,
    distribuicao: Array.isArray(data.distribuicao) ? data.distribuicao : [],
    bancarios: Array.isArray(data.bancarios) ? data.bancarios : [],
    fiscais: Array.isArray(data.fiscais) ? data.fiscais : [],
    fornecedores: Array.isArray(data.fornecedores) ? data.fornecedores : [],
    outros: Array.isArray(data.outros) ? data.outros : [],
  };
}

function fillGrupoEconomicoDefaults(data: Partial<GrupoEconomicoData>): GrupoEconomicoData {
  return { empresas: Array.isArray(data.empresas) ? data.empresas : [] };
}

function fillCurvaABCDefaults(data: Partial<CurvaABCData>): CurvaABCData {
  return {
    clientes: data.clientes ?? [],
    totalClientesNaBase: data.totalClientesNaBase ?? 0,
    totalClientesExtraidos: data.totalClientesExtraidos ?? 0,
    periodoReferencia: data.periodoReferencia ?? "",
    receitaTotalBase: data.receitaTotalBase ?? "0,00",
    concentracaoTop3: data.concentracaoTop3 ?? "0.00",
    concentracaoTop5: data.concentracaoTop5 ?? "0.00",
    concentracaoTop10: data.concentracaoTop10 ?? "0.00",
    totalClientesClasseA: data.totalClientesClasseA ?? 0,
    receitaClasseA: data.receitaClasseA ?? "0,00",
    maiorCliente: data.maiorCliente ?? "",
    maiorClientePct: data.maiorClientePct ?? "0.00",
    alertaConcentracao: data.alertaConcentracao ?? false,
  };
}

function fillDREDefaults(data: Partial<DREData>): DREData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    crescimentoReceita: data.crescimentoReceita || "0,00",
    tendenciaLucro: data.tendenciaLucro || "estavel",
    periodoMaisRecente: data.periodoMaisRecente || "",
    observacoes: data.observacoes || "",
  };
}

function fillBalancoDefaults(data: Partial<BalancoData>): BalancoData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    periodoMaisRecente: data.periodoMaisRecente || "",
    tendenciaPatrimonio: data.tendenciaPatrimonio || "estavel",
    observacoes: data.observacoes || "",
  };
}

function fillIRSocioDefaults(data: Partial<IRSocioData>): IRSocioData {
  return {
    nomeSocio: sanitizeStr(data.nomeSocio, 100),
    cpf: data.cpf || "",
    anoBase: data.anoBase || "",
    tipoDocumento: sanitizeEnum(data.tipoDocumento, ["recibo", "declaracao", "extrato"] as const, "recibo"),
    numeroRecibo: data.numeroRecibo || "",
    dataEntrega: data.dataEntrega || "",
    situacaoMalhas: data.situacaoMalhas ?? false,
    debitosEmAberto: data.debitosEmAberto ?? false,
    descricaoDebitos: sanitizeDescricaoDebitos(data.descricaoDebitos),
    rendimentosTributaveis: sanitizeMoney(data.rendimentosTributaveis),
    rendimentosIsentos: sanitizeMoney(data.rendimentosIsentos),
    rendimentoTotal: sanitizeMoney(data.rendimentoTotal),
    bensImoveis: sanitizeMoney(data.bensImoveis),
    bensVeiculos: sanitizeMoney(data.bensVeiculos),
    aplicacoesFinanceiras: sanitizeMoney(data.aplicacoesFinanceiras),
    outrosBens: sanitizeMoney(data.outrosBens),
    totalBensDireitos: sanitizeMoney(data.totalBensDireitos),
    dividasOnus: sanitizeMoney(data.dividasOnus),
    patrimonioLiquido: sanitizeMoney(data.patrimonioLiquido),
    impostoDefinido: sanitizeMoney(data.impostoDefinido),
    valorQuota: sanitizeMoney(data.valorQuota),
    impostoPago: sanitizeMoney(data.impostoPago),
    impostoRestituir: sanitizeMoney(data.impostoRestituir),
    temSociedades: data.temSociedades ?? false,
    sociedades: Array.isArray(data.sociedades) ? data.sociedades : [],
    coerenciaComEmpresa: data.coerenciaComEmpresa ?? true,
    observacoes: sanitizeStr(data.observacoes, 500),
  };
}

function fillRelatorioVisitaDefaults(data: Partial<RelatorioVisitaData>): RelatorioVisitaData {
  return {
    dataVisita: data.dataVisita || "",
    responsavelVisita: data.responsavelVisita || "",
    localVisita: data.localVisita || "",
    duracaoVisita: data.duracaoVisita || "",
    estruturaFisicaConfirmada: data.estruturaFisicaConfirmada ?? true,
    funcionariosObservados: data.funcionariosObservados ?? 0,
    estoqueVisivel: data.estoqueVisivel ?? false,
    estimativaEstoque: data.estimativaEstoque || "",
    operacaoCompativelFaturamento: data.operacaoCompativelFaturamento ?? true,
    maquinasEquipamentos: data.maquinasEquipamentos ?? false,
    descricaoEstrutura: data.descricaoEstrutura || "",
    pontosPositivos: Array.isArray(data.pontosPositivos) ? data.pontosPositivos : [],
    pontosAtencao: Array.isArray(data.pontosAtencao) ? data.pontosAtencao : [],
    recomendacaoVisitante: data.recomendacaoVisitante || "aprovado",
    nivelConfiancaVisita: data.nivelConfiancaVisita || "alto",
    presencaSocios: data.presencaSocios ?? false,
    sociosPresentes: Array.isArray(data.sociosPresentes) ? data.sociosPresentes : [],
    documentosVerificados: Array.isArray(data.documentosVerificados) ? data.documentosVerificados : [],
    observacoesLivres: data.observacoesLivres || "",
    pleito: data.pleito || "",
    modalidade: data.modalidade || undefined,
    taxaConvencional: data.taxaConvencional || "",
    taxaComissaria: data.taxaComissaria || "",
    limiteTotal: data.limiteTotal || "",
    limiteConvencional: data.limiteConvencional || "",
    limiteComissaria: data.limiteComissaria || "",
    limitePorSacado: data.limitePorSacado || "",
    ticketMedio: data.ticketMedio || "",
    valorCobrancaBoleto: data.valorCobrancaBoleto || "",
    prazoRecompraCedente: data.prazoRecompraCedente || "",
    prazoEnvioCartorio: data.prazoEnvioCartorio || "",
    prazoMaximoOp: data.prazoMaximoOp || "",
    cobrancaTAC: data.cobrancaTAC || "",
    tranche: data.tranche || "",
    prazoTranche: data.prazoTranche || "",
    folhaPagamento: data.folhaPagamento || "",
    endividamentoBanco: data.endividamentoBanco || "",
    endividamentoFactoring: data.endividamentoFactoring || "",
    vendasCheque: data.vendasCheque || "",
    vendasDuplicata: data.vendasDuplicata || "",
    vendasOutras: data.vendasOutras || "",
    prazoMedioFaturamento: data.prazoMedioFaturamento || "",
    prazoMedioEntrega: data.prazoMedioEntrega || "",
    referenciasFornecedores: data.referenciasFornecedores || (data as Record<string, unknown>).referenciaComercial as string || "",
  };
}

type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData | CurvaABCData | DREData | BalancoData | IRSocioData | RelatorioVisitaData;

function countFilledFields(data: AnyExtracted): number {
  const obj = data as unknown as Record<string, unknown>;
  return Object.values(obj).filter(v =>
    typeof v === "string" ? v.length > 0 :
    Array.isArray(v) ? v.length > 0 :
    typeof v === "boolean" ? true : false
  ).length;
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Validar Content-Type antes de tentar parsear FormData
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Request deve ser multipart/form-data com o arquivo anexado.", success: false },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[extract] FormData parse failed:", formErr instanceof Error ? formErr.message : formErr);
      return NextResponse.json(
        { error: "Falha ao processar o upload. Verifique o arquivo e tente novamente.", success: false },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;
    const slot = formData.get("slot") as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 20MB." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ──── Excel: processamento direto sem IA ────
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${file.name}`);
        const faturamento = await extractExcel(buffer);
        const filled = countFilledFields(faturamento);
        return NextResponse.json({
          success: true,
          data: faturamento,
          meta: { rawTextLength: 0, filledFields: filled, isScanned: false, aiPowered: false },
        });
      } catch (err) {
        console.error("[extract] Excel processing failed:", err);
        // Se falhar, tentar via IA
      }
    }

    // ──── Selecionar prompt ────
    let prompt: string;
    switch (docType) {
      case "cnpj":       prompt = PROMPT_CNPJ; break;
      case "qsa":        prompt = PROMPT_QSA; break;
      case "contrato":   prompt = PROMPT_CONTRATO; break;
      case "faturamento": prompt = PROMPT_FATURAMENTO; break;
      case "scr":            prompt = PROMPT_SCR; break;
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      case "curva_abc":      prompt = PROMPT_CURVA_ABC; break;
      case "dre":            prompt = PROMPT_DRE; break;
      case "balanco":        prompt = PROMPT_BALANCO; break;
      case "ir_socio":       prompt = PROMPT_IR_SOCIOS; break;
      case "relatorio_visita": prompt = PROMPT_RELATORIO_VISITA; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else {
      // Sempre tenta extrair texto primeiro (muito mais barato em tokens)
      textContent = await extractText(buffer, ext);
      // Mínimos por tipo de doc — quando pdf-parse falha em layouts com tabelas/colunas,
      // o texto sai suspeitosamente curto. Abaixo do limiar, cai pro Gemini multimodal
      // (que lê o PDF nativo e ignora o text extractor).
      const minTextByDoc: Record<string, number> = {
        contrato: 5000, scr: 800, qsa: 500, dre: 1500, balanco: 1500,
        curva_abc: 800, processos: 1000, protestos: 500, grupoEconomico: 800,
        ir_socio: 1500, relatorio_visita: 800, cnpj: 500,
      };
      const minRequired = minTextByDoc[docType] ?? 200;
      const trimmedLen = textContent.trim().length;
      const hasContent = hasReadableContent(textContent);
      const isUsableText = trimmedLen >= minRequired && hasContent;

      if (!isUsableText && ext === "pdf") {
        console.log(`[extract] PDF text insuficiente (${trimmedLen} < ${minRequired} para ${docType}), enviando como binario`);
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      } else if (!isUsableText) {
        return NextResponse.json({
          error: "Não foi possível extrair texto do documento. Tente enviar em outro formato.",
        }, { status: 422 });
      }
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 4000, qsa: 6000, contrato: 12000, faturamento: 10000, scr: 15000,
        protestos: 8000, processos: 12000, grupoEconomico: 8000,
        curva_abc: 6000, dre: 12000, balanco: 12000, ir_socio: 5000, relatorio_visita: 8000,
      };
      textContent = textContent.substring(0, maxChars[docType] || 10000);
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── SSE stream — mantém conexão viva enquanto Gemini processa ────
    const enc = new TextEncoder();
    const _send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) => {
      try { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); } catch { /* ignore if closed */ }
    };

    const _prompt = prompt;
    const _textContent = textContent;
    const _imageContent = imageContent;
    const _docType = docType;
    const _isImage = isImage;
    const maxOutputTokensMap: Record<string, number> = {
      cnpj: 4096, qsa: 4096, contrato: 4096, faturamento: 8192, scr: 8192,
      protestos: 8192, processos: 8192, grupoEconomico: 4096,
      curva_abc: 8192, dre: 8192, balanco: 8192, ir_socio: 4096, relatorio_visita: 4096,
    };
    const _maxOutputTokens = maxOutputTokensMap[docType] ?? 2048;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        try {
          let data: AnyExtracted;
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent, _maxOutputTokens);
            console.log(`[extract] AI response length: ${aiResponse.length}`);
            console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
            const parsed = parseJSON<Record<string, unknown>>(aiResponse);

            switch (_docType) {
              case "cnpj": {
                data = fillCNPJDefaults(parsed as Partial<CNPJData>);
                // Bonus: se o Cartão CNPJ incluir QSA detectado, guarda para usar como QSA automático
                const qsaDetectado = (parsed as Record<string, unknown>).qsaDetectado as Array<{nome?:string;cpfCnpj?:string;qualificacao?:string;dataEntrada?:string}> | undefined;
                if (Array.isArray(qsaDetectado) && qsaDetectado.length > 0) {
                  const validSocios = qsaDetectado.filter(s => s && s.nome && s.nome.trim().length > 2);
                  if (validSocios.length > 0) {
                    (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado = {
                      capitalSocial: (parsed as Record<string, unknown>).capitalSocialCNPJ as string || "",
                      quadroSocietario: validSocios.map(s => ({
                        nome: s.nome || "",
                        cpfCnpj: s.cpfCnpj || "",
                        qualificacao: s.qualificacao || "",
                        participacao: "",
                        dataEntrada: s.dataEntrada || "",
                      })),
                    };
                    console.log(`[extract][cnpj] QSA detectado no cartão: ${validSocios.length} sócios`);
                  }
                }
                break;
              }
              case "qsa": {
                data = fillQSADefaults(parsed as Partial<QSAData>);
                const n = (data as QSAData).quadroSocietario?.length ?? 0;
                console.log(`[extract][qsa] Gemini retornou ${n} socio(s) apos filtro. capitalSocial="${(data as QSAData).capitalSocial || "vazio"}"`);
                if (n === 0) {
                  console.warn(`[extract][qsa] NENHUM SOCIO EXTRAIDO — verifique o documento e o prompt. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
                }
                break;
              }
              case "contrato": {
                data = fillContratoDefaults(parsed as Partial<ContratoSocialData>);
                const cd = data as ContratoSocialData;
                const n = cd.socios?.length ?? 0;
                console.log(`[extract][contrato] socios=${n} capitalSocial="${cd.capitalSocial || "vazio"}" objetoSocial=${cd.objetoSocial ? `${cd.objetoSocial.length}c` : "vazio"} dataConst="${cd.dataConstituicao || "vazio"}" temAlteracoes=${cd.temAlteracoes}`);
                if (n === 0 && !cd.capitalSocial && !cd.objetoSocial) {
                  console.warn(`[extract][contrato] NENHUM CAMPO EXTRAIDO — verifique documento. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
                }
                break;
              }
              case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
              case "scr": {
                data = fillSCRDefaults(parsed as Partial<SCRData>);
                const scrData = data as SCRData;
                // Override de tipoPessoa baseado no slot do frontend — elimina a dependencia
                // do Gemini inferir PJ/PF corretamente.
                if (slot === "scr_socio" || slot === "scr_socio_anterior") {
                  if (scrData.tipoPessoa !== "PF") {
                    console.log(`[extract][scr] slot=${slot} forcando tipoPessoa=PF (Gemini retornou "${scrData.tipoPessoa || "vazio"}")`);
                  }
                  scrData.tipoPessoa = "PF";
                } else if (slot === "scr" || slot === "scrAnterior") {
                  if (scrData.tipoPessoa !== "PJ") {
                    console.log(`[extract][scr] slot=${slot} forcando tipoPessoa=PJ (Gemini retornou "${scrData.tipoPessoa || "vazio"}")`);
                  }
                  scrData.tipoPessoa = "PJ";
                }
                // Persiste o slot original do upload como hint determinístico para
                // a hidratação decidir atual/anterior quando periodoReferencia falhar.
                if (slot) {
                  (scrData as SCRData & { _slotHint?: string })._slotHint = slot;
                }
                console.log(`[extract][scr] slot=${slot || "nenhum"} periodoRef="${scrData.periodoReferencia || "VAZIO"}" tipoPessoa="${scrData.tipoPessoa || "VAZIO"}" cnpjSCR="${scrData.cnpjSCR || ""}" cpfSCR="${scrData.cpfSCR || ""}" totalDividas="${scrData.totalDividasAtivas || "0"}"`);
                if (!scrData.periodoReferencia) {
                  console.warn(`[extract][scr] SEM periodoReferencia — ordenacao atual/anterior vai falhar`);
                }
                const periodoAnterior = (parsed as Record<string, unknown>).periodoAnterior as Partial<SCRData> | undefined;
                if (periodoAnterior && periodoAnterior.periodoReferencia) {
                  (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior = fillSCRDefaults(periodoAnterior);
                  (data as SCRData & { _variacoes?: Record<string, string> })._variacoes =
                    ((parsed as Record<string, unknown>).variacoes as Record<string, string>) || {};
                  console.log(`[extract][scr] Periodo anterior detectado no mesmo doc: ${periodoAnterior.periodoReferencia}`);
                }
                break;
              }
              case "protestos":        data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
              case "processos":        data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
              case "grupoEconomico":   data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
              case "curva_abc":        data = fillCurvaABCDefaults(parsed as Partial<CurvaABCData>); break;
              case "dre":              data = fillDREDefaults(parsed as Partial<DREData>); break;
              case "balanco":          data = fillBalancoDefaults(parsed as Partial<BalancoData>); break;
              case "ir_socio":         data = fillIRSocioDefaults(parsed as Partial<IRSocioData>); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults(parsed as Partial<RelatorioVisitaData>); break;
              default:                 data = fillCNPJDefaults(parsed as Partial<CNPJData>);
            }
          } catch (aiError) {
            const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
            console.error(`[extract] AI failed:`, errMsg);
            console.error(`[extract] Context: inputMode=${inputMode} | docType=${_docType}`);
            console.error(`[extract] Input preview:`, inputMode === "text"
              ? _textContent.substring(0, 200)
              : `[binary ${_imageContent?.mimeType}, base64 len: ${_imageContent?.base64.length}]`
            );

            switch (_docType) {
              case "cnpj":           data = fillCNPJDefaults({}); break;
              case "qsa":            data = fillQSADefaults({}); break;
              case "contrato":       data = fillContratoDefaults({}); break;
              case "faturamento":    data = fillFaturamentoDefaults({}); break;
              case "scr":            data = fillSCRDefaults({}); break;
              case "protestos":      data = fillProtestosDefaults({}); break;
              case "processos":      data = fillProcessosDefaults({}); break;
              case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
              case "curva_abc":      data = fillCurvaABCDefaults({}); break;
              case "dre":            data = fillDREDefaults({}); break;
              case "balanco":        data = fillBalancoDefaults({}); break;
              case "ir_socio":       data = fillIRSocioDefaults({}); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults({}); break;
              default:               data = fillCNPJDefaults({});
            }

            let errorType: "quota" | "parse" | "empty" | "unknown" = "unknown";
            if (errMsg.includes("429") || errMsg.includes("EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("rate")) {
              errorType = "quota";
            } else if (errMsg.includes("JSON") || errMsg.includes("parse") || errMsg.includes("SyntaxError")) {
              errorType = "parse";
            } else if (errMsg.includes("empty") || errMsg.includes("length: 0") || errMsg.includes("Empty")) {
              errorType = "empty";
            }

            // success: false quando IA falhou — o frontend trata como erro visivel
            // em vez de fingir sucesso com dados vazios
            _send(controller, "result", {
              success: false, data,
              error: errMsg.substring(0, 200),
              meta: { rawTextLength: _textContent.length, filledFields: 0, isScanned: _isImage, aiError: true, errorType, errorMessage: errMsg.substring(0, 200) },
            });
            return;
          }

          const filled = countFilledFields(data);
          const scrAnteriorExtra = (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
          const variacoesExtra = (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          if (scrAnteriorExtra) {
            delete (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
            delete (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          }
          // QSA detectado automaticamente no Cartão CNPJ
          const qsaDetectadoExtra = (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado;
          if (qsaDetectadoExtra) {
            delete (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado;
          }

          _send(controller, "result", {
            success: true, data,
            ...(scrAnteriorExtra ? { scrAnterior: scrAnteriorExtra, variacoes: variacoesExtra } : {}),
            ...(qsaDetectadoExtra ? { qsaDetectado: qsaDetectadoExtra } : {}),
            meta: { rawTextLength: _textContent.length, filledFields: filled, isScanned: _isImage, aiPowered: true },
          });
        } catch (err) {
          console.error("[extract] Stream error:", err instanceof Error ? err.message : err);
          _send(controller, "result", { success: false, error: "Erro interno ao processar o documento." });
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
