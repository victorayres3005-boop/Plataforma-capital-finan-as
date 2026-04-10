"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Pencil, RotateCcw, ArrowRight } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SectionCard, KpiCard, StatusPill, CriteriaItem, MetricBarChart, ScrTable, AlertBanner, ResultadoBox } from "@/components/report/ReportComponents";

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

export default function GenerateStep({ data: initialData, originalFiles, onBack, onReset, onNotify: _onNotify, onFirstCollection: _onFirstCollection }: GenerateStepProps) {
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
      // Salva o JSONB completo E as colunas denormalizadas que alimentam o dashboard
      await supabase
        .from("document_collections")
        .update({
          ai_analysis: analysis as unknown as Record<string, unknown>,
          rating: analysis.rating ?? null,
          decisao: (analysis.decisao as DocumentCollection["decisao"]) ?? null,
        })
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
  const [finishing, setFinishing] = useState(false);

  // Helper: campos desnormalizados para a tabela
  // IMPORTANTE: só inclui rating/decisao quando aiAnalysis está disponível,
  // para não sobrescrever valores existentes no banco durante o auto-save inicial.
  const getCollectionMeta = () => {
    const mediaStr = data.faturamento.mediaAno || "0";
    const fmm = parseFloat(mediaStr.replace(/\./g, "").replace(",", ".")) || null;
    const base = {
      company_name: data.cnpj.razaoSocial || null,
      cnpj: data.cnpj.cnpj || null,
      fmm_12m: fmm,
    };
    if (!aiAnalysis) return base;
    return {
      ...base,
      rating: aiAnalysis.rating ?? null,
      decisao: (aiAnalysis.decisao as DocumentCollection["decisao"]) ?? null,
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

  const handleGoToParecer = async () => {
    setFinishing(true);
    try {
      let id = collectionId;
      if (!id) {
        id = await handleSave();
      }
      if (!id) throw new Error("Não foi possível salvar a coleta");
      window.location.href = `/parecer?id=${id}`;
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Verifique a conexão"));
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

  const qsaCount = data.qsa.quadroSocietario.filter(s => s.nome).length;

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
    <div className="max-w-5xl mx-auto w-full px-6 sm:px-8 animate-slide-up flex gap-6 items-start">

      {/* ── Sidebar de navegação (desktop) ── */}
      <nav className="hidden lg:flex flex-col gap-0.5 w-[188px] flex-shrink-0 sticky top-4 self-start">
        <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.14em", padding: "0 10px", marginBottom: 6 }}>Seções</p>
        {navItems.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="hover:text-cf-navy group"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "var(--text-2)", textDecoration: "none", transition: "background 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={e => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          >
            <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--ds-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--text-3)", flexShrink: 0 }}>
              {item.icon}
            </span>
            <span className="leading-snug">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 min-w-0 pb-28" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ════════════════════════════════════════
            SEÇÃO 00 — SUMÁRIO EXECUTIVO
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-00"
          badge="00"
          badgeVariant="navy"
          sectionLabel="Análise de Crédito"
          title="Sumário Executivo"
          headerRight={
            <StatusPill
              label={decision}
              variant={decision === "APROVADO" ? "green" : decision === "REPROVADO" ? "red" : "yellow"}
              dot
            />
          }
        >
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Alert banner: SCR vencidos ou prejuízos */}
            {(vencidosSCR > 0 || prejuizosVal > 0) && (
              <AlertBanner
                variant="danger"
                label="SCR"
                message={
                  vencidosSCR > 0 && prejuizosVal > 0
                    ? `Operações vencidas (R$ ${data.scr.vencidos}) e prejuízos (R$ ${data.scr.prejuizos}) detectados`
                    : vencidosSCR > 0
                    ? `Operações vencidas: R$ ${data.scr.vencidos}`
                    : `Prejuízos registrados: R$ ${data.scr.prejuizos}`
                }
              />
            )}

            {/* 4 KPI cards */}
            <div className="kpi-grid">
              <KpiCard
                label="Rating"
                value={`${finalRating}/10`}
                sub={finalRating >= 7 ? "Perfil saudável" : finalRating >= 4 ? "Atenção recomendada" : "Perfil crítico"}
                variant={decision === "APROVADO" ? "success" : decision === "REPROVADO" ? "danger" : "warning"}
              />
              <KpiCard
                label="Dívida Total"
                value={dividaAtiva > 0 ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
                sub="SCR / Bacen"
                variant={dividaAtiva > 1000000 ? "warning" : "default"}
              />
              <KpiCard
                label="Protestos"
                value={String(protestosVigentes)}
                sub="vigentes"
                variant={protestosVigentes > 0 ? "danger" : "success"}
              />
              <KpiCard
                label="Proc. Passivos"
                value={data.processos ? (parseInt(data.processos.poloPassivoQtd || "0") > 0 ? String(parseInt(data.processos.poloPassivoQtd || "0")) : "—") : "—"}
                sub="polo passivo"
                variant={data.processos && parseInt(data.processos.poloPassivoQtd || "0") > 0 ? "warning" : "default"}
              />
            </div>

            {/* Info row 1: Empresa, CNPJ, Situação, Idade, Sócios */}
            <div style={{ borderTop: "0.5px solid var(--ds-border-t)", paddingTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px 20px" }}>
                {([
                  { label: "Empresa",     value: data.cnpj.razaoSocial || "—" },
                  { label: "CNPJ",        value: data.cnpj.cnpj || "—" },
                  { label: "Situação",    value: data.cnpj.situacaoCadastral || "—" },
                  { label: "Idade",       value: companyAge || "—" },
                  { label: "Sócios (QSA)", value: String(qsaCount) },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 3 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-1)" }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Info row 2: Capital, Fat. Anual, Em Atraso, Prejuízos */}
            <div style={{ borderTop: "0.5px solid var(--ds-border-t)", paddingTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px 20px" }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 3 }}>Capital Social</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-1)" }}>{data.qsa.capitalSocial || data.contrato.capitalSocial || "—"}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 3 }}>Fat. Anual</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-1)" }}>{data.faturamento.somatoriaAno ? `R$ ${data.faturamento.somatoriaAno}` : "—"}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 3 }}>Em Atraso</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: atraso > 0 ? "var(--ds-danger-text)" : "var(--text-1)" }}>{atraso > 0 ? `R$ ${data.scr.operacoesEmAtraso}` : "—"}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 3 }}>Prejuízos</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: prejuizosVal > 0 ? "var(--ds-danger-text)" : "var(--text-1)" }}>{prejuizosVal > 0 ? `R$ ${data.scr.prejuizos}` : "—"}</p>
                </div>
              </div>
            </div>

            {/* IA: loading */}
            {analyzingAI && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--ds-surface-2)", borderRadius: "var(--ds-radius-md)" }}>
                <Loader2 size={14} className="animate-spin" style={{ color: "var(--navy)", flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>Analisando com IA...</p>
                  {analysisStatus && <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{analysisStatus}</p>}
                </div>
              </div>
            )}

            {/* IA: erro */}
            {!analyzingAI && analysisError && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "var(--ds-danger-bg)", border: "0.5px solid var(--ds-danger-border)", borderRadius: "var(--ds-radius-md)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={14} style={{ color: "var(--ds-danger-text)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--ds-danger-text)" }}>{analysisError}</span>
                </div>
                <button
                  onClick={handleReanalyze}
                  style={{ fontSize: 12, fontWeight: 600, color: "white", background: "var(--ds-danger-text)", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* IA: badges de contexto */}
            {aiAnalysis && !analyzingAI && (
              <>
                {aiAnalysis.coberturaAnalise && aiAnalysis.coberturaAnalise.nivel !== "completa" && (() => {
                  const ausentes = aiAnalysis.coberturaAnalise!.documentos.filter(d => !d.presente).map(d => d.label);
                  return ausentes.length > 0 ? (
                    <AlertBanner variant="warn" label="Análise Parcial" message={`Documentos ausentes: ${ausentes.join(", ")}. Score calculado com dados disponíveis.`} />
                  ) : null;
                })()}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {analysisFromCache && (
                    <span style={{ fontSize: 11, color: "var(--text-4)", marginRight: 12 }}>Análise carregada do cache</span>
                  )}
                  <button onClick={handleReanalyze} disabled={analyzingAI} style={{ fontSize: 11, color: "var(--text-4)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Reanalisar
                  </button>
                </div>
              </>
            )}

            {/* Alertas */}
            {alerts.length > 0 && <AlertList alerts={alerts} />}

            {/* Resumo executivo */}
            {resumoExecutivo && (
              <div style={{ padding: "14px 16px", background: "#eff6ff", border: "0.5px solid #bfdbfe", borderRadius: "var(--ds-radius-md)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#1d4ed8", marginBottom: 6 }}>Resumo Executivo</p>
                <p style={{ fontSize: 12, color: "#1e40af", lineHeight: 1.65 }}>{resumoExecutivo}</p>
              </div>
            )}

            {/* Pontos fortes */}
            {pontosFortes.length > 0 && (
              <div style={{ padding: "14px 16px", background: "var(--ds-success-bg)", border: "0.5px solid var(--ds-success-border)", borderRadius: "var(--ds-radius-md)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ds-success-text)", marginBottom: 8 }}>
                  Pontos Fortes ({pontosFortes.length})
                </p>
                {pontosFortes.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                    <CheckCircle2 size={12} style={{ color: "var(--ds-success-text)", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 12, color: "var(--ds-success-text)" }}>{p}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pontos fracos */}
            {pontosFracos.length > 0 && (
              <div style={{ padding: "14px 16px", background: "var(--ds-danger-bg)", border: "0.5px solid var(--ds-danger-border)", borderRadius: "var(--ds-radius-md)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ds-danger-text)", marginBottom: 8 }}>
                  Pontos Fracos ({pontosFracos.length})
                </p>
                {pontosFracos.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                    <AlertTriangle size={12} style={{ color: "var(--ds-danger-text)", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 12, color: "var(--ds-danger-text)" }}>{p}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Perguntas para visita */}
            {perguntasVisita.length > 0 && (
              <div style={{ padding: "14px 16px", background: "var(--ds-warning-bg)", border: "0.5px solid var(--ds-warning-border)", borderRadius: "var(--ds-radius-md)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ds-warning-text)", marginBottom: 8 }}>
                  Perguntas para Visita ({perguntasVisita.length})
                </p>
                {perguntasVisita.map((q, i) => (
                  <div key={i} style={{ marginTop: i > 0 ? 10 : 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-warning-text)" }}>{i + 1}. {q.pergunta}</p>
                    <p style={{ fontSize: 11, color: "#78350f", marginTop: 3 }}>{q.contexto}</p>
                  </div>
                ))}
              </div>
            )}

          </div>
        </SectionCard>

        {/* ── Editar dados do relatório (collapsible) ── */}
        <div className="bg-white overflow-hidden" style={{ border: "0.5px solid var(--ds-border-t)", borderRadius: "var(--ds-radius-lg)" }}>
          <button
            onClick={() => setEditing(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div style={{ width: 32, height: 32, borderRadius: "var(--ds-radius-md)", background: editing ? "var(--navy)" : "var(--ds-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}>
                <Pencil size={14} style={{ color: editing ? "white" : "var(--text-3)" }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>Editar dados do relatório</p>
                <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 1 }}>Ajuste os campos antes de gerar</p>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 99, background: editing ? "var(--navy)" : "var(--ds-surface-2)", color: editing ? "white" : "var(--text-3)", transition: "all 0.2s" }}>
              {editing ? "Fechar" : "Abrir"}
            </span>
          </button>

          {editing && (
            <div style={{ borderTop: "0.5px solid var(--ds-border-t)", padding: "16px 20px 20px" }} className="animate-fade-in space-y-5">
              {/* Identificação */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--navy)", display: "inline-block" }} />
                  Identificação da Empresa
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Razão Social", "razaoSocial"], ["Nome Fantasia", "nomeFantasia"], ["CNPJ", "cnpj"],
                    ["Data Abertura", "dataAbertura"], ["Situação", "situacaoCadastral"], ["Data Situação", "dataSituacaoCadastral"],
                    ["Motivo Situação", "motivoSituacao"], ["Natureza Jurídica", "naturezaJuridica"],
                    ["CNAE Principal", "cnaePrincipal"], ["Porte", "porte"], ["Capital Social", "capitalSocialCNPJ"],
                    ["Endereço", "endereco"], ["Telefone", "telefone"], ["E-mail", "email"],
                  ] as [string, keyof typeof data.cnpj][]).map(([label, key]) => (
                    <div key={key} className={key === "razaoSocial" || key === "endereco" || key === "naturezaJuridica" || key === "cnaePrincipal" ? "col-span-2" : ""}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      <input value={data.cnpj[key]} onChange={e => setCNPJ(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Estrutura Societária */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                  Estrutura Societária
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([["Capital Social", "capitalSocial"], ["Data Constituição", "dataConstituicao"]] as [string, keyof typeof data.contrato][]).map(([label, key]) => (
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

              {/* Perfil de Crédito */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warning)", display: "inline-block" }} />
                  Perfil de Crédito
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Total Dívidas (R$)", "totalDividasAtivas"], ["Classificação Risco", "classificacaoRisco"],
                    ["A Vencer (R$)", "operacoesAVencer"], ["Em Atraso", "operacoesEmAtraso"],
                    ["Vencidas (R$)", "operacoesVencidas"], ["Tempo Atraso", "tempoAtraso"],
                    ["Prejuízos", "prejuizos"], ["Coobrigações", "coobrigacoes"],
                    ["Carteira a Vencer", "carteiraAVencer"], ["Vencidos", "vencidos"],
                    ["Limite Crédito", "limiteCredito"], ["Histórico", "historicoInadimplencia"],
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

              {/* Parecer */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--navy)", display: "inline-block" }} />
                  Parecer Final
                </p>
                <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Resumo do Risco / Parecer</label>
                <textarea value={data.resumoRisco} onChange={e => setResumoRisco(e.target.value)} rows={4} className="input-field py-1.5 text-xs mt-0.5 resize-none" placeholder="Descreva o parecer final sobre a empresa analisada..." />
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
            SEÇÃO FS — PARÂMETROS DO FUNDO
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-fs"
          badge="FS"
          badgeVariant="navy"
          sectionLabel="Critérios de Elegibilidade"
          title="Parâmetros do Fundo"
          headerRight={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {fundPresets.length > 0 && (
                <select
                  value={selectedPresetId ?? "active"}
                  onChange={e => setSelectedPresetId(e.target.value)}
                  style={{ fontSize: 11, fontWeight: 500, color: "var(--text-2)", background: "var(--ds-surface-2)", border: "0.5px solid var(--ds-border-s)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", outline: "none", maxWidth: 160 }}
                >
                  <option value="active">Configurações Ativas</option>
                  {fundPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {fundValidation.failCount > 0 && (
                <StatusPill label={`${fundValidation.failCount} reprovado${fundValidation.failCount !== 1 ? "s" : ""}`} variant="red" />
              )}
              {fundValidation.warnCount > 0 && (
                <StatusPill label={`${fundValidation.warnCount} atenção`} variant="yellow" />
              )}
              <StatusPill
                label={`${fundValidation.passCount}/${fundValidation.criteria.length} ok`}
                variant={fundValidation.failCount > 0 ? "red" : fundValidation.warnCount > 0 ? "yellow" : "green"}
              />
            </div>
          }
        >
          {/* Critérios */}
          <div style={{ borderBottom: "0.5px solid var(--ds-border-t)" }}>
            {fundValidation.criteria.map((c, idx) => (
              <div key={c.id} style={{ borderTop: idx > 0 ? "0.5px solid var(--ds-border-t)" : "none" }}>
                <CriteriaItem
                  status={c.status}
                  name={c.label}
                  eliminatorio={c.eliminatoria}
                  limit={c.threshold}
                  value={c.actual}
                  detail={c.detail}
                />
              </div>
            ))}
          </div>

          {/* Resultado + detalhes LC */}
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <ResultadoBox
              title={
                creditLimit.classificacao === "REPROVADO"
                  ? "Empresa não elegível para este perfil"
                  : `Limite sugerido: R$ ${Math.round(creditLimit.limiteAjustado).toLocaleString("pt-BR")}`
              }
              sub={
                creditLimit.classificacao === "REPROVADO"
                  ? `${fundValidation.failCount} critério(s) eliminatório(s) não atendido(s)`
                  : creditLimit.classificacao === "CONDICIONAL"
                  ? `Reduzido 30% por ${fundValidation.warnCount} critério(s) de atenção — perfil "${selectedPresetName}"`
                  : `Todos os ${fundValidation.passCount} critérios atendidos — perfil "${selectedPresetName}"`
              }
              badge={creditLimit.classificacao === "CONDICIONAL" ? "APROVAÇÃO CONDICIONAL" : creditLimit.classificacao}
              variant={creditLimit.classificacao === "APROVADO" ? "aprovado" : creditLimit.classificacao === "REPROVADO" ? "reprovado" : "pendente"}
            />

            {creditLimit.classificacao !== "REPROVADO" && (
              <div className="kpi-grid">
                <KpiCard
                  label="Prazo máximo"
                  value={`${creditLimit.prazo} dias`}
                  sub={creditLimit.classificacao === "APROVADO" ? "Aprovado" : "Condicional"}
                />
                <KpiCard
                  label="Revisão em"
                  value={new Date(creditLimit.dataRevisao).toLocaleDateString("pt-BR")}
                  sub={`em ${creditLimit.revisaoDias} dias`}
                />
                <KpiCard
                  label="Conc. máx./sacado"
                  value={`R$ ${Math.round(creditLimit.limiteConcentracao).toLocaleString("pt-BR")}`}
                  sub={`${creditLimit.concentracaoMaxPct}% do limite`}
                />
                <KpiCard
                  label="Base de cálculo"
                  value={`R$ ${Math.round(creditLimit.fmmBase).toLocaleString("pt-BR")}`}
                  sub={`FMM × ${creditLimit.fatorBase}x`}
                />
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedPresetColor, display: "inline-block" }} />
                <span style={{ fontSize: 11, color: "var(--text-4)" }}>{selectedPresetName}</span>
              </div>
              <a href="/configuracoes" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", textDecoration: "none" }}>
                Gerenciar perfis →
              </a>
            </div>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════
            SEÇÃO 05 — SCR / BACEN
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-05"
          badge="05"
          badgeVariant="navy"
          sectionLabel="Perfil de Crédito"
          title="SCR / Bacen"
        >
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

            {data.scr.semHistorico && (
              <AlertBanner variant="warn" label="Sem histórico bancário" message="Empresa sem operações registradas no SCR / Banco Central" />
            )}

            {/* KPIs linha 1 */}
            <div className="kpi-grid">
              <KpiCard
                label="Total Dívidas"
                value={dividaAtiva > 0 ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
                variant={dividaAtiva > 1000000 ? "warning" : "default"}
              />
              <KpiCard
                label="A Vencer"
                value={data.scr.carteiraAVencer ? `R$ ${data.scr.carteiraAVencer}` : "—"}
              />
              <KpiCard
                label="Vencidos"
                value={vencidosSCR > 0 ? `R$ ${data.scr.vencidos}` : "—"}
                variant={vencidosSCR > 0 ? "danger" : "default"}
              />
              <KpiCard
                label="Prejuízos"
                value={prejuizosVal > 0 ? `R$ ${data.scr.prejuizos}` : "—"}
                variant={prejuizosVal > 0 ? "danger" : "default"}
              />
            </div>

            {/* KPIs linha 2 */}
            <div className="kpi-grid">
              <KpiCard label="Op. a Vencer" value={data.scr.operacoesAVencer ? `R$ ${data.scr.operacoesAVencer}` : "—"} />
              <KpiCard
                label="Em Atraso"
                value={atraso > 0 ? `R$ ${data.scr.operacoesEmAtraso}` : "—"}
                variant={atraso > 0 ? "warning" : "default"}
              />
              <KpiCard
                label="Vencidas"
                value={vencidas > 0 ? `R$ ${data.scr.operacoesVencidas}` : "—"}
                variant={vencidas > 0 ? "danger" : "default"}
              />
              <KpiCard label="Coobrigações" value={data.scr.coobrigacoes ? `R$ ${data.scr.coobrigacoes}` : "—"} />
            </div>

            {/* KPIs linha 3 */}
            <div className="kpi-grid">
              <KpiCard label="Curto Prazo" value={data.scr.carteiraCurtoPrazo ? `R$ ${data.scr.carteiraCurtoPrazo}` : "—"} />
              <KpiCard label="Longo Prazo" value={data.scr.carteiraLongoPrazo ? `R$ ${data.scr.carteiraLongoPrazo}` : "—"} />
              <KpiCard label="Limite de Crédito" value={data.scr.limiteCredito ? `R$ ${data.scr.limiteCredito}` : "—"} />
            </div>

            {/* Modalidades */}
            {data.scr.modalidades.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 8 }}>Modalidades de Crédito</p>
                <div style={{ border: "0.5px solid var(--ds-border-s)", borderRadius: "var(--ds-radius-md)", overflow: "hidden" }}>
                  <ScrTable
                    columns={["Modalidade", "Total", "A Vencer", "Vencido", "Part."]}
                    rows={data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido, m.participacao])}
                  />
                </div>
              </div>
            )}

            {/* Instituições */}
            {data.scr.instituicoes.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 8 }}>Instituições Credoras</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.scr.instituicoes.map((inst, i) => (
                    <span key={i} style={{ background: "var(--ds-surface-2)", color: "var(--text-2)", fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6 }}>
                      {inst.nome}: R$ {inst.valor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Inadimplência */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 8 }}>Histórico de Inadimplência</p>
              {data.scr.historicoInadimplencia ? (
                <AlertBanner variant="warn" label="Histórico" message={data.scr.historicoInadimplencia} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "var(--ds-success-bg)", border: "0.5px solid var(--ds-success-border)", borderRadius: "var(--ds-radius-md)" }}>
                  <CheckCircle2 size={14} style={{ color: "var(--ds-success-text)", flexShrink: 0 }} />
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--ds-success-text)" }}>Sem registro de operações vencidas ou prejuízos</p>
                </div>
              )}
            </div>

          </div>
        </SectionCard>

        {/* ════════════════════════════════════════
            SEÇÃO 07 — PROCESSOS JUDICIAIS
            ════════════════════════════════════════ */}
        {data.processos && (parseInt(data.processos.passivosTotal || "0") > 0 || data.processos.temRJ || (data.processos.distribuicao?.length ?? 0) > 0) && (() => {
          const proc = data.processos!;
          const passivosN  = parseInt(proc.passivosTotal  || "0");
          const ativosN    = parseInt(proc.ativosTotal    || "0");
          if (passivosN === 0 && ativosN === 0 && !proc.temRJ) return null;
          const poloAtivoN = parseInt(proc.poloAtivoQtd  || "0");
          const poloPassN  = parseInt(proc.poloPassivoQtd || "0");
          const dividasN   = parseInt(proc.dividasQtd    || "0");
          return (
            <SectionCard
              id="sec-07"
              badge="07"
              badgeVariant="navy"
              sectionLabel="Processos Judiciais"
              title="Credit Hub"
              headerRight={proc.temRJ ? <StatusPill label="RECUPERAÇÃO JUDICIAL" variant="red" /> : undefined}
            >
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

                <div className="kpi-grid">
                  <KpiCard label="Total Processos" value={passivosN > 0 ? String(passivosN) : "—"} sub="todos os polos" variant={passivosN > 0 ? "warning" : "default"} />
                  <KpiCard label="Polo Ativo"      value={poloAtivoN > 0 ? String(poloAtivoN) : "—"} sub="empresa autora" />
                  <KpiCard label="Polo Passivo"    value={poloPassN > 0 ? String(poloPassN) : "—"} sub="empresa ré" variant={poloPassN > 0 ? "warning" : "default"} />
                  <KpiCard label="Dívidas"         value={dividasN > 0 ? String(dividasN) : "—"} sub="vencidas" variant={dividasN > 0 ? "danger" : "default"} />
                </div>

                {proc.valorTotalEstimado && proc.valorTotalEstimado !== "0,00" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--ds-warning-bg)", border: "0.5px solid var(--ds-warning-border)", borderRadius: "var(--ds-radius-md)" }}>
                    <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ds-warning-text)" }}>Valor Total Estimado</p>
                    <p style={{ fontSize: 20, fontWeight: 500, color: "var(--ds-warning-text)" }}>R$ {proc.valorTotalEstimado}</p>
                  </div>
                )}

                {(proc.distribuicao?.length ?? 0) > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 10 }}>Distribuição por Tipo</p>
                    <MetricBarChart
                      items={proc.distribuicao!.slice(0, 8).map(d => ({
                        label: d.tipo,
                        count: Number(d.qtd),
                        pct: Number(d.pct),
                        highlight: /execu|falên/i.test(d.tipo),
                      }))}
                    />
                  </div>
                )}

                {(proc.distribuicaoTemporal?.length ?? 0) > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 10 }}>Antiguidade dos Processos</p>
                    <div className="kpi-grid">
                      {proc.distribuicaoTemporal!.map((dt, i) => (
                        <KpiCard key={i} label={dt.periodo} value={String(dt.qtd)} sub={`R$ ${dt.valor}`} />
                      ))}
                    </div>
                  </div>
                )}

                {proc.top10Valor && proc.top10Valor.filter(p => p.numero || p.tipo).length > 0 && (() => {
                  const reais = proc.top10Valor!.filter(p => (p.numero || p.tipo) && p.tipo !== "DÍVIDA");
                  if (reais.length === 0) return null;
                  return (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 10 }}>Maiores Processos por Valor</p>
                      <div style={{ border: "0.5px solid var(--ds-border-s)", borderRadius: "var(--ds-radius-md)", overflow: "hidden" }}>
                        <ScrTable
                          columns={["Número", "Tipo", "Data", "Valor", "Status"]}
                          rows={reais.slice(0, 5).map(p => [
                            <span key="n" style={{ fontFamily: "monospace", fontSize: 10 }}>{p.numero || "—"}</span>,
                            p.tipo || "—",
                            p.data || "—",
                            <span key="v" style={{ fontWeight: 500, color: "var(--ds-warning-text)" }}>R$ {p.valor}</span>,
                            p.status ? <StatusPill key="s" label={p.status.slice(0, 20)} variant="gray" /> : <span key="s" style={{ color: "var(--text-4)" }}>—</span>,
                          ])}
                        />
                      </div>
                    </div>
                  );
                })()}

              </div>
            </SectionCard>
          );
        })()}

        {/* ════════════════════════════════════════
            SEÇÃO OP — RELATÓRIO DE VISITA
            ════════════════════════════════════════ */}
        {data.relatorioVisita && (
          <SectionCard
            id="sec-op"
            badge="OP"
            badgeVariant="teal"
            sectionLabel="Parâmetros Operacionais"
            title="Relatório de Visita"
          >
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Taxas e Limites */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", paddingBottom: 8, marginBottom: 10, borderBottom: "0.5px solid var(--ds-border-t)" }}>Taxas e Limites</p>
                <div className="kpi-grid">
                  {([
                    ["Taxa Convencional",    data.relatorioVisita.taxaConvencional],
                    ["Taxa Comissária",      data.relatorioVisita.taxaComissaria],
                    ["Limite Total",         data.relatorioVisita.limiteTotal        ? `R$ ${data.relatorioVisita.limiteTotal}` : ""],
                    ["Limite Convencional",  data.relatorioVisita.limiteConvencional ? `R$ ${data.relatorioVisita.limiteConvencional}` : ""],
                    ["Limite Comissária",    data.relatorioVisita.limiteComissaria   ? `R$ ${data.relatorioVisita.limiteComissaria}` : ""],
                    ["Limite por Sacado",    data.relatorioVisita.limitePorSacado    ? `R$ ${data.relatorioVisita.limitePorSacado}` : ""],
                    ["Ticket Médio",         data.relatorioVisita.ticketMedio        ? `R$ ${data.relatorioVisita.ticketMedio}` : ""],
                    ["Cobr. Boleto",         data.relatorioVisita.valorCobrancaBoleto ? `R$ ${data.relatorioVisita.valorCobrancaBoleto}` : ""],
                  ] as [string, string | undefined][]).map(([label, value]) => (
                    <KpiCard key={label} label={label} value={value || "—"} />
                  ))}
                </div>
              </div>

              {/* Condições e Prazos */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", paddingBottom: 8, marginBottom: 10, borderBottom: "0.5px solid var(--ds-border-t)" }}>Condições e Prazos</p>
                <div className="kpi-grid">
                  {([
                    ["Prazo Recompra",   data.relatorioVisita.prazoRecompraCedente ? `${data.relatorioVisita.prazoRecompraCedente} dias` : ""],
                    ["Envio Cartório",   data.relatorioVisita.prazoEnvioCartorio   ? `${data.relatorioVisita.prazoEnvioCartorio} dias` : ""],
                    ["Prazo Máximo Op.", data.relatorioVisita.prazoMaximoOp        ? `${data.relatorioVisita.prazoMaximoOp} dias` : ""],
                    ["Cobrança TAC",     data.relatorioVisita.cobrancaTAC],
                    ["Tranche",          data.relatorioVisita.tranche              ? `R$ ${data.relatorioVisita.tranche}` : ""],
                    ["Prazo Tranche",    data.relatorioVisita.prazoTranche         ? `${data.relatorioVisita.prazoTranche} dias` : ""],
                  ] as [string, string | undefined][]).map(([label, value]) => (
                    <KpiCard key={label} label={label} value={value || "—"} />
                  ))}
                </div>
              </div>

              {/* Mix de Vendas */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", paddingBottom: 8, marginBottom: 10, borderBottom: "0.5px solid var(--ds-border-t)" }}>Dados da Empresa</p>
                <div className="kpi-grid">
                  {([
                    ["Funcionários",        String(data.relatorioVisita.funcionariosObservados || "—")],
                    ["Folha Pagamento",     data.relatorioVisita.folhaPagamento         ? `R$ ${data.relatorioVisita.folhaPagamento}` : ""],
                    ["Endiv. Banco",        data.relatorioVisita.endividamentoBanco],
                    ["Endiv. Factoring",    data.relatorioVisita.endividamentoFactoring],
                    ["Vendas Cheque",       data.relatorioVisita.vendasCheque],
                    ["Vendas Duplicata",    data.relatorioVisita.vendasDuplicata],
                    ["Vendas Outras",       data.relatorioVisita.vendasOutras],
                    ["Prazo Faturamento",   data.relatorioVisita.prazoMedioFaturamento  ? `${data.relatorioVisita.prazoMedioFaturamento} dias` : ""],
                    ["Prazo Entrega",       data.relatorioVisita.prazoMedioEntrega      ? `${data.relatorioVisita.prazoMedioEntrega} dias` : ""],
                  ] as [string, string | undefined][]).map(([label, value]) => (
                    <KpiCard key={label} label={label} value={value || "—"} />
                  ))}
                </div>
                {data.relatorioVisita.referenciasFornecedores && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-4)", marginBottom: 4 }}>Referências Comerciais / Fornecedores</p>
                    <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{data.relatorioVisita.referenciasFornecedores}</p>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {/* ════════════════════════════════════════
            SEÇÃO ✎ — ANOTAÇÕES
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-nt"
          badge="✎"
          badgeVariant="navy"
          sectionLabel="Observações do Analista"
          title="Anotações"
          headerRight={savingNotes ? <span style={{ fontSize: 11, color: "var(--text-4)" }}>Salvando...</span> : undefined}
        >
          <div style={{ padding: "16px 20px" }}>
            <textarea
              value={analystNotes}
              onChange={e => setAnalystNotes(e.target.value)}
              onBlur={() => saveNotes(analystNotes)}
              placeholder="Registre aqui observações sobre a empresa, pontos de atenção identificados na visita, pendências de documentação, ou qualquer informação relevante para a tomada de decisão de crédito..."
              style={{
                width: "100%", minHeight: 180, resize: "vertical",
                background: "var(--ds-surface-2)",
                border: "0.5px solid var(--ds-border-t)",
                borderRadius: "var(--ds-radius-md)",
                padding: "12px 14px",
                fontSize: 13, color: "var(--text-1)", lineHeight: 1.65,
                fontFamily: "inherit", outline: "none",
              }}
              className="focus:ring-2 focus:ring-cf-navy/20 placeholder:text-cf-text-4"
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "0 2px" }}>
              <span style={{ fontSize: 11, color: "var(--text-4)" }}>Salvo automaticamente ao sair do campo</span>
              <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "monospace" }}>{analystNotes.length} caracteres</span>
            </div>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════
            SEÇÃO ↓ — EXPORTAR
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-ex"
          badge="↓"
          badgeVariant="navy"
          sectionLabel="Download"
          title="Exportar Relatório"
        >
          <div style={{ padding: "16px 20px" }}>
            {generatedFormats.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--ds-success-bg)", border: "0.5px solid var(--ds-success-border)", borderRadius: "var(--ds-radius-md)", marginBottom: 14 }}>
                <CheckCircle2 size={14} style={{ color: "var(--ds-success-text)" }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ds-success-text)" }}>Relatório gerado com sucesso!</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {([
                { fmt: "pdf"  as Format, label: "PDF",   sub: "Completo e formatado", fn: generatePDF,   ext: ".pdf",  dot: "#dc2626", recommended: true },
                { fmt: "docx" as Format, label: "Word",  sub: "Editável (.docx)",     fn: generateDOCX,  ext: ".docx", dot: "#2b5eb7", recommended: false },
                { fmt: "xlsx" as Format, label: "Excel", sub: "Dados tabulados",      fn: generateExcel, ext: ".xlsx", dot: "#1d6f42", recommended: false },
                { fmt: "html" as Format, label: "HTML",  sub: "Web / impressão",      fn: generateHTML,  ext: ".html", dot: "#e34f26", recommended: false },
              ]).map(({ fmt, label, sub, fn, ext, dot, recommended }) => {
                const done    = generatedFormats.has(fmt);
                const loading = generatingFormat === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={fn}
                    disabled={!!generatingFormat}
                    style={{
                      flex: "1 1 140px", display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 14px", borderRadius: "var(--ds-radius-md)",
                      border: `0.5px solid ${done ? "var(--ds-success-border)" : recommended ? "var(--navy)" : "var(--ds-border-s)"}`,
                      background: done ? "var(--ds-success-bg)" : recommended ? "#eff6ff" : "white",
                      cursor: !!generatingFormat ? "not-allowed" : "pointer",
                      opacity: !!generatingFormat && !loading ? 0.55 : 1,
                      transition: "all 0.15s",
                      position: "relative",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: done ? "var(--ds-success-text)" : dot, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>{label}</span>
                        <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "monospace" }}>{ext}</span>
                      </div>
                      <p style={{ fontSize: 11, color: loading ? dot : done ? "var(--ds-success-text)" : "var(--text-4)", marginTop: 2 }}>
                        {loading ? "Gerando..." : done ? "Pronto!" : sub}
                      </p>
                    </div>
                    {loading && <Loader2 size={14} className="animate-spin" style={{ color: dot, flexShrink: 0 }} />}
                    {done    && <CheckCircle2 size={14} style={{ color: "var(--ds-success-text)", flexShrink: 0 }} />}
                    {recommended && !done && (
                      <span style={{ position: "absolute", top: -9, right: 10, fontSize: 9, fontWeight: 700, color: "white", background: "var(--navy)", borderRadius: 99, padding: "2px 6px", letterSpacing: "0.03em" }}>
                        Recomendado
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* ── Sticky bottom action bar ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white" style={{ borderTop: "0.5px solid var(--ds-border-s)" }}>
          <div className="max-w-screen-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="btn-secondary" style={{ minHeight: "auto", padding: "8px 16px", fontSize: "13px" }}>
                <ArrowLeft size={13} /> Voltar
              </button>
              {onReset && (
                <button
                  onClick={() => { try { localStorage.removeItem(NOTES_KEY); } catch { /* ignore */ } onReset(); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-4)", background: "none", border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 6 }}
                >
                  <RotateCcw size={12} /> Recomeçar
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {savedFeedback && <StatusPill label="Salvo" variant="green" dot />}
              {generatedFormats.size > 0 && (
                <StatusPill
                  label={`${generatedFormats.size} formato${generatedFormats.size > 1 ? "s" : ""} gerado${generatedFormats.size > 1 ? "s" : ""}`}
                  variant="green"
                  dot
                />
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <GoalfyButton data={data} aiAnalysis={aiAnalysis} settings={fundSettings} disabled={!aiAnalysis} />
              <button
                onClick={handleGoToParecer}
                disabled={finishing}
                className="btn-green"
                style={{ minHeight: "auto", padding: "8px 18px", fontSize: "13px", display: "flex", alignItems: "center", gap: 6 }}
              >
                {finishing
                  ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                  : <>Registrar Parecer <ArrowRight size={13} /></>
                }
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

