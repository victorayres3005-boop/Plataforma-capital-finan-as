import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, ProtestosData, ProcessosData, GrupoEconomicoData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

  // somatoriaAno usa TODOS os meses
  const valores = meses.map(m => parseBRVal(m.valor));
  const soma = valores.reduce((a, b) => a + b, 0);

  // FMM = soma dos 12 / 12 (incluindo zeros na divisão)
  const valoresFMM = mesesFMM.map(m => parseBRVal(m.valor));
  const media = mesesFMM.length > 0 ? valoresFMM.reduce((a, b) => a + b, 0) / 12 : 0;

  // Meses zerados nos últimos 12
  const mesesZeradosExcel = mesesFMM
    .filter((_, i) => valoresFMM[i] === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  // Verificar alertas
  const faturamentoZerado = valores.length === 0 || valores.every(v => v === 0);
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

const PROMPT_CNPJ = `Você é um especialista em documentos da Receita Federal do Brasil.
Analise o Cartão CNPJ recebido e extraia os dados com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "razaoSocial": "", "nomeFantasia": "", "cnpj": "", "dataAbertura": "",
  "situacaoCadastral": "", "dataSituacaoCadastral": "", "motivoSituacao": "",
  "naturezaJuridica": "", "cnaePrincipal": "", "cnaeSecundarios": "",
  "porte": "", "capitalSocialCNPJ": "", "endereco": "", "telefone": "", "email": ""
}

Regras:
- CNPJ com pontuação (XX.XXX.XXX/XXXX-XX), datas DD/MM/YYYY
- endereco: concatenar logradouro, nº, complemento, bairro, município, UF, CEP
- cnaePrincipal: código + descrição. cnaeSecundarios: todos separados por ;
- Campos ausentes → ""
- NÃO invente dados`;

const PROMPT_QSA = `Você é um especialista em análise de documentos societários brasileiros.
Analise o documento QSA (Quadro de Sócios e Administradores) recebido e extraia os dados.
Retorne APENAS JSON válido, sem texto adicional:

{
  "capitalSocial": "",
  "quadroSocietario": [
    { "nome": "", "cpfCnpj": "", "qualificacao": "", "participacao": "" }
  ]
}

Regras:
- Liste TODOS os sócios/administradores encontrados
- CPF com pontuação (XXX.XXX.XXX-XX), CNPJ com pontuação
- qualificacao: Sócio-Administrador, Sócio, Administrador, Procurador, etc. (valor exato do documento)
- participacao: percentual ou quantidade de quotas se disponível
- capitalSocial: valor em reais formatado (ex: "R$ 220.000,00")
- NÃO confunda testemunhas ou advogados com sócios
- NÃO invente dados`;

const PROMPT_CONTRATO = `Você é um especialista em análise de documentos societários brasileiros.
Analise o Contrato Social recebido e extraia os dados.
Retorne APENAS JSON válido, sem texto adicional:

{
  "socios": [{ "nome": "", "cpf": "", "participacao": "", "qualificacao": "" }],
  "capitalSocial": "", "objetoSocial": "", "dataConstituicao": "",
  "temAlteracoes": false, "prazoDuracao": "", "administracao": "", "foro": ""
}

Regras:
- Liste TODOS os sócios. CPF com pontuação. Não inclua testemunhas/advogados.
- objetoSocial: resumir em até 2 frases
- temAlteracoes: true se for alteração/consolidação
- Campos ausentes → "" ou false
- NÃO invente dados`;

const PROMPT_FATURAMENTO = `Você é um especialista em análise financeira.
Analise O DOCUMENTO INTEIRO de faturamento recebido e extraia os valores mensais.

ATENÇÃO — REGRAS CRÍTICAS DE EXTRAÇÃO:
- Varra TODO o documento: tabelas, gráficos, resumos, rodapés, cabeçalhos
- Extraia TODOS os meses encontrados, independente do ano
- NÃO se limite ao ano mais recente ou aos dados em destaque
- Se o documento tiver dados de 2023, 2024, 2025 e 2026 — extraia todos
- Se um mês aparecer em mais de um lugar com valores diferentes, use o maior valor
- NÃO invente dados — se um mês não estiver no documento, não inclua

Retorne APENAS JSON válido, sem texto adicional, sem markdown:
{
  "meses": [
    { "mes": "01/2024", "valor": "1.234.567,89" },
    { "mes": "02/2024", "valor": "1.234.567,89" }
  ],
  "somatoriaTotal": "",
  "totalMesesExtraidos": 0,
  "faturamentoZerado": false,
  "dadosAtualizados": true,
  "ultimoMesComDados": "",
  "anoMaisAntigo": "",
  "anoMaisRecente": ""
}

Regras de formatação:
- meses: TODOS os meses encontrados no documento inteiro, ordem cronológica crescente
- mes: formato MM/YYYY
- valor: formatação brasileira (1.234.567,89) — se for zero, use "0,00"
- somatoriaTotal: soma de todos os meses extraídos
- totalMesesExtraidos: contagem total de meses no array
- faturamentoZerado: true se todos os valores são zero ou ausentes
- dadosAtualizados: false se o último mês com dados é anterior a 60 dias da data atual
- ultimoMesComDados: último mês que tem valor maior que zero (formato MM/YYYY)
- anoMaisAntigo: ano mais antigo encontrado no documento (formato YYYY)
- anoMaisRecente: ano mais recente encontrado no documento (formato YYYY)`;

const PROMPT_SCR = `Você é um extrator de dados estruturados especializado em documentos do Sistema de Informações de Crédito (SCR) do Banco Central do Brasil.
Retorne APENAS JSON válido, sem markdown, sem explicações.

O documento SCR contém estas seções — extraia cada uma:

1. CABEÇALHO: CNPJ do cliente, período de referência (MM/AAAA), % documentos processados, % volume processado

2. CARTEIRA A VENCER (seção "Carteira a Vencer" ou "A Vencer"): valores em R$ por faixa — 14-30d, 31-60d, 61-90d, 91-180d, 181-360d, acima 360d, prazo indeterminado, total

3. VENCIDOS (seção "Vencidos"): valores em R$ por faixa — 15-30d, 31-60d, 61-90d, 91-180d, 181-360d, acima 360d, total

4. PREJUÍZOS: até 12 meses, acima de 12 meses, total

5. LIMITE DE CRÉDITO: até 360 dias, acima de 360 dias, total

6. OUTROS VALORES: Carteira de Crédito total, Responsabilidade Total, Risco Total, Coobrigação Assumida, Coobrigação Recebida, Créditos a Liberar

7. MODALIDADES (tabela se presente): para cada linha extraia tipo, domínio, subdomínio, valor

8. INSTITUIÇÕES FINANCEIRAS: listar todas com nome e valor

9. CAMPOS DERIVADOS (calcule você mesmo):
- totalDividasAtivas = carteira_a_vencer.total + vencidos.total
- operacoesAVencer = carteira_a_vencer.total (em dia = a vencer)
- operacoesVencidas = vencidos.total
- carteiraCurtoPrazo = soma das faixas até 360d da carteira a vencer
- carteiraLongoPrazo = faixa acima 360d da carteira a vencer
- semHistorico = true se totalDividasAtivas === 0 E limite.total === 0 E modalidades vazia
- classificacaoRisco = letra de classificação (AA, A, B, C, D, E, F, G, H) se presente no documento

Schema JSON de saída (RESPEITE EXATAMENTE estes nomes de campos):
{
  "periodoReferencia": "MM/AAAA",
  "cnpjSCR": "",
  "pctDocumentosProcessados": "",
  "pctVolumeProcessado": "",
  "carteiraAVencer": "",
  "vencidos": "",
  "prejuizos": "",
  "limiteCredito": "",
  "qtdeInstituicoes": "",
  "qtdeOperacoes": "",
  "totalDividasAtivas": "",
  "operacoesAVencer": "",
  "operacoesEmAtraso": "",
  "operacoesVencidas": "",
  "tempoAtraso": "",
  "coobrigacoes": "",
  "classificacaoRisco": "",
  "carteiraCurtoPrazo": "",
  "carteiraLongoPrazo": "",
  "emDia": "",
  "semHistorico": false,
  "numeroIfs": "",
  "faixasAVencer": {
    "ate30d": "", "d31_60": "", "d61_90": "",
    "d91_180": "", "d181_360": "", "acima360d": "",
    "prazoIndeterminado": "", "total": ""
  },
  "faixasVencidos": {
    "ate30d": "", "d31_60": "", "d61_90": "",
    "d91_180": "", "d181_360": "", "acima360d": "", "total": ""
  },
  "faixasPrejuizos": { "ate12m": "", "acima12m": "", "total": "" },
  "faixasLimite": { "ate360d": "", "acima360d": "", "total": "" },
  "outrosValores": {
    "carteiraCredito": "", "responsabilidadeTotal": "",
    "riscoTotal": "", "coobrigacaoAssumida": "",
    "coobrigacaoRecebida": "", "creditosALiberar": ""
  },
  "modalidades": [
    { "nome": "", "total": "", "aVencer": "", "vencido": "", "participacao": "" }
  ],
  "instituicoes": [
    { "nome": "", "valor": "" }
  ],
  "valoresMoedaEstrangeira": "",
  "historicoInadimplencia": "",
  "periodoAnterior": {
    "periodoReferencia": "", "carteiraAVencer": "", "vencidos": "", "prejuizos": "",
    "limiteCredito": "", "totalDividasAtivas": "", "operacoesAVencer": "", "operacoesEmAtraso": "",
    "operacoesVencidas": "", "carteiraCurtoPrazo": "", "carteiraLongoPrazo": "",
    "classificacaoRisco": "", "qtdeInstituicoes": "", "numeroIfs": "", "emDia": "",
    "semHistorico": false
  },
  "variacoes": {
    "emDia": "", "carteiraCurtoPrazo": "", "carteiraLongoPrazo": "",
    "totalDividasAtivas": "", "vencidos": "", "prejuizos": "", "limiteCredito": "", "numeroIfs": ""
  }
}

REGRAS:
- Campos de valor: use os valores TOTAIS da seção nos campos flat (carteiraAVencer, vencidos, prejuizos, limiteCredito) E os detalhes por faixa nos objetos (faixasAVencer, faixasVencidos, etc.)
- Valores monetários: formatação brasileira com vírgula decimal (ex: "23.785,80")
- Se o valor estiver em "mil R$" ou "R$ mil", multiplique por 1000 e formate
- Procure em TODAS as páginas do documento — dados podem estar espalhados
- modalidades: listar TODAS encontradas com total, a vencer, vencido e % participação
- instituicoes: listar TODAS com nome e valor
- Campos ausentes → "" para strings, false para booleanos, arrays vazios []
- NÃO invente dados — extraia apenas o que está visível no documento
- Se o documento contiver dados de dois períodos distintos (ex: tabela comparativa com colunas como "02/2025" e "02/2026"), extraia: o período MAIS RECENTE nos campos principais e o período ANTERIOR em "periodoAnterior" com o mesmo schema flat. Calcule "variacoes" para os campos: emDia, carteiraCurtoPrazo, carteiraLongoPrazo, totalDividasAtivas, vencidos, prejuizos, limiteCredito, numeroIfs. Formato da variação: "+7,6%", "-6,5%", "0" ou "-" se ausente. Se o documento tiver apenas um período, deixe "periodoAnterior" com campos vazios e "variacoes" com campos "-"`;


const PROMPT_PROTESTOS = `Você é um especialista em análise de crédito.
Analise o documento de certidão de protestos e extraia os dados.
Retorne APENAS JSON válido:

{
  "vigentesQtd": "",
  "vigentesValor": "",
  "regularizadosQtd": "",
  "regularizadosValor": "",
  "detalhes": [
    { "data": "", "credor": "", "valor": "", "regularizado": false }
  ]
}

Regras:
- vigentesQtd/Valor: total de protestos ativos (não regularizados)
- regularizadosQtd/Valor: total de protestos já quitados
- detalhes: listar TODOS os protestos encontrados
- Valores em formatação brasileira
- regularizado: true se consta como pago/regularizado
- NÃO invente dados`;

const PROMPT_PROCESSOS = `Você é um especialista em análise jurídica.
Analise o documento de processos judiciais e extraia os dados.
Retorne APENAS JSON válido:

{
  "passivosTotal": "",
  "ativosTotal": "",
  "valorTotalEstimado": "",
  "temRJ": false,
  "distribuicao": [
    { "tipo": "", "qtd": "", "pct": "" }
  ],
  "bancarios": [
    { "banco": "", "assunto": "", "status": "", "data": "", "valor": "" }
  ],
  "fiscais": [
    { "contraparte": "", "valor": "", "status": "", "data": "" }
  ],
  "fornecedores": [
    { "contraparte": "", "assunto": "", "valor": "", "status": "", "data": "" }
  ],
  "outros": [
    { "contraparte": "", "assunto": "", "valor": "", "status": "", "data": "" }
  ]
}

Regras:
- passivosTotal: número total de processos como réu
- ativosTotal: número total de processos como autor
- temRJ: true se houver Recuperação Judicial
- distribuicao: agrupar por tipo (TRABALHISTA, BANCO, FISCAL, FORNECEDOR, OUTROS) com qtd e %
- bancarios: listar processos contra bancos/instituições financeiras com detalhes; incluir valor individual se disponível
- fiscais: extraia todos os processos fiscais/tributários individuais encontrados no documento
- fornecedores: extraia todos os processos com fornecedores individuais encontrados
- outros: extraia processos que não se enquadrem em bancário, trabalhista, fiscal ou fornecedor
- Para trabalhistas: NÃO listar individualmente — apenas manter no array distribuicao com qtd e %
- status: ARQUIVADO, EM ANDAMENTO, DISTRIBUIDO, JULGADO, EM GRAU DE RECURSO
- Campos ausentes em processos individuais: usar "" para strings
- NÃO invente dados`;

const PROMPT_GRUPO_ECONOMICO = `Você é um especialista em análise de crédito.
Analise o documento de grupo econômico e extraia os dados das empresas relacionadas.
Retorne APENAS JSON válido:

{
  "empresas": [
    {
      "razaoSocial": "",
      "cnpj": "",
      "relacao": "",
      "scrTotal": "",
      "protestos": "",
      "processos": ""
    }
  ]
}

Regras:
- Listar TODAS as empresas do grupo econômico
- relacao: "via Sócio", "Controlada", "Coligada" ou como consta no documento
- scrTotal: valor total do SCR da empresa se disponível
- protestos: quantidade ou valor de protestos se disponível
- processos: quantidade de processos se disponível
- Campos ausentes → ""
- NÃO invente dados`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }): Promise<string> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (typeof content === "string") {
    parts.push({ text: prompt + "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
    parts.push({ text: prompt });
  }

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      let rateLimitRetries = 0;
      const MAX_RATE_RETRIES = 2;

      for (let attempt = 0; attempt < 2 + MAX_RATE_RETRIES; attempt++) {
        try {
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model} attempt=${attempt + 1}`);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
              },
            }),
          });

          if (response.status === 429) {
            if (rateLimitRetries < MAX_RATE_RETRIES) {
              rateLimitRetries++;
              // Extract wait time from response
              let waitMs = 3000;
              const retryAfterMs = response.headers.get("retry-after-ms");
              const retryAfter = response.headers.get("retry-after");
              if (retryAfterMs) {
                waitMs = parseInt(retryAfterMs);
              } else if (retryAfter) {
                waitMs = parseInt(retryAfter) * 1000;
              } else {
                try {
                  const errBody = await response.clone().json();
                  const msg = errBody?.error?.message || "";
                  const match = msg.match(/retry\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*s/i);
                  if (match) waitMs = Math.ceil(parseFloat(match[1]) * 1000);
                } catch { /* ignore */ }
              }
              waitMs = Math.min(Math.max(waitMs, 2000), 60000);
              console.log(`[Gemini] Rate limited on key=${apiKey.substring(0, 8)} model=${model}, waiting ${waitMs}ms (retry ${rateLimitRetries}/${MAX_RATE_RETRIES})...`);
              await sleep(waitMs);
              continue;
            } else {
              console.log(`[Gemini] Max rate-limit retries on key=${apiKey.substring(0, 8)} model=${model}, moving on`);
              break;
            }
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Gemini] HTTP ${response.status}:`, body.substring(0, 300));
            break;
          }

          const result = await response.json();
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response`);
            break;
          }
          return text;
        } catch (err) {
          console.error(`[Gemini] Error:`, err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada Gemini (único provedor)
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string },
): Promise<string> {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error("Nenhuma GEMINI_API_KEY configurada.");
  }

  // callGemini aceita string (texto) ou objeto (binário) como segundo parâmetro
  const content: string | { mimeType: string; base64: string } = imageContent ?? textContent;
  return await callGemini(prompt, content);
}

// ─────────────────────────────────────────
// Parse JSON
// ─────────────────────────────────────────
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  return JSON.parse(cleaned);
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
  const quadro = Array.isArray(data.quadroSocietario) && data.quadroSocietario.length > 0
    ? data.quadroSocietario.map(s => ({
        nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
        qualificacao: s.qualificacao || "", participacao: s.participacao || "",
      }))
    : [{ nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }];
  return { capitalSocial: data.capitalSocial || "", quadroSocietario: quadro };
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData {
  const socios = Array.isArray(data.socios) && data.socios.length > 0
    ? data.socios.map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }))
    : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }];
  return {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
}

function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  const meses = Array.isArray(data.meses) ? data.meses : [];
  const parseBR = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenados = [...meses].sort((a, b) => {
    const [mesA, anoA] = (a.mes || "").split("/").map(Number);
    const [mesB, anoB] = (b.mes || "").split("/").map(Number);
    return (anoA - anoB) || (mesA - mesB);
  });

  const meses12 = ordenados.slice(-12);
  const soma12 = meses12.reduce((s, m) => s + parseBR(m.valor), 0);
  const fmm12m = meses12.length > 0 ? soma12 / 12 : 0;

  const porAno: Record<string, number[]> = {};
  for (const m of ordenados) {
    const [, ano] = (m.mes || "").split("/");
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

  const somaTotal = meses.reduce((s, m) => s + parseBR(m.valor), 0);

  const mesesZerados = meses12
    .filter(m => parseBR(m.valor) === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  return {
    meses,
    somatoriaAno: fmtBR(somaTotal),
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
  const emptyFaixas = { ate30d: "", d31_60: "", d61_90: "", d91_180: "", d181_360: "", acima360d: "", total: "" };
  return {
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
    // Campos detalhados (novo prompt)
    cnpjSCR: data.cnpjSCR || "",
    pctDocumentosProcessados: data.pctDocumentosProcessados || "",
    pctVolumeProcessado: data.pctVolumeProcessado || "",
    faixasAVencer: data.faixasAVencer || { ...emptyFaixas, prazoIndeterminado: "" },
    faixasVencidos: data.faixasVencidos || { ...emptyFaixas },
    faixasPrejuizos: data.faixasPrejuizos || { ate12m: "", acima12m: "", total: "" },
    faixasLimite: data.faixasLimite || { ate360d: "", acima360d: "", total: "" },
    outrosValores: data.outrosValores || {
      carteiraCredito: "", responsabilidadeTotal: "", riscoTotal: "",
      coobrigacaoAssumida: "", coobrigacaoRecebida: "", creditosALiberar: "",
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

type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData;

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
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else if (ext === "pdf" && (docType === "scr" || docType === "qsa")) {
      // SCR e QSA do Bacen/Receita: sempre enviar como binário (encoding problemático)
      console.log(`[extract] ${docType} PDF — sending as binary (always multimodal for this type)`);
      imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
    } else {
      textContent = await extractText(buffer, ext);
      const isUsableText = textContent.trim().length >= 20 && hasReadableContent(textContent);

      if (!isUsableText && ext === "pdf") {
        console.log(`[extract] PDF text not usable, sending as binary...`);
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
        cnpj: 8000, qsa: 15000, contrato: 40000, faturamento: 20000, scr: 40000,
        protestos: 25000, processos: 30000, grupoEconomico: 20000,
      };
      textContent = textContent.substring(0, maxChars[docType] || 25000);
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── Chamar IA ────
    let data: AnyExtracted;
    const inputMode = imageContent ? "binary" : "text";

    try {
      const aiResponse = await callAI(prompt, textContent, imageContent);
      console.log(`[extract] AI response length: ${aiResponse.length}`);
      console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
      const parsed = parseJSON<Record<string, unknown>>(aiResponse);

      switch (docType) {
        case "cnpj":           data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
        case "qsa":            data = fillQSADefaults(parsed as Partial<QSAData>); break;
        case "contrato":       data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
        case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
        case "scr": {
          data = fillSCRDefaults(parsed as Partial<SCRData>);
          const periodoAnterior = (parsed as Record<string, unknown>).periodoAnterior as Partial<SCRData> | undefined;
          if (periodoAnterior && periodoAnterior.periodoReferencia) {
            (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior = fillSCRDefaults(periodoAnterior);
            (data as SCRData & { _variacoes?: Record<string, string> })._variacoes =
              ((parsed as Record<string, unknown>).variacoes as Record<string, string>) || {};
          }
          break;
        }
        case "protestos":      data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
        case "processos":      data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
        case "grupoEconomico": data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
        default:               data = fillCNPJDefaults(parsed as Partial<CNPJData>);
      }
    } catch (aiError) {
      const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
      console.error(`[extract] AI (Gemini) failed:`, errMsg);
      console.error(`[extract] Context: inputMode=${inputMode} | docType=${docType}`);
      console.error(`[extract] Input preview (first 200 chars):`, inputMode === "text"
        ? textContent.substring(0, 200)
        : `[binary ${imageContent?.mimeType}, base64 length: ${imageContent?.base64.length}]`
      );

      switch (docType) {
        case "cnpj":           data = fillCNPJDefaults({}); break;
        case "qsa":            data = fillQSADefaults({}); break;
        case "contrato":       data = fillContratoDefaults({}); break;
        case "faturamento":    data = fillFaturamentoDefaults({}); break;
        case "scr":            data = fillSCRDefaults({}); break;
        case "protestos":      data = fillProtestosDefaults({}); break;
        case "processos":      data = fillProcessosDefaults({}); break;
        case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
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

      return NextResponse.json({
        success: true, data,
        meta: { rawTextLength: textContent.length, filledFields: 0, isScanned: isImage, aiError: true, errorType, errorMessage: errMsg.substring(0, 200) },
      });
    }

    const filled = countFilledFields(data);
    const scrAnteriorExtra = (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
    const variacoesExtra = (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
    if (scrAnteriorExtra) {
      delete (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
      delete (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
    }
    return NextResponse.json({
      success: true, data,
      ...(scrAnteriorExtra ? { scrAnterior: scrAnteriorExtra, variacoes: variacoesExtra } : {}),
      meta: { rawTextLength: textContent.length, filledFields: filled, isScanned: isImage, aiPowered: true },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
