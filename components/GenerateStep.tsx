"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, AlertCircle, Pencil, Check, X as XIcon, RotateCcw } from "lucide-react";
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
import { ExtractedData, CollectionDocument, DocumentCollection, FundSettings, DEFAULT_FUND_SETTINGS, AIAnalysis } from "@/types";
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
  if (data.faturamento.faturamentoZerado) {
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

  // ── Data Validation ──
  const validation = validateExtractedData(data);

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

  // ── Fund Settings ──
  const [fundSettings, setFundSettings] = useState<FundSettings>(DEFAULT_FUND_SETTINGS);
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: s } = await supabase.from("fund_settings").select("*").eq("user_id", user.id).maybeSingle();
        if (s) setFundSettings({ ...DEFAULT_FUND_SETTINGS, ...s });
      } catch { /* use defaults */ }
    };
    loadSettings();
  }, []);

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
    if (data.faturamento.faturamentoZerado) a.push({ message: "Faturamento zerado no período", severity: "ALTA" });
    if (!data.faturamento.dadosAtualizados) a.push({ message: "Faturamento desatualizado", severity: "MODERADA" });
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
  return (
    <div className="animate-slide-up space-y-5">

      {/* ══════════════════════════════════════════════════════
          CARD 00 — SUMARIO EXECUTIVO
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[#E5E7EB]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E5E7EB] rounded-t-xl">
          <div className="w-1 h-8 rounded-full bg-[#F59E0B]" />
          <span className="text-xs font-bold text-[#1E3A5F] uppercase tracking-[0.08em]">00</span>
          <span className="text-sm font-bold text-[#111827]">Sumario Executivo</span>
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
          <div className="grid grid-cols-3 gap-5">
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
          <div className="grid grid-cols-4 gap-5">
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
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CARD 05 — PERFIL DE CREDITO SCR/BACEN
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[#E5E7EB]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E5E7EB] rounded-t-xl">
          <div className="w-1 h-8 rounded-full bg-[#F59E0B]" />
          <span className="text-xs font-bold text-[#1E3A5F] uppercase tracking-[0.08em]">05</span>
          <span className="text-sm font-bold text-[#111827]">Perfil de Credito — SCR / BACEN</span>
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

      {/* ── Editar dados do relatorio ── */}
      <div className="card overflow-hidden">
        <button onClick={() => setEditing(p => !p)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-cf-bg transition-colors text-left group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cf-surface flex items-center justify-center group-hover:bg-cf-navy/10 transition-colors">
              <Pencil size={14} className="text-cf-navy" />
            </div>
            <div>
              <span className="text-sm font-semibold text-cf-text-1 block">Editar dados do relatorio</span>
              <span className="text-[11px] text-cf-text-3">Ajuste os campos antes de gerar</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-cf-navy bg-cf-surface px-3 py-1.5 rounded-full group-hover:bg-cf-navy group-hover:text-white transition-all">{editing ? "Fechar" : "Abrir"}</span>
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

      {/* ── Conteudo do relatorio ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-cf-border bg-cf-bg/50">
          <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest">Conteudo do relatorio</p>
        </div>
        <div className="p-4 space-y-2">
          {[
            { n: "01", title: "Identificacao da Empresa", desc: "Dados do Cartao CNPJ", color: "bg-cf-navy", bgLight: "bg-cf-navy/5" },
            { n: "02", title: "Quadro Societario (QSA)", desc: "Dados do QSA", color: "bg-cf-green", bgLight: "bg-cf-green/5" },
            { n: "03", title: "Contrato Social", desc: "Dados do Contrato Social", color: "bg-cf-navy", bgLight: "bg-cf-navy/5" },
            { n: "04", title: "Faturamento", desc: "Faturamento mensal e anual", color: "bg-cf-green", bgLight: "bg-cf-green/5" },
            { n: "05", title: "Perfil de Credito", desc: "Dados do SCR/Bacen", color: "bg-cf-warning", bgLight: "bg-cf-warning/5" },
            { n: "06", title: "Protestos", desc: "Protestos vigentes e regularizados", color: "bg-[#DC2626]", bgLight: "bg-red-50" },
            { n: "07", title: "Processos Judiciais", desc: "Processos ativos e bancarios", color: "bg-cf-warning", bgLight: "bg-cf-warning/5" },
            { n: "08", title: "Grupo Economico", desc: "Empresas do grupo", color: "bg-cf-navy", bgLight: "bg-cf-navy/5" },
            { n: "09", title: "Parecer Final", desc: "Decisao e resumo do risco", color: "bg-cf-navy", bgLight: "bg-cf-navy/5" },
          ].map(s => (
            <div key={s.n} className={`flex items-center gap-4 rounded-xl px-4 py-3.5 border border-cf-border/60 ${s.bgLight} transition-all hover:border-cf-border`}>
              <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center flex-shrink-0`}>
                <span className="text-xs font-bold text-white">{s.n}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-cf-text-1">{s.title}</p>
                <p className="text-xs text-cf-text-3">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Conferencia de dados ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-cf-border bg-cf-bg/50">
          <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest">Conferencia dos dados</p>
        </div>
        <div className="p-4 space-y-3">
          {/* Coverage bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-cf-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  validation.coverage.pct >= 70 ? "bg-cf-green" : validation.coverage.pct >= 40 ? "bg-amber-400" : "bg-red-400"
                }`}
                style={{ width: `${validation.coverage.pct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-cf-text-2 w-12 text-right">{validation.coverage.pct}%</span>
          </div>

          {/* Blocked */}
          {validation.coverage.pct < 40 && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-600">
                Dados insuficientes para analise confiavel ({validation.coverage.pct}% preenchido). Revise os documentos enviados.
              </p>
            </div>
          )}

          {/* Errors */}
          {validation.errors.length > 0 && (
            <div className="space-y-1.5">
              {validation.errors.map((e, i) => (
                <div key={`err-${i}`} className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                  <XIcon size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700">{e.message}</p>
                    <p className="text-[10px] text-red-400 mt-0.5">{e.document.toUpperCase()} — {e.field}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="space-y-1.5">
              {validation.warnings.map((w, i) => (
                <div key={`warn-${i}`} className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
                  <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700">{w.message}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5">{w.document.toUpperCase()} — {w.field}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All good */}
          {validation.errors.length === 0 && validation.warnings.length === 0 && (
            <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-green-700">
                Dados validados — {validation.coverage.pct}% dos campos preenchidos
              </p>
            </div>
          )}

          {/* Summary when has issues but valid */}
          {validation.errors.length === 0 && validation.warnings.length > 0 && validation.coverage.pct >= 40 && (
            <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
              <p className="text-[11px] font-medium text-green-700">
                {validation.coverage.pct}% preenchido — analise pode prosseguir com os alertas acima
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Observações do Analista ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-cf-border bg-cf-bg/50 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest">Observacoes do analista</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Anotacoes livres que aparecem no PDF e ficam salvas na coleta</p>
          </div>
          {savingNotes && <span className="text-[10px] text-cf-text-4 animate-pulse">Salvando...</span>}
        </div>
        <div className="p-4">
          <textarea
            value={analystNotes}
            onChange={e => setAnalystNotes(e.target.value)}
            onBlur={() => saveNotes(analystNotes)}
            placeholder="Ex: Empresa apresenta boa liquidez mas concentração elevada no cliente principal. Recomendo solicitar balanço atualizado antes da aprovação..."
            rows={4}
            className="w-full text-sm text-cf-text-1 bg-cf-bg/50 border border-cf-border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-cf-navy/20 focus:border-cf-navy/40 placeholder:text-cf-text-4"
          />
        </div>
      </div>

      {/* ── Download & Acoes ── */}
      <div className="space-y-4 pt-1">
        {generatedFormats.size > 0 && (
          <div className="flex items-center justify-center gap-2 py-2.5 bg-cf-green/5 rounded-xl border border-cf-green/20">
            <CheckCircle2 size={16} className="text-cf-green" />
            <span className="text-sm font-semibold text-cf-green">Relatorio gerado com sucesso!</span>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-cf-border bg-cf-bg/50">
            <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest">Formato de download</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { fmt: "pdf" as Format, label: "PDF", sub: "Baixar PDF", fn: generatePDF,
                  logo: <svg viewBox="0 0 24 24" width="36" height="36" fill="#FF0000"><path d="M7.998 17.5c-.21 0-.42-.072-.588-.218-.397-.345-.44-.95-.095-1.348.862-.993 2.13-2.543 2.13-2.543s-1.07-3.475-.544-4.95c.218-.609.613-1.066 1.16-1.14.263-.035.672.007.89.3.367.498.377 1.267.027 2.42-.223.738-.532 1.576-.891 2.422.452.97 1.09 1.877 1.618 2.46.88-.12 1.64-.143 2.18-.015.509.12.889.439.989.836.108.427-.045.893-.413 1.26-.382.38-.897.488-1.35.288-.56-.247-1.164-.76-1.735-1.376-.898.236-1.884.568-2.756.923-.506.9-.996 1.584-1.47 1.87a.797.797 0 0 1-.452.141l.1-.03zm.558-1.04s-.005.008-.01.013l.01-.014zm6.553-2.865-.029-.006.036.01-.007-.004zm-3.3-6.47-.005.02.009-.028-.004.009z"/></svg> },
                { fmt: "docx" as Format, label: "Word", sub: "Gerar Word", fn: generateDOCX,
                  logo: <Image src="/logos/word.jpg" alt="Word" width={48} height={48} className="rounded-lg object-contain" /> },
                { fmt: "xlsx" as Format, label: "Excel", sub: "Baixar Excel", fn: generateExcel,
                  logo: <Image src="/logos/excel.jpg" alt="Excel" width={48} height={48} className="rounded-lg object-contain" /> },
                { fmt: "html" as Format, label: "HTML", sub: "Gerar HTML", fn: generateHTML,
                  logo: <svg viewBox="0 0 24 24" width="36" height="36" fill="#E34F26"><path d="M4.136 3.012h15.729l-1.431 16.15L11.991 21l-6.436-1.838L4.136 3.012zM7.266 9.76l-.186-2.166h9.835l-.191 2.166H12.17l.204 2.256h4.345l-.543 5.508L12 18.903v.012l-.008.002-4.161-1.162-.287-3.166h2.147l.149 1.62 2.16.573 2.148-.57.237-2.529H7.46L7.266 9.76z"/></svg> },
              ]).map(({ fmt, label, sub, fn, logo }) => {
                const done = generatedFormats.has(fmt);
                const loading = generatingFormat === fmt;
                return (
                  <button key={fmt} onClick={fn} disabled={!!generatingFormat}
                    className={`relative flex flex-col items-center gap-3 py-5 px-3 rounded-xl border-2 transition-all duration-200
                      ${done
                        ? "border-cf-green/30 bg-cf-green/5 hover:bg-cf-green/10"
                        : "border-cf-border hover:border-cf-navy/30 bg-white hover:bg-cf-bg"
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}>
                    <div className="w-12 h-12 flex items-center justify-center">
                      {loading ? <Loader2 size={24} className="animate-spin text-cf-navy" /> : logo}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-cf-text-1">{label}</p>
                      <p className="text-[11px] text-cf-text-3 mt-0.5">
                        {loading ? "Gerando..." : done ? "Pronto!" : sub}
                      </p>
                    </div>
                    {done && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 size={14} className="text-cf-green" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Acoes finais */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-cf-border">
          {/* Esquerda: navegação */}
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="btn-secondary text-xs" style={{ minHeight: "auto", padding: "6px 12px" }}>
              <ArrowLeft size={13} /> Voltar
            </button>
            {onReset && (
              <button onClick={() => { try { localStorage.removeItem(NOTES_KEY); } catch { /* ignore */ } onReset(); }}
                className="text-xs font-medium text-cf-text-3 hover:text-cf-navy transition-colors px-2 py-1.5"
                style={{ minHeight: "auto" }}>
                <RotateCcw size={12} className="inline mr-1" /> Recomeçar
              </button>
            )}
            {savedFeedback && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-cf-green">
                <Check size={12} /> Salvo
              </span>
            )}
          </div>

          {/* Direita: ações principais */}
          <div className="flex items-center gap-2">
            {/* Goalfy */}
            <GoalfyButton data={data} aiAnalysis={aiAnalysis} settings={fundSettings} disabled={!aiAnalysis} />

            {/* Finalizar — sempre visível */}
            {!confirmFinish ? (
              <button
                onClick={() => setConfirmFinish(true)}
                disabled={finishing}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border border-cf-green/30 text-cf-green hover:bg-cf-green/5 transition-colors disabled:opacity-50"
                style={{ minHeight: "auto" }}
              >
                {finishing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {finishing ? "Finalizando..." : "Finalizar coleta"}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 border border-cf-green/30 rounded-lg px-3 py-1.5 bg-cf-green/5">
                <span className="text-xs text-cf-text-2">Confirmar?</span>
                <button onClick={handleFinish} className="text-xs font-semibold text-cf-green hover:underline" style={{ minHeight: "auto" }}>Sim</button>
                <span className="text-cf-text-4 text-xs">·</span>
                <button onClick={() => setConfirmFinish(false)} className="text-xs text-cf-text-3 hover:underline" style={{ minHeight: "auto" }}>Não</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
