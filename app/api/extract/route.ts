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

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];
const GROQ_MODEL = "llama-3.3-70b-versatile";

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

  // Calcular soma e média
  const valores = meses.map(m => {
    const num = parseFloat(m.valor.replace(/\./g, "").replace(",", "."));
    return isNaN(num) ? 0 : num;
  });

  const soma = valores.reduce((a, b) => a + b, 0);
  const media = valores.length > 0 ? soma / valores.length : 0;

  // Verificar alertas
  const faturamentoZerado = valores.length === 0 || valores.every(v => v === 0);
  const ultimoMes = meses.length > 0 ? meses[meses.length - 1].mes : "";

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
- endereco: montar string estruturada no formato "Logradouro, Nº Número, Complemento, Bairro, Município-UF, CEP XXXXX-XXX". Extraia cada componente separadamente do documento (logradouro, número, complemento, bairro, município, UF, CEP) e concatene nesse formato. Se algum componente estiver ausente, omita-o da string sem deixar vírgulas duplas.
- naturezaJuridica: incluir código numérico + descrição (ex: "206-2 - Sociedade Empresária Limitada")
- cnaePrincipal: código completo com pontuação + descrição (ex: "47.61-0-03 - Comércio varejista de artigos de papelaria")
- cnaeSecundarios: todos os CNAEs secundários separados por ";" no mesmo formato código + descrição
- capitalSocialCNPJ: valor formatado em reais (ex: "R$ 100.000,00")
- situacaoCadastral: valor exato do documento (ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA)
- Se a situação NÃO for ATIVA, preencher motivoSituacao com o motivo exato
- porte: MICROEMPRESA, EMPRESA DE PEQUENO PORTE, DEMAIS, ou como consta no documento
- Campos ausentes → ""
- NÃO invente dados`;

const PROMPT_QSA = `Você é um especialista em análise de documentos societários brasileiros.
Analise o documento QSA (Quadro de Sócios e Administradores) recebido e extraia os dados com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "capitalSocial": "",
  "quadroSocietario": [
    {
      "nome": "",
      "cpfCnpj": "",
      "tipo_pessoa": "",
      "qualificacao": "",
      "participacao": "",
      "eh_administrador": false
    }
  ]
}

Regras:
- Liste TODOS os sócios/administradores encontrados no documento, sem exceção
- CPF com pontuação (XXX.XXX.XXX-XX), CNPJ com pontuação (XX.XXX.XXX/XXXX-XX)
- tipo_pessoa: "PF" para pessoa física (CPF), "PJ" para pessoa jurídica (CNPJ)
- qualificacao: valor exato do documento — Sócio-Administrador, Sócio, Administrador, Procurador, Diretor, etc.
- participacao: percentual se disponível (ex: "50%") ou quantidade de quotas (ex: "110.000 quotas")
- eh_administrador: true se a qualificação indica poder de administração (Sócio-Administrador, Administrador, Diretor)
- capitalSocial: valor numérico em reais formatado (ex: "R$ 220.000,00")
- NÃO confunda testemunhas, advogados ou contadores com sócios
- NÃO invente dados`;

const PROMPT_CONTRATO = `Você é um especialista em análise de documentos societários brasileiros.
Analise o Contrato Social (ou Alteração Contratual / Consolidação) recebido e extraia os dados com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "socios": [
    { "nome": "", "cpf": "", "participacao": "", "qualificacao": "" }
  ],
  "capitalSocial": "",
  "objetoSocial": "",
  "dataConstituicao": "",
  "temAlteracoes": false,
  "prazoDuracao": "",
  "administracao": "",
  "foro": "",
  "historico_alteracoes": "",
  "data_inicio_atividades_real": "",
  "administrador_nao_socio": false
}

