"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Pencil, Check, RotateCcw } from "lucide-react";
import Image from "next/image";
import { buildHTMLReport } from "@/lib/generators/html";
import { buildDOCXReport } from "@/lib/generators/docx";
import { buildExcelReport } from "@/lib/generators/excel";
import { buildPDFReport } from "@/lib/generators/pdf";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import GoalfyButton from "@/components/GoalfyButton";
import AlertList from "@/components/AlertList";
import { ExtractedData, CollectionDocument, DocumentCollection, FundSettings, DEFAULT_FUND_SETTINGS, AIAnalysis, FundCriterion, FundValidationResult, CriterionStatus, FundPreset, CreditLimitResult } from "@/types";
import type { OriginalFiles } from "@/components/UploadStep";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface GenerateStepProps {
  data: ExtractedData;
  originalFiles?: OriginalFiles;
  onBack: () => void;
  onReset?: () => void;
  onNotify?: (msg: string) => void;
  onFirstCollection?: () => void;
}

// Module-level refs for upload context (set by component)
let _uploadCtx: { userId: string; collectionId: string } | null = null;

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  // Also save to Supabase Storage if we have a collection context
  if (_uploadCtx) {
    uploadFile(_uploadCtx.userId, _uploadCtx.collectionId, "reports", fileName, blob).catch(() => {});
  }
}

// ── Alert & Analysis types ──
type AlertSeverity = "ALTA" | "MODERADA" | "INFO";
interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

// ── Data Validation ──
interface ValidationIssue {
  field: string;
  document: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  isValid: boolean;
  canProceed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  coverage: {
    total: number;
    filled: number;
    pct: number;
  };
}

// ── Fund Parameter Validation ──────────────────────────────────────────────

function parseMoney(v: string): number {
  return parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtMoney(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getAgeYears(dataAbertura: string): number | null {
  if (!dataAbertura) return null;
  const parts = dataAbertura.split("/");
  let year: number;
  if (parts.length === 3) {
    year = parseInt(parts[2], 10);
  } else {
    const dash = dataAbertura.split("-");
    year = parseInt(dash[0], 10);
  }
  if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) return null;
  return new Date().getFullYear() - year;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validarContraParametros(data: ExtractedData, settings: FundSettings): FundValidationResult {
  const criteria: FundCriterion[] = [];

  // ── 1. Situação Cadastral ─────────────────────────────────────────────────
  const situacao = data.cnpj.situacaoCadastral?.toUpperCase().trim() || "";
  const situacaoOk = situacao.includes("ATIVA");
  criteria.push({
    id: "situacao",
    label: "Situação Cadastral",
    threshold: "ATIVA",
    actual: situacao || "Não informada",
    status: !situacao ? "unknown" : situacaoOk ? "ok" : "error",
    eliminatoria: true,
    detail: !situacaoOk && situacao ? `Situação: ${situacao}` : undefined,
  });

  // ── 2. FMM Mínimo ──────────────────────────────────────────────────────────
  const fmmStr = data.faturamento.fmm12m || data.faturamento.mediaAno || "";
  const fmmVal = parseMoney(fmmStr);
  const fmmOk = fmmVal >= settings.fmm_minimo;
  criteria.push({
    id: "fmm",
    label: "Faturamento Médio Mensal (FMM)",
    threshold: `≥ ${fmtMoney(settings.fmm_minimo)}/mês`,
    actual: fmmVal > 0 ? `${fmtMoney(fmmVal)}/mês` : "Não informado",
    status: fmmVal === 0 ? "unknown" : fmmOk ? "ok" : "error",
    eliminatoria: true,
    detail: !fmmOk && fmmVal > 0 ? `Déficit: ${fmtMoney(settings.fmm_minimo - fmmVal)}` : undefined,
  });

  // ── 3. Idade Mínima ────────────────────────────────────────────────────────
  const ageYears = getAgeYears(data.cnpj.dataAbertura);
  const idadeOk = ageYears !== null && ageYears >= settings.idade_minima_anos;
  criteria.push({
    id: "idade",
    label: "Idade da Empresa",
    threshold: `≥ ${settings.idade_minima_anos} ano${settings.idade_minima_anos !== 1 ? "s" : ""}`,
    actual: ageYears !== null ? `${ageYears} ano${ageYears !== 1 ? "s" : ""}` : "Não informada",
    status: ageYears === null ? "unknown" : idadeOk ? "ok" : "error",
    eliminatoria: true,
    detail: ageYears !== null && !idadeOk ? `Faltam ${settings.idade_minima_anos - ageYears} ano(s)` : undefined,
  });

  // ── 4. Alavancagem ────────────────────────────────────────────────────────
  const dividaTotal = parseMoney(data.scr.totalDividasAtivas);
  const alavancagem = fmmVal > 0 && dividaTotal > 0 ? dividaTotal / fmmVal : 0;
  const alavStr = fmmVal > 0 && dividaTotal > 0 ? `${alavancagem.toFixed(1)}x FMM` : dividaTotal === 0 ? "Sem dívida" : "Sem FMM";
  const alavStatus: CriterionStatus =
    fmmVal === 0 ? "unknown" :
    dividaTotal === 0 ? "ok" :
    alavancagem <= settings.alavancagem_saudavel ? "ok" :
    alavancagem <= settings.alavancagem_maxima ? "warning" : "error";
  criteria.push({
    id: "alavancagem",
    label: "Alavancagem (Dívida / FMM)",
    threshold: `Saudável ≤ ${settings.alavancagem_saudavel}x · Máx ≤ ${settings.alavancagem_maxima}x`,
    actual: alavStr,
    status: alavStatus,
    eliminatoria: alavStatus === "error",
    detail: alavStatus === "warning" ? "Acima do saudável, dentro do limite máximo" : undefined,
  });

  // ── 5. SCR Vencidos % ─────────────────────────────────────────────────────
  const vencidosVal = parseMoney(data.scr.vencidos);
  const carteira = parseMoney(data.scr.carteiraAVencer) || dividaTotal;
  const vencidosPct = carteira > 0 && vencidosVal > 0 ? (vencidosVal / carteira) * 100 : 0;
  const vencidosStr = carteira > 0
    ? (vencidosVal === 0 ? "0%" : `${vencidosPct.toFixed(1)}% (${fmtMoney(vencidosVal)})`)
    : dividaTotal === 0 ? "Sem dívida" : "Sem carteira";
  const vencidosStatus: CriterionStatus =
    carteira === 0 && dividaTotal === 0 ? "ok" :
    carteira === 0 ? "unknown" :
    vencidosPct <= settings.scr_vencidos_max_pct ? "ok" : "error";
  criteria.push({
    id: "scr_vencidos",
    label: "SCR — Vencidos",
    threshold: `≤ ${settings.scr_vencidos_max_pct}% da carteira`,
    actual: vencidosStr,
    status: vencidosStatus,
    eliminatoria: true,
  });

  // ── 6. Prejuízos SCR ──────────────────────────────────────────────────────
  const prejVal = parseMoney(data.scr.prejuizos);
  criteria.push({
    id: "prejuizos",
    label: "SCR — Prejuízos",
    threshold: "Ausentes (R$ 0)",
    actual: prejVal > 0 ? fmtMoney(prejVal) : "R$ 0",
    status: prejVal > 0 ? "error" : "ok",
    eliminatoria: false,
  });

  // ── 7. Protestos ─────────────────────────────────────────────────────────
  const protestosN = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  const protestosOk = protestosN <= settings.protestos_max;
  criteria.push({
    id: "protestos",
    label: "Protestos Vigentes",
    threshold: `≤ ${settings.protestos_max}`,
    actual: String(protestosN),
    status: protestosOk ? "ok" : "error",
    eliminatoria: true,
    detail: !protestosOk ? `Excede o limite em ${protestosN - settings.protestos_max} protesto(s)` : undefined,
  });

  // ── 8. Processos Passivos ─────────────────────────────────────────────────
  const passivosN = parseInt(data.processos?.passivosTotal || data.processos?.poloPassivoQtd || "0", 10) || 0;
  const passivosOk = passivosN <= settings.processos_passivos_max;
  const passivosStatus: CriterionStatus = passivosN === 0 ? "ok" : passivosOk ? "warning" : "error";
  criteria.push({
    id: "processos",
    label: "Processos Passivos",
    threshold: `≤ ${settings.processos_passivos_max}`,
    actual: String(passivosN),
    status: passivosStatus,
    eliminatoria: false,
    detail: passivosN > 0 && passivosOk ? "Dentro do limite — monitorar" : !passivosOk ? `Excede em ${passivosN - settings.processos_passivos_max}` : undefined,
  });

  // ── 9. Recuperação Judicial ───────────────────────────────────────────────
  const temRJ = data.processos?.temRJ === true;
  criteria.push({
    id: "rj",
    label: "Recuperação Judicial",
    threshold: "Não detectada",
    actual: temRJ ? "ATIVA" : "Não detectada",
    status: temRJ ? "error" : "ok",
    eliminatoria: true,
  });

  const passCount   = criteria.filter(c => c.status === "ok").length;
  const warnCount   = criteria.filter(c => c.status === "warning").length;
  const failCount   = criteria.filter(c => c.status === "error").length;
  const unknownCount = criteria.filter(c => c.status === "unknown").length;
  const hasEliminatoria = criteria.some(c => c.eliminatoria && c.status === "error");

  return { criteria, passCount, warnCount, failCount, unknownCount, hasEliminatoria };
}

// Recomputa faturamentoZerado dos meses reais (nunca confia no flag armazenado)
function calcFaturamentoZerado(fat: ExtractedData["faturamento"]): boolean {
  if (!fat.meses || fat.meses.length === 0) return false; // sem meses = falta de doc, não zero
  const parseFat = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  return fat.meses.every(m => parseFat(m.valor) === 0);
}

function validateExtractedData(data: ExtractedData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // ── CNPJ ──
  if (!data.cnpj.razaoSocial) {
    errors.push({ field: "razaoSocial", document: "cnpj", message: "Razão Social não extraída", severity: "error" });
  }
  if (!data.cnpj.cnpj) {
    errors.push({ field: "cnpj", document: "cnpj", message: "CNPJ não extraído", severity: "error" });
  }
  if (!data.cnpj.dataAbertura) {
    warnings.push({ field: "dataAbertura", document: "cnpj", message: "Data de abertura não encontrada", severity: "warning" });
  }
  if (!data.cnpj.cnaePrincipal) {
    warnings.push({ field: "cnaePrincipal", document: "cnpj", message: "CNAE principal não encontrado", severity: "warning" });
  }

  // ── QSA ──
  const sociosQSA = data.qsa.quadroSocietario.filter(s => s.nome);
  if (sociosQSA.length === 0) {
    errors.push({ field: "quadroSocietario", document: "qsa", message: "Nenhum sócio encontrado no QSA", severity: "error" });
  } else {
    const semDoc = sociosQSA.filter(s => !s.cpfCnpj);
    if (semDoc.length > 0) {
      warnings.push({ field: "cpfCnpj", document: "qsa", message: `${semDoc.length} sócio(s) sem CPF/CNPJ`, severity: "warning" });
    }
  }

  // ── Contrato Social ──
  if (!data.contrato.dataConstituicao) {
    warnings.push({ field: "dataConstituicao", document: "contrato", message: "Data de constituição não encontrada", severity: "warning" });
  }
  const sociosContrato = data.contrato.socios.filter(s => s.nome);
  if (sociosContrato.length === 0) {
    warnings.push({ field: "socios", document: "contrato", message: "Nenhum sócio encontrado no contrato", severity: "warning" });
  }
  if (!data.contrato.administracao) {
    warnings.push({ field: "administracao", document: "contrato", message: "Administração não identificada", severity: "warning" });
  }

  // ── Faturamento ──
  if (data.faturamento.meses.length === 0) {
    errors.push({ field: "meses", document: "faturamento", message: "Nenhum mês de faturamento extraído", severity: "error" });
  }
  const mediaNum = parseFloat(data.faturamento.mediaAno.replace(/\./g, "").replace(",", ".")) || 0;
  if (data.faturamento.meses.length > 0 && mediaNum === 0) {
    errors.push({ field: "mediaAno", document: "faturamento", message: "Faturamento médio é zero", severity: "error" });
  }
  if (data.faturamento.meses.length > 0 && data.faturamento.meses.length < 6) {
    warnings.push({ field: "meses", document: "faturamento", message: `Apenas ${data.faturamento.meses.length} meses — ideal ter 6+`, severity: "warning" });
  }
  if (calcFaturamentoZerado(data.faturamento)) {
    warnings.push({ field: "faturamentoZerado", document: "faturamento", message: "Faturamento zerado no período", severity: "warning" });
  }

  // ── SCR ──
  const scrVazio = !data.scr.totalDividasAtivas && !data.scr.carteiraAVencer && !data.scr.periodoReferencia;
  if (scrVazio) {
    warnings.push({ field: "periodoReferencia", document: "scr", message: "SCR sem dados extraídos — verifique o documento", severity: "warning" });
  }

  // ── Protestos ──
  const protestosQtd = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  if (protestosQtd > 0) {
    warnings.push({ field: "vigentesQtd", document: "protestos", message: `${protestosQtd} protesto(s) vigente(s) encontrado(s)`, severity: "warning" });
  }

  // ── Processos ──
  if (data.processos?.temRJ) {
    errors.push({ field: "temRJ", document: "processos", message: "Recuperação Judicial detectada", severity: "error" });
  }

  // ── Coverage ──
  let total = 0;
  let filled = 0;
  function countFields(obj: unknown) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const v of Object.values(obj as Record<string, unknown>)) {
        countFields(v);
      }
    } else if (typeof obj === "string") {
      total++;
      if (obj !== "") filled++;
    }
  }
  countFields(data.cnpj);
  countFields(data.qsa);
  countFields(data.contrato);
  countFields(data.faturamento);
  countFields(data.scr);

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return {
    isValid: errors.length === 0,
    canProceed: errors.length === 0 && pct >= 40,
    errors,
    warnings,
    coverage: { total, filled, pct },
  };
}

