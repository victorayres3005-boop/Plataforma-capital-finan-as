export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, FaturamentoMensal, ProtestosData, ProcessosData, GrupoEconomicoData, CurvaABCData, DREData, BalancoData, IRSocioData, RelatorioVisitaData, SCRModalidade, Socio, Filial, SocioRetirante, DREAno, BalancoAno, ClienteCurvaABC, SociedadeIR, DividaAtivaData, CenprotData, GefipData } from "@/types";
import {
  CNPJDataSchema, QSADataSchema, ContratoSocialDataSchema, FaturamentoDataSchema, SCRDataSchema,
  RelatorioVisitaSchema,
  safeParseExtracted, auditBusinessRules,
} from "@/lib/extract/schemas";
import {
  PROMPT_CNPJ, PROMPT_QSA, PROMPT_CONTRATO, PROMPT_FATURAMENTO,
  PROMPT_SCR, PROMPT_SCR_SEM_DADOS, PROMPT_SCR_BUREAU,
  PROMPT_FAT_DAS, PROMPT_FAT_BANCARIO,
  PROMPT_IR_RECIBO, PROMPT_IR_SOCIOS,
  PROMPT_PROTESTOS, PROMPT_PROCESSOS, PROMPT_GRUPO_ECONOMICO,
  PROMPT_CURVA_ABC, PROMPT_DRE, PROMPT_BALANCO,
  PROMPT_RELATORIO_VISITA,
  PROMPT_DIVIDA_ATIVA, PROMPT_CENPROT, PROMPT_GEFIP,
} from "@/lib/extract/prompts";
import {
  adaptCNPJNew, adaptQSANew, adaptContratoNew, adaptFaturamentoNew,
  adaptSCRNew, adaptCurvaABCNew, adaptDRENew, adaptBalancoNew,
  adaptIRNew, adaptVisitaNew, directParseCurvaABC,
} from "@/lib/extract/adapters";
import {
  fillCNPJDefaults, fillQSADefaults, fillContratoDefaults, fillFaturamentoDefaults,
  fillSCRDefaults, fillProtestosDefaults, fillProcessosDefaults, fillGrupoEconomicoDefaults,
  fillCurvaABCDefaults, fillDREDefaults, fillBalancoDefaults, fillIRSocioDefaults,
  fillRelatorioVisitaDefaults, countFilledFields,
  fillDividaAtivaDefaults, fillCenprotDefaults, fillGefipDefaults,
} from "@/lib/extract/fillDefaults";
import type { AnyExtracted } from "@/lib/extract/fillDefaults";
import { callAI, GEMINI_API_KEYS } from "@/lib/extract/ai";
import { parseJSON } from "@/lib/extract/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;


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

// ─── Blob fetch seguro (allowlist + timeout + size limit) ────────────────────
// Defesa contra SSRF: só permite hosts do Vercel Blob.
// Defesa contra OOM: respeita Content-Length e aborta em 30s.
const ALLOWED_BLOB_HOST_PATTERNS: RegExp[] = [
  /\.public\.blob\.vercel-storage\.com$/i,
  /\.blob\.vercel-storage\.com$/i,
];
const MAX_BLOB_BYTES = 30 * 1024 * 1024; // 30MB — alinhado ao limite multipart