Regras:
- Liste TODOS os sócios. CPF com pontuação (XXX.XXX.XXX-XX). Não inclua testemunhas/advogados.
- participacao: percentual ou quantidade de quotas (ex: "50%" ou "50.000 quotas de R$ 1,00")
- qualificacao: Sócio-Administrador, Sócio, Administrador, etc.
- capitalSocial: valor em reais formatado (ex: "R$ 500.000,00")
- objetoSocial: resumir em até 2 frases claras e precisas
- dataConstituicao: data de constituição original da empresa (DD/MM/YYYY)
- temAlteracoes: true se o documento é uma alteração contratual ou consolidação (não o contrato original)
- prazoDuracao: "Indeterminado" ou prazo específico se mencionado
- administracao: descrever quem administra (nomes e forma — isolada ou conjunta)
- foro: comarca indicada no contrato
- historico_alteracoes: se for consolidação/alteração, resumir brevemente as alterações mencionadas (ex: "1ª Alt: mudança de endereço; 2ª Alt: inclusão de sócio"). Se não houver, deixar ""
- data_inicio_atividades_real: se mencionada uma data de início de atividades diferente da constituição, informar aqui (DD/MM/YYYY). Caso contrário, ""
- administrador_nao_socio: true se o administrador designado NÃO consta na lista de sócios (administrador externo/terceiro)
- Campos ausentes → "" ou false
- NÃO invente dados`;

const PROMPT_FATURAMENTO = `Você é um especialista em análise financeira de empresas brasileiras.
Analise o documento de faturamento recebido e extraia os valores mensais com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "cnpj_empresa": "",
  "periodo_inicio": "",
  "periodo_fim": "",
  "meses": [
    { "mes": "01/2025", "valor": "1.234.567,89" }
  ],
  "serie_mensal": [
    { "competencia": "01/2025", "valor_total": "1.234.567,89" }
  ],
  "somatoriaAno": "",
  "mediaAno": "",
  "faturamentoZerado": false,
  "dadosAtualizados": true,
  "ultimoMesComDados": ""
}

Regras:
- cnpj_empresa: CNPJ da empresa se constar no documento (para validação cruzada)
- periodo_inicio: primeiro mês com dados (MM/YYYY)
- periodo_fim: último mês com dados (MM/YYYY)
- meses: listar TODOS os meses com faturamento encontrado, em ordem cronológica
- serie_mensal: mesma lista em formato alternativo — competencia (MM/YYYY) e valor_total
- mes/competencia: formato MM/YYYY
- valor/valor_total: formatação brasileira (1.234.567,89) — SEM prefixo "R$"
- somatoriaAno: soma de todos os meses no período
- mediaAno: média aritmética dos meses
- faturamentoZerado: true se todos os valores são zero ou ausentes
- dadosAtualizados: false se o último mês com dados é anterior a 60 dias da data atual
- ultimoMesComDados: último mês que tem valor de faturamento (MM/YYYY)
- Se houver faturamento por CNPJ filial, somar tudo no total mensal
- NÃO invente dados`;

const PROMPT_SCR = `Você é um especialista no Sistema de Informações de Crédito (SCR) do Banco Central do Brasil.

Analise VISUALMENTE este documento SCR oficial do Bacen. O documento contém dados de endividamento bancário da empresa.

ESTRUTURA TÍPICA DO DOCUMENTO SCR:
- Cabeçalho: CNPJ consultado, período de referência (MM/AAAA), % docs e volume processados
- Seção "Carteira a Vencer": tabela com prazos (até 30d, 31-60d, 61-90d, 91-180d, 181-360d, acima 360d)
- Seção "Vencidos": mesmos prazos
- Seção "Prejuízos": até 12m, acima 12m
- Seção "Limite de Crédito": até 360d, acima 360d
- Seção "Outros": coobrigações, responsabilidade total, créditos a liberar, vendor
- Seção "Modalidades": tabela detalhada de tipos de operação
- Pode ter múltiplas páginas

Retorne APENAS JSON:

{
  "periodoReferencia": "MM/AAAA",
  "cnpjConsultado": "",
  "percentualDocsProcessados": "",
  "percentualVolumeProcessado": "",
  "qtdeInstituicoes": "",
  "qtdeOperacoes": "",
  "carteiraAVencer": "",
  "carteiraAVencerDetalhado": {
    "ate30d": "", "de31a60d": "", "de61a90d": "",
    "de91a180d": "", "de181a360d": "", "acima360d": "", "total": ""
  },
  "vencidos": "",
  "vencidosDetalhado": {
    "de15a30d": "", "de31a60d": "", "de61a90d": "",
    "de91a180d": "", "de181a360d": "", "acima360d": "", "total": ""
  },
  "prejuizos": "",
  "prejuizosDetalhado": { "ate12m": "", "acima12m": "", "total": "" },
  "limiteCredito": "",
  "limiteCreditoDetalhado": { "ate360d": "", "acima360d": "", "total": "" },
  "totalDividasAtivas": "",
  "coobrigacoes": "",
  "responsabilidadeTotal": "",
  "creditosALiberar": "",
  "riscoIndiretoVendor": "",
  "classificacaoRisco": "",
  "carteiraCurtoPrazo": "",
  "carteiraLongoPrazo": "",
  "modalidades": [
    { "nome": "", "total": "", "aVencer": "", "vencido": "", "participacao": "" }
  ],
  "instituicoes": [
    { "nome": "", "valor": "" }
  ],
  "valoresMoedaEstrangeira": "",
  "historicoInadimplencia": "",
  "status": "COM_HISTORICO"
}