export default function GenerateStep({ data: initialData, originalFiles, onBack, onReset, onNotify, onFirstCollection }: GenerateStepProps) {
  const [data, setData] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(initialData)));
  const [editing, setEditing] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<Format | null>(null);
  const [generatedFormats, setGeneratedFormats] = useState<Set<Format>>(new Set());

  const setCNPJ = (k: keyof typeof data.cnpj, v: string) => setData(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof data.contrato, v: string | boolean) => setData(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof data.scr, v: string) => setData(p => ({ ...p, scr: { ...p.scr, [k]: v } }));
  const setResumoRisco = (v: string) => setData(p => ({ ...p, resumoRisco: v }));

  // ── Data Validation (mantido para uso interno, card removido da UI) ──
  void validateExtractedData(data);

  // ── Collection ID (needed by cache logic below) ──
  const [collectionId, setCollectionId] = useState<string | null>(null);

  // ── Observações do analista ──
  const NOTES_KEY = "cf_analyst_notes_draft";
  const [analystNotes, setAnalystNotes] = useState<string>(() => {
    try { return localStorage.getItem(NOTES_KEY) || ""; } catch { return ""; }
  });
  const [savingNotes, setSavingNotes] = useState(false);

  // Persiste no localStorage a cada mudança
  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, analystNotes); } catch { /* ignore */ }
  }, [analystNotes]);

  // ── Fund Settings + Presets ──
  const [fundSettings, setFundSettings] = useState<FundSettings>(DEFAULT_FUND_SETTINGS);
  const [fundPresets, setFundPresets] = useState<FundPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | "active" | null>("active");
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: s }, { data: presets }] = await Promise.all([
          supabase.from("fund_settings").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("fund_presets").select("*").eq("user_id", user.id).order("created_at"),
        ]);
        if (s) setFundSettings({ ...DEFAULT_FUND_SETTINGS, ...s });
        if (presets) setFundPresets(presets);
      } catch { /* use defaults */ }
    };
    loadSettings();
  }, []);

  // Derives the settings to validate against (active or selected preset)
  const activeValidationSettings: FundSettings = (() => {
    if (selectedPresetId === "active" || selectedPresetId === null) return fundSettings;
    const preset = fundPresets.find(p => p.id === selectedPresetId);
    return preset ? { ...DEFAULT_FUND_SETTINGS, ...preset } : fundSettings;
  })();
  const selectedPresetName = selectedPresetId === "active" || selectedPresetId === null
    ? "Configurações Ativas"
    : fundPresets.find(p => p.id === selectedPresetId)?.name ?? "Configurações Ativas";
  const selectedPresetColor = selectedPresetId === "active" || selectedPresetId === null
    ? "#203b88"
    : fundPresets.find(p => p.id === selectedPresetId)?.color ?? "#203b88";

  // ── AI Analysis with cache ──
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [analysisFromCache, setAnalysisFromCache] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  const analysisFetched = useRef(false);

  const normalizeParecer = (parecer: unknown): Record<string, unknown> => {
    if (typeof parecer === "string") {
      return { resumoExecutivo: parecer };
    }
    if (typeof parecer === "object" && parecer !== null) {
      return parecer as Record<string, unknown>;
    }
    return { resumoExecutivo: "" };
  };

  const applyAnalysis = (analysis: AIAnalysis) => {
    const normalizedParecer = normalizeParecer(analysis.parecer);
    const normalizedAnalysis = { ...analysis, parecer: normalizedParecer };
    setAiAnalysis(normalizedAnalysis as AIAnalysis);
    const resumo = String(normalizedParecer.textoCompleto || normalizedParecer.resumoExecutivo || "");
    if (resumo) setResumoRisco(resumo);
  };

  const loadCachedAnalysis = async (colId: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { data: row, error } = await supabase
        .from("document_collections")
        .select("ai_analysis")
        .eq("id", colId)
        .single();
      if (error || !row?.ai_analysis) return false;
      const cached = row.ai_analysis as Record<string, unknown>;
      if (!cached.decisao && !cached.rating) return false;
      const parecerNorm = normalizeParecer(cached.parecer);
      const cacheValido =
        cached.parametrosOperacionais &&
        (cached.alertas as Array<Record<string, unknown>> | undefined)?.[0]?.mitigacao !== undefined &&
        parecerNorm.resumoExecutivo;
      if (!cacheValido) {
        return false;
      }
      applyAnalysis({ ...cached, parecer: parecerNorm } as unknown as AIAnalysis);
      setAnalysisFromCache(true);
      return true;
    } catch {
      return false;
    }
  };

  const saveAnalysisCache = async (colId: string, analysis: AIAnalysis) => {
    try {
      const supabase = createClient();
      await supabase
        .from("document_collections")
        .update({ ai_analysis: analysis as unknown as Record<string, unknown> })
        .eq("id", colId);
    } catch (err) {
      console.warn("[generate] Failed to cache analysis:", err);
    }
  };

  const handleReanalyze = async () => {
    analysisFetched.current = false;
    setAiAnalysis(null);
    setAnalysisFromCache(false);
    setAnalysisError(null);
    setAnalysisStatus("");
    if (collectionId) {
      try {
        const supabase = createClient();
        await supabase.from("document_collections").update({ ai_analysis: null }).eq("id", collectionId);
      } catch { /* ignore */ }
    }
    runAnalysisRef.current?.();
  };

  const runAnalysisRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (analysisFetched.current) return;
    analysisFetched.current = true;

    const runAnalysis = async () => {
      // 1. Try cache first
      if (collectionId) {
        const hasCached = await loadCachedAnalysis(collectionId);
        if (hasCached) return;
      }

      // 2. Call AI analysis API (bureaus já foram consultados no UploadStep)
      setAnalyzingAI(true);
      setAnalysisError(null);
      setAnalysisStatus("Iniciando análise...");
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, settings: fundSettings }),
        });
        if (!res.ok) {
          throw new Error(res.status === 504 ? "Timeout (504) — tente novamente." : `Erro HTTP ${res.status}`);
        }

        // ── Lê SSE stream ou JSON ──
        let analysisJson: { success: boolean; analysis?: AIAnalysis; error?: string } | null = null;
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              if (!part.trim()) continue;
              const lines = part.trim().split("\n");
              let ev = "message"; let rawData = "";
              for (const line of lines) {
                if (line.startsWith("event: ")) ev = line.slice(7).trim();
                if (line.startsWith("data: ")) rawData = line.slice(6).trim();
              }
              if (!rawData) continue;
              try {
                const payload = JSON.parse(rawData);
                if (ev === "status") setAnalysisStatus(payload.message || "");
                if (ev === "result") { analysisJson = payload; break outer; }
                if (ev === "error") throw new Error(payload.error || "Erro na análise");
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        } else {
          analysisJson = await res.json().catch(() => ({ success: false, error: `Erro HTTP ${res.status}` }));
        }

        if (analysisJson?.success && analysisJson?.analysis) {
          // 3. Garantir coleta no Supabase antes de salvar o cache
          let idParaSalvar = collectionId;

          if (!idParaSalvar) {
            try {
              const supabase = createClient();

              // Fix 1 — desestruturação correta do getUser
              const { data: userData, error: userError } = await supabase.auth.getUser();

              if (userError) {
                console.warn("[generate] getUser error:", userError.message);
              }

              if (userData?.user?.id) {
                const documents = buildDocuments();
                const { data: row, error: insertError } = await supabase
                  .from("document_collections")
                  .insert({
                    user_id: userData.user.id,
                    status: "in_progress",
                    documents,
                    company_name: data.cnpj?.razaoSocial || null,
                    cnpj: data.cnpj?.cnpj || null,
                  })
                  .select("id")
                  .single();

                // Fix 2 — loga erro do insert em vez de engolir silenciosamente
                if (insertError) {
                  console.error("[generate] Failed to insert collection:", insertError.message, insertError.details, insertError.hint);
                } else if (row?.id) {
                  setCollectionId(row.id);
                  _uploadCtx = { userId: userData.user.id, collectionId: row.id };
                  idParaSalvar = row.id;
                }
              } else {
                console.warn("[generate] No authenticated user found — cache will not be saved");
              }
            } catch (err) {
              console.warn("[generate] Failed to auto-create collection:", err);
            }
          }

          console.log("[generate] parecer raw:", JSON.stringify(analysisJson.analysis!.parecer));
          applyAnalysis(analysisJson.analysis!);

          if (idParaSalvar) {
            await saveAnalysisCache(idParaSalvar, { ...analysisJson.analysis!, parecer: normalizeParecer(analysisJson.analysis!.parecer) } as AIAnalysis);
          } else {
            console.warn("[generate] idParaSalvar is null — ai_analysis not saved to Supabase");
          }

          // Auto-send to Goalfy (fire-and-forget)
          try {
            fetch("/api/goalfy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data, aiAnalysis: analysisJson.analysis, settings: fundSettings }),
            }).then(r => r.json()).then(gj => {
              if (gj.mock) {
                console.log("[generate] Goalfy: webhook não configurado (mock)");
              } else if (gj.success) {
                console.log("[generate] Goalfy: dados enviados com sucesso");
              } else {
                console.warn("[generate] Goalfy: falha no envio:", gj.error);
              }
            }).catch(e => console.warn("[generate] Goalfy fetch error:", e));
          } catch {
            // non-blocking
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate] AI analysis failed:", msg);
        setAnalysisError(msg);
      } finally {
        setAnalyzingAI(false);
        setAnalysisStatus("");
      }
    };

    runAnalysisRef.current = runAnalysis;
    runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── Supabase: Salvar / Finalizar coleta ──
  const [, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Helper: campos desnormalizados para a tabela
  const getCollectionMeta = () => {
    const mediaStr = data.faturamento.mediaAno || "0";
    const fmm = parseFloat(mediaStr.replace(/\./g, "").replace(",", ".")) || null;
    return {
      company_name: data.cnpj.razaoSocial || null,
      cnpj: data.cnpj.cnpj || null,
      rating: aiAnalysis?.rating ?? null,
      decisao: aiAnalysis?.decisao as DocumentCollection["decisao"] ?? null,
      fmm_12m: fmm,
    };
  };

  const buildDocuments = (): CollectionDocument[] => {
    const docs: CollectionDocument[] = [];
    const asRec = (o: object) => o as unknown as Record<string, unknown>;
    if (data.cnpj.cnpj || data.cnpj.razaoSocial) docs.push({ type: "cnpj", filename: "cartao-cnpj.pdf", extracted_data: asRec(data.cnpj), uploaded_at: new Date().toISOString() });
    if (data.qsa.quadroSocietario.some(s => s.nome)) docs.push({ type: "qsa", filename: "qsa.pdf", extracted_data: asRec(data.qsa), uploaded_at: new Date().toISOString() });
    if (data.contrato.capitalSocial || data.contrato.socios.some(s => s.nome)) docs.push({ type: "contrato_social", filename: "contrato-social.pdf", extracted_data: asRec(data.contrato), uploaded_at: new Date().toISOString() });
    if (data.faturamento.meses.length > 0 || data.faturamento.somatoriaAno) docs.push({ type: "faturamento", filename: "faturamento.pdf", extracted_data: asRec(data.faturamento), uploaded_at: new Date().toISOString() });
    if (data.scr.totalDividasAtivas || data.scr.operacoesEmAtraso) docs.push({ type: "scr_bacen", filename: "scr-bacen.pdf", extracted_data: asRec(data.scr), uploaded_at: new Date().toISOString() });
    if (data.scrAnterior) docs.push({ type: "scr_bacen", filename: "scr-anterior.pdf", extracted_data: asRec(data.scrAnterior), uploaded_at: new Date().toISOString() });
    if (data.protestos && (parseInt(data.protestos.vigentesQtd) > 0 || parseInt(data.protestos.regularizadosQtd) > 0 || data.protestos.detalhes.length > 0)) docs.push({ type: "protestos", filename: "protestos.pdf", extracted_data: asRec(data.protestos), uploaded_at: new Date().toISOString() });
    if (data.processos && (data.processos.passivosTotal || data.processos.ativosTotal || data.processos.distribuicao.length > 0)) docs.push({ type: "processos", filename: "processos.pdf", extracted_data: asRec(data.processos), uploaded_at: new Date().toISOString() });
    if (data.grupoEconomico && data.grupoEconomico.empresas.length > 0) docs.push({ type: "grupo_economico", filename: "grupo-economico.pdf", extracted_data: asRec(data.grupoEconomico), uploaded_at: new Date().toISOString() });
    if (data.dre && (data.dre.anos?.length > 0 || data.dre.crescimentoReceita || data.dre.observacoes)) docs.push({ type: "dre" as CollectionDocument["type"], filename: "dre.pdf", extracted_data: asRec(data.dre), uploaded_at: new Date().toISOString() });
    if (data.balanco && (data.balanco.anos?.length > 0 || data.balanco.observacoes || data.balanco.tendenciaPatrimonio)) docs.push({ type: "balanco" as CollectionDocument["type"], filename: "balanco.pdf", extracted_data: asRec(data.balanco), uploaded_at: new Date().toISOString() });
    if (data.curvaABC && (data.curvaABC.clientes?.length > 0 || data.curvaABC.maiorCliente || data.curvaABC.periodoReferencia)) docs.push({ type: "curva_abc" as CollectionDocument["type"], filename: "curva-abc.pdf", extracted_data: asRec(data.curvaABC), uploaded_at: new Date().toISOString() });
    if (data.irSocios && data.irSocios.length > 0) data.irSocios.forEach((ir, i) => docs.push({ type: "ir_socio" as CollectionDocument["type"], filename: `ir-socio-${i + 1}.pdf`, extracted_data: asRec(ir), uploaded_at: new Date().toISOString() }));
    if (data.relatorioVisita && (data.relatorioVisita.dataVisita || data.relatorioVisita.responsavelVisita || data.relatorioVisita.descricaoEstrutura || data.relatorioVisita.observacoesLivres)) docs.push({ type: "relatorio_visita" as CollectionDocument["type"], filename: "relatorio-visita.pdf", extracted_data: asRec(data.relatorioVisita), uploaded_at: new Date().toISOString() });
    return docs;
  };

  const handleSave = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const supabase = createClient();
      const documents = buildDocuments();

      if (collectionId) {
        // Ensure upload context is set for report saves
        if (!_uploadCtx) {
          const { data: session } = await supabase.auth.getUser();
          _uploadCtx = { userId: session.user?.id ?? "anonymous", collectionId };
        }
        const { error } = await supabase.from("document_collections").update({ documents, label: data.cnpj.razaoSocial || null, ...getCollectionMeta() }).eq("id", collectionId);
        if (error) throw error;
        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return collectionId;
      } else {
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) {
          toast.error("Você precisa estar logado para salvar coletas.");
          return null;
        }
        const userId = session.user.id;
        const { data: row, error } = await supabase.from("document_collections").insert({
          user_id: userId,
          status: "in_progress",
          label: data.cnpj.razaoSocial || null,
          documents,
          ...getCollectionMeta(),
        }).select("id").single();
        if (error) throw error;
        setCollectionId(row.id);
        _uploadCtx = { userId, collectionId: row.id };

        // Upload original files to Supabase Storage (fire-and-forget)
        if (originalFiles) {
          const fileMap = {
            cnpj: "cartao-cnpj", qsa: "qsa", contrato: "contrato-social",
            faturamento: "faturamento", scr: "scr-bacen", scrAnterior: "scr-anterior",
          } as const;
          for (const [key, label] of Object.entries(fileMap)) {
            const filesArr = originalFiles[key as keyof typeof originalFiles];
            if (Array.isArray(filesArr)) {
              filesArr.forEach((file, i) => {
                const suffix = filesArr.length > 1 ? `-${i + 1}` : "";
                uploadFile(userId, row.id, "originals", `${label}${suffix}.${file.name.split(".").pop() || "pdf"}`, file)
                  .catch(() => {});
              });
            }
          }
        }

        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return row.id;
      }
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Verifique a conexão com o Supabase"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    setConfirmFinish(false);
    try {
      const supabase = createClient();
      let idToFinish = collectionId;
      if (!idToFinish) {
        idToFinish = await handleSave();
      }
      if (!idToFinish) throw new Error("Não foi possível salvar a coleta");

      const { error } = await supabase.from("document_collections").update({
        status: "finished",
        finished_at: new Date().toISOString(),
        ...getCollectionMeta(),
      }).eq("id", idToFinish);
      if (error) throw error;

      toast.success("Coleta finalizada!");
      onNotify?.(`Relatório de "${data.cnpj.razaoSocial || "empresa"}" finalizado`);
      onFirstCollection?.();
      window.location.href = `/historico?highlight=${idToFinish}`;
    } catch (err) {
      toast.error("Erro ao finalizar: " + (err instanceof Error ? err.message : "Verifique a conexão"));
    } finally {
      setFinishing(false);
    }
  };

  // ── Auto-save: salva automaticamente ao entrar no step ──
  const autoSaved = useRef(false);
  useEffect(() => {
    if (!autoSaved.current) {
      autoSaved.current = true;
      handleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeName = (data.cnpj.cnpj || "relatorio").replace(/[\/\\.:]/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  // ── Helpers ──
  const parseMoneyToNumber = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const dividaAtiva = parseMoneyToNumber(data.scr.totalDividasAtivas);
  const atraso = parseMoneyToNumber(data.scr.operacoesEmAtraso);
  const prejuizosVal = parseMoneyToNumber(data.scr.prejuizos);
  const vencidas = parseMoneyToNumber(data.scr.operacoesVencidas);
  const vencidosSCR = parseMoneyToNumber(data.scr.vencidos);
  const protestosVigentes = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  const processosBancariosAtivos = (data.processos?.bancarios || []).filter(b => b.status && /andamento|distribu/i.test(b.status)).length;

  // ── Rating local (0-10) — usado como fallback se IA não disponível ──
  const ratingScore = (() => {
    // Sem dados mínimos → rating 0 (ausência de documento não é mérito)
    const temDadosMinimos = !!(
      data.cnpj.razaoSocial ||
      (data.faturamento.meses?.length ?? 0) > 0 ||
      data.scr.totalDividasAtivas
    );
    if (!temDadosMinimos) return 0;

    let s = 0;
    // Situação ATIVA (+1)
    if (data.cnpj.situacaoCadastral?.toUpperCase().includes("ATIVA")) s += 1;
    // Empresa > 5 anos from dataAbertura (+1)
    if (data.cnpj.dataAbertura) {
      const parts = data.cnpj.dataAbertura.split("/");
      if (parts.length >= 3) {
        const year = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(year) && new Date().getFullYear() - year > 5) s += 1;
      }
    }
    // Faturamento consistente não-zerado (+1.5)
    if (!data.faturamento.faturamentoZerado) s += 1.5;
    // Faturamento atualizado (+0.5)
    if (data.faturamento.dadosAtualizados) s += 0.5;
    // SCR sem vencidos (+1.5)
    if (vencidosSCR === 0 && vencidas === 0) s += 1.5;
    // SCR sem prejuízos (+1.5)
    if (prejuizosVal === 0) s += 1.5;
    // Classificação risco A-C (+1)
    const cl = data.scr.classificacaoRisco?.toUpperCase().trim();
    if (cl && ["A", "AA", "B", "C"].includes(cl)) s += 1;
    // Sem protestos vigentes (+1)
    if (protestosVigentes === 0) s += 1;
    // Sem RJ e processos bancários ativos (+0.5)
    if (!data.processos?.temRJ && processosBancariosAtivos === 0) s += 0.5;
    // Base (+0.5)
    s += 0.5;
    return Math.min(10, Math.round(s * 10) / 10);
  })();

  // ── Decision (usa IA se disponível, senão cálculo local) ──
  const finalRating = aiAnalysis ? aiAnalysis.rating : ratingScore;
  const decision: string =
    aiAnalysis ? aiAnalysis.decisao :
    (finalRating >= 7 ? "APROVADO" : finalRating >= 4 ? "PENDENTE" : "REPROVADO");
  const decisionColor = decision === "APROVADO" ? "#16A34A" : decision === "REPROVADO" ? "#DC2626" : "#D97706";
  const decisionBg = decision === "APROVADO" ? "#F0FDF4" : decision === "PENDENTE" ? "#FFFBEB" : "#FEF2F2";
  const decisionBorder = decision === "APROVADO" ? "#BBF7D0" : decision === "PENDENTE" ? "#FDE68A" : "#FECACA";

  // ── Alerts (usa IA se disponível) ──
  const alerts: Alert[] = (() => {
    if (aiAnalysis && aiAnalysis.alertas.length > 0) {
      return aiAnalysis.alertas.map(a => ({
        message: a.descricao,
        severity: a.severidade as AlertSeverity,
        impacto: a.impacto,
      }));
    }
    const a: Alert[] = [];
    if (vencidosSCR > 0 || vencidas > 0) a.push({ message: "SCR com operações vencidas", severity: "ALTA" });
    if (prejuizosVal > 0) a.push({ message: "SCR com prejuízos registrados", severity: "ALTA" });
    if (calcFaturamentoZerado(data.faturamento)) a.push({ message: "Faturamento zerado no período", severity: "ALTA" });
    if (data.faturamento.meses.length > 0 && !data.faturamento.dadosAtualizados) a.push({ message: "Faturamento desatualizado", severity: "MODERADA" });
    const rl = data.scr.classificacaoRisco?.toUpperCase();
    if (rl && ["D", "E", "F", "G", "H"].includes(rl)) a.push({ message: `Classificação de risco ${rl}`, severity: "MODERADA" });
    if (atraso > 0) a.push({ message: "Operações em atraso no SCR", severity: "MODERADA" });
    return a;
  })();

  const alertsHigh = alerts.filter(a => a.severity === "ALTA");
  const alertsMod = alerts.filter(a => a.severity === "MODERADA" || a.severity === "INFO");

  // ── Pontos fortes/fracos e parecer da IA ──
  // parecer é string | objeto — narrowar antes de acessar propriedades
  const _parecerObj = (typeof aiAnalysis?.parecer === 'object' && aiAnalysis?.parecer !== null)
    ? aiAnalysis!.parecer as { resumoExecutivo?: string; textoCompleto?: string; pontosFortes?: string[]; pontosNegativosOuFracos?: string[]; perguntasVisita?: Array<{pergunta: string; contexto: string}> }
    : null;
  const pontosFortes   = (aiAnalysis?.pontosFortes   || _parecerObj?.pontosFortes              || []) as string[];
  const pontosFracos   = (aiAnalysis?.pontosFracos   || _parecerObj?.pontosNegativosOuFracos   || []) as string[];
  const perguntasVisita = (aiAnalysis?.perguntasVisita || _parecerObj?.perguntasVisita           || []) as Array<{pergunta: string; contexto: string}>;
  // textoCompleto = análise completa (3-4 parágrafos); resumoExecutivo = 1 parágrafo. Prioriza o completo no PDF.
  const resumoExecutivo = _parecerObj?.textoCompleto
    || aiAnalysis?.resumoExecutivo
    || (typeof aiAnalysis?.parecer === 'string' ? aiAnalysis.parecer : _parecerObj?.resumoExecutivo)
    || "";

  // ── Legacy risk for UI badge ──
  const riskScore = (() => {
    if (alertsHigh.length > 0) return "alto";
    if (alertsMod.length > 0) return "medio";
    return "baixo";
  })();

  const riskCfg = {
    alto:  { label: "RISCO ALTO",     labelColor: "text-[#DC2626]", bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", dot: "bg-[#DC2626]", heroColor: "text-[#DC2626]" },
    medio: { label: "RISCO MODERADO", labelColor: "text-[#D97706]", bg: "bg-[#FFFBEB]",  border: "border-[#FDE68A]", dot: "bg-[#F59E0B]", heroColor: "text-[#D97706]" },
    baixo: { label: "RISCO BAIXO",    labelColor: "text-[#16A34A]", bg: "bg-[#F0FDF4]",  border: "border-[#BBF7D0]", dot: "bg-[#16A34A]", heroColor: "text-[#16A34A]" },
  };
  const risk = riskCfg[riskScore];

  const qsaCount = data.qsa.quadroSocietario.filter(s => s.nome).length;

  const MutedValue = ({ v }: { v: string }) => {
    const isZero = !v || v === "0" || v === "0,00" || v === "R$ 0,00";
    return <span className={isZero ? "text-[#9CA3AF]" : "text-[#111827] font-semibold"}>{isZero ? "—" : v}</span>;
  };

  // Company age helper
  const companyAge = (() => {
    if (!data.cnpj.dataAbertura) return "";
    const parts = data.cnpj.dataAbertura.split("/");
    if (parts.length >= 3) {
      const year = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(year)) {
        const age = new Date().getFullYear() - year;
        return `${age} ano${age !== 1 ? "s" : ""}`;
      }
    }
    return "";
  })();

  // ── Fund parameter validation ──
  const fundValidation = validarContraParametros(data, activeValidationSettings);

  // ── Credit Limit Result ──
  const creditLimit: CreditLimitResult = (() => {
    const fmmRaw = parseMoney(data.faturamento.fmm12m || data.faturamento.mediaAno || data.faturamento.somatoriaAno || '0');
    const fator = activeValidationSettings.fator_limite_base;
    const limiteBase = fmmRaw * fator;
    const classificacao: 'APROVADO' | 'CONDICIONAL' | 'REPROVADO' =
      (fundValidation.hasEliminatoria || fundValidation.failCount > 0) ? 'REPROVADO'
      : fundValidation.warnCount > 0 ? 'CONDICIONAL' : 'APROVADO';
    const fatorReducao = classificacao === 'REPROVADO' ? 0 : classificacao === 'CONDICIONAL' ? 0.7 : 1;
    const limiteAjustado = limiteBase * fatorReducao;
    const prazo = classificacao === 'APROVADO' ? activeValidationSettings.prazo_maximo_aprovado
      : classificacao === 'CONDICIONAL' ? activeValidationSettings.prazo_maximo_condicional : 0;
    const revisaoDias = classificacao !== 'REPROVADO'
      ? (classificacao === 'APROVADO' ? activeValidationSettings.revisao_aprovado_dias : activeValidationSettings.revisao_condicional_dias)
      : 0;
    const dataRevisao = new Date();
    dataRevisao.setDate(dataRevisao.getDate() + revisaoDias);
    return {
      classificacao, limiteAjustado, limiteBase, fmmBase: fmmRaw, fatorBase: fator, fatorReducao,
      prazo, revisaoDias, dataRevisao: dataRevisao.toISOString(),
      concentracaoMaxPct: activeValidationSettings.concentracao_max_sacado,
      limiteConcentracao: limiteAjustado * (activeValidationSettings.concentracao_max_sacado / 100),
      presetName: selectedPresetName,
    };
  })();

  // ── Persist fund_status to collection ──
  useEffect(() => {
    if (!collectionId || fundValidation.criteria.length === 0) return;
    const status = fundValidation.hasEliminatoria || fundValidation.failCount > 0 ? "error"
      : fundValidation.warnCount > 0 ? "warning" : "ok";
    const payload = {
      status,
      pass_count: fundValidation.passCount,
      fail_count: fundValidation.failCount,
      warn_count: fundValidation.warnCount,
      total: fundValidation.criteria.length,
      preset_name: selectedPresetName,
      preset_color: selectedPresetColor,
      validated_at: new Date().toISOString(),
    };
    const save = async () => {
      try {
        const supabase = createClient();
        await supabase.from("document_collections").update({ fund_status: payload }).eq("id", collectionId);
      } catch { /* ignore */ }
    };
    save();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, selectedPresetId, fundValidation.passCount, fundValidation.failCount, fundValidation.warnCount]);

  // ═══════════════════════════════════════════════════
  // PDF Generation
  // ═══════════════════════════════════════════════════
  // Carrega notas salvas no Supabase quando collectionId fica disponível
  useEffect(() => {
    if (!collectionId) return;
    const supabase = createClient();
    supabase.from("document_collections").select("observacoes").eq("id", collectionId).single()
      .then(({ data: row }) => {
        if (row?.observacoes && !analystNotes.trim()) {
          setAnalystNotes(row.observacoes);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const saveNotes = async (notes: string) => {
    if (!collectionId) return;
    setSavingNotes(true);
    try {
      const supabase = createClient();
      await supabase.from("document_collections").update({ observacoes: notes.trim() || null }).eq("id", collectionId);
    } catch { /* silently fail */ } finally { setSavingNotes(false); }
  };

  const generatePDF = async () => {
    setGeneratingFormat("pdf");
    try {
      // Tenta buscar foto do estabelecimento via Street View antes de gerar o PDF
      let streetViewBase64: string | undefined;
      const endereco = data.cnpj?.endereco;
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (endereco && apiKey) {
        try {
          const svUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x250&location=${encodeURIComponent(endereco)}&key=${apiKey}`;
          const svRes = await fetch(svUrl);
          if (svRes.ok) {
            const svBlob = await svRes.blob();
            const reader = new FileReader();
            streetViewBase64 = await new Promise<string>(resolve => {
              reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
              reader.readAsDataURL(svBlob);
            });
          }
        } catch {
          // Street View indisponível — segue sem foto
        }
      }

      const blob = await buildPDFReport({
        data, aiAnalysis, decision, finalRating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
        dividaAtiva, atraso, riskScore, decisionColor, decisionBg, decisionBorder,
        observacoes: analystNotes.trim() || undefined,
        streetViewBase64,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
      setGeneratedFormats(p => new Set(p).add("pdf"));
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // DOCX Generation
  // ═══════════════════════════════════════════════════
  const generateDOCX = async () => {
    setGeneratingFormat("docx");
    try {
      const blob = await buildDOCXReport({
        data, aiAnalysis, decision, finalRating, alerts,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.docx`);
      setGeneratedFormats(p => new Set(p).add("docx"));
    } catch (err) {
      console.error("DOCX generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // Excel Generation
  // ═══════════════════════════════════════════════════
  const generateExcel = async () => {
    setGeneratingFormat("xlsx");
    try {
      const blob = await buildExcelReport({
        data, aiAnalysis, decision, finalRating, alerts,
        pontosFortes, pontosFracos, companyAge, protestosVigentes,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.xlsx`);
      setGeneratedFormats(p => new Set(p).add("xlsx"));
    } catch (err) {
      console.error("Excel generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // HTML Generation (extracted to lib/generators/html.ts)
  // ═══════════════════════════════════════════════════
  const generateHTML = () => {
    setGeneratingFormat("html");
    try {
      const htmlContent = buildHTMLReport({
        data, aiAnalysis, decision, finalRating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, vencidosSCR, vencidas, prejuizosVal, protestosVigentes,
      });
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.html`);
      setGeneratedFormats(p => new Set(p).add("html"));
    } catch (err) {
      console.error("HTML generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  /* old generateHTML body removed — see lib/generators/html.ts */
  
  // ═══════════════════════════════════════════════════
  // UI Render
  // ═══════════════════════════════════════════════════
  // Sidebar nav items
  const navItems = [
    { id: "sec-00", icon: "00", label: "Sumário Executivo" },
    { id: "sec-fs", icon: "FS", label: "Parâmetros do Fundo" },
    { id: "sec-05", icon: "05", label: "SCR / Bacen" },
    { id: "sec-07", icon: "07", label: "Processos Judiciais" },
    { id: "sec-op", icon: "OP", label: "Relatório de Visita" },
    { id: "sec-nt", icon: "✎", label: "Anotações" },
    { id: "sec-ex", icon: "⬇", label: "Exportar" },
  ];

  return (
    <div className="animate-slide-up flex gap-6 items-start">

      {/* ── Sidebar de navegação (desktop) ── */}
      <nav className="hidden lg:flex flex-col gap-0.5 w-[196px] flex-shrink-0 sticky top-4 self-start">
        <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-[0.14em] px-3 mb-1">Seções</p>
        {navItems.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-[#374151] hover:bg-[#EFF6FF] hover:text-[#203b88] transition-colors group"
            onClick={e => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          >
            <span className="w-6 h-6 rounded-md bg-[#F3F4F6] group-hover:bg-[#DBEAFE] flex items-center justify-center text-[9px] font-bold text-[#6B7280] group-hover:text-[#203b88] transition-colors flex-shrink-0">{item.icon}</span>
            <span className="leading-snug">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 min-w-0 space-y-5 pb-28">

      {/* ══════════════════════════════════════════════════════
          CARD 00 — SUMARIO EXECUTIVO
          ══════════════════════════════════════════════════════ */}
      <div id="sec-00" className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #2d4f8a", boxShadow: "0 4px 20px rgba(32,59,136,0.12)" }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
            <span className="text-sm font-bold text-white">00</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Sumário Executivo</p>
            <p className="text-sm font-bold text-white">Análise de Crédito</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Rating + Decision badges */}
          <div className="grid grid-cols-3 gap-4">
            <div className={`px-4 py-3 rounded-lg border animate-stagger-1`} style={{ background: decisionBg, borderColor: decisionBorder }}>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">Rating</p>
              <p className="text-[22px] font-bold animate-number-in" style={{ color: decisionColor }}>{finalRating}/10</p>
              <p className="text-[11px] text-[#6B7280]">{finalRating >= 7 ? 'Perfil saudavel' : finalRating >= 4 ? 'Atencao recomendada' : 'Perfil critico'}</p>
            </div>
            <div className={`px-4 py-3 rounded-lg border animate-stagger-2`} style={{ background: decisionBg, borderColor: decisionBorder }}>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">Decisao</p>
              <p className="text-[18px] font-bold animate-scale-in" style={{ color: decisionColor }}>{decision}</p>
            </div>
            <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg animate-stagger-3 ${risk.bg} border ${risk.border}`}>
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${risk.dot}`} />
                  <span className={`text-sm font-bold tracking-wide ${risk.labelColor}`}>{risk.label}</span>
                </div>
                <p className="text-[11px] text-[#6B7280] mt-1">Alertas: {alerts.length}</p>
              </div>
            </div>
          </div>

          {/* Alerts panel */}
          {alerts.length > 0 && (
            <AlertList alerts={alerts} />
          )}

          {/* AI Analysis: Resumo + Pontos Fortes/Fracos */}
          {analyzingAI && (
            <div className="bg-cf-surface border border-cf-border rounded-lg px-4 py-3 flex items-center gap-3">
              <Loader2 size={14} className="animate-spin text-cf-navy flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-cf-text-2 font-medium">Analisando com IA...</span>
                {analysisStatus && (
                  <span className="text-[10px] text-cf-text-4">{analysisStatus}</span>
                )}
              </div>
            </div>
          )}
          {!analyzingAI && analysisError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-red-500 text-xs">⚠</span>
                <span className="text-xs text-red-700">{analysisError}</span>
              </div>
              <button
                onClick={handleReanalyze}
                className="text-[11px] font-semibold text-white bg-cf-navy hover:bg-cf-navy/90 px-3 py-1.5 rounded transition-colors flex-shrink-0"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {aiAnalysis && !analyzingAI && (
            <div className="flex items-center justify-between">
              {analysisFromCache && (
                <span className="text-[10px] text-cf-text-4">Analise carregada do cache</span>
              )}
              <button onClick={handleReanalyze} disabled={analyzingAI} className="text-[11px] text-cf-text-4 hover:text-cf-navy underline transition-colors ml-auto" style={{ minHeight: "auto" }}>
                Reanalisar
              </button>
            </div>
          )}
          {resumoExecutivo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-blue-700 font-bold mb-1">Resumo Executivo</p>
              <p className="text-xs text-blue-900 leading-relaxed">{resumoExecutivo}</p>
            </div>
          )}
          {pontosFortes.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-green-700 font-bold mb-1">Pontos Fortes ({pontosFortes.length})</p>
              {pontosFortes.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-green-800 mt-1">
                  <CheckCircle2 size={12} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}
          {pontosFracos.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-red-700 font-bold mb-1">Pontos Fracos ({pontosFracos.length})</p>
              {pontosFracos.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-red-800 mt-1">
                  <AlertTriangle size={12} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}
          {perguntasVisita.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-amber-700 font-bold mb-1">Perguntas para Visita ({perguntasVisita.length})</p>
              {perguntasVisita.map((q, i) => (
                <div key={i} className="mt-2">
                  <p className="text-[12px] text-amber-900 font-semibold">{i + 1}. {q.pergunta}</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">{q.contexto}</p>
                </div>
              ))}
            </div>
          )}

          {/* Hero number: Divida Total */}
          {dividaAtiva > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Divida Total</p>
              <p className={`text-[22px] font-bold leading-tight ${dividaAtiva > 1000000 ? "text-[#D97706]" : "text-[#111827]"}`}>
                R$ {data.scr.totalDividasAtivas}
              </p>
            </div>
          )}

          {/* Grid row 1 */}
          <div className="grid grid-cols-4 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Empresa</p>
              <p className="text-[14px] font-semibold text-[#111827] leading-snug break-words">{data.cnpj.razaoSocial || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">CNPJ</p>
              <p className="text-[14px] font-semibold text-[#111827] font-mono">{data.cnpj.cnpj || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Situacao</p>
              <p className="text-[14px] font-semibold text-[#111827]">{data.cnpj.situacaoCadastral || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Idade</p>
              <p className="text-[14px] font-semibold text-[#111827]">{companyAge || "—"}</p>
            </div>
          </div>

          {/* Grid row 2 */}
          <div className="border-t border-[#F3F4F6] pt-4 grid grid-cols-3 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Socios (QSA)</p>
              <p className="text-[14px] font-semibold text-[#111827]">{qsaCount}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Capital Social</p>
              <p className="text-[14px] font-semibold text-[#111827] break-words">{data.qsa.capitalSocial || data.contrato.capitalSocial || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Faturamento Anual</p>
              <p className="text-[14px] font-semibold text-[#111827] break-words">{data.faturamento.somatoriaAno ? `R$ ${data.faturamento.somatoriaAno}` : "—"}</p>
            </div>
          </div>

          {/* Grid row 3 */}
          <div className="border-t border-[#F3F4F6] pt-4 grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Em Atraso</p>
              <p className="text-[14px]"><MutedValue v={data.scr.operacoesEmAtraso ? `R$ ${data.scr.operacoesEmAtraso}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Prejuizos</p>
              <p className="text-[14px]"><MutedValue v={data.scr.prejuizos ? `R$ ${data.scr.prejuizos}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Protestos Vigentes</p>
              <p className="text-[14px]"><MutedValue v={protestosVigentes > 0 ? String(protestosVigentes) : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Classificacao de Risco</p>
              <p className="text-[14px] font-semibold text-[#111827]">{data.scr.classificacaoRisco || "—"}</p>
            </div>
          </div>

          {/* Grid row 4 — Processos (Credit Hub) */}
          {data.processos && (parseInt(data.processos.passivosTotal || "0") > 0 || parseInt(data.processos.ativosTotal || "0") > 0 || data.processos.temRJ) && (() => {
            const passivosN = parseInt(data.processos!.passivosTotal || "0");
            return (
              <div className="border-t border-[#F3F4F6] pt-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] font-bold mb-3">Processos Judiciais — Credit Hub</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Total Processos</p>
                    <p className={`text-[20px] font-bold ${passivosN > 0 ? "text-[#D97706]" : "text-[#111827]"}`}>{passivosN}</p>
                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">todos os polos</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Polo Ativo</p>
                    <p className="text-[20px] font-bold text-[#1D4ED8]">{parseInt(data.processos!.poloAtivoQtd || "0") || "—"}</p>
                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">empresa autora</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Polo Passivo</p>
                    <p className={`text-[20px] font-bold ${parseInt(data.processos!.poloPassivoQtd || "0") > 0 ? "text-[#D97706]" : "text-[#111827]"}`}>{parseInt(data.processos!.poloPassivoQtd || "0") || "—"}</p>
                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">empresa ré</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Alertas</p>
                    <p className="text-[14px] font-semibold flex flex-wrap gap-1">
                      {data.processos!.temFalencia && <span className="text-[11px] font-bold text-white bg-[#DC2626] px-1.5 py-0.5 rounded">FALÊNCIA</span>}
                      {data.processos!.temRJ && <span className="text-[11px] font-bold text-white bg-[#D97706] px-1.5 py-0.5 rounded">RJ</span>}
                      {!data.processos!.temFalencia && !data.processos!.temRJ && <span className="text-[#9CA3AF]">—</span>}
                    </p>
                  </div>
                </div>
                {data.processos!.distribuicao?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.processos!.distribuicao.slice(0, 6).map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-[#FFF7ED] border border-[#FED7AA] text-[#9A3412] rounded-full px-2.5 py-0.5 font-medium">
                        {d.tipo} <span className="font-bold">({d.qtd})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CARD FS — PARÂMETROS DO FUNDO
          ══════════════════════════════════════════════════════ */}
      <div id="sec-fs" className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #2d4f8a", boxShadow: "0 4px 20px rgba(32,59,136,0.12)" }}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
              <span className="text-sm font-bold text-white">FS</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Critérios de Elegibilidade</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <p className="text-sm font-bold text-white">Parâmetros do Fundo</p>
                {/* Preset selector */}
                {fundPresets.length > 0 && (
                  <select
                    value={selectedPresetId ?? "active"}
                    onChange={e => setSelectedPresetId(e.target.value)}
                    style={{
                      fontSize: "10px", fontWeight: 700, color: "white", background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)", borderRadius: "6px", padding: "2px 6px",
                      cursor: "pointer", outline: "none", maxWidth: "160px",
                    }}
                  >
                    <option value="active" style={{ color: "#111827", background: "white" }}>Configurações Ativas</option>
                    {fundPresets.map(p => (
                      <option key={p.id} value={p.id} style={{ color: "#111827", background: "white" }}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
          {/* Summary badge */}
          <div className="flex items-center gap-2">
            {fundValidation.failCount > 0 && (
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                {fundValidation.failCount} reprovado{fundValidation.failCount !== 1 ? "s" : ""}
              </span>
            )}
            {fundValidation.warnCount > 0 && (
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>
                {fundValidation.warnCount} atenção
              </span>
            )}
            <span style={{
              fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px",
              background: fundValidation.failCount > 0 ? "rgba(220,38,38,0.15)" : fundValidation.warnCount > 0 ? "rgba(217,119,6,0.15)" : "rgba(22,163,74,0.2)",
              color: fundValidation.failCount > 0 ? "#fca5a5" : fundValidation.warnCount > 0 ? "#fcd34d" : "#86efac",
              border: "1px solid rgba(255,255,255,0.2)",
            }}>
              {fundValidation.passCount}/{fundValidation.criteria.length} critérios
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="divide-y divide-[#F3F4F6]">
          {fundValidation.criteria.map(c => {
            const icon = c.status === "ok" ? "✓" : c.status === "warning" ? "!" : c.status === "error" ? "✕" : "?";
            const iconBg = c.status === "ok" ? "#f0fdf4" : c.status === "warning" ? "#fffbeb" : c.status === "error" ? "#fef2f2" : "#f9fafb";
            const iconColor = c.status === "ok" ? "#16a34a" : c.status === "warning" ? "#d97706" : c.status === "error" ? "#dc2626" : "#9ca3af";
            const iconBorder = c.status === "ok" ? "#bbf7d0" : c.status === "warning" ? "#fde68a" : c.status === "error" ? "#fecaca" : "#e5e7eb";
            const rowBg = c.status === "error" ? "#fffafa" : c.status === "warning" ? "#fffdf5" : "white";

            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr", alignItems: "center", gap: "12px", padding: "12px 20px", background: rowBg }}>
                {/* Icon */}
                <div style={{ width: "28px", height: "28px", borderRadius: "99px", display: "flex", alignItems: "center", justifyContent: "center", background: iconBg, border: `1px solid ${iconBorder}`, flexShrink: 0, fontSize: "12px", fontWeight: 700, color: iconColor }}>
                  {icon}
                </div>

                {/* Label */}
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#111827", marginBottom: "1px" }}>{c.label}</p>
                  {c.eliminatoria && c.status === "error" && (
                    <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", color: "#dc2626", background: "#fee2e2", padding: "1px 5px", borderRadius: "4px" }}>ELIMINATÓRIO</span>
                  )}
                  {c.detail && c.status !== "error" && (
                    <p style={{ fontSize: "10px", color: "#6b7280", marginTop: "1px" }}>{c.detail}</p>
                  )}
                </div>

                {/* Threshold */}
                <div>
                  <p style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Limite do Fundo</p>
                  <p style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>{c.threshold}</p>
                </div>

                {/* Actual */}
                <div>
                  <p style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Apurado</p>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: iconColor }}>{c.actual}</p>
                  {c.detail && c.status === "error" && (
                    <p style={{ fontSize: "10px", color: iconColor, opacity: 0.8, marginTop: "1px" }}>{c.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 20px", borderTop: "1px solid #F3F4F6", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "11px", color: "#6b7280" }}>
            {fundValidation.hasEliminatoria
              ? "⚠ Critério eliminatório não atendido — aprovação impedida pelos parâmetros do fundo."
              : fundValidation.warnCount > 0
                ? "Critérios de atenção identificados — análise condicional recomendada."
                : "Todos os critérios atendidos."}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#6b7280" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: selectedPresetColor, display: "inline-block" }} />
              {selectedPresetName}
            </span>
            <a href="/configuracoes" target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", fontWeight: 600, color: "#203b88", textDecoration: "none" }}>
              Gerenciar perfis →
            </a>
          </div>
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════
          CARD LC — LIMITE DE CRÉDITO SUGERIDO
          ══════════════════════════════════════════════════════ */}
      {(() => {
        const fmmRaw = parseMoney(data.faturamento.fmm12m || data.faturamento.mediaAno || data.faturamento.somatoriaAno || "0");
        const fator = activeValidationSettings.fator_limite_base;
        const limiteBase = fmmRaw * fator;
        const lcClass: "APROVADO" | "CONDICIONAL" | "REPROVADO" =
          (fundValidation.hasEliminatoria || fundValidation.failCount > 0) ? "REPROVADO"
          : fundValidation.warnCount > 0 ? "CONDICIONAL" : "APROVADO";
        const fatorReducao = lcClass === "REPROVADO" ? 0 : lcClass === "CONDICIONAL" ? 0.7 : 1;
        const limiteAjustado = limiteBase * fatorReducao;
        const prazo = lcClass === "APROVADO" ? activeValidationSettings.prazo_maximo_aprovado
          : lcClass === "CONDICIONAL" ? activeValidationSettings.prazo_maximo_condicional : 0;
        const revisaoDias = lcClass !== "REPROVADO"
          ? (lcClass === "APROVADO" ? activeValidationSettings.revisao_aprovado_dias : activeValidationSettings.revisao_condicional_dias)
          : 0;
        const dataRevisao = new Date();
        dataRevisao.setDate(dataRevisao.getDate() + revisaoDias);
        const concentracaoMax = activeValidationSettings.concentracao_max_sacado;
        const limiteConcentracao = limiteAjustado * (concentracaoMax / 100);
        const fmtM = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        const lcColor = lcClass === "APROVADO" ? "#16a34a" : lcClass === "CONDICIONAL" ? "#d97706" : "#dc2626";
        const lcBg = lcClass === "APROVADO" ? "#dcfce7" : lcClass === "CONDICIONAL" ? "#fef3c7" : "#fee2e2";
        const lcBorder = lcClass === "APROVADO" ? "#bbf7d0" : lcClass === "CONDICIONAL" ? "#fde68a" : "#fecaca";
        const lcGrad = lcClass === "APROVADO" ? "linear-gradient(135deg, #14532d 0%, #166534 100%)"
          : lcClass === "CONDICIONAL" ? "linear-gradient(135deg, #78350f 0%, #92400e 100%)"
          : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)";
        return (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1px solid ${lcBorder}`, boxShadow: `0 4px 20px ${lcColor}22` }}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: lcGrad }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
                  <span className="text-sm font-bold text-white">LC</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Resultado da Análise</p>
                  <p className="text-sm font-bold text-white">Limite de Crédito Sugerido</p>
                </div>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 800, padding: "4px 14px", borderRadius: "99px", background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
                {lcClass === "CONDICIONAL" ? "APROVAÇÃO CONDICIONAL" : lcClass}
              </span>
            </div>

            {/* Body */}
            <div style={{ padding: "24px 20px" }}>
              {/* Main limit number */}
              <div style={{ marginBottom: "24px" }}>
                {lcClass === "REPROVADO" ? (
                  <div>
                    <p style={{ fontSize: "36px", fontWeight: 800, color: "#dc2626", letterSpacing: "-0.02em" }}>Não elegível</p>
                    <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Critério eliminatório não atendido — empresa fora dos parâmetros do fundo</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Limite aprovado</p>
                    <p style={{ fontSize: "40px", fontWeight: 800, color: lcColor, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmtM(limiteAjustado)}</p>
                    {lcClass === "CONDICIONAL" && (
                      <p style={{ fontSize: "11px", color: "#d97706", marginTop: "6px" }}>Reduzido em 30% por critérios de atenção (base: {fmtM(limiteBase)})</p>
                    )}
                  </div>
                )}
              </div>

              {/* Details grid */}
              {lcClass !== "REPROVADO" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
                  {[
                    { label: "Prazo máximo", value: `${prazo} dias`, sub: lcClass === "APROVADO" ? "Aprovado" : "Condicional" },
                    { label: "Revisão em", value: dataRevisao.toLocaleDateString("pt-BR"), sub: `em ${revisaoDias} dias` },
                    { label: "Conc. máx./sacado", value: fmtM(limiteConcentracao), sub: `${concentracaoMax}% do limite` },
                    { label: "Base de cálculo", value: fmtM(fmmRaw), sub: `FMM × ${fator}x` },
                  ].map(item => (
                    <div key={item.label} style={{ padding: "12px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #F1F5F9" }}>
                      <p style={{ fontSize: "9px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{item.label}</p>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{item.value}</p>
                      <p style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>{item.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Methodology note */}
              <div style={{ padding: "10px 14px", background: lcBg, borderRadius: "8px", border: `1px solid ${lcBorder}` }}>
                <p style={{ fontSize: "11px", color: lcColor, lineHeight: 1.5 }}>
                  {lcClass === "REPROVADO"
                    ? `${fundValidation.failCount} critério(s) eliminatório(s) impedem a aprovação. Corrija as pendências ou ajuste os parâmetros do perfil "${selectedPresetName}".`
                    : lcClass === "CONDICIONAL"
                      ? `Aprovação condicional com limite reduzido. ${fundValidation.warnCount} critério(s) de atenção identificados no perfil "${selectedPresetName}". Prazo de revisão: ${revisaoDias} dias.`
                      : `Todos os ${fundValidation.passCount} critérios do perfil "${selectedPresetName}" atendidos. Limite: FMM ${fmtM(fmmRaw)} × ${fator} = ${fmtM(limiteBase)}.`
                  }
                </p>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ══════════════════════════════════════════════════════
          CARD 05 — PERFIL DE CREDITO SCR/BACEN
          ══════════════════════════════════════════════════════ */}
      <div id="sec-05" className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #2d4f8a", boxShadow: "0 4px 20px rgba(32,59,136,0.12)" }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
            <span className="text-sm font-bold text-white">05</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Perfil de Crédito</p>
            <p className="text-sm font-bold text-white">SCR / BACEN</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Sem histórico bancário */}
          {data.scr.semHistorico && (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5">
              <span className="text-blue-400 text-base mt-0.5">ℹ</span>
              <div>
                <p className="text-[13px] font-semibold text-blue-700">Sem operações registradas no SCR</p>
                <p className="text-[12px] text-blue-500 mt-0.5">Empresa sem dívida bancária ativa — ausência de histórico de crédito no Banco Central</p>
              </div>
            </div>
          )}

          {/* Hero: Total Dividas Ativas */}
          <div className={data.scr.semHistorico ? "opacity-40" : ""}>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Total Dividas Ativas</p>
            <p className={`text-[24px] font-bold leading-tight ${dividaAtiva > 1000000 ? "text-[#D97706]" : "text-[#111827]"}`}>
              {data.scr.totalDividasAtivas ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
            </p>
          </div>

          {/* Summary row */}
          <div className={`grid grid-cols-3 gap-5${data.scr.semHistorico ? " opacity-40" : ""}`}>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Carteira a Vencer</p>
              <p className="text-[15px] font-semibold text-[#111827]">{data.scr.carteiraAVencer ? `R$ ${data.scr.carteiraAVencer}` : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Vencidos</p>
              <p className="text-[15px]"><MutedValue v={data.scr.vencidos ? `R$ ${data.scr.vencidos}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Prejuizos</p>
              <p className="text-[15px]"><MutedValue v={data.scr.prejuizos ? `R$ ${data.scr.prejuizos}` : ""} /></p>
            </div>
          </div>

          {/* Grid: Operacoes */}
          <div className="grid grid-cols-3 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Operacoes a Vencer</p>
              <p className="text-[15px] font-semibold text-[#111827]">{data.scr.operacoesAVencer ? `R$ ${data.scr.operacoesAVencer}` : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Em Atraso</p>
              <p className="text-[15px]"><MutedValue v={data.scr.operacoesEmAtraso ? `R$ ${data.scr.operacoesEmAtraso}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Vencidas</p>
              <p className="text-[15px]"><MutedValue v={data.scr.operacoesVencidas ? `R$ ${data.scr.operacoesVencidas}` : ""} /></p>
            </div>
          </div>

          {/* Grid: CP / LP */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Carteira Curto Prazo</p>
              <p className="text-[15px]"><MutedValue v={data.scr.carteiraCurtoPrazo ? `R$ ${data.scr.carteiraCurtoPrazo}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Carteira Longo Prazo</p>
              <p className="text-[15px]"><MutedValue v={data.scr.carteiraLongoPrazo ? `R$ ${data.scr.carteiraLongoPrazo}` : ""} /></p>
            </div>
          </div>

          {/* Grid: Coobrigacoes + Limite */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Coobrigacoes / Garantias</p>
              <p className="text-[15px]"><MutedValue v={data.scr.coobrigacoes ? `R$ ${data.scr.coobrigacoes}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Limite de Credito</p>
              <p className="text-[15px]"><MutedValue v={data.scr.limiteCredito ? `R$ ${data.scr.limiteCredito}` : ""} /></p>
            </div>
          </div>

          {/* Modalidades Table */}
          {data.scr.modalidades.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2">Modalidades de Credito</p>
              <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#D97706] text-white">
                      <th className="text-left px-3 py-2 font-semibold">Modalidade</th>
                      <th className="text-left px-3 py-2 font-semibold">Total</th>
                      <th className="text-left px-3 py-2 font-semibold">A Vencer</th>
                      <th className="text-left px-3 py-2 font-semibold">Vencido</th>
                      <th className="text-left px-3 py-2 font-semibold">Part.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scr.modalidades.map((m, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}>
                        <td className="px-3 py-2 text-[#111827] font-medium">{m.nome}</td>
                        <td className="px-3 py-2 text-[#111827]">{m.total}</td>
                        <td className="px-3 py-2 text-[#111827]">{m.aVencer}</td>
                        <td className="px-3 py-2 text-[#111827]">{m.vencido}</td>
                        <td className="px-3 py-2 text-[#111827] font-semibold">{m.participacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Instituicoes */}
          {data.scr.instituicoes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2">Instituicoes Credoras</p>
              <div className="flex flex-wrap gap-1.5">
                {data.scr.instituicoes.map((inst, i) => (
                  <span key={i} className="inline-block bg-[#F3F4F6] text-[#374151] text-[12px] font-medium px-2.5 py-1 rounded">
                    {inst.nome}: R$ {inst.valor}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Historico de Inadimplencia */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2">Historico de Inadimplencia</p>
            {data.scr.historicoInadimplencia ? (
              <div className="flex items-start gap-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-4 py-3">
                <AlertTriangle size={14} className="text-[#D97706] flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-[#374151] leading-relaxed break-words">{data.scr.historicoInadimplencia}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-4 py-3">
                <CheckCircle2 size={14} className="text-[#16A34A] flex-shrink-0" />
                <p className="text-[13px] text-[#16A34A] font-medium">Nao ha registro de operacoes vencidas ou prejuizos</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CARD 07 — PROCESSOS JUDICIAIS (Credit Hub)
          ══════════════════════════════════════════════════════ */}
      {data.processos && (parseInt(data.processos.passivosTotal || "0") > 0 || data.processos.temRJ || data.processos.distribuicao?.length > 0) && (() => {
        const proc = data.processos!;
        const passivosN = parseInt(proc.passivosTotal || "0");
        const ativosN   = parseInt(proc.ativosTotal   || "0");
        const dividasN  = parseInt(proc.dividasQtd    || "0");
        const semDados  = passivosN === 0 && ativosN === 0 && !proc.temRJ;
        if (semDados) return null;
        return (
          <div id="sec-07" className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #2d4f8a", boxShadow: "0 4px 20px rgba(32,59,136,0.12)" }}>
            <div className="px-5 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
                <span className="text-sm font-bold text-white">07</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Processos Judiciais</p>
                <p className="text-sm font-bold text-white">Credit Hub</p>
              </div>
              {proc.temRJ && (
                <span className="text-[10px] font-bold text-white bg-white/20 border border-white/30 px-2.5 py-1 rounded-full">RECUPERAÇÃO JUDICIAL</span>
              )}
            </div>
            <div className="p-5 space-y-5">

              {/* KPIs */}
              {(() => {
                const poloAtivoN  = parseInt(proc.poloAtivoQtd  || "0");
                const poloPassN   = parseInt(proc.poloPassivoQtd || "0");
                const kpis = [
                  { label: "Total Processos",   value: passivosN, danger: passivosN > 0,  sub: "todos os polos" },
                  { label: "Polo Ativo",         value: poloAtivoN, danger: false,          sub: "empresa autora/exequente", color: "text-[#1D4ED8]", bg: "bg-blue-50 border-blue-200" },
                  { label: "Polo Passivo",       value: poloPassN,  danger: poloPassN > 0,  sub: "empresa ré/executada" },
                  { label: "Dívidas",            value: dividasN,   danger: dividasN > 0,   sub: "vencidas" },
                ];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {kpis.map(k => (
                      <div key={k.label} className={`rounded-xl border px-4 py-3 ${k.bg ?? (k.danger ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#F8FAFC] border-[#E5E7EB]")}`}>
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">{k.label}</p>
                        <p className={`text-[22px] font-bold ${k.color ?? (k.danger ? "text-[#D97706]" : "text-[#6B7280]")}`}>{k.value > 0 ? k.value : "—"}</p>
                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">{k.sub}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Valor total estimado */}
              {proc.valorTotalEstimado && proc.valorTotalEstimado !== "0,00" && (
                <div className="flex items-center justify-between bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-5 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[#9A3412] font-bold">Valor Total Estimado</p>
                  <p className="text-[20px] font-bold text-[#D97706]">R$ {proc.valorTotalEstimado}</p>
                </div>
              )}

              {/* Distribuição por tipo */}
              {proc.distribuicao?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2 font-bold">Distribuição por Tipo</p>
                  <div className="space-y-2">
                    {proc.distribuicao.slice(0, 8).map((d, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[11px] text-[#374151] w-44 flex-shrink-0 truncate font-medium">{d.tipo}</span>
                        <div className="flex-1 bg-[#F3F4F6] rounded-full h-2">
                          <div className="h-2 rounded-full bg-[#D97706] transition-all duration-500" style={{ width: `${d.pct}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-[#374151] w-5 text-right">{d.qtd}</span>
                        <span className="text-[10px] text-[#9CA3AF] w-8 text-right">{d.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Distribuição temporal */}
              {proc.distribuicaoTemporal && proc.distribuicaoTemporal.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2 font-bold">Antiguidade dos Processos</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {proc.distribuicaoTemporal.map((dt, i) => (
                      <div key={i} className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-3 py-2 text-center">
                        <p className="text-[10px] text-[#6B7280] mb-0.5">{dt.periodo}</p>
                        <p className="text-[16px] font-bold text-[#374151]">{dt.qtd}</p>
                        <p className="text-[10px] text-[#9CA3AF]">R$ {dt.valor}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top processos por valor */}
              {proc.top10Valor && proc.top10Valor.filter(p => p.numero || p.tipo).length > 0 && (() => {
                const reais = proc.top10Valor!.filter(p => (p.numero || p.tipo) && p.tipo !== "DÍVIDA");
                if (reais.length === 0) return null;
                return (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2 font-bold">Maiores Processos por Valor</p>
                    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "#1E3A5F" }} className="text-white">
                            <th className="text-left px-3 py-2 font-semibold">Número</th>
                            <th className="text-left px-3 py-2 font-semibold">Tipo</th>
                            <th className="text-left px-3 py-2 font-semibold">Data</th>
                            <th className="text-left px-3 py-2 font-semibold">Valor</th>
                            <th className="text-left px-3 py-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reais.slice(0, 5).map((p, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}>
                              <td className="px-3 py-2 text-[#111827] font-mono text-[10px] max-w-[120px] truncate">{p.numero || "—"}</td>
                              <td className="px-3 py-2 text-[#374151]">{p.tipo || "—"}</td>
                              <td className="px-3 py-2 text-[#6B7280]">{p.data || "—"}</td>
                              <td className="px-3 py-2 font-semibold text-[#D97706]">R$ {p.valor}</td>
                              <td className="px-3 py-2">
                                {p.status ? <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#374151] max-w-[100px] truncate">{p.status}</span> : <span className="text-[#9CA3AF]">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          CARD — PARAMETROS OPERACIONAIS (Relatório de Visita)
          ══════════════════════════════════════════════════════ */}
      {data.relatorioVisita && (
        <div id="sec-op" className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #2d4f8a", boxShadow: "0 4px 20px rgba(32,59,136,0.12)" }}>
          <div className="px-5 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
              <span className="text-sm font-bold text-white">OP</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Parâmetros Operacionais</p>
              <p className="text-sm font-bold text-white">Relatório de Visita</p>
            </div>
          </div>
          <div className="p-5 space-y-5">

            {/* Taxas e Limites */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] font-bold mb-3 border-b border-[#F3F4F6] pb-1">Taxas e Limites</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  ["Taxa Convencional", data.relatorioVisita.taxaConvencional],
                  ["Taxa Comissaria", data.relatorioVisita.taxaComissaria],
                  ["Limite Total", data.relatorioVisita.limiteTotal ? `R$ ${data.relatorioVisita.limiteTotal}` : ""],
                  ["Limite Convencional", data.relatorioVisita.limiteConvencional ? `R$ ${data.relatorioVisita.limiteConvencional}` : ""],
                  ["Limite Comissaria", data.relatorioVisita.limiteComissaria ? `R$ ${data.relatorioVisita.limiteComissaria}` : ""],
                  ["Limite por Sacado", data.relatorioVisita.limitePorSacado ? `R$ ${data.relatorioVisita.limitePorSacado}` : ""],
                  ["Ticket Medio", data.relatorioVisita.ticketMedio ? `R$ ${data.relatorioVisita.ticketMedio}` : ""],
                  ["Valor Cobranca Boleto", data.relatorioVisita.valorCobrancaBoleto ? `R$ ${data.relatorioVisita.valorCobrancaBoleto}` : ""],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">{label}</p>
                    <p className="text-[14px] font-semibold text-[#111827]">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Condicoes de Cobranca e Prazos */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] font-bold mb-3 border-b border-[#F3F4F6] pb-1">Condicoes de Cobranca e Prazos</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  ["Prazo Recompra Cedente", data.relatorioVisita.prazoRecompraCedente ? `${data.relatorioVisita.prazoRecompraCedente} dias` : ""],
                  ["Envio para Cartorio", data.relatorioVisita.prazoEnvioCartorio ? `${data.relatorioVisita.prazoEnvioCartorio} dias` : ""],
                  ["Prazo Maximo", data.relatorioVisita.prazoMaximoOp ? `${data.relatorioVisita.prazoMaximoOp} dias` : ""],
                  ["Cobranca de TAC", data.relatorioVisita.cobrancaTAC],
                  ["Tranche", data.relatorioVisita.tranche ? `R$ ${data.relatorioVisita.tranche}` : ""],
                  ["Prazo Tranche", data.relatorioVisita.prazoTranche ? `${data.relatorioVisita.prazoTranche} dias` : ""],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">{label}</p>
                    <p className="text-[14px] font-semibold text-[#111827]">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Dados da Empresa */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] font-bold mb-3 border-b border-[#F3F4F6] pb-1">Dados da Empresa</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  ["Num. Funcionarios", String(data.relatorioVisita.funcionariosObservados || "—")],
                  ["Folha de Pagamento", data.relatorioVisita.folhaPagamento ? `R$ ${data.relatorioVisita.folhaPagamento}` : ""],
                  ["Endividamento Banco", data.relatorioVisita.endividamentoBanco],
                  ["Endividamento Factoring/FIDC", data.relatorioVisita.endividamentoFactoring],
                  ["Vendas Cheque", data.relatorioVisita.vendasCheque],
                  ["Vendas Duplicata", data.relatorioVisita.vendasDuplicata],
                  ["Vendas Outras", data.relatorioVisita.vendasOutras],
                  ["Prazo Medio Faturamento", data.relatorioVisita.prazoMedioFaturamento ? `${data.relatorioVisita.prazoMedioFaturamento} dias` : ""],
                  ["Prazo Medio Entrega", data.relatorioVisita.prazoMedioEntrega ? `${data.relatorioVisita.prazoMedioEntrega} dias` : ""],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">{label}</p>
                    <p className="text-[14px] font-semibold text-[#111827]">{value || "—"}</p>
                  </div>
                ))}
              </div>
              {data.relatorioVisita.referenciasFornecedores && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Referencias Comerciais / Fornecedores</p>
                  <p className="text-[13px] text-[#374151] leading-relaxed">{data.relatorioVisita.referenciasFornecedores}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Editar dados do relatorio ── */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <button onClick={() => setEditing(p => !p)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F8FAFC] transition-colors text-left group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors" style={{ background: editing ? "#1a3560" : "#EFF6FF", border: "1.5px solid #DBEAFE" }}>
              <Pencil size={14} style={{ color: editing ? "white" : "#203b88" }} />
            </div>
            <div>
              <span className="text-sm font-semibold text-[#111827] block">Editar dados do relatório</span>
              <span className="text-[11px] text-[#9CA3AF]">Ajuste os campos antes de gerar</span>
            </div>
          </div>
          <span
            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
            style={{
              background: editing ? "#1a3560" : "#EFF6FF",
              color: editing ? "white" : "#203b88",
              border: "1.5px solid #DBEAFE",
            }}
          >
            {editing ? "Fechar" : "Abrir"}
          </span>
        </button>
        {editing && (
          <div className="border-t border-cf-border px-5 pb-5 pt-4 space-y-5 animate-fade-in">
            {/* Secao CNPJ */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" /> Identificacao da Empresa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ["Razao Social", "razaoSocial"], ["Nome Fantasia", "nomeFantasia"], ["CNPJ", "cnpj"],
                  ["Data Abertura", "dataAbertura"], ["Situacao", "situacaoCadastral"], ["Data Situacao", "dataSituacaoCadastral"],
                  ["Motivo Situacao", "motivoSituacao"], ["Natureza Juridica", "naturezaJuridica"],
                  ["CNAE Principal", "cnaePrincipal"], ["Porte", "porte"], ["Capital Social", "capitalSocialCNPJ"],
                  ["Endereco", "endereco"], ["Telefone", "telefone"], ["E-mail", "email"],
                ] as [string, keyof typeof data.cnpj][]).map(([label, key]) => (
                  <div key={key} className={key === "razaoSocial" || key === "endereco" || key === "naturezaJuridica" || key === "cnaePrincipal" ? "col-span-2" : ""}>
                    <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                    <input value={data.cnpj[key]} onChange={e => setCNPJ(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                  </div>
                ))}
              </div>
            </div>

            {/* Secao Contrato */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block" /> Estrutura Societaria</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([["Capital Social", "capitalSocial"], ["Data Constituicao", "dataConstituicao"]] as [string, keyof typeof data.contrato][]).map(([label, key]) => (
                  <div key={key}>
                    <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                    <input value={data.contrato[key] as string} onChange={e => setContrato(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Objeto Social</label>
                  <textarea value={data.contrato.objetoSocial} onChange={e => setContrato("objetoSocial", e.target.value)} rows={3} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                </div>
              </div>
            </div>

            {/* Secao SCR */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-warning inline-block" /> Perfil de Credito</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ["Total Dividas (R$)", "totalDividasAtivas"], ["Classificacao Risco", "classificacaoRisco"],
                  ["A Vencer (R$)", "operacoesAVencer"], ["Em Atraso", "operacoesEmAtraso"],
                  ["Vencidas (R$)", "operacoesVencidas"], ["Tempo Atraso", "tempoAtraso"],
                  ["Prejuizos", "prejuizos"], ["Coobrigacoes", "coobrigacoes"],
                  ["Carteira a Vencer", "carteiraAVencer"], ["Vencidos", "vencidos"],
                  ["Limite Credito", "limiteCredito"], ["Historico", "historicoInadimplencia"],
                ] as [string, keyof typeof data.scr][]).map(([label, key]) => (
                  <div key={key as string} className={key === "historicoInadimplencia" ? "col-span-2" : ""}>
                    <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                    {key === "historicoInadimplencia"
                      ? <textarea value={data.scr[key] as string} onChange={e => setSCR(key, e.target.value)} rows={2} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                      : <input value={data.scr[key] as string} onChange={e => setSCR(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Secao Parecer */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" /> Parecer Final</p>
              <div>
                <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Resumo do Risco / Parecer</label>
                <textarea value={data.resumoRisco} onChange={e => setResumoRisco(e.target.value)} rows={4} className="input-field py-1.5 text-xs mt-0.5 resize-none" placeholder="Descreva o parecer final sobre a empresa analisada..." />
              </div>
            </div>
          </div>
        )}
      </div>


      {/* ── Observações do Analista ── */}
      <div id="sec-nt" className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #2d4f8a", boxShadow: "0 4px 20px rgba(32,59,136,0.12)" }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
            <span className="text-sm font-bold text-white">✎</span>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">Observações do Analista</p>
            <p className="text-sm font-bold text-white">Anotações livres no PDF</p>
          </div>
          {savingNotes && <span className="text-[10px] font-medium text-white/50 animate-pulse">Salvando...</span>}
        </div>
        <div className="p-4">
          <textarea
            value={analystNotes}
            onChange={e => setAnalystNotes(e.target.value)}
            onBlur={() => saveNotes(analystNotes)}
            placeholder="Registre aqui observações sobre a empresa, pontos de atenção identificados na visita, pendências de documentação, ou qualquer informação relevante para a tomada de decisão de crédito..."
            className="w-full text-sm text-cf-text-1 bg-cf-bg/50 border border-cf-border rounded-xl px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-cf-navy/20 focus:border-cf-navy/40 placeholder:text-cf-text-4"
            style={{ minHeight: "200px" }}
          />
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <span className="text-[10px] text-[#9CA3AF]">As anotações são salvas automaticamente ao sair do campo</span>
            <span className="text-[10px] font-mono text-[#9CA3AF]">{analystNotes.length} caracteres</span>
          </div>
        </div>
      </div>

      {/* ── Download & Acoes ── */}
      <div id="sec-ex" className="space-y-4 pt-1">
        {generatedFormats.size > 0 && (
          <div className="flex items-center justify-center gap-2.5 py-3 rounded-xl border"
            style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)", borderColor: "#86efac" }}>
            <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
            <span className="text-sm font-semibold" style={{ color: "#15803d" }}>
              Relatório gerado com sucesso!
            </span>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-4 border-b border-[#E5E7EB]" style={{ background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)" }}>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.12em]">Exportar Relatório</p>
            <p className="text-sm font-bold text-white mt-0.5">Selecione o formato de download</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { fmt: "pdf" as Format, label: "PDF", sub: "Completo e formatado", fn: generatePDF, ext: ".pdf", color: "#FF0000", recommended: true,
                  logo: <svg viewBox="0 0 24 24" width="28" height="28" fill="#FF0000"><path d="M7.998 17.5c-.21 0-.42-.072-.588-.218-.397-.345-.44-.95-.095-1.348.862-.993 2.13-2.543 2.13-2.543s-1.07-3.475-.544-4.95c.218-.609.613-1.066 1.16-1.14.263-.035.672.007.89.3.367.498.377 1.267.027 2.42-.223.738-.532 1.576-.891 2.422.452.97 1.09 1.877 1.618 2.46.88-.12 1.64-.143 2.18-.015.509.12.889.439.989.836.108.427-.045.893-.413 1.26-.382.38-.897.488-1.35.288-.56-.247-1.164-.76-1.735-1.376-.898.236-1.884.568-2.756.923-.506.9-.996 1.584-1.47 1.87a.797.797 0 0 1-.452.141l.1-.03zm.558-1.04s-.005.008-.01.013l.01-.014zm6.553-2.865-.029-.006.036.01-.007-.004zm-3.3-6.47-.005.02.009-.028-.004.009z"/></svg> },
                { fmt: "docx" as Format, label: "Word", sub: "Editável (.docx)", fn: generateDOCX, ext: ".docx", color: "#2B5EB7", recommended: false,
                  logo: <Image src="/logos/word.jpg" alt="Word" width={36} height={36} className="rounded object-contain" /> },
                { fmt: "xlsx" as Format, label: "Excel", sub: "Dados tabulados", fn: generateExcel, ext: ".xlsx", color: "#1D6F42", recommended: false,
                  logo: <Image src="/logos/excel.jpg" alt="Excel" width={36} height={36} className="rounded object-contain" /> },
                { fmt: "html" as Format, label: "HTML", sub: "Web / impressão", fn: generateHTML, ext: ".html", color: "#E34F26", recommended: false,
                  logo: <svg viewBox="0 0 24 24" width="28" height="28" fill="#E34F26"><path d="M4.136 3.012h15.729l-1.431 16.15L11.991 21l-6.436-1.838L4.136 3.012zM7.266 9.76l-.186-2.166h9.835l-.191 2.166H12.17l.204 2.256h4.345l-.543 5.508L12 18.903v.012l-.008.002-4.161-1.162-.287-3.166h2.147l.149 1.62 2.16.573 2.148-.57.237-2.529H7.46L7.266 9.76z"/></svg> },
              ]).map(({ fmt, label, sub, fn, ext, color, logo, recommended }) => {
                const done = generatedFormats.has(fmt);
                const loading = generatingFormat === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={fn}
                    disabled={!!generatingFormat}
                    className={`relative flex flex-col items-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group
                      ${done
                        ? "border-[#73b815]/40 bg-[#f0fdf4]"
                        : recommended
                        ? "border-[#203b88]/40 bg-[#EFF6FF]"
                        : "border-[#E5E7EB] bg-white hover:border-[#203b88]/20 hover:bg-[#F8FAFC]"
                      }`}
                  >
                    {recommended && !done && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white bg-[#203b88] px-2 py-0.5 rounded-full whitespace-nowrap">Recomendado</span>
                    )}
                    {/* Ícone */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
                      style={{ backgroundColor: done ? "#f0fdf4" : `${color}10`, border: `1.5px solid ${done ? "#73b815" : color}22` }}
                    >
                      {loading
                        ? <Loader2 size={22} className="animate-spin" style={{ color }} />
                        : done
                        ? <CheckCircle2 size={22} style={{ color: "#73b815" }} />
                        : logo}
                    </div>
                    {/* Texto */}
                    <div className="text-center">
                      <p className="text-sm font-bold text-[#111827]">{label}</p>
                      <p className="text-[10px] text-[#9CA3AF] font-mono">{ext}</p>
                    </div>
                    <p className="text-[10px] font-medium text-center leading-snug" style={{ color: done ? "#73b815" : loading ? color : "#6B7280" }}>
                      {loading ? "Gerando..." : done ? "Pronto!" : sub}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Sticky bottom action bar ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E5E7EB]" style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
          <div className="max-w-screen-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
            {/* Esquerda: navegação */}
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="btn-secondary" style={{ minHeight: "auto", padding: "8px 16px", fontSize: "13px" }}>
                <ArrowLeft size={13} /> Voltar
              </button>
              {onReset && (
                <button
                  onClick={() => { try { localStorage.removeItem(NOTES_KEY); } catch { /* ignore */ } onReset(); }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#9CA3AF] hover:text-[#374151] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#F3F4F6]"
                  style={{ minHeight: "auto" }}
                >
                  <RotateCcw size={12} /> Recomeçar
                </button>
              )}
            </div>

            {/* Centro: status pill */}
            <div className="flex items-center gap-2">
              {savedFeedback && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[#73b815] bg-[#f0fdf4] border border-[#86efac] px-2.5 py-1 rounded-full">
                  <Check size={11} /> Salvo
                </span>
              )}
              {generatedFormats.size > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#86efac] px-2.5 py-1 rounded-full">
                  <CheckCircle2 size={11} /> {generatedFormats.size} formato{generatedFormats.size > 1 ? "s" : ""} gerado{generatedFormats.size > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Direita: ações principais */}
            <div className="flex items-center gap-2.5">
              <GoalfyButton data={data} aiAnalysis={aiAnalysis} settings={fundSettings} disabled={!aiAnalysis} />

              {!confirmFinish ? (
                <button
                  onClick={() => setConfirmFinish(true)}
                  disabled={finishing}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-lg text-white active:scale-95 transition-all duration-150 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #5a9010 0%, #73b815 100%)",
                    boxShadow: "0 4px 14px rgba(115,184,21,0.35)",
                    minHeight: "auto",
                  }}
                >
                  {finishing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {finishing ? "Finalizando..." : "Finalizar coleta"}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 border border-[#73b815]/30 rounded-lg px-3.5 py-2 bg-[#f0fdf4]">
                  <span className="text-xs text-[#374151] font-medium">Confirmar?</span>
                  <button onClick={handleFinish} className="text-xs font-bold text-[#73b815] hover:underline" style={{ minHeight: "auto" }}>Sim</button>
                  <span className="text-[#9CA3AF] text-xs">·</span>
                  <button onClick={() => setConfirmFinish(false)} className="text-xs text-[#6B7280] hover:underline" style={{ minHeight: "auto" }}>Não</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      </div>
    </div>
  );
}