async function fetchBlobSafe(blobUrl: string): Promise<{ buffer: Buffer; contentType: string | null } | { error: string; status: number }> {
  let parsed: URL;
  try {
    parsed = new URL(blobUrl);
  } catch {
    return { error: "blobUrl inválido.", status: 400 };
  }
  if (parsed.protocol !== "https:") {
    return { error: "blobUrl deve usar HTTPS.", status: 400 };
  }
  if (!ALLOWED_BLOB_HOST_PATTERNS.some(rx => rx.test(parsed.hostname))) {
    console.warn(`[extract] blobUrl host não permitido: ${parsed.hostname}`);
    return { error: "Host do blob não permitido.", status: 400 };
  }
  let resp: Response;
  try {
    // redirect:"error" bloqueia 30x — caso contrário URL no host permitido poderia
    // redirecionar para IP interno (SSRF via redirect).
    resp = await fetch(blobUrl, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Falha ao baixar blob: ${msg}`, status: 502 };
  }
  if (!resp.ok) {
    return { error: `Não foi possível baixar o arquivo do blob (${resp.status}).`, status: 400 };
  }
  const lenHeader = resp.headers.get("content-length");
  if (lenHeader) {
    const declared = Number(lenHeader);
    if (Number.isFinite(declared) && declared > MAX_BLOB_BYTES) {
      return { error: `Arquivo excede o limite de ${MAX_BLOB_BYTES / 1024 / 1024}MB.`, status: 413 };
    }
  }
  // Streaming: aborta logo que ultrapassar o limite, sem bufferizar GB inteiros em RAM.
  if (!resp.body) {
    return { error: "Resposta do blob sem body.", status: 502 };
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > MAX_BLOB_BYTES) {
          await reader.cancel().catch(() => {});
          return { error: `Arquivo excede o limite de ${MAX_BLOB_BYTES / 1024 / 1024}MB.`, status: 413 };
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Falha ao ler blob: ${msg}`, status: 502 };
  }
  return { buffer: Buffer.concat(chunks.map(c => Buffer.from(c)), received), contentType: resp.headers.get("content-type") };
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
    if (ext === "xlsx" || ext === "xls") {
      // Converte planilha em texto tabular para envio ao Gemini quando o
      // parser dedicado de faturamento não conseguiu extrair os dados.
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const lines: string[] = [];
      for (const sheet of workbook.worksheets.slice(0, 3)) {
        lines.push(`=== Planilha: ${sheet.name} ===`);
        sheet.eachRow(row => {
          const cells = (row.values as unknown[])
            .slice(1)
            .map(c => (c == null ? "" : String(c).trim()))
            .join("\t");
          if (cells.replace(/\t/g, "").trim()) lines.push(cells);
        });
      }
      return lines.join("\n");
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
// Layer 3 — Detecção de subformato (determinística, sem chamada IA)
// ─────────────────────────────────────────
type Subformat =
  | "SCR_BACEN_SEM_DADOS"
  | "SCR_BUREAU"
  | "FAT_DAS"
  | "FAT_BANCARIO"
  | "IR_RECIBO"
  | "DEFAULT";

function detectSubformat(docType: string, text: string): Subformat {
  const t = text.toUpperCase();

  if (docType === "scr") {
    if (
      t.includes("NAO POSSUI DADOS NO SCR") || t.includes("NÃO POSSUI DADOS NO SCR") ||
      t.includes("SEM OPERACOES REGISTRADAS") || t.includes("SEM OPERAÇÕES REGISTRADAS") ||
      (t.includes("CLIENTE") && t.includes("NAO POSSUI") && t.includes("SCR"))
    ) return "SCR_BACEN_SEM_DADOS";
    if (
      t.includes("CREDIT HUB") || t.includes("CONSULTA SIMPLES") ||
      t.includes("BOA VISTA SCPC") || t.includes("QUOD") ||
      (t.includes("PEFIN") && t.includes("REFIN")) ||
      (t.includes("NEGATIVAC") && !t.includes("CARTEIRA A VENCER"))
    ) return "SCR_BUREAU";
  }

  if (docType === "faturamento") {
    if (t.includes("PGDAS") || (t.includes("SIMPLES NACIONAL") && t.includes("RECEITA BRUTA"))) return "FAT_DAS";
    if (
      t.includes("SALDO ANTERIOR") &&
      (t.includes("CRÉDITO") || t.includes("CREDITO")) &&
      (t.includes("DÉBITO") || t.includes("DEBITO"))
    ) return "FAT_BANCARIO";
  }

  if (docType === "ir_socio") {
    if (
      (t.includes("RECIBO DE ENTREGA") || t.includes("RECIBO DA DECLARACAO")) &&
      !t.includes("BENS E DIREITOS") && !t.includes("RENDIMENTOS TRIBUTAVEIS")
    ) return "IR_RECIBO";
  }

  return "DEFAULT";
}



// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // ── Stub E2E ──────────────────────────────────────────────────────────────
    // Quando rodando E2E (Playwright), retorna fixture estática em vez de
    // chamar Gemini. Evita custo + flakiness por modelo lento. Fixture
    // representa um cartão CNPJ extraído com sucesso. Outros tipos de
    // documento podem ser adicionados conforme cenários novos surgirem.
    // Ativação: header `x-e2e-mode: true` na request OU env E2E_EXTRACT_STUB=true.
    const isE2eStub =
      request.headers.get("x-e2e-mode") === "true" ||
      process.env.E2E_EXTRACT_STUB === "true";
    if (isE2eStub) {
      // docType: prefere header explícito; senão parseia body (JSON.type ou FormData.type).
      // Cloned request pra não consumir o stream original — já vamos retornar mesmo, mas mantém
      // padrão limpo caso futuramente precisemos chain com outra lógica.
      let docType = request.headers.get("x-e2e-doc-type") || "";
      if (!docType) {
        try {
          if (contentType.includes("application/json")) {
            const body = await request.clone().json() as { type?: string };
            docType = body?.type ?? "";
          } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            const fd = await request.clone().formData();
            docType = String(fd.get("type") ?? "");
          }
        } catch { /* parse falhou — usa default */ }
      }
      docType = docType || "cnpj";
      console.log(`[extract][E2E_STUB] retornando fixture estática para tipo=${docType}`);
      const STUB_FIXTURES: Record<string, { data: Record<string, unknown>; filledFields: number }> = {
        cnpj: {
          data: {
            razaoSocial: "Empresa E2E Stub LTDA",
            nomeFantasia: "E2E Stub",
            cnpj: "12.345.678/0001-90",
            dataAbertura: "01/01/2020",
            situacaoCadastral: "ATIVA",
            cnaePrincipal: "62.01-5-01",
            capitalSocialCNPJ: "R$ 100.000,00",
            endereco: "Rua de Teste, 123, São Paulo, SP, 01000-000",
            porte: "ME",
          },
          filledFields: 9,
        },
        // Contrato sem dataConstituicao propositalmente — aciona auto-fill via cnpj.dataAbertura
        contrato: {
          data: {
            socios: [{ nome: "Sócio E2E", cpf: "111.222.333-44", participacao: "100%", qualificacao: "Administrador" }],
            capitalSocial: "R$ 100.000,00",
            objetoSocial: "Atividades de teste E2E.",
            dataConstituicao: "",
            temAlteracoes: false,
            prazoDuracao: "Indeterminado",
            administracao: "Administrador único",
            foro: "São Paulo",
          },
          filledFields: 7,
        },
        qsa: {
          data: {
            capitalSocial: "R$ 100.000,00",
            quadroSocietario: [
              { nome: "Sócio E2E", cpfCnpj: "111.222.333-44", qualificacao: "Administrador", participacao: "100%", dataEntrada: "01/01/2020" },
            ],
          },
          filledFields: 5,
        },
        faturamento: {
          data: {
            meses: [
              { mes: "01/2026", valor: "R$ 50.000,00" },
              { mes: "02/2026", valor: "R$ 55.000,00" },
              { mes: "03/2026", valor: "R$ 60.000,00" },
            ],
            total: "R$ 165.000,00",
            mediaMensal: "R$ 55.000,00",
          },
          filledFields: 5,
        },
      };
      const fixture = STUB_FIXTURES[docType] ?? STUB_FIXTURES.cnpj;
      return NextResponse.json({
        success: true,
        data: fixture.data,
        meta: { rawTextLength: 0, filledFields: fixture.filledFields, isScanned: false, aiPowered: false, warningsCount: 0, e2eStub: true, docType },
      });
    }

    // ── Caminho 2: arquivo via Vercel Blob URL (JSON body) ──────────────────
    // Usado para arquivos grandes que não cabem no corpo de uma função serverless.
    // O cliente faz upload direto para o Blob e nos envia só a URL.
    if (contentType.includes("application/json")) {
      let body: { blobUrl?: string; type?: string; slot?: string; fileName?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
      }
      const { blobUrl, type: docTypeJson, slot: slotJson, fileName, bypass_cache: bypassCacheJson } = body as { blobUrl?: string; type?: string; slot?: string; fileName?: string; bypass_cache?: boolean };
      if (!blobUrl || !docTypeJson) {
        return NextResponse.json({ error: "blobUrl e type são obrigatórios." }, { status: 400 });
      }
      if (GEMINI_API_KEYS.length === 0) {
        return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
      }
      // Fetch do blob (URL pública temporária do Vercel Blob) — protegido contra SSRF + OOM
      const blobFetchRes = await fetchBlobSafe(blobUrl);
      if ("error" in blobFetchRes) {
        return NextResponse.json({ error: blobFetchRes.error }, { status: blobFetchRes.status });
      }
      const blobBuffer = blobFetchRes.buffer;
      const blobFileName = fileName ?? blobUrl.split("/").pop() ?? "document.pdf";
      const blobExt = getFileExt(blobFileName);
      const blobMime = EXT_TO_MIME[blobExt];
      if (!blobMime) {
        return NextResponse.json({ error: `Formato .${blobExt} não suportado.` }, { status: 400 });
      }
      // Caminho Blob: variáveis já prontas, pula o bloco FormData
      if (GEMINI_API_KEYS.length === 0) {
        return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
      }
      return processExtract(request, blobBuffer, blobFileName, blobMime, docTypeJson, slotJson ?? null, bypassCacheJson === true);
    }

    // ── Caminho 1: arquivo via multipart/form-data (upload direto) ──────────
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Request deve ser multipart/form-data ou JSON com blobUrl.", success: false },
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
    const bypassCache = formData.get("bypass_cache") === "true";

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    const MAX_SIZE = 30 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 30MB. Comprima o PDF antes de enviar." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return processExtract(request, buffer, file.name, mimeType, docType, slot, bypassCache);
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// Lógica de extração compartilhada (FormData e Blob)
// ─────────────────────────────────────────
// Cache version — bump aqui ao atualizar prompts para invalidar extrações antigas.
// v3 = Layer 3 (subformatos especializados, SCR texto, IR/FAT/SCR novos prompts).
const CACHE_VERSION = "v4";
// TTL do cache: extrações mais antigas que N dias são ignoradas e refeitas.
const CACHE_TTL_DAYS = 30;

async function processExtract(
  request: NextRequest,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  docType: string,
  slot: string | null,
  bypassCache = false,
): Promise<Response> {
  const ext = getFileExt(fileName);
  try {
    // ──── Cache de extracao por hash (sha256 do arquivo) ────
    // Versão = CACHE_VERSION, TTL = CACHE_TTL_DAYS dias.
    // bypassCache=true pula a leitura (mas ainda escreve após extração bem-sucedida).
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const cacheDocType = `${docType}_${CACHE_VERSION}`;
    const cacheTTLDate = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
    let cachedUserId: string | null = null;
    try {
      const supaCache = createServerSupabase();
      const { data: userData } = await supaCache.auth.getUser();
      cachedUserId = userData.user?.id || null;
      if (cachedUserId && !bypassCache) {
        const { data: cached } = await supaCache
          .from("extraction_cache")
          .select("extracted_data, filled_fields")
          .eq("user_id", cachedUserId)
          .eq("file_hash", fileHash)
          .eq("doc_type", cacheDocType)
          .gte("created_at", cacheTTLDate)
          .maybeSingle();
        if (cached?.extracted_data) {
          console.log(`[extract][cache] HIT ${cacheDocType} hash=${fileHash.substring(0, 12)} (${cached.filled_fields ?? "?"} campos)`);
          return NextResponse.json({
            success: true,
            data: cached.extracted_data,
            meta: { rawTextLength: 0, filledFields: cached.filled_fields ?? 0, isScanned: false, aiPowered: false, cached: true },
          });
        }
      } else if (bypassCache) {
        console.log(`[extract][cache] BYPASS ${cacheDocType} hash=${fileHash.substring(0, 12)}`);
      }
    } catch (cacheErr) {
      console.warn(`[extract][cache] lookup falhou (seguindo sem cache):`, cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }

    // ──── Excel: processamento direto sem IA ────
    // Se o parser Excel retornar vazio OU lancar erro, cai pro Gemini como fallback
    // (evita que analista veja "faturamento vazio" sem aviso quando o XLSX foge do formato).
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${fileName}`);
        const faturamento = await extractExcel(buffer);
        const filled = countFilledFields(faturamento);
        const hasMeses = Array.isArray(faturamento.meses) && faturamento.meses.length > 0;
        if (!hasMeses || filled === 0) {
          console.warn(`[extract] Excel parser retornou vazio (meses=${faturamento.meses?.length ?? 0}, filled=${filled}) — caindo pro Gemini como fallback`);
          // Prossegue para fluxo Gemini (nao retorna aqui)
        } else {
          return NextResponse.json({
            success: true,
            data: faturamento,
            meta: { rawTextLength: 0, filledFields: filled, isScanned: false, aiPowered: false },
          });
        }
      } catch (err) {
        console.error("[extract] Excel processing failed:", err);
        // Se falhar, tentar via IA
      }
    }

    // ──── Layer 3: extrair texto para detecção de subformato ────
    // PDFs textuais têm extração rápida (pdf-parse). O texto extraído aqui é reutilizado
    // no modo texto para Gemini, evitando dupla extração.
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let rawPdfText = "";
    let pdfParseMs = 0;
    if (ext === "pdf") {
      const t0 = Date.now();
      rawPdfText = await extractText(buffer, "pdf");
      pdfParseMs = Date.now() - t0;
      console.log(`[extract] pdf-parse ${docType} ${(buffer.length / 1024).toFixed(0)}KB → ${rawPdfText.length} chars em ${pdfParseMs}ms`);
    }
    const subformat = detectSubformat(docType, rawPdfText);
    if (subformat !== "DEFAULT") {
      console.log(`[extract] subformat detected: ${subformat}`);
    }

    // ──── Selecionar prompt (Layer 3: especializado por subformato) ────
    let prompt: string;
    switch (docType) {
      case "cnpj":       prompt = PROMPT_CNPJ; break;
      case "qsa":        prompt = PROMPT_QSA; break;
      case "contrato":   prompt = PROMPT_CONTRATO; break;
      case "faturamento":
        if (subformat === "FAT_DAS")      prompt = PROMPT_FAT_DAS;
        else if (subformat === "FAT_BANCARIO") prompt = PROMPT_FAT_BANCARIO;
        else                               prompt = PROMPT_FATURAMENTO;
        break;
      case "scr": {
        if (subformat === "SCR_BACEN_SEM_DADOS") prompt = PROMPT_SCR_SEM_DADOS;
        else if (subformat === "SCR_BUREAU")     prompt = PROMPT_SCR_BUREAU;
        else {
          const tipoEsperado = slot === "scr_socio" ? "PF" : "PJ";
          prompt = PROMPT_SCR.replace("{{TIPO_ESPERADO}}", tipoEsperado);
        }
        break;
      }
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      case "curva_abc":      prompt = PROMPT_CURVA_ABC; break;
      case "dre":            prompt = PROMPT_DRE; break;
      case "balanco":        prompt = PROMPT_BALANCO; break;
      case "ir_socio":
        prompt = subformat === "IR_RECIBO" ? PROMPT_IR_RECIBO : PROMPT_IR_SOCIOS;
        break;
      case "relatorio_visita": prompt = PROMPT_RELATORIO_VISITA; break;
      case "divida_ativa":   prompt = PROMPT_DIVIDA_ATIVA; break;
      case "cenprot":        prompt = PROMPT_CENPROT; break;
      case "gefip":          prompt = PROMPT_GEFIP; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    // Estratégia: TEXTO PRIMEIRO sempre que pdf-parse extraiu conteúdo útil.
    // Modo texto é 3-5x mais rápido que visual e cabe folgado nos 52s.
    // Visual é reservado para tipos onde layout/assinaturas importam (contrato, relatório de visita)
    // ou quando pdf-parse não conseguiu extrair texto útil (PDF escaneado).
    const VISUAL_ONLY_TYPES = ["contrato", "relatorio_visita"];
    // PDF escaneado heurística: arquivo grande (>50KB) mas texto extraído muito escasso (<1500 chars)
    // indica que pdf-parse só leu metadados/cabeçalho — o conteúdo real está em imagem.
    const isLikelyScanned = buffer.length > 51200 && rawPdfText.trim().length < 1500;
    const hasUsefulText = !isLikelyScanned && rawPdfText.trim().length > 200 && /\d/.test(rawPdfText);
    // Fallback visual reservado apenas para faturamento com texto muito grande.
    // curva_abc removida: maxChars=60k suporta PDFs grandes em modo texto, e modo visual
    // falha silenciosamente (retorna clientes:[]) quando o PDF tem centenas de linhas.
    const LARGE_TEXT_FALLBACK_VISUAL = ["faturamento"];
    const isLargeText = rawPdfText.length > 25000;
    const shouldFallbackToVisual = LARGE_TEXT_FALLBACK_VISUAL.includes(docType) && isLargeText;

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else if (ext === "pdf") {
      if (VISUAL_ONLY_TYPES.includes(docType)) {
        // Tipos onde o visual importa (assinaturas em contrato, layout em relatório de visita)
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
        console.log(`[extract] ${docType} — modo visual (tipo requer leitura visual)`);
      } else if (shouldFallbackToVisual) {
        // Texto muito grande (>25k chars) — modo texto trava no prompt; cai pra visual
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
        console.log(`[extract] ${docType} — modo visual (fallback: texto grande, ${rawPdfText.length} chars)`);
      } else if (hasUsefulText) {
        // PDF digital com texto útil → modo texto rápido (cabe em ~5-8s)
        textContent = rawPdfText;
        console.log(`[extract] ${docType}/${subformat} — modo TEXTO (${rawPdfText.length} chars, ${pdfParseMs}ms)`);
      } else {
        // PDF escaneado/sem texto útil → cai pro Gemini visual
        if (isLikelyScanned) {
          console.log(`[extract] ${docType} — modo visual (PDF escaneado detectado: ${rawPdfText.trim().length} chars em ${Math.round(buffer.length/1024)}KB)`);
        } else {
          console.log(`[extract] ${docType} — modo visual (texto insuficiente: ${rawPdfText.trim().length} chars)`);
        }
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      }
    } else {
      // Formatos não-PDF (xlsx, docx, txt…): extrai texto normalmente
      textContent = await extractText(buffer, ext);
      if (!textContent.trim()) {
        if (docType !== "faturamento") {
          return NextResponse.json({
            error: "Não foi possível extrair texto do documento. Tente enviar em formato PDF.",
          }, { status: 422 });
        }
        console.warn(`[extract] faturamento: texto vazio para ext=${ext} — tentando Gemini sem conteúdo textual`);
      }
    }

    // Injeta hint do nome do arquivo no prompt para SCR — quando periodoReferencia
    // nao aparece no documento, Gemini pode usar o filename como pista de ultimo recurso.
    if (docType === "scr" && fileName) {
      prompt = `${prompt}\n\n═══ HINT DO NOME DO ARQUIVO ═══\nO arquivo foi enviado com o nome: "${fileName}"\nSe o documento nao declarar periodoReferencia claramente mas o nome do arquivo contem uma data (ex: "scr-11-2025.pdf", "bacen-2024-12.pdf"), use essa data como periodoReferencia (formato MM/AAAA). NUNCA retorne periodoReferencia vazio.`;
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 4000, qsa: 6000, faturamento: 20000, scr: 15000,
        protestos: 8000, processos: 12000, grupoEconomico: 8000,
        dre: 30000, balanco: 30000, ir_socio: 15000,
        curva_abc: 60000,
        // relatorio_visita / contrato → modo visual, não chegam aqui
      };
      const limit = maxChars[docType] || 10000;
      const originalLen = textContent.length;
      if (originalLen > limit) {
        // Onda 1 #1.5: antes silencioso. Texto cortado pode perder tabela
        // util que estava no fim do PDF (totais, rodape, paginas finais).
        console.warn(`[extract][${docType}] texto truncado: ${originalLen} → ${limit} chars (${Math.round((1 - limit/originalLen) * 100)}% descartado)`);
      }
      textContent = textContent.substring(0, limit);
    }

    // Curva ABC com texto grande (>15k chars): tenta parser direto antes de chamar Gemini.
    // Parser direto extrai clientes via regex em <10ms, evitando timeout do modelo (400+ clientes
    // geram 10k+ tokens de output, ultrapassam os 45s disponíveis no Hobby plan).
    //
    // IMPORTANTE: usar `rawPdfText` (texto completo) e não `textContent` (truncado em 60k para
    // o Gemini). PDFs com 1000+ clientes ultrapassam 60k chars; truncar antes do regex faria
    // o parser ver só os primeiros clientes e devolver lista parcial silenciosamente.
    let _directCurvaABC: ReturnType<typeof directParseCurvaABC> | undefined;
    if (docType === "curva_abc" && textContent.length > 15000) {
      const sourceText = rawPdfText && rawPdfText.length > textContent.length ? rawPdfText : textContent;
      const dp = directParseCurvaABC(sourceText);
      if (dp && dp.clientes.length >= 5) {
        _directCurvaABC = dp;
        console.log(`[extract][curva_abc] Direct parse: ${dp.clientes.length} clientes, periodo="${dp.periodoReferencia}", total=${dp.totalFaturado} (sourceLen=${sourceText.length})`);
      } else {
        console.log(`[extract][curva_abc] Direct parse insuficiente (${dp?.clientes.length ?? 0} clientes) — usando Gemini`);
      }
    }

    console.log(`[extract] ${fileName} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── SSE stream — mantém conexão viva enquanto Gemini processa ────
    const enc = new TextEncoder();
    const _send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) => {
      try { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); } catch { /* ignore if closed */ }
    };

    // Para documentos enviados como binário (vision), injeta instrução de leitura completa.
    // Sem isso, modelos multimodais podem processar só as primeiras páginas de PDFs longos.
    if (imageContent) {
      prompt = `INSTRUÇÃO CRÍTICA: Leia TODAS as páginas deste documento do início ao fim antes de extrair qualquer dado. Não pare nas primeiras páginas. Seções importantes como parâmetros, quadro societário, bens e direitos e conclusões geralmente estão nas últimas páginas.\n\n${prompt}`;
    }

    const _prompt = prompt;
    const _textContent = textContent;
    const _imageContent = imageContent;
    const _docType = docType;
    const _directCurvaABCBypass = _directCurvaABC;
    const _cacheDocType = cacheDocType;
    const _isImage = isImage;
    const _buffer = buffer;
    const maxOutputTokensMap: Record<string, number> = {
      cnpj: 4096, qsa: 4096, grupoEconomico: 4096, protestos: 4096,
      faturamento: 8192, scr: 8192, processos: 8192,
      dre: 8192, balanco: 8192,
      contrato: 8192, curva_abc: 32000, ir_socio: 8192, relatorio_visita: 8192,
    };
    const _maxOutputTokens = maxOutputTokensMap[docType] ?? 2048;

    // Thinking budget calibrado para Hobby plan (60s max total).
    // 2.5 Pro com 1024 tokens completa em ~15-35s; 512 em ~10-20s; 0 em ~5-15s.
    const thinkingBudgetMap: Record<string, number> = {
      relatorio_visita:  512,  // reduzido de 1024 — Files API + 3.1 Pro cascade pode exceder 52s
      contrato:          512,
      ir_socio:            0,  // tabelas/listas — thinking sem ganho; evita timeout no Hobby plan
      curva_abc:           0,  // tabela de clientes — sem raciocínio necessário
      faturamento:         0,  // extração de tabela simples — thinking adiciona latência sem ganho
      scr:               128,
      dre:               128,
      balanco:           128,
      processos:         128,
      protestos:           0,
      qsa:                 0,
      grupoEconomico:      0,
      cnpj:                0,
    };
    const _thinkingBudget = thinkingBudgetMap[docType] ?? 256;

    // Documentos que precisam de mais tempo por tentativa (texto longo + estrutura densa).
    // Override > 0 → callGemini usa 1 tentativa com esse timeout em vez de 2 × 15s.
    const perAttemptMsMap: Record<string, number> = {
      ir_socio: 30000,  // DIRPF pode ter 100+ linhas de bens/rendimentos — 30s por tentativa
      curva_abc: 45000, // Curva ABC pode ter 500+ clientes; texto 40k+ chars + saída 10k tokens — 45s
    };
    const _perAttemptMsOverride = perAttemptMsMap[docType] ?? 0;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        const startTimeMs = Date.now();
        const zodWarnings: Array<{field: string; message: string}> = [];
        try {
          let data: AnyExtracted;
          let _rawAiResponse = "";
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          if (_docType === "curva_abc" && _directCurvaABCBypass && _directCurvaABCBypass.clientes.length >= 5) {
            // Bypass: parser direto evitou timeout Gemini em arquivo com 400+ clientes
            data = fillCurvaABCDefaults(adaptCurvaABCNew({
              curva_abc_clientes: _directCurvaABCBypass.clientes,
              total_faturado: _directCurvaABCBypass.totalFaturado,
              periodo_referencia: _directCurvaABCBypass.periodoReferencia,
            }) as Partial<CurvaABCData>);
            console.log(`[extract][curva_abc] ${(data as CurvaABCData).clientes?.length ?? 0} clientes via parser direto — Gemini skipped`);
          } else {
          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent, _maxOutputTokens, _imageContent ? _buffer : undefined, _thinkingBudget, _perAttemptMsOverride);
            _rawAiResponse = aiResponse;
            console.log(`[extract] AI response length: ${aiResponse.length}`);
            console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
            const rawParsed = parseJSON<Record<string, unknown>>(aiResponse);

            // ──── Validacao Zod por doc type (leniente + warnings) ────
            // Coerciona tipos, aplica defaults e acumula avisos de formato/negocio.
            // Nao bloqueia a resposta — so documenta problemas.
            let parsed: Record<string, unknown> = rawParsed;
            try {
              if (_docType === "cnpj") {
                // Adapter: novo prompt do Cartão CNPJ retorna snake_case + estrutura aninhada.
                // Converte para camelCase flat esperado pelo CNPJDataSchema antes da validação.
                const adapted = adaptCNPJNew(rawParsed);
                const r = safeParseExtracted(CNPJDataSchema, adapted as Record<string, unknown>, "cnpj");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "qsa") {
                const adapted = adaptQSANew(rawParsed);
                const r = safeParseExtracted(QSADataSchema, adapted as Record<string, unknown>, "qsa");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "contrato") {
                const adapted = adaptContratoNew(rawParsed);
                const r = safeParseExtracted(ContratoSocialDataSchema, adapted as Record<string, unknown>, "contrato");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "faturamento") {
                const adapted = adaptFaturamentoNew(rawParsed);
                const r = safeParseExtracted(FaturamentoDataSchema, adapted as Record<string, unknown>, "faturamento");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "scr") {
                const adapted = adaptSCRNew(rawParsed);
                const r = safeParseExtracted(SCRDataSchema, adapted as Record<string, unknown>, "scr");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              }
              // Docs sem schema Zod: roda o adapter direto (hydrator cuida dos defaults)
              if (_docType === "curva_abc")        parsed = adaptCurvaABCNew(rawParsed) as Record<string, unknown>;
              else if (_docType === "dre")         parsed = adaptDRENew(rawParsed)      as Record<string, unknown>;
              else if (_docType === "balanco")     parsed = adaptBalancoNew(rawParsed)  as Record<string, unknown>;
              else if (_docType === "ir_socio")    parsed = adaptIRNew(rawParsed)       as Record<string, unknown>;
              else if (_docType === "relatorio_visita") {
                const adaptedVisita = adaptVisitaNew(rawParsed) as Record<string, unknown>;
                const rv = safeParseExtracted(RelatorioVisitaSchema, adaptedVisita, "relatorio_visita");
                parsed = rv.data as unknown as Record<string, unknown>;
                zodWarnings.push(...rv.warnings);
              }
              // Audit de regras de negocio (range, coerencia, formato)
              const businessWarnings = auditBusinessRules(_docType, parsed);
              zodWarnings.push(...businessWarnings);
              if (zodWarnings.length > 0) {
                console.warn(`[extract][${_docType}] ${zodWarnings.length} warning(s) de validacao`);
              }
            } catch (zodErr) {
              console.warn(`[extract][${_docType}] zod falhou, seguindo com rawParsed:`, zodErr instanceof Error ? zodErr.message : zodErr);
              parsed = rawParsed;
            }

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
              case "divida_ativa":     data = fillDividaAtivaDefaults(parsed as Partial<DividaAtivaData>); break;
              case "cenprot":          data = fillCenprotDefaults(parsed as Partial<CenprotData>); break;
              case "gefip":            data = fillGefipDefaults(parsed as Partial<GefipData>); break;
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

            // Onda 2 #2.2: antes este catch montava `data = fillXxxDefaults({})`
            // (objeto preenchido com strings vazias) e mandava no payload de erro.
            // Risco: qualquer consumer futuro que esquecesse de checar `success:false`
            // ia mesclar esse objeto em cima de dados reais, zerando campos. Trocado
            // por `data: null` — caller é obrigado a checar antes de usar.
            let errorType: "quota" | "parse" | "empty" | "unknown" = "unknown";
            if (errMsg.includes("429") || errMsg.includes("EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("rate")) {
              errorType = "quota";
            } else if (errMsg.includes("TIMEOUT") || errMsg.includes("timed out") || errMsg.includes("AbortError")) {
              errorType = "quota"; // timeout → "API indisponível" é mais útil que "formato inválido"
            } else if (errMsg.includes("JSON") || errMsg.includes("parse") || errMsg.includes("SyntaxError")) {
              errorType = "parse";
            } else if (errMsg.includes("empty") || errMsg.includes("length: 0") || errMsg.includes("Empty")) {
              errorType = "empty";
            }

            // success: false quando IA falhou — o frontend trata como erro visivel
            // em vez de fingir sucesso com dados vazios
            _send(controller, "result", {
              success: false, data: null,
              error: errMsg.substring(0, 200),
              meta: { rawTextLength: _textContent.length, filledFields: 0, isScanned: _isImage, aiError: true, errorType, errorMessage: errMsg.substring(0, 200) },
            });
            return;
          }
          } // end else (AI path — skipped when curva_abc bypass active)

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

          // Injeta warnings de validação dentro do próprio data com prefixo
          // "_warnings" (meta-field, strippado na hidratação). Permite que o
          // histórico/UI exibam badges por documento sem mexer no fluxo de estado.
          const dataWithMeta = zodWarnings.length > 0
            ? { ...(data as unknown as Record<string, unknown>), _warnings: zodWarnings }
            : data;

          _send(controller, "result", {
            success: true, data: dataWithMeta,
            ...(scrAnteriorExtra ? { scrAnterior: scrAnteriorExtra, variacoes: variacoesExtra } : {}),
            ...(qsaDetectadoExtra ? { qsaDetectado: qsaDetectadoExtra } : {}),
            meta: { rawTextLength: _textContent.length, filledFields: filled, isScanned: _isImage, aiPowered: true, warningsCount: zodWarnings.length },
          });

          // Grava no cache de extracao — fire-and-forget, nunca bloqueia a resposta.
          // So cacheia quando a extracao veio util (filled > 0).
          if (cachedUserId && filled > 0) {
            (async () => {
              try {
                const supaCacheWrite = createServerSupabase();
                await supaCacheWrite.from("extraction_cache").upsert({
                  user_id: cachedUserId,
                  file_hash: fileHash,
                  doc_type: cacheDocType,
                  extracted_data: data as unknown as Record<string, unknown>,
                  filled_fields: filled,
                }, { onConflict: "user_id,file_hash,doc_type" });
                console.log(`[extract][cache] gravado ${_cacheDocType} hash=${fileHash.substring(0, 12)} filled=${filled}`);
              } catch (e) {
                console.warn(`[extract][cache] falha ao gravar (ignorado):`, e instanceof Error ? e.message : e);
              }
            })();
          }

          // Metricas de extracao — fire-and-forget. Captura cada extracao para
          // futuro diagnostico de quais campos falham mais por doc type.
          if (cachedUserId) {
            const duracaoMs = Date.now() - startTimeMs;
            (async () => {
              try {
                const supaMetrics = createServerSupabase();
                await supaMetrics.from("extraction_metrics").insert({
                  user_id: cachedUserId,
                  doc_type: _docType,
                  filled_fields: filled,
                  input_mode: inputMode,
                  text_length: _textContent.length,
                  duration_ms: duracaoMs,
                  ai_powered: true,
                  cached: false,
                  zod_warnings: zodWarnings.length > 0 ? zodWarnings : null,
                  input_chars: _textContent.length || null,
                  raw_response: (filled === 0 || _docType === "relatorio_visita") ? _rawAiResponse.slice(0, 5000) || null : null,
                });
              } catch { /* nunca falha a requisicao */ }
            })();
          }
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