REGRAS:
- Se TODOS os valores forem zero ou vazios: status = "SEM_HISTORICO_BANCARIO"
- Valores monetários: formatação brasileira (ex: "23.785,80")
- Se valores em "mil R$": converter (multiplicar por 1000)
- Leia CADA tabela, CADA linha, CADA página
- modalidades: listar TODAS as modalidades/operações
- instituicoes: listar TODAS as IFs
- NÃO invente dados`;

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
    { "banco": "", "assunto": "", "status": "", "data": "" }
  ]
}

Regras:
- passivosTotal: número total de processos como réu
- ativosTotal: número total de processos como autor
- temRJ: true se houver Recuperação Judicial
- distribuicao: agrupar por tipo (TRABALHISTA, BANCO, FISCAL, FORNECEDOR, OUTROS) com qtd e %
- bancarios: listar processos contra bancos/instituições financeiras com detalhes
- status: ARQUIVADO, EM ANDAMENTO, DISTRIBUIDO, JULGADO, EM GRAU DE RECURSO
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
      for (let attempt = 0; attempt < 2; attempt++) {
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
            console.log(`[Gemini] Rate limited on key=${apiKey.substring(0, 8)} model=${model}, trying next...`);
            await sleep(2000);
            break; // Próximo modelo ou key
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
// PROVEDOR 2: Groq (fallback)
// ─────────────────────────────────────────
async function callGroq(prompt: string, content: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[Groq] Attempt ${attempt + 1}...`);
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "Você é um extrator de dados de documentos brasileiros. Responda SOMENTE com JSON válido. NUNCA repita o documento. Sua resposta deve começar com { e terminar com }." },
            {
              role: "user",
              content: JSON.stringify({ tarefa: prompt, documento: content }),
            },
          ],
          temperature: 0.0,
          max_tokens: 4096,
        }),
      });

      if (response.status === 429) {
        await sleep(3000 * Math.pow(2, attempt));
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Groq] HTTP ${response.status}:`, body.substring(0, 300));
        throw new Error(`Groq ${response.status}`);
      }

      const result = await response.json();
      const text = result?.choices?.[0]?.message?.content;
      if (!text) throw new Error("Resposta vazia");
      return text;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("GROQ_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada com fallback: Gemini → Groq
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string }
): Promise<string> {
  if (GEMINI_API_KEYS.length > 0) {
    try {
      return await callGemini(prompt, imageContent || textContent);
    } catch (err) {
      console.log(`[AI] Gemini failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (GROQ_API_KEY && textContent) {
    try {
      return await callGroq(prompt, textContent.substring(0, 10000));
    } catch (err) {
      console.log(`[AI] Groq failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error("Serviço de IA temporariamente indisponível. Aguarde 1 minuto e tente novamente.");
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
  return {
    meses: Array.isArray(data.meses) ? data.meses : [],
    somatoriaAno: data.somatoriaAno || "0,00",
    mediaAno: data.mediaAno || "0,00",
    faturamentoZerado: data.faturamentoZerado ?? true,
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fillSCRDefaults(data: Record<string, any>): SCRData {
  // Map detailed breakdown totals to top-level fields if top-level is empty
  const carteiraAVencer = data.carteiraAVencer
    || data.carteiraAVencerDetalhado?.total
    || "";
  const vencidos = data.vencidos
    || data.vencidosDetalhado?.total
    || "";
  const prejuizos = data.prejuizos
    || data.prejuizosDetalhado?.total
    || "";
  const limiteCredito = data.limiteCredito
    || data.limiteCreditoDetalhado?.total
    || "";

  // Build detailed breakdown strings to store in existing string fields where useful
  const detailParts: string[] = [];
  if (data.carteiraAVencerDetalhado) {
    const d = data.carteiraAVencerDetalhado;
    const parts = [
      d.ate30d && `até 30d: ${d.ate30d}`,
      d.de31a60d && `31-60d: ${d.de31a60d}`,
      d.de61a90d && `61-90d: ${d.de61a90d}`,
      d.de91a180d && `91-180d: ${d.de91a180d}`,
      d.de181a360d && `181-360d: ${d.de181a360d}`,
      d.acima360d && `>360d: ${d.acima360d}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`A Vencer: ${parts.join("; ")}`);
  }
  if (data.vencidosDetalhado) {
    const d = data.vencidosDetalhado;
    const parts = [
      d.de15a30d && `15-30d: ${d.de15a30d}`,
      d.de31a60d && `31-60d: ${d.de31a60d}`,
      d.de61a90d && `61-90d: ${d.de61a90d}`,
      d.de91a180d && `91-180d: ${d.de91a180d}`,
      d.de181a360d && `181-360d: ${d.de181a360d}`,
      d.acima360d && `>360d: ${d.acima360d}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`Vencidos: ${parts.join("; ")}`);
  }
  if (data.prejuizosDetalhado) {
    const d = data.prejuizosDetalhado;
    const parts = [
      d.ate12m && `até 12m: ${d.ate12m}`,
      d.acima12m && `>12m: ${d.acima12m}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`Prejuízos: ${parts.join("; ")}`);
  }
  if (data.limiteCreditoDetalhado) {
    const d = data.limiteCreditoDetalhado;
    const parts = [
      d.ate360d && `até 360d: ${d.ate360d}`,
      d.acima360d && `>360d: ${d.acima360d}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`Limite: ${parts.join("; ")}`);
  }

  // Concatenate extra SCR info into historicoInadimplencia if it was empty
  const extraInfo = detailParts.join(" | ");
  const historicoInadimplencia = data.historicoInadimplencia
    || (extraInfo ? extraInfo : "");

  // Map new fields that don't exist in SCRData to existing fields
  const operacoesAVencer = data.operacoesAVencer || carteiraAVencer || "";
  const coobrigacoes = data.coobrigacoes || data.responsabilidadeTotal || "";
  const tempoAtraso = data.tempoAtraso || "";
  const operacoesEmAtraso = data.operacoesEmAtraso || "";
  const operacoesVencidas = data.operacoesVencidas || vencidos || "";
  const totalDividasAtivas = data.totalDividasAtivas || data.responsabilidadeTotal || "";

  return {
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer,
    vencidos,
    prejuizos,
    limiteCredito,
    qtdeInstituicoes: data.qtdeInstituicoes || "",
    qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas,
    operacoesAVencer,
    operacoesEmAtraso,
    operacoesVencidas,
    tempoAtraso,
    coobrigacoes,
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo: data.carteiraCurtoPrazo || "",
    carteiraLongoPrazo: data.carteiraLongoPrazo || "",
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia,
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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0 && !GROQ_API_KEY) {
      return NextResponse.json({ error: "Nenhuma API key configurada." }, { status: 500 });
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
    } else if (ext === "pdf" && (docType === "scr" || docType === "qsa" || docType === "contrato")) {
      // SCR, QSA e Contrato: sempre enviar como binário (encoding problemático em PDFs desses tipos)
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

    try {
      const aiResponse = await callAI(prompt, textContent, imageContent);
      console.log(`[extract] AI response length: ${aiResponse.length}`);
      const parsed = parseJSON<Record<string, unknown>>(aiResponse);

      switch (docType) {
        case "cnpj":           data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
        case "qsa":            data = fillQSADefaults(parsed as Partial<QSAData>); break;
        case "contrato":       data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
        case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
        case "scr":            data = fillSCRDefaults(parsed as Record<string, unknown>); break;
        case "protestos":      data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
        case "processos":      data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
        case "grupoEconomico": data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
        default:               data = fillCNPJDefaults(parsed as Partial<CNPJData>);
      }
    } catch (aiError) {
      console.error("[extract] AI failed:", aiError);

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
      return NextResponse.json({
        success: true, data,
        meta: { rawTextLength: textContent.length, filledFields: 0, isScanned: isImage, aiError: true },
      });
    }

    const filled = countFilledFields(data);
    return NextResponse.json({
      success: true, data,
      meta: { rawTextLength: textContent.length, filledFields: filled, isScanned: isImage, aiPowered: true },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
