"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Download, Loader2, CheckCircle2, AlertTriangle, Pencil, Check, X as XIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { ExtractedData, CollectionDocument } from "@/types";
import type { OriginalFiles } from "@/components/UploadStep";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface GenerateStepProps {
  data: ExtractedData;
  originalFiles?: OriginalFiles;
  onBack: () => void;
  onReset?: () => void;
  onNotify?: (msg: string) => void;
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

interface AIAnalysis {
  rating: number;
  ratingMax: number;
  decisao: string;
  resumoExecutivo: string;
  alertas: Array<{ severidade: string; descricao: string; impacto: string }>;
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: Array<{ pergunta: string; contexto: string }>;
  indicadores: Record<string, string>;
  parecer: string;
}

export default function GenerateStep({ data: initialData, originalFiles, onBack, onReset, onNotify }: GenerateStepProps) {
  const [data, setData] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(initialData)));
  const [editing, setEditing] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<Format | null>(null);
  const [generatedFormats, setGeneratedFormats] = useState<Set<Format>>(new Set());
  const setGenerated = (v: boolean) => { if (v) setGeneratedFormats(p => new Set(p).add("pdf")); };

  const setCNPJ = (k: keyof typeof data.cnpj, v: string) => setData(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof data.contrato, v: string | boolean) => setData(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof data.scr, v: string) => setData(p => ({ ...p, scr: { ...p.scr, [k]: v } }));
  const setResumoRisco = (v: string) => setData(p => ({ ...p, resumoRisco: v }));

  // ── AI Analysis ──
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const analysisFetched = useRef(false);

  useEffect(() => {
    if (analysisFetched.current) return;
    analysisFetched.current = true;

    const runAnalysis = async () => {
      setAnalyzingAI(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        const json = await res.json();
        if (json.success && json.analysis) {
          setAiAnalysis(json.analysis);
          // Preencher resumoRisco com o parecer da IA
          if (json.analysis.parecer) {
            setResumoRisco(json.analysis.parecer);
          }
        }
      } catch (err) {
        console.error("AI analysis failed:", err);
      } finally {
        setAnalyzingAI(false);
      }
    };

    runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Supabase: Salvar / Finalizar coleta ──
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishing, setFinishing] = useState(false);

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
        const { error } = await supabase.from("document_collections").update({ documents, label: data.cnpj.razaoSocial || null }).eq("id", collectionId);
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
    try {
      const supabase = createClient();
      const idToFinish = collectionId || await handleSave();
      if (!idToFinish) throw new Error("Não foi possível salvar a coleta");

      const { error } = await supabase.from("document_collections").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", idToFinish);
      if (error) throw error;

      setShowFinishModal(false);
      toast.success("Coleta finalizada!");
      onNotify?.(`Relatório de "${data.cnpj.razaoSocial || "empresa"}" finalizado`);
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
  const decision: "APROVADO" | "PENDENTE" | "REPROVADO" =
    aiAnalysis ? (aiAnalysis.decisao as "APROVADO" | "PENDENTE" | "REPROVADO") :
    (finalRating >= 7 ? "APROVADO" : finalRating >= 4 ? "PENDENTE" : "REPROVADO");
  const decisionColor = decision === "APROVADO" ? "#16A34A" : decision === "PENDENTE" ? "#D97706" : "#DC2626";
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
  const pontosFortes = aiAnalysis?.pontosFortes || [];
  const pontosFracos = aiAnalysis?.pontosFracos || [];
  const perguntasVisita = aiAnalysis?.perguntasVisita || [];
  const resumoExecutivo = aiAnalysis?.resumoExecutivo || "";

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
  const generatePDF = async () => {
    setGeneratingFormat("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210;
      const margin = 20;
      const contentW = W - margin * 2;
      let y = 0;

      const colors = {
        bg: [32, 59, 136] as [number, number, number],
        primary: [32, 59, 136] as [number, number, number],
        accent: [115, 184, 21] as [number, number, number],
        "accent-light": [168, 217, 107] as [number, number, number],
        surface: [255, 255, 255] as [number, number, number],
        surface2: [237, 242, 251] as [number, number, number],
        surface3: [220, 232, 248] as [number, number, number],
        text: [17, 24, 39] as [number, number, number],
        textSec: [55, 65, 81] as [number, number, number],
        textMuted: [107, 114, 128] as [number, number, number],
        border: [209, 220, 240] as [number, number, number],
        warning: [217, 119, 6] as [number, number, number],
        danger: [220, 38, 38] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
        navy: [32, 59, 136] as [number, number, number],
        navyLight: [26, 48, 112] as [number, number, number],
        green: [22, 163, 74] as [number, number, number],
        amber: [217, 119, 6] as [number, number, number],
        red: [220, 38, 38] as [number, number, number],
      };

      const pageCount = { n: 0 };
      const footerDateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const newPage = () => {
        if (pageCount.n > 0) doc.addPage();
        pageCount.n++;
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 210, 297, "F");
        doc.setFillColor(...colors.navy);
        doc.rect(0, 0, 210, 1.5, "F");
        y = 1.5;
      };

      const checkPageBreak = (needed: number) => {
        if (y + needed > 275) { newPage(); drawHeader(); }
      };

      const drawHeader = () => {
        doc.setFillColor(...colors.navy);
        doc.rect(0, 1.5, 210, 32, "F");
        doc.setFillColor(...colors.accent);
        doc.rect(0, 33.5, 210, 2, "F");

        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.circle(margin + 7, 12, 7);
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 7, 20.5, 1.5, "F");

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("capital", margin + 17, 16);
        doc.setTextColor(...colors["accent-light"]);
        doc.text("financas", margin + 17 + doc.getTextWidth("capital") + 1, 16);

        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text("CONSOLIDADOR DE DOCUMENTOS", margin + 17, 21);

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Relatório de Due Diligence", W - margin, 13, { align: "right" });

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        const now = new Date();
        const dtStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
        doc.text(`Gerado em ${dtStr}`, W - margin, 20, { align: "right" });

        if (data.cnpj.razaoSocial) {
          doc.setFontSize(7);
          doc.setTextColor(180, 200, 240);
          doc.text(data.cnpj.razaoSocial.substring(0, 45), W - margin, 26, { align: "right" });
        }

        y = 42;
      };

      const drawSectionTitle = (num: string, title: string, color: [number, number, number]) => {
        checkPageBreak(16);
        doc.setFillColor(...colors.surface2);
        doc.roundedRect(margin, y, contentW, 10, 1.5, 1.5, "F");
        doc.setFillColor(...color);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...color);
        doc.text(num, margin + 7, y + 6.5);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(title, margin + 14, y + 6.5);
        y += 14;
      };

      const drawField = (label: string, value: string, fullWidth = false) => {
        if (!value) return;
        checkPageBreak(14);
        const fieldW = fullWidth ? contentW : contentW / 2 - 2;
        doc.setFillColor(...colors.surface);
        doc.roundedRect(margin, y, fieldW, 12, 1, 1, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(label.toUpperCase(), margin + 4, y + 4.5);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        const displayVal = value.length > (fullWidth ? 80 : 35) ? value.substring(0, fullWidth ? 80 : 35) + "..." : value;
        doc.text(displayVal, margin + 4, y + 9.5);
        y += 14;
      };

      const drawFieldRow = (fields: Array<{ label: string; value: string }>) => {
        const validFields = fields.filter((f) => f.value);
        if (validFields.length === 0) return;
        checkPageBreak(14);
        const fieldW = contentW / validFields.length - 2;
        let x = margin;
        validFields.forEach((field) => {
          doc.setFillColor(...colors.surface);
          doc.roundedRect(x, y, fieldW, 12, 1, 1, "F");
          doc.setFontSize(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.textMuted);
          doc.text(field.label.toUpperCase(), x + 4, y + 4.5);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...colors.text);
          const maxChars = Math.floor(fieldW / 2.8);
          const displayVal = field.value.length > maxChars ? field.value.substring(0, maxChars) + "..." : field.value;
          doc.text(displayVal, x + 4, y + 9.5);
          x += fieldW + 4;
        });
        y += 14;
      };

      const drawMultilineField = (label: string, value: string, maxLines = 6) => {
        if (!value) return;
        const lineH = 5;
        const paddingV = 6;
        const maxWidth = contentW - 8;
        const lines = doc.splitTextToSize(value, maxWidth);
        const displayLines = lines.slice(0, maxLines);
        const boxH = displayLines.length * lineH + paddingV * 2 + 6;
        checkPageBreak(boxH + 4);
        doc.setFillColor(...colors.surface);
        doc.roundedRect(margin, y, contentW, boxH, 1, 1, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(label.toUpperCase(), margin + 4, y + 5);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.text);
        displayLines.forEach((line: string, i: number) => {
          doc.text(line, margin + 4, y + paddingV + 5 + i * lineH);
        });
        if (lines.length > maxLines) {
          doc.setFontSize(7);
          doc.setTextColor(...colors.textMuted);
          doc.text(`+ ${lines.length - maxLines} linha(s) omitida(s)...`, margin + 4, y + boxH - 2);
        }
        y += boxH + 4;
      };

      const drawSpacer = (h = 6) => { y += h; };

      // Helper: draw simple table
      const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
        const rowH = 10;
        const headerH = 8;

        checkPageBreak(headerH + Math.min(rows.length, 3) * rowH + 4);

        // Header
        doc.setFillColor(...colors.surface2);
        doc.roundedRect(margin, y, contentW, headerH, 1, 1, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        let hx = margin;
        headers.forEach((h, i) => {
          doc.text(h, hx + 4, y + 5.5);
          hx += colWidths[i];
        });
        y += headerH + 1;

        // Rows
        rows.forEach((row, idx) => {
          checkPageBreak(rowH + 2);
          const rowColor = idx % 2 === 0 ? colors.surface : colors.surface2;
          doc.setFillColor(...rowColor);
          doc.rect(margin, y, contentW, rowH, "F");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          let rx = margin;
          row.forEach((cell, ci) => {
            const maxChars = Math.floor(colWidths[ci] / 2.2);
            const val = cell.length > maxChars ? cell.substring(0, maxChars) + "..." : cell;
            doc.text(val, rx + 4, y + 6.5);
            rx += colWidths[ci];
          });
          y += rowH;
        });
        y += 4;
      };

      // Helper: draw alert box in PDF
      const drawAlertBox = (text: string, severity: AlertSeverity) => {
        checkPageBreak(10);
        const bgColor: [number, number, number] = severity === "ALTA" ? [254, 242, 242] : [255, 251, 235];
        const barColor: [number, number, number] = severity === "ALTA" ? colors.danger : colors.warning;
        const textColor: [number, number, number] = severity === "ALTA" ? colors.danger : colors.warning;
        doc.setFillColor(...bgColor);
        doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
        doc.setFillColor(...barColor);
        doc.roundedRect(margin, y, 2.5, 8, 0.5, 0.5, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text(`[${severity}] ${text}`, margin + 6, y + 5.5);
        y += 10;
      };

      // Helper: draw badge
      const drawBadge = (text: string, bgColor: [number, number, number], textColor: [number, number, number], x: number, yPos: number, w: number, h: number) => {
        doc.setFillColor(...bgColor);
        doc.roundedRect(x, yPos, w, h, 2, 2, "F");
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textColor);
        doc.text(text, x + w / 2, yPos + h / 2 + 3, { align: "center" });
      };

      // ===== PAGE 1 — CAPA + SINTESE =====
      newPage();
      doc.setFillColor(...colors.navy);
      doc.rect(0, 0, 210, 297, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(0, 0, 210, 3, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(160, 50, 40);
      doc.circle(50, 250, 30);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(2);
      doc.circle(W / 2, 65, 18);
      doc.setFillColor(255, 255, 255);
      doc.circle(W / 2, 84, 3, "F");

      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      const capW = doc.getTextWidth("capital");
      doc.text("capital", W / 2 - (capW + doc.getTextWidth("financas") + 2) / 2, 105);
      doc.setTextColor(...colors["accent-light"]);
      doc.text("financas", W / 2 - (capW + doc.getTextWidth("financas") + 2) / 2 + capW + 2, 105);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 200, 240);
      doc.text("CONSOLIDADOR DE DOCUMENTOS", W / 2, 116, { align: "center" });

      doc.setFillColor(...colors.accent);
      doc.rect(W / 2 - 30, 123, 60, 1.5, "F");

      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Relatório de", W / 2, 140, { align: "center" });
      doc.text("Due Diligence", W / 2, 151, { align: "center" });

      if (data.cnpj.razaoSocial) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors["accent-light"]);
        doc.text(data.cnpj.razaoSocial.substring(0, 50), W / 2, 168, { align: "center" });
      }
      if (data.cnpj.cnpj) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text(`CNPJ: ${data.cnpj.cnpj}`, W / 2, 177, { align: "center" });
      }

      const coverDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      doc.setFontSize(9);
      doc.setTextColor(140, 170, 220);
      doc.text(`Gerado em ${coverDate}`, W / 2, 190, { align: "center" });

      // Rating badge on cover
      const ratingColorPDF: [number, number, number] = finalRating >= 7 ? colors.green : finalRating >= 4 ? colors.amber : colors.red;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(W / 2 - 50, 200, 42, 22, 3, 3, "F");
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ratingColorPDF);
      doc.text(`${finalRating}/10`, W / 2 - 29, 214, { align: "center" });
      doc.setFontSize(6);
      doc.text("RATING", W / 2 - 29, 207, { align: "center" });

      // Decision badge on cover
      const decisionColorPDF: [number, number, number] = decision === "APROVADO" ? colors.green : decision === "PENDENTE" ? colors.amber : colors.red;
      const decisionBgPDF: [number, number, number] = decision === "APROVADO" ? [240, 253, 244] : decision === "PENDENTE" ? [255, 251, 235] : [254, 242, 242];
      doc.setFillColor(...decisionBgPDF);
      doc.roundedRect(W / 2 + 8, 200, 42, 22, 3, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...decisionColorPDF);
      doc.text(decision, W / 2 + 29, 214, { align: "center" });
      doc.setFontSize(6);
      doc.text("DECISAO", W / 2 + 29, 207, { align: "center" });

      // Quick metrics
      const metricsY = 230;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 200, 240);
      const metrics = [
        { label: "Situacao", val: data.cnpj.situacaoCadastral || "—" },
        { label: "CNAE", val: data.cnpj.cnaePrincipal ? data.cnpj.cnaePrincipal.substring(0, 25) : "—" },
        { label: "Capital Social", val: data.qsa.capitalSocial || data.contrato.capitalSocial || "—" },
        { label: "Idade", val: companyAge || "—" },
      ];
      const mW = contentW / metrics.length;
      metrics.forEach((m, i) => {
        const mx = margin + i * mW;
        doc.setTextColor(140, 170, 220);
        doc.text(m.label.toUpperCase(), mx, metricsY);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text(m.val.substring(0, 20), mx, metricsY + 5);
        doc.setFont("helvetica", "normal");
      });

      // Alerts panel on cover
      if (alerts.length > 0) {
        const alertY = 242;
        doc.setFillColor(40, 50, 100);
        const alertBoxH = 6 + alerts.length * 5;
        doc.roundedRect(margin, alertY, contentW, alertBoxH, 2, 2, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 200, 100);
        doc.text(`ALERTAS (${alerts.length})`, margin + 4, alertY + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        alerts.forEach((alert, i) => {
          const aColor: [number, number, number] = alert.severity === "ALTA" ? [255, 120, 120] : [255, 200, 100];
          doc.setTextColor(...aColor);
          doc.text(`[${alert.severity}] ${alert.message}`, margin + 4, alertY + 9 + i * 5);
        });
      }

      doc.setFontSize(7);
      doc.setTextColor(100, 140, 200);
      doc.text("Documento confidencial — uso restrito", W / 2, 280, { align: "center" });
      doc.setFillColor(...colors.accent);
      doc.rect(0, 294, 210, 3, "F");

      // ===== PAGE 2 — QSA + CONTRATO =====
      newPage();
      drawHeader();

      drawSectionTitle("02", "QUADRO SOCIETARIO (QSA)", colors.accent);

      if (data.qsa.capitalSocial) {
        drawField("Capital Social", data.qsa.capitalSocial, true);
      }

      const validQSA = data.qsa.quadroSocietario.filter(s => s.nome);
      if (validQSA.length > 0) {
        const qsaColW = [contentW * 0.30, contentW * 0.22, contentW * 0.28, contentW * 0.20];
        drawTable(
          ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
          validQSA.map(s => [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", s.participacao || "—"]),
          qsaColW,
        );
      }

      drawSpacer(8);

      drawSectionTitle("03", "CONTRATO SOCIAL", colors.primary);

      if (data.contrato.temAlteracoes) {
        checkPageBreak(12);
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFillColor(...colors.warning);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.warning);
        doc.text("ATENCAO: Documento com alteracoes societarias recentes", margin + 8, y + 6.5);
        y += 14;
      }

      if (data.contrato.objetoSocial) drawMultilineField("Objeto Social", data.contrato.objetoSocial, 5);
      if (data.contrato.administracao) drawMultilineField("Administracao e Poderes", data.contrato.administracao, 4);

      drawFieldRow([
        { label: "Capital Social", value: data.contrato.capitalSocial },
        { label: "Data de Constituicao", value: data.contrato.dataConstituicao },
      ]);
      drawFieldRow([
        { label: "Prazo de Duracao", value: data.contrato.prazoDuracao },
        { label: "Foro", value: data.contrato.foro },
      ]);

      // ===== PAGE 3 — FATURAMENTO =====
      newPage();
      drawHeader();
      drawSectionTitle("04", "FATURAMENTO", colors.accent);

      // Alerts
      if (data.faturamento.faturamentoZerado) {
        drawAlertBox("Faturamento zerado no periodo", "ALTA");
      }
      if (!data.faturamento.dadosAtualizados) {
        drawAlertBox(`Dados desatualizados — ultimo mes: ${data.faturamento.ultimoMesComDados || "N/A"}`, "MODERADA");
      }

      drawFieldRow([
        { label: "Somatoria Anual", value: data.faturamento.somatoriaAno ? `R$ ${data.faturamento.somatoriaAno}` : "" },
        { label: "Media Mensal", value: data.faturamento.mediaAno ? `R$ ${data.faturamento.mediaAno}` : "" },
      ]);

      // Monthly table with visual bars
      const validMeses = data.faturamento.meses.filter(m => m.mes);
      if (validMeses.length > 0) {
        drawSpacer(4);
        const maxFat = Math.max(...validMeses.map(m => parseMoneyToNumber(m.valor)), 1);
        const rowH = 10;
        const headerH = 8;

        checkPageBreak(headerH + Math.min(validMeses.length, 3) * rowH + 4);

        // Header
        doc.setFillColor(...colors.surface2);
        doc.roundedRect(margin, y, contentW, headerH, 1, 1, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("MES", margin + 4, y + 5.5);
        doc.text("VALOR (R$)", margin + contentW * 0.25 + 4, y + 5.5);
        doc.text("", margin + contentW * 0.55 + 4, y + 5.5);
        y += headerH + 1;

        validMeses.forEach((m, idx) => {
          checkPageBreak(rowH + 2);
          const rowColor = idx % 2 === 0 ? colors.surface : colors.surface2;
          doc.setFillColor(...rowColor);
          doc.rect(margin, y, contentW, rowH, "F");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.text(m.mes, margin + 4, y + 6.5);
          doc.text(m.valor || "0,00", margin + contentW * 0.25 + 4, y + 6.5);
          // Visual bar
          const barVal = parseMoneyToNumber(m.valor);
          const barW = Math.max(1, (barVal / maxFat) * (contentW * 0.40));
          doc.setFillColor(...colors.accent);
          doc.roundedRect(margin + contentW * 0.55, y + 3, barW, 4, 1, 1, "F");
          y += rowH;
        });
        y += 4;
      }

      // ===== PAGE 4 — SCR =====
      newPage();
      drawHeader();
      drawSectionTitle("05", "PERFIL DE CREDITO — SCR / BACEN", colors.warning);

      // Summary fields
      drawFieldRow([
        { label: "Carteira a Vencer (R$)", value: data.scr.carteiraAVencer },
        { label: "Vencidos (R$)", value: data.scr.vencidos },
        { label: "Prejuizos (R$)", value: data.scr.prejuizos },
      ]);
      drawFieldRow([
        { label: "Limite de Credito (R$)", value: data.scr.limiteCredito },
        { label: "Qtde Instituicoes", value: data.scr.qtdeInstituicoes },
        { label: "Qtde Operacoes", value: data.scr.qtdeOperacoes },
      ]);
      drawFieldRow([
        { label: "Total Dividas Ativas (R$)", value: data.scr.totalDividasAtivas },
        { label: "Classificacao Risco (A-H)", value: data.scr.classificacaoRisco },
      ]);
      drawFieldRow([
        { label: "Operacoes a Vencer (R$)", value: data.scr.operacoesAVencer },
        { label: "Operacoes em Atraso", value: data.scr.operacoesEmAtraso },
        { label: "Operacoes Vencidas (R$)", value: data.scr.operacoesVencidas },
      ]);
      drawFieldRow([
        { label: "Tempo Medio de Atraso", value: data.scr.tempoAtraso },
        { label: "Coobrigacoes (R$)", value: data.scr.coobrigacoes },
      ]);
      drawFieldRow([
        { label: "Carteira Curto Prazo (R$)", value: data.scr.carteiraCurtoPrazo },
        { label: "Carteira Longo Prazo (R$)", value: data.scr.carteiraLongoPrazo },
      ]);
      if (data.scr.valoresMoedaEstrangeira) drawField("Valores Moeda Estrangeira", data.scr.valoresMoedaEstrangeira, true);

      // SCR comparison table if scrAnterior exists
      if (data.scrAnterior) {
        drawSpacer(4);
        checkPageBreak(20);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("COMPARATIVO SCR (ANTERIOR vs ATUAL)", margin, y + 4);
        y += 8;

        const compMetrics: Array<{ label: string; anterior: string; atual: string }> = [
          { label: "Carteira a Vencer", anterior: data.scrAnterior.carteiraAVencer, atual: data.scr.carteiraAVencer },
          { label: "Vencidos", anterior: data.scrAnterior.vencidos, atual: data.scr.vencidos },
          { label: "Prejuizos", anterior: data.scrAnterior.prejuizos, atual: data.scr.prejuizos },
          { label: "Total Dividas", anterior: data.scrAnterior.totalDividasAtivas, atual: data.scr.totalDividasAtivas },
          { label: "Limite Credito", anterior: data.scrAnterior.limiteCredito, atual: data.scr.limiteCredito },
          { label: "Instituicoes", anterior: data.scrAnterior.qtdeInstituicoes, atual: data.scr.qtdeInstituicoes },
          { label: "Operacoes", anterior: data.scrAnterior.qtdeOperacoes, atual: data.scr.qtdeOperacoes },
        ];

        const compRows = compMetrics.map(m => {
          const antVal = parseMoneyToNumber(m.anterior);
          const atualVal = parseMoneyToNumber(m.atual);
          const diff = atualVal - antVal;
          const varStr = diff === 0 ? "=" : diff > 0 ? `+${diff.toLocaleString("pt-BR")}` : diff.toLocaleString("pt-BR");
          return [m.label, m.anterior || "—", m.atual || "—", varStr];
        });

        const compColW = [contentW * 0.28, contentW * 0.24, contentW * 0.24, contentW * 0.24];
        drawTable(
          ["METRICA", "ANTERIOR", "ATUAL", "VARIACAO"],
          compRows,
          compColW,
        );
      }

      // Modalidades table
      if (data.scr.modalidades && data.scr.modalidades.length > 0) {
        drawSpacer(4);
        checkPageBreak(20);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("MODALIDADES DE CREDITO", margin, y + 4);
        y += 8;
        const modColW = [contentW * 0.30, contentW * 0.18, contentW * 0.18, contentW * 0.18, contentW * 0.16];
        drawTable(
          ["MODALIDADE", "TOTAL", "A VENCER", "VENCIDO", "PART."],
          data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido, m.participacao]),
          modColW,
        );
      }

      // Instituicoes table
      if (data.scr.instituicoes && data.scr.instituicoes.length > 0) {
        drawSpacer(4);
        checkPageBreak(20);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("INSTITUICOES CREDORAS", margin, y + 4);
        y += 8;
        const instColW = [contentW * 0.60, contentW * 0.40];
        drawTable(
          ["INSTITUICAO", "VALOR (R$)"],
          data.scr.instituicoes.map(i => [i.nome, i.valor]),
          instColW,
        );
      }

      if (data.scr.historicoInadimplencia) drawMultilineField("Historico de Inadimplencia", data.scr.historicoInadimplencia, 5);

      // ===== PAGE 5 — PROTESTOS =====
      newPage();
      drawHeader();
      drawSectionTitle("06", "PROTESTOS", colors.danger);

      drawFieldRow([
        { label: "Vigentes (Qtd)", value: data.protestos?.vigentesQtd || "0" },
        { label: "Vigentes (R$)", value: data.protestos?.vigentesValor || "0,00" },
        { label: "Regularizados (Qtd)", value: data.protestos?.regularizadosQtd || "0" },
        { label: "Regularizados (R$)", value: data.protestos?.regularizadosValor || "0,00" },
      ]);

      if (protestosVigentes > 0) {
        drawAlertBox(`${protestosVigentes} protesto(s) vigente(s) — R$ ${data.protestos?.vigentesValor || "0,00"}`, "ALTA");
      }

      const protestoDetalhes = data.protestos?.detalhes || [];
      if (protestoDetalhes.length > 0) {
        drawSpacer(4);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("DETALHES DOS PROTESTOS", margin, y + 4);
        y += 8;
        const pColW = [contentW * 0.18, contentW * 0.35, contentW * 0.22, contentW * 0.25];
        drawTable(
          ["DATA", "CREDOR", "VALOR (R$)", "STATUS"],
          protestoDetalhes.map(p => [p.data || "—", p.credor || "—", p.valor || "—", p.regularizado ? "Regularizado" : "Vigente"]),
          pColW,
        );
      } else {
        drawSpacer(4);
        checkPageBreak(12);
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFillColor(22, 163, 74);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text("Nenhum protesto identificado", margin + 8, y + 6.5);
        y += 14;
      }

      // ===== PAGE 6 — PROCESSOS =====
      newPage();
      drawHeader();
      drawSectionTitle("07", "PROCESSOS JUDICIAIS", colors.warning);

      drawFieldRow([
        { label: "Passivos (Total)", value: data.processos?.passivosTotal || "0" },
        { label: "Ativos (Total)", value: data.processos?.ativosTotal || "0" },
        { label: "Valor Estimado (R$)", value: data.processos?.valorTotalEstimado || "0,00" },
      ]);

      // RJ badge
      if (data.processos?.temRJ) {
        drawAlertBox("RECUPERACAO JUDICIAL identificada", "ALTA");
      }

      // Distribuicao table
      const distribuicao = data.processos?.distribuicao || [];
      if (distribuicao.length > 0) {
        drawSpacer(4);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("DISTRIBUICAO POR TIPO", margin, y + 4);
        y += 8;
        const distColW = [contentW * 0.45, contentW * 0.25, contentW * 0.30];
        drawTable(
          ["TIPO", "QUANTIDADE", "PERCENTUAL"],
          distribuicao.map(d => [d.tipo || "—", d.qtd || "0", d.pct ? `${d.pct}%` : "—"]),
          distColW,
        );
      }

      // Processos bancarios table
      const bancarios = data.processos?.bancarios || [];
      if (bancarios.length > 0) {
        drawSpacer(4);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("PROCESSOS BANCARIOS", margin, y + 4);
        y += 8;
        const bancColW = [contentW * 0.25, contentW * 0.30, contentW * 0.22, contentW * 0.23];
        drawTable(
          ["BANCO", "ASSUNTO", "STATUS", "DATA"],
          bancarios.map(b => [b.banco || "—", b.assunto || "—", b.status || "—", b.data || "—"]),
          bancColW,
        );
      }

      if (!data.processos || (parseInt(data.processos.passivosTotal || "0") === 0 && parseInt(data.processos.ativosTotal || "0") === 0)) {
        drawSpacer(4);
        checkPageBreak(12);
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFillColor(22, 163, 74);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text("Nenhum processo judicial identificado", margin + 8, y + 6.5);
        y += 14;
      }

      // ===== PAGE 7 — GRUPO ECONOMICO =====
      newPage();
      drawHeader();
      drawSectionTitle("08", "GRUPO ECONOMICO", colors.primary);

      const empresasGrupo = data.grupoEconomico?.empresas || [];
      if (empresasGrupo.length > 0) {
        const geColW = [contentW * 0.25, contentW * 0.18, contentW * 0.15, contentW * 0.14, contentW * 0.14, contentW * 0.14];
        drawTable(
          ["RAZAO SOCIAL", "CNPJ", "RELACAO", "SCR (R$)", "PROTESTOS", "PROCESSOS"],
          empresasGrupo.map(e => [e.razaoSocial || "—", e.cnpj || "—", e.relacao || "—", e.scrTotal || "—", e.protestos || "0", e.processos || "0"]),
          geColW,
        );
      } else {
        drawSpacer(4);
        checkPageBreak(12);
        doc.setFillColor(...colors.surface2);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text("Nenhuma empresa identificada no grupo economico", margin + 8, y + 6.5);
        y += 14;
      }

      // ===== PAGE 8 — PARECER =====
      newPage();
      drawHeader();
      drawSectionTitle("09", "PARECER FINAL", colors.primary);

      // Decision badge
      checkPageBreak(30);
      const dBgColor: [number, number, number] = decision === "APROVADO" ? [240, 253, 244] : decision === "PENDENTE" ? [255, 251, 235] : [254, 242, 242];
      const dTextColor: [number, number, number] = decision === "APROVADO" ? colors.green : decision === "PENDENTE" ? colors.amber : colors.red;
      drawBadge(decision, dBgColor, dTextColor, margin, y, contentW / 3, 16);

      // Rating next to decision
      doc.setFillColor(...colors.surface2);
      doc.roundedRect(margin + contentW / 3 + 4, y, contentW / 3 - 4, 16, 2, 2, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...dTextColor);
      doc.text(`Rating: ${finalRating}/10`, margin + contentW / 3 + 10, y + 10);

      y += 22;

      // Parecer text
      const parecerText = data.resumoRisco || "Parecer nao preenchido.";
      drawMultilineField("Resumo do Parecer", parecerText, 15);

      // Alerts summary in parecer
      if (alerts.length > 0) {
        drawSpacer(4);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text("RESUMO DE ALERTAS", margin, y + 4);
        y += 8;
        alerts.forEach(alert => {
          drawAlertBox(alert.message, alert.severity);
        });
      }

      // Footer on all pages
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFillColor(...colors.navy);
        doc.rect(0, 284, 210, 13, "F");
        doc.setFillColor(...colors.accent);
        doc.rect(0, 284, 210, 1, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text(`Capital Financas — Consolidador | ${footerDateStr} | Confidencial`, margin, 291);
        doc.text(`Pagina ${p} de ${totalPages}`, W - margin, 291, { align: "right" });
      }

      doc.save(`capital-financas-${safeName}-${dateStr}.pdf`);
      setGenerated(true);
      if (generatedFormats.size === 0) onNotify?.(`PDF gerado para "${data.cnpj.razaoSocial || "empresa"}"`);
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
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Header, Footer } = await import("docx");

      const navy = "203B88";
      const green = "73B815";
      const greenLight = "A8D96B";
      const warning = "D97706";
      const danger = "DC2626";
      const muted = "6B7280";
      const border1 = "D1DCF0";
      const surface = "EDF2FB";
      const surface2 = "F5F7FB";
      const textDark = "111827";
      const dateFmt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const footerDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const spacer = (pts = 200) => new Paragraph({ spacing: { before: pts } });

      const sectionTitle = (num: string, title: string, color: string) => new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 6, color }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: 100, type: WidthType.PERCENTAGE }, shading: { type: "clear" as const, fill: surface },
            children: [new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 120 }, children: [
              new TextRun({ text: num + "  ", size: 18, bold: true, color, font: "Arial" }),
              new TextRun({ text: title, size: 20, bold: true, color: textDark, font: "Arial" }),
            ] })],
          }),
        ] })],
      });

      const fieldTable = (fields: [string, string][]) => {
        const rows = fields.filter(([, v]) => v).map(([label, value]) =>
          new TableRow({ children: [
            new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: label.toUpperCase(), size: 15, color: muted, font: "Arial" })] })],
            }),
            new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: value || "—", size: 18, bold: true, font: "Arial" })] })],
            }),
          ] })
        );
        if (rows.length === 0) return spacer(0);
        return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: border1 }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows });
      };

      const makeDataTable = (headers: string[], rows: string[][], headerColor: string) => {
        if (rows.length === 0) return new Paragraph({ children: [new TextRun({ text: "Nenhum dado encontrado.", italics: true, color: muted, font: "Arial" })] });
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: headers.map(h =>
              new TableCell({ shading: { type: "clear" as const, fill: headerColor }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: 60 }, children: [new TextRun({ text: h, size: 15, bold: true, color: "FFFFFF", font: "Arial" })] })] })
            ) }),
            ...rows.map((row, i) => new TableRow({ children: row.map(v =>
              new TableCell({ shading: { type: "clear" as const, fill: i % 2 === 0 ? "FFFFFF" : surface2 }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: 60 }, children: [new TextRun({ text: v, size: 17, font: "Arial" })] })] })
            ) })),
          ],
        });
      };

      const alertParagraph = (text: string, sev: AlertSeverity) => new Paragraph({
        shading: { type: "clear" as const, fill: sev === "ALTA" ? "FEF2F2" : "FEF3C7" },
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: `  [${sev}] ${text}`, bold: true, color: sev === "ALTA" ? danger : warning, size: 18, font: "Arial" })],
      });

      // QSA table
      const validQSADoc = data.qsa.quadroSocietario.filter(s => s.nome);
      const qsaTable = makeDataTable(
        ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
        validQSADoc.map(s => [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", s.participacao || "—"]),
        navy,
      );

      // Socios table
      const validSociosDoc = data.contrato.socios.filter(s => s.nome);
      const sociosTable = makeDataTable(
        ["NOME DO SOCIO", "CPF", "PARTICIPACAO"],
        validSociosDoc.map(s => [s.nome, s.cpf || "—", s.participacao || "—"]),
        navy,
      );

      // Faturamento table
      const faturamentoTable = makeDataTable(
        ["MES", "VALOR (R$)"],
        data.faturamento.meses.filter(m => m.mes).map(m => [m.mes, m.valor || "0,00"]),
        green,
      );

      // Modalidades table
      const modalidadesTable = data.scr.modalidades.length > 0
        ? makeDataTable(
          ["MODALIDADE", "TOTAL", "A VENCER", "VENCIDO", "PART."],
          data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido, m.participacao]),
          warning,
        )
        : null;

      // Instituicoes table
      const instituicoesTable = data.scr.instituicoes.length > 0
        ? makeDataTable(
          ["INSTITUICAO", "VALOR (R$)"],
          data.scr.instituicoes.map(i => [i.nome, i.valor]),
          warning,
        )
        : null;

      // SCR comparison table
      const scrCompTable = data.scrAnterior ? makeDataTable(
        ["METRICA", "ANTERIOR", "ATUAL", "VARIACAO"],
        [
          { label: "Carteira a Vencer", ant: data.scrAnterior.carteiraAVencer, at: data.scr.carteiraAVencer },
          { label: "Vencidos", ant: data.scrAnterior.vencidos, at: data.scr.vencidos },
          { label: "Prejuizos", ant: data.scrAnterior.prejuizos, at: data.scr.prejuizos },
          { label: "Total Dividas", ant: data.scrAnterior.totalDividasAtivas, at: data.scr.totalDividasAtivas },
          { label: "Limite Credito", ant: data.scrAnterior.limiteCredito, at: data.scr.limiteCredito },
        ].map(m => {
          const d1 = parseMoneyToNumber(m.ant); const d2 = parseMoneyToNumber(m.at);
          const diff = d2 - d1;
          return [m.label, m.ant || "—", m.at || "—", diff === 0 ? "=" : diff > 0 ? `+${diff.toLocaleString("pt-BR")}` : diff.toLocaleString("pt-BR")];
        }),
        warning,
      ) : null;

      // Protestos table
      const protestosDetalhes = data.protestos?.detalhes || [];
      const protestosTable = protestosDetalhes.length > 0
        ? makeDataTable(
          ["DATA", "CREDOR", "VALOR (R$)", "STATUS"],
          protestosDetalhes.map(p => [p.data || "—", p.credor || "—", p.valor || "—", p.regularizado ? "Regularizado" : "Vigente"]),
          danger,
        )
        : null;

      // Processos tables
      const distTable = (data.processos?.distribuicao || []).length > 0
        ? makeDataTable(
          ["TIPO", "QUANTIDADE", "PERCENTUAL"],
          data.processos!.distribuicao.map(d => [d.tipo, d.qtd, d.pct ? `${d.pct}%` : "—"]),
          warning,
        )
        : null;

      const bancTable = (data.processos?.bancarios || []).length > 0
        ? makeDataTable(
          ["BANCO", "ASSUNTO", "STATUS", "DATA"],
          data.processos!.bancarios.map(b => [b.banco || "—", b.assunto || "—", b.status || "—", b.data || "—"]),
          warning,
        )
        : null;

      // Grupo economico table
      const geTable = (data.grupoEconomico?.empresas || []).length > 0
        ? makeDataTable(
          ["RAZAO SOCIAL", "CNPJ", "RELACAO", "SCR (R$)", "PROTESTOS", "PROCESSOS"],
          data.grupoEconomico!.empresas.map(e => [e.razaoSocial, e.cnpj, e.relacao, e.scrTotal || "—", e.protestos || "0", e.processos || "0"]),
          navy,
        )
        : null;

      const docx = new Document({
        sections: [
          // -- CAPA --
          {
            properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
            children: [
              spacer(4000),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "capital", size: 56, bold: true, color: navy, font: "Arial" }),
                new TextRun({ text: "financas", size: 56, bold: true, color: green, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [
                new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 20, color: greenLight }),
              ] }),
              spacer(400),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "RELATORIO DE DUE DILIGENCE", size: 36, bold: true, color: navy, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [
                new TextRun({ text: "Consolidador de Documentos", size: 22, color: muted, font: "Arial" }),
              ] }),
              spacer(600),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: data.cnpj.razaoSocial || "Empresa", size: 24, bold: true, color: textDark, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [
                new TextRun({ text: data.cnpj.cnpj || "", size: 20, color: muted, font: "Arial" }),
              ] }),
              spacer(400),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: `Rating: ${finalRating}/10  |  ${decision}`, size: 24, bold: true, color: decision === "APROVADO" ? green : decision === "PENDENTE" ? warning : danger, font: "Arial" }),
              ] }),
              spacer(800),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: `Gerado em ${dateFmt}`, size: 18, color: muted, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [
                new TextRun({ text: "Documento confidencial — uso restrito", size: 16, color: "9CA3AF", italics: true, font: "Arial" }),
              ] }),
            ],
          },
          // -- CONTEUDO --
          {
            properties: {
              page: { margin: { top: 1200, bottom: 1000, left: 1000, right: 1000 } },
            },
            headers: { default: new Header({ children: [
              new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: green } }, spacing: { after: 100 }, children: [
                new TextRun({ text: "capital", size: 16, bold: true, color: navy, font: "Arial" }),
                new TextRun({ text: "financas", size: 16, bold: true, color: green, font: "Arial" }),
                new TextRun({ text: "    Relatorio de Due Diligence", size: 14, color: muted, font: "Arial" }),
              ] }),
            ] }) },
            footers: { default: new Footer({ children: [
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 } }, spacing: { before: 100 }, children: [
                new TextRun({ text: `Capital Financas — Consolidador | ${footerDate} | Confidencial`, size: 14, color: "9CA3AF", font: "Arial" }),
              ] }),
            ] }) },
            children: [
              // Alerts summary
              ...(alerts.length > 0 ? [
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `ALERTAS (${alerts.length})`, size: 18, bold: true, color: warning, font: "Arial" })] }),
                ...alerts.map(a => alertParagraph(a.message, a.severity)),
                spacer(200),
              ] : []),

              // Section 01
              sectionTitle("01", "IDENTIFICACAO DA EMPRESA", navy),
              spacer(100),
              fieldTable([
                ["Razao Social", data.cnpj.razaoSocial], ["Nome Fantasia", data.cnpj.nomeFantasia],
                ["CNPJ", data.cnpj.cnpj], ["Data de Abertura", data.cnpj.dataAbertura],
                ["Situacao Cadastral", data.cnpj.situacaoCadastral], ["Data da Situacao", data.cnpj.dataSituacaoCadastral],
                ["Motivo da Situacao", data.cnpj.motivoSituacao], ["Natureza Juridica", data.cnpj.naturezaJuridica],
                ["CNAE Principal", data.cnpj.cnaePrincipal], ["CNAEs Secundarios", data.cnpj.cnaeSecundarios],
                ["Porte", data.cnpj.porte], ["Capital Social (CNPJ)", data.cnpj.capitalSocialCNPJ],
                ["Endereco Completo", data.cnpj.endereco],
                ["Telefone", data.cnpj.telefone], ["E-mail", data.cnpj.email],
              ]),

              // Section 02 — QSA
              spacer(300),
              sectionTitle("02", "QUADRO SOCIETARIO (QSA)", green),
              spacer(100),
              ...(data.qsa.capitalSocial ? [new Paragraph({ spacing: { after: 100 }, children: [
                new TextRun({ text: "Capital Social: ", size: 17, bold: true, color: muted, font: "Arial" }),
                new TextRun({ text: data.qsa.capitalSocial, size: 18, bold: true, color: textDark, font: "Arial" }),
              ] })] : []),
              qsaTable,

              // Section 03 — Contrato Social
              spacer(300),
              sectionTitle("03", "CONTRATO SOCIAL", navy),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "QUADRO SOCIETARIO (CONTRATO)", size: 15, bold: true, color: muted, font: "Arial" })] }),
              sociosTable,
              spacer(100),
              fieldTable([
                ["Capital Social", data.contrato.capitalSocial], ["Data de Constituicao", data.contrato.dataConstituicao],
                ["Prazo de Duracao", data.contrato.prazoDuracao], ["Foro", data.contrato.foro],
                ["Objeto Social", data.contrato.objetoSocial], ["Administracao e Poderes", data.contrato.administracao],
              ]),
              ...(data.contrato.temAlteracoes ? [spacer(100), new Paragraph({
                shading: { type: "clear" as const, fill: "FEF3C7" }, spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: "  ATENCAO: Documento com alteracoes societarias recentes", bold: true, color: warning, size: 18, font: "Arial" })],
              })] : []),

              // Section 04 — Faturamento
              spacer(300),
              sectionTitle("04", "FATURAMENTO", green),
              spacer(100),
              ...(data.faturamento.faturamentoZerado ? [alertParagraph("Faturamento zerado no periodo", "ALTA")] : []),
              ...(!data.faturamento.dadosAtualizados ? [alertParagraph(`Dados desatualizados — ultimo mes: ${data.faturamento.ultimoMesComDados || "N/A"}`, "MODERADA")] : []),
              fieldTable([
                ["Somatoria Anual (R$)", data.faturamento.somatoriaAno],
                ["Media Mensal (R$)", data.faturamento.mediaAno],
                ["Ultimo Mes com Dados", data.faturamento.ultimoMesComDados],
              ]),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "FATURAMENTO MENSAL", size: 15, bold: true, color: muted, font: "Arial" })] }),
              faturamentoTable,

              // Section 05 — SCR
              spacer(300),
              sectionTitle("05", "PERFIL DE CREDITO — SCR / BACEN", warning),
              spacer(100),
              fieldTable([
                ["Carteira a Vencer (R$)", data.scr.carteiraAVencer],
                ["Vencidos (R$)", data.scr.vencidos],
                ["Prejuizos (R$)", data.scr.prejuizos],
                ["Limite de Credito (R$)", data.scr.limiteCredito],
                ["Qtde Instituicoes", data.scr.qtdeInstituicoes],
                ["Qtde Operacoes", data.scr.qtdeOperacoes],
                ["Total Dividas Ativas (R$)", data.scr.totalDividasAtivas],
                ["Classificacao de Risco (A-H)", data.scr.classificacaoRisco],
                ["Operacoes a Vencer (R$)", data.scr.operacoesAVencer],
                ["Operacoes em Atraso", data.scr.operacoesEmAtraso],
                ["Operacoes Vencidas (R$)", data.scr.operacoesVencidas],
                ["Tempo Medio de Atraso", data.scr.tempoAtraso],
                ["Coobrigacoes / Garantias (R$)", data.scr.coobrigacoes],
                ["Carteira Curto Prazo (R$)", data.scr.carteiraCurtoPrazo],
                ["Carteira Longo Prazo (R$)", data.scr.carteiraLongoPrazo],
                ["Valores Moeda Estrangeira", data.scr.valoresMoedaEstrangeira],
                ["Historico de Inadimplencia", data.scr.historicoInadimplencia],
              ]),
              ...(scrCompTable ? [
                spacer(200),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "COMPARATIVO SCR (ANTERIOR vs ATUAL)", size: 15, bold: true, color: muted, font: "Arial" })] }),
                scrCompTable,
              ] : []),
              ...(modalidadesTable ? [
                spacer(200),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "MODALIDADES DE CREDITO", size: 15, bold: true, color: muted, font: "Arial" })] }),
                modalidadesTable,
              ] : []),
              ...(instituicoesTable ? [
                spacer(200),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "INSTITUICOES CREDORAS", size: 15, bold: true, color: muted, font: "Arial" })] }),
                instituicoesTable,
              ] : []),

              // Section 06 — Protestos
              spacer(300),
              sectionTitle("06", "PROTESTOS", danger),
              spacer(100),
              fieldTable([
                ["Vigentes (Qtd)", data.protestos?.vigentesQtd || "0"],
                ["Vigentes (R$)", data.protestos?.vigentesValor || "0,00"],
                ["Regularizados (Qtd)", data.protestos?.regularizadosQtd || "0"],
                ["Regularizados (R$)", data.protestos?.regularizadosValor || "0,00"],
              ]),
              ...(protestosVigentes > 0 ? [alertParagraph(`${protestosVigentes} protesto(s) vigente(s)`, "ALTA")] : []),
              ...(protestosTable ? [
                spacer(100),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "DETALHES DOS PROTESTOS", size: 15, bold: true, color: muted, font: "Arial" })] }),
                protestosTable,
              ] : []),

              // Section 07 — Processos
              spacer(300),
              sectionTitle("07", "PROCESSOS JUDICIAIS", warning),
              spacer(100),
              fieldTable([
                ["Passivos (Total)", data.processos?.passivosTotal || "0"],
                ["Ativos (Total)", data.processos?.ativosTotal || "0"],
                ["Valor Estimado (R$)", data.processos?.valorTotalEstimado || "0,00"],
              ]),
              ...(data.processos?.temRJ ? [alertParagraph("RECUPERACAO JUDICIAL identificada", "ALTA")] : []),
              ...(distTable ? [
                spacer(100),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "DISTRIBUICAO POR TIPO", size: 15, bold: true, color: muted, font: "Arial" })] }),
                distTable,
              ] : []),
              ...(bancTable ? [
                spacer(100),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "PROCESSOS BANCARIOS", size: 15, bold: true, color: muted, font: "Arial" })] }),
                bancTable,
              ] : []),

              // Section 08 — Grupo Economico
              spacer(300),
              sectionTitle("08", "GRUPO ECONOMICO", navy),
              spacer(100),
              ...(geTable ? [geTable] : [new Paragraph({ children: [new TextRun({ text: "Nenhuma empresa identificada no grupo economico.", italics: true, color: muted, font: "Arial" })] })]),

              // Section 09 — Parecer
              spacer(300),
              sectionTitle("09", "PARECER FINAL", navy),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [
                new TextRun({ text: `Decisao: ${decision}  |  Rating: ${finalRating}/10`, size: 22, bold: true, color: decision === "APROVADO" ? green : decision === "PENDENTE" ? warning : danger, font: "Arial" }),
              ] }),
              spacer(100),
              fieldTable([
                ["Parecer", data.resumoRisco || "Parecer nao preenchido."],
              ]),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(docx);
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
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Capital Financas";
      wb.created = new Date();

      const NAVY = "FF203B88"; const GREEN = "FF73B815"; const WARNING = "FFD97706";
      const SURFACE = "FFF5F7FB"; const STRIPE = "FFEDF2FB";
      const BORDER_C = "FFD1DCF0"; const TEXT = "FF111827"; const MUTED = "FF6B7280"; const WHITE = "FFFFFFFF";
      const DANGER = "FFDC2626";

      const F = (c: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: c } });
      const B = { style: "thin" as const, color: { argb: BORDER_C } };
      const BD = { top: B, bottom: B, left: B, right: B };
      const genDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const footerDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const ws = wb.addWorksheet("Relatorio Capital Financas");
      ws.columns = [{ width: 2.5 }, { width: 28 }, { width: 28 }, { width: 20 }, { width: 14 }, { width: 2.5 }];
      ws.views = [{ showGridLines: false }];

      let r = 1;

      // -- HEADER BRANDED --
      ws.mergeCells(r, 1, r, 6);
      ws.getRow(r).height = 48;
      const h = ws.getRow(r).getCell(1);
      h.value = "     capital financas"; h.font = { bold: true, size: 20, color: { argb: WHITE }, name: "Arial" };
      h.fill = F(NAVY); h.alignment = { vertical: "middle" };
      r++;

      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 5; ws.getRow(r).getCell(1).fill = F(GREEN); r++;

      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 24;
      const sub = ws.getRow(r).getCell(1);
      sub.value = "     RELATORIO CONSOLIDADO  —  Consolidador de Documentos";
      sub.font = { size: 10, color: { argb: MUTED }, name: "Arial" }; sub.fill = F(SURFACE); sub.alignment = { vertical: "middle" };
      r++;

      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 22;
      const info = ws.getRow(r).getCell(1);
      info.value = `     ${data.cnpj.razaoSocial || "Empresa"}  |  CNPJ: ${data.cnpj.cnpj || "—"}  |  Rating: ${finalRating}/10  |  ${decision}  |  ${genDate}`;
      info.font = { size: 10, bold: true, color: { argb: NAVY }, name: "Arial" }; info.fill = F(STRIPE); info.alignment = { vertical: "middle" };
      r++; r++;

      // -- HELPERS --
      const secTitle = (num: string, title: string, color: string) => {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).height = 30;
        const c = ws.getRow(r).getCell(2);
        c.value = `  ${num}    ${title}`;
        c.font = { bold: true, size: 13, color: { argb: color }, name: "Arial" };
        c.fill = F(SURFACE);
        c.border = { left: { style: "medium" as const, color: { argb: color.replace("FF", "") } }, bottom: B };
        c.alignment = { vertical: "middle" };
        r++; r++;
      };

      const field2 = (label: string, value: string, i: number) => {
        const bg = i % 2 === 0 ? STRIPE : WHITE;
        ws.mergeCells(r, 3, r, 5);
        ws.getRow(r).height = 24;
        const cl = ws.getRow(r).getCell(2);
        cl.value = label; cl.font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        cl.fill = F(bg); cl.border = BD; cl.alignment = { vertical: "middle" };
        const cv = ws.getRow(r).getCell(3);
        cv.value = value || "—"; cv.font = { size: 11, color: { argb: TEXT }, name: "Arial", bold: !!value };
        cv.fill = F(bg); cv.border = BD; cv.alignment = { vertical: "middle", wrapText: true };
        r++;
      };

      const xlSpacer = () => { ws.getRow(r).height = 10; r++; };

      const xlTable = (headers: string[], rows: string[][], headerColor: string) => {
        const hRow = ws.getRow(r);
        hRow.height = 26;
        headers.forEach((hdr, i) => {
          const c = hRow.getCell(i + 2);
          c.value = hdr; c.font = { bold: true, size: 9, color: { argb: WHITE }, name: "Arial" };
          c.fill = F(headerColor); c.border = BD; c.alignment = { vertical: "middle", horizontal: "center" };
        });
        r++;
        rows.forEach((row, i) => {
          const xlRow = ws.getRow(r);
          xlRow.height = 24;
          const bg = i % 2 === 0 ? STRIPE : WHITE;
          row.forEach((v, ci) => {
            const c = xlRow.getCell(ci + 2);
            c.value = v; c.font = { size: 10, color: { argb: TEXT }, name: "Arial" };
            c.fill = F(bg); c.border = BD; c.alignment = { vertical: "middle" };
          });
          r++;
        });
      };

      // ======= SECAO 01: IDENTIFICACAO =======
      secTitle("01", "IDENTIFICACAO DA EMPRESA", NAVY);
      [
        ["Razao Social", data.cnpj.razaoSocial], ["Nome Fantasia", data.cnpj.nomeFantasia],
        ["CNPJ", data.cnpj.cnpj], ["Data de Abertura", data.cnpj.dataAbertura],
        ["Situacao Cadastral", data.cnpj.situacaoCadastral], ["Data da Situacao", data.cnpj.dataSituacaoCadastral],
        ["Motivo da Situacao", data.cnpj.motivoSituacao], ["Natureza Juridica", data.cnpj.naturezaJuridica],
        ["CNAE Principal", data.cnpj.cnaePrincipal], ["CNAEs Secundarios", data.cnpj.cnaeSecundarios],
        ["Porte", data.cnpj.porte], ["Capital Social (CNPJ)", data.cnpj.capitalSocialCNPJ],
        ["Endereco Completo", data.cnpj.endereco],
        ["Telefone", data.cnpj.telefone], ["E-mail", data.cnpj.email],
      ].forEach(([l, v], i) => field2(l, v, i));

      xlSpacer(); xlSpacer();

      // ======= SECAO 02: QSA =======
      secTitle("02", "QUADRO SOCIETARIO (QSA)", GREEN);
      if (data.qsa.capitalSocial) field2("Capital Social", data.qsa.capitalSocial, 0);
      xlSpacer();

      const validQSAXl = data.qsa.quadroSocietario.filter(s => s.nome);
      if (validQSAXl.length > 0) {
        xlTable(
          ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
          validQSAXl.map(s => [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", s.participacao || "—"]),
          GREEN,
        );
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhum socio encontrado no QSA";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 03: CONTRATO SOCIAL =======
      secTitle("03", "CONTRATO SOCIAL", NAVY);

      const validSociosXl = data.contrato.socios.filter(s => s.nome);
      if (validSociosXl.length > 0) {
        xlTable(
          ["NOME DO SOCIO", "CPF", "QUALIFICACAO", "PART."],
          validSociosXl.map(s => [s.nome, s.cpf || "—", s.qualificacao || "—", s.participacao || "—"]),
          NAVY,
        );
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhum socio encontrado";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }

      xlSpacer();
      [
        ["Capital Social", data.contrato.capitalSocial], ["Data de Constituicao", data.contrato.dataConstituicao],
        ["Prazo de Duracao", data.contrato.prazoDuracao], ["Foro", data.contrato.foro],
        ["Objeto Social", data.contrato.objetoSocial], ["Administracao e Poderes", data.contrato.administracao],
        ["Alteracoes Societarias", data.contrato.temAlteracoes ? "SIM — Alteracoes recentes" : "Nao identificadas"],
      ].forEach(([l, v], i) => field2(l, v as string, i));

      xlSpacer(); xlSpacer();

      // ======= SECAO 04: FATURAMENTO =======
      secTitle("04", "FATURAMENTO", GREEN);

      if (data.faturamento.faturamentoZerado) {
        field2("[ALTA] ALERTA", "Faturamento zerado no periodo", 0);
      }
      if (!data.faturamento.dadosAtualizados) {
        field2("[MODERADA] ATENCAO", `Dados desatualizados — ultimo mes: ${data.faturamento.ultimoMesComDados || "N/A"}`, 1);
      }

      [
        ["Somatoria Anual (R$)", data.faturamento.somatoriaAno],
        ["Media Mensal (R$)", data.faturamento.mediaAno],
        ["Ultimo Mes com Dados", data.faturamento.ultimoMesComDados],
      ].forEach(([l, v], i) => field2(l, v, i));

      xlSpacer();
      const validMesesXl = data.faturamento.meses.filter(m => m.mes);
      if (validMesesXl.length > 0) {
        xlTable(
          ["MES", "VALOR (R$)", "", ""],
          validMesesXl.map(m => [m.mes, m.valor || "0,00", "", ""]),
          GREEN,
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 05: SCR / BACEN =======
      secTitle("05", "PERFIL DE CREDITO — SCR / BACEN", WARNING);
      [
        ["Carteira a Vencer (R$)", data.scr.carteiraAVencer],
        ["Vencidos (R$)", data.scr.vencidos],
        ["Prejuizos (R$)", data.scr.prejuizos],
        ["Limite de Credito (R$)", data.scr.limiteCredito],
        ["Qtde Instituicoes", data.scr.qtdeInstituicoes],
        ["Qtde Operacoes", data.scr.qtdeOperacoes],
        ["Total de Dividas Ativas (R$)", data.scr.totalDividasAtivas],
        ["Classificacao de Risco (A-H)", data.scr.classificacaoRisco],
        ["Operacoes a Vencer (R$)", data.scr.operacoesAVencer],
        ["Operacoes em Atraso", data.scr.operacoesEmAtraso],
        ["Operacoes Vencidas (R$)", data.scr.operacoesVencidas],
        ["Tempo Medio de Atraso", data.scr.tempoAtraso],
        ["Coobrigacoes / Garantias (R$)", data.scr.coobrigacoes],
        ["Carteira Curto Prazo (R$)", data.scr.carteiraCurtoPrazo],
        ["Carteira Longo Prazo (R$)", data.scr.carteiraLongoPrazo],
        ["Valores Moeda Estrangeira", data.scr.valoresMoedaEstrangeira],
        ["Historico de Inadimplencia", data.scr.historicoInadimplencia],
      ].forEach(([l, v], i) => field2(l, v, i));

      // SCR Comparison
      if (data.scrAnterior) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "COMPARATIVO SCR (ANTERIOR vs ATUAL)";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        const compMetrics = [
          { label: "Carteira a Vencer", ant: data.scrAnterior.carteiraAVencer, at: data.scr.carteiraAVencer },
          { label: "Vencidos", ant: data.scrAnterior.vencidos, at: data.scr.vencidos },
          { label: "Prejuizos", ant: data.scrAnterior.prejuizos, at: data.scr.prejuizos },
          { label: "Total Dividas", ant: data.scrAnterior.totalDividasAtivas, at: data.scr.totalDividasAtivas },
          { label: "Limite Credito", ant: data.scrAnterior.limiteCredito, at: data.scr.limiteCredito },
        ];
        xlTable(
          ["METRICA", "ANTERIOR", "ATUAL", "VARIACAO"],
          compMetrics.map(m => {
            const d1 = parseMoneyToNumber(m.ant); const d2 = parseMoneyToNumber(m.at);
            const diff = d2 - d1;
            return [m.label, m.ant || "—", m.at || "—", diff === 0 ? "=" : diff > 0 ? `+${diff.toLocaleString("pt-BR")}` : diff.toLocaleString("pt-BR")];
          }),
          WARNING,
        );
      }

      // Modalidades
      if (data.scr.modalidades.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "MODALIDADES DE CREDITO";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["MODALIDADE", "TOTAL", "A VENCER", "VENCIDO"],
          data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido]),
          WARNING,
        );
      }

      // Instituicoes
      if (data.scr.instituicoes.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "INSTITUICOES CREDORAS";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["INSTITUICAO", "VALOR (R$)", "", ""],
          data.scr.instituicoes.map(i => [i.nome, i.valor, "", ""]),
          WARNING,
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 06: PROTESTOS =======
      secTitle("06", "PROTESTOS", DANGER);
      [
        ["Vigentes (Qtd)", data.protestos?.vigentesQtd || "0"],
        ["Vigentes (R$)", data.protestos?.vigentesValor || "0,00"],
        ["Regularizados (Qtd)", data.protestos?.regularizadosQtd || "0"],
        ["Regularizados (R$)", data.protestos?.regularizadosValor || "0,00"],
      ].forEach(([l, v], i) => field2(l, v, i));

      const protestoDetXl = data.protestos?.detalhes || [];
      if (protestoDetXl.length > 0) {
        xlSpacer();
        xlTable(
          ["DATA", "CREDOR", "VALOR (R$)", "STATUS"],
          protestoDetXl.map(p => [p.data || "—", p.credor || "—", p.valor || "—", p.regularizado ? "Regularizado" : "Vigente"]),
          DANGER,
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 07: PROCESSOS =======
      secTitle("07", "PROCESSOS JUDICIAIS", WARNING);
      [
        ["Passivos (Total)", data.processos?.passivosTotal || "0"],
        ["Ativos (Total)", data.processos?.ativosTotal || "0"],
        ["Valor Estimado (R$)", data.processos?.valorTotalEstimado || "0,00"],
        ["Recuperacao Judicial", data.processos?.temRJ ? "SIM" : "NAO"],
      ].forEach(([l, v], i) => field2(l, v, i));

      const distXl = data.processos?.distribuicao || [];
      if (distXl.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "DISTRIBUICAO POR TIPO";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["TIPO", "QUANTIDADE", "PERCENTUAL", ""],
          distXl.map(d => [d.tipo, d.qtd, d.pct ? `${d.pct}%` : "—", ""]),
          WARNING,
        );
      }

      const bancXl = data.processos?.bancarios || [];
      if (bancXl.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "PROCESSOS BANCARIOS";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["BANCO", "ASSUNTO", "STATUS", "DATA"],
          bancXl.map(b => [b.banco || "—", b.assunto || "—", b.status || "—", b.data || "—"]),
          WARNING,
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 08: GRUPO ECONOMICO =======
      secTitle("08", "GRUPO ECONOMICO", NAVY);
      const geXl = data.grupoEconomico?.empresas || [];
      if (geXl.length > 0) {
        xlTable(
          ["RAZAO SOCIAL", "CNPJ", "RELACAO", "SCR (R$)"],
          geXl.map(e => [e.razaoSocial, e.cnpj, e.relacao, e.scrTotal || "—"]),
          NAVY,
        );
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhuma empresa identificada no grupo economico";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 09: PARECER =======
      secTitle("09", "PARECER FINAL", NAVY);
      field2("Decisao", decision, 0);
      field2("Rating", `${finalRating}/10`, 1);
      field2("Parecer", data.resumoRisco || "Parecer nao preenchido.", 2);

      xlSpacer(); xlSpacer();

      // -- Rodape de dados --
      field2("Data de Geracao", genDate, 0);
      field2("Empresa Analisada", data.cnpj.razaoSocial, 1);
      field2("CNPJ", data.cnpj.cnpj, 2);

      xlSpacer(); xlSpacer();

      // -- FOOTER --
      ws.mergeCells(r, 2, r, 5);
      ws.getRow(r).getCell(2).value = `Capital Financas — Consolidador | ${footerDate} | Confidencial`;
      ws.getRow(r).getCell(2).font = { size: 8, italic: true, color: { argb: "FF9CA3AF" }, name: "Arial" };
      ws.getRow(r).getCell(2).alignment = { horizontal: "center" };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.xlsx`);
      setGeneratedFormats(p => new Set(p).add("xlsx"));
    } catch (err) {
      console.error("Excel generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // HTML Generation
  // ═══════════════════════════════════════════════════
  const generateHTML = () => {
    setGeneratingFormat("html");
    try {
      const d = data;
      const esc = (s: string) => (s || "—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const maskCpf = (cpf: string) => cpf ? cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, "$1.***.*$3-$4") : "—";
      const genDt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const footerDt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const vs = d.contrato.socios.filter(s => s.nome);
      const vq = d.qsa.quadroSocietario.filter(s => s.nome);

      const row = (label: string, value: string) => {
        const isEmpty = !value || value === "—" || value === "0" || value === "0,00";
        return `<tr><td class="lbl">${esc(label)}</td><td class="val${isEmpty ? " muted" : ""}">${isEmpty ? "—" : esc(value)}</td></tr>`;
      };
      const riskBadge = (r: string) => {
        if (!r) return `<span class="muted">—</span>`;
        const bad = ["D","E","F","G","H"].includes(r.toUpperCase());
        return `<span class="badge ${bad ? "badge-red" : "badge-green"}">${esc(r)}</span>`;
      };

      const alertHtml = (a: Alert) => {
        const cls = a.severity === "ALTA" ? "danger" : "warn";
        return `<div class="alert-box ${cls}"><span class="alert-icon">${a.severity === "ALTA" ? "!" : "i"}</span><span>[${a.severity}] ${esc(a.message)}</span></div>`;
      };

      const protestosDet = d.protestos?.detalhes || [];
      const distArr = d.processos?.distribuicao || [];
      const bancArr = d.processos?.bancarios || [];
      const geArr = d.grupoEconomico?.empresas || [];

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatorio — ${esc(d.cnpj.razaoSocial || "Capital Financas")}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',system-ui,sans-serif;background:#F3F4F6;color:#1E293B;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:960px;margin:0 auto;padding:32px;background:#fff}
.header{background:#203B88;color:#fff;padding:28px 32px;border-radius:10px 10px 0 0}
.header .logo{font-size:22px;font-weight:700;letter-spacing:-0.3px}
.header .logo span{color:#73B815}
.header .subtitle{font-size:11px;color:#94A3B8;margin-top:4px;text-transform:uppercase;letter-spacing:2px}
.info-bar{background:#F0F4F8;padding:14px 32px;display:flex;gap:32px;flex-wrap:wrap;border-bottom:1px solid #E2E8F0}
.info-bar .item{font-size:13px;color:#64748B}
.info-bar .item strong{color:#203B88;font-weight:600}
.section{padding:28px 0}
.section+.section{border-top:1px solid #E5E7EB}
.sec-title{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.sec-bar{width:4px;height:32px;border-radius:2px;background:#73B815}
.sec-num{font-size:13px;font-weight:700;color:#203B88}
.sec-title h2{font-size:17px;font-weight:700;color:#203B88}
table{width:100%;border-collapse:collapse;table-layout:fixed}
table tr td{padding:8px 12px;font-size:14px;border-bottom:1px solid #E5E7EB;vertical-align:top;white-space:normal;word-break:break-word;height:auto;min-height:36px}
table tr:nth-child(even) td{background:#F0F4F8}
table tr:nth-child(odd) td{background:#FFFFFF}
table tr:last-child td{border-bottom:none}
td.lbl{width:240px;min-width:240px;color:#6B7280;font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;background:#F8FAFC !important}
td.val{color:#111827;font-weight:600}
td.val.muted{color:#9CA3AF;font-weight:400}
.data-table{border-radius:8px;overflow:hidden;border:1px solid #E2E8F0;margin-bottom:20px}
.data-table thead th{background:#203B88;color:#fff;padding:10px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-align:left}
.data-table tbody td{padding:10px 12px;font-size:14px;border-bottom:1px solid #E5E7EB;white-space:normal;word-break:break-word}
.data-table tbody tr:nth-child(even){background:#F0F4F8}
.data-table tbody tr:nth-child(odd){background:#fff}
.data-table.green thead th{background:#73B815}
.data-table.warning thead th{background:#D97706}
.data-table.danger thead th{background:#DC2626}
.badge{display:inline-block;padding:3px 12px;border-radius:4px;font-size:12px;font-weight:700}
.badge-red{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA}
.badge-green{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
.badge-amber{background:#FFFBEB;color:#D97706;border:1px solid #FDE68A}
.hero-num{font-size:24px;font-weight:700;color:#203B88;letter-spacing:-0.5px}
.hero-num.amber{color:#D97706}
.muted{color:#9CA3AF}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.chip{display:inline-block;background:#EFF6FF;color:#1D4ED8;font-size:12px;font-weight:500;padding:4px 10px;border-radius:4px}
.chip.gray{background:#F3F4F6;color:#374151}
.footer-block{margin-top:28px;padding-top:20px;border-top:1px solid #E5E7EB}
.footer-block table tr td{border-bottom:1px solid #E5E7EB;background:#F8FAFC !important}
.footer-block table tr:nth-child(even) td{background:#fff !important}
.footer-text{text-align:center;padding:20px 0;font-size:11px;color:#94A3B8}
.alert-box{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:8px;font-size:13px;line-height:1.6;margin-bottom:12px}
.alert-box.danger{background:#FEF2F2;border:1px solid #FECACA;color:#DC2626}
.alert-box.warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}
.alert-box.clean{background:#F0FDF4;border:1px solid #BBF7D0;color:#16A34A}
.alert-icon{font-size:16px;flex-shrink:0;margin-top:1px}
.rating-panel{display:flex;gap:16px;margin-bottom:20px}
.rating-card{flex:1;padding:16px;border-radius:8px;border:1px solid #E5E7EB}
@media print{body{background:#fff}.page{padding:20px;max-width:100%}}
</style></head><body>
<div class="page">

<!-- HEADER -->
<div class="header">
  <div class="logo">capital<span>financas</span></div>
  <div class="subtitle">Relatorio Consolidado — Consolidador de Documentos</div>
</div>
<div class="info-bar">
  <div class="item"><strong>${esc(d.cnpj.razaoSocial)}</strong></div>
  <div class="item">CNPJ: <strong>${esc(d.cnpj.cnpj)}</strong></div>
  <div class="item">Gerado em <strong>${genDt}</strong></div>
</div>

<!-- SUMARIO -->
<div class="section">
  <div class="rating-panel">
    <div class="rating-card" style="background:${decisionBg};border-color:${decisionBorder}">
      <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em">Rating</div>
      <div style="font-size:28px;font-weight:700;color:${decisionColor}">${finalRating}/10</div>
      <div style="font-size:13px;font-weight:700;color:${decisionColor}">${decision}</div>
    </div>
    <div class="rating-card" style="background:${riskScore === 'baixo' ? '#F0FDF4' : riskScore === 'medio' ? '#FFFBEB' : '#FEF2F2'};border-color:${riskScore === 'baixo' ? '#BBF7D0' : riskScore === 'medio' ? '#FDE68A' : '#FECACA'}">
      <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em">Risco</div>
      <div style="font-size:16px;font-weight:700;color:${riskScore === 'baixo' ? '#16A34A' : riskScore === 'medio' ? '#D97706' : '#DC2626'}">${riskScore === 'alto' ? 'ALTO' : riskScore === 'medio' ? 'MODERADO' : 'BAIXO'}</div>
      <div style="font-size:12px;color:#6B7280">Alertas: ${alerts.length}</div>
    </div>
  </div>
  ${alerts.length > 0 ? `<div style="margin-bottom:16px">${alerts.map(a => alertHtml(a)).join('')}</div>` : ''}
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
    <div class="chip">${esc(d.cnpj.situacaoCadastral || "—")}</div>
    <div class="chip">${esc(d.cnpj.cnaePrincipal ? d.cnpj.cnaePrincipal.substring(0,30) : "—")}</div>
    <div class="chip gray">${esc(d.qsa.capitalSocial || d.contrato.capitalSocial || "—")}</div>
    ${companyAge ? `<div class="chip gray">${companyAge}</div>` : ''}
  </div>
</div>

<!-- SECAO 01 — IDENTIFICACAO -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">01</span><h2>Identificacao da Empresa</h2></div>
  <table>
    ${row("Razao Social", d.cnpj.razaoSocial)}
    ${row("Nome Fantasia", d.cnpj.nomeFantasia)}
    ${row("CNPJ", d.cnpj.cnpj)}
    ${row("Data de Abertura", d.cnpj.dataAbertura)}
    ${row("Situacao Cadastral", d.cnpj.situacaoCadastral)}
    ${row("Data da Situacao", d.cnpj.dataSituacaoCadastral)}
    ${row("Motivo da Situacao", d.cnpj.motivoSituacao)}
    ${row("Natureza Juridica", d.cnpj.naturezaJuridica)}
    ${row("CNAE Principal", d.cnpj.cnaePrincipal)}
    ${row("CNAEs Secundarios", d.cnpj.cnaeSecundarios)}
    ${row("Porte", d.cnpj.porte)}
    ${row("Capital Social", d.cnpj.capitalSocialCNPJ)}
    ${row("Endereco", d.cnpj.endereco)}
    ${row("Telefone", d.cnpj.telefone)}
    ${row("E-mail", d.cnpj.email)}
  </table>
</div>

<!-- SECAO 02 — QSA -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">02</span><h2>Quadro Societario (QSA)</h2></div>
  ${d.qsa.capitalSocial ? `<p style="margin-bottom:12px;font-size:14px"><strong>Capital Social:</strong> ${esc(d.qsa.capitalSocial)}</p>` : ''}
  <table class="data-table">
    <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Qualificacao</th><th>Participacao</th></tr></thead>
    <tbody>${vq.length > 0 ? vq.map(s => `<tr><td>${esc(s.nome)}</td><td style="font-family:monospace">${esc(s.cpfCnpj)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("") : "<tr><td colspan='4' style='text-align:center;color:#94A3B8;padding:20px'>Nenhum socio encontrado</td></tr>"}</tbody>
  </table>
</div>

<!-- SECAO 03 — CONTRATO SOCIAL -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">03</span><h2>Contrato Social</h2></div>
  <table class="data-table">
    <thead><tr><th>Nome do Socio</th><th>CPF</th><th>Qualificacao</th><th>Participacao</th></tr></thead>
    <tbody>${vs.length > 0 ? vs.map(s => `<tr><td>${esc(s.nome)}</td><td style="font-family:monospace">${maskCpf(s.cpf)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("") : "<tr><td colspan='4' style='text-align:center;color:#94A3B8;padding:20px'>Nenhum socio encontrado</td></tr>"}</tbody>
  </table>
  <table>
    ${row("Capital Social", d.contrato.capitalSocial)}
    ${row("Data de Constituicao", d.contrato.dataConstituicao)}
    ${row("Prazo de Duracao", d.contrato.prazoDuracao)}
    ${row("Foro", d.contrato.foro)}
    ${row("Objeto Social", d.contrato.objetoSocial)}
    ${row("Administracao e Poderes", d.contrato.administracao)}
    ${d.contrato.temAlteracoes ? '<tr><td class="lbl">Alteracoes</td><td class="val"><span class="badge badge-amber">Alteracoes societarias recentes</span></td></tr>' : ""}
  </table>
</div>

<!-- SECAO 04 — FATURAMENTO -->
<div class="section">
  <div class="sec-title"><div class="sec-bar" style="background:#73B815"></div><span class="sec-num">04</span><h2>Faturamento</h2></div>
  ${d.faturamento.faturamentoZerado ? '<div class="alert-box danger"><span class="alert-icon">!</span><span>[ALTA] Faturamento zerado no periodo</span></div>' : ''}
  ${!d.faturamento.dadosAtualizados ? `<div class="alert-box warn"><span class="alert-icon">i</span><span>[MODERADA] Dados desatualizados — ultimo mes com dados: ${esc(d.faturamento.ultimoMesComDados || 'N/A')}</span></div>` : ''}
  <table>
    ${row("Somatoria Anual (R$)", d.faturamento.somatoriaAno)}
    ${row("Media Mensal (R$)", d.faturamento.mediaAno)}
    ${row("Ultimo Mes com Dados", d.faturamento.ultimoMesComDados)}
  </table>
  ${d.faturamento.meses.filter(m => m.mes).length > 0 ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Faturamento Mensal</h3>
  <table class="data-table green">
    <thead><tr><th>Mes</th><th>Valor (R$)</th></tr></thead>
    <tbody>${d.faturamento.meses.filter(m => m.mes).map(m => `<tr><td>${esc(m.mes)}</td><td><strong>${esc(m.valor || '0,00')}</strong></td></tr>`).join('')}</tbody>
  </table>` : ''}
</div>

<!-- SECAO 05 — PERFIL DE CREDITO SCR/BACEN -->
<div class="section">
  <div class="sec-title"><div class="sec-bar" style="background:#D97706"></div><span class="sec-num">05</span><h2>Perfil de Credito — SCR / BACEN</h2></div>
  <table>
    <tr><td class="lbl">Total de Dividas Ativas</td><td class="val"><span class="hero-num${parseFloat((d.scr.totalDividasAtivas||"0").replace(/\./g,"").replace(",",".")) > 1000000 ? " amber" : ""}">${d.scr.totalDividasAtivas ? "R$ " + esc(d.scr.totalDividasAtivas) : "—"}</span></td></tr>
    <tr><td class="lbl">Classificacao de Risco</td><td class="val">${riskBadge(d.scr.classificacaoRisco)}</td></tr>
    ${row("Carteira a Vencer (R$)", d.scr.carteiraAVencer)}
    ${row("Vencidos (R$)", d.scr.vencidos)}
    ${row("Prejuizos (R$)", d.scr.prejuizos)}
    ${row("Limite de Credito (R$)", d.scr.limiteCredito)}
    ${row("Qtde Instituicoes", d.scr.qtdeInstituicoes)}
    ${row("Qtde Operacoes", d.scr.qtdeOperacoes)}
    ${row("Operacoes a Vencer (R$)", d.scr.operacoesAVencer)}
    ${row("Operacoes em Atraso (R$)", d.scr.operacoesEmAtraso)}
    ${row("Operacoes Vencidas (R$)", d.scr.operacoesVencidas)}
    ${row("Tempo Medio de Atraso", d.scr.tempoAtraso)}
    ${row("Coobrigacoes / Garantias (R$)", d.scr.coobrigacoes)}
    ${row("Carteira Curto Prazo (R$)", d.scr.carteiraCurtoPrazo)}
    ${row("Carteira Longo Prazo (R$)", d.scr.carteiraLongoPrazo)}
    ${row("Valores Moeda Estrangeira", d.scr.valoresMoedaEstrangeira)}
  </table>

  ${d.scrAnterior ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Comparativo SCR (Anterior vs Atual)</h3>
  <table class="data-table warning">
    <thead><tr><th>Metrica</th><th>Anterior</th><th>Atual</th><th>Variacao</th></tr></thead>
    <tbody>${[
      { label: "Carteira a Vencer", ant: d.scrAnterior.carteiraAVencer, at: d.scr.carteiraAVencer },
      { label: "Vencidos", ant: d.scrAnterior.vencidos, at: d.scr.vencidos },
      { label: "Prejuizos", ant: d.scrAnterior.prejuizos, at: d.scr.prejuizos },
      { label: "Total Dividas", ant: d.scrAnterior.totalDividasAtivas, at: d.scr.totalDividasAtivas },
    ].map(m => {
      const d1 = parseMoneyToNumber(m.ant); const d2 = parseMoneyToNumber(m.at);
      const diff = d2 - d1;
      const varStr = diff === 0 ? "=" : diff > 0 ? `+${diff.toLocaleString("pt-BR")}` : diff.toLocaleString("pt-BR");
      return `<tr><td>${esc(m.label)}</td><td>${esc(m.ant || "—")}</td><td>${esc(m.at || "—")}</td><td><strong>${esc(varStr)}</strong></td></tr>`;
    }).join('')}</tbody>
  </table>` : ''}

  ${d.scr.modalidades.length > 0 ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Modalidades de Credito</h3>
  <table class="data-table warning">
    <thead><tr><th>Modalidade</th><th>Total</th><th>A Vencer</th><th>Vencido</th><th>Part.</th></tr></thead>
    <tbody>${d.scr.modalidades.map(m => `<tr><td>${esc(m.nome)}</td><td>${esc(m.total)}</td><td>${esc(m.aVencer)}</td><td>${esc(m.vencido)}</td><td><strong>${esc(m.participacao)}</strong></td></tr>`).join('')}</tbody>
  </table>` : ''}

  ${d.scr.instituicoes.length > 0 ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Instituicoes Credoras</h3>
  <table class="data-table warning">
    <thead><tr><th>Instituicao</th><th>Valor (R$)</th></tr></thead>
    <tbody>${d.scr.instituicoes.map(i => `<tr><td>${esc(i.nome)}</td><td><strong>${esc(i.valor)}</strong></td></tr>`).join('')}</tbody>
  </table>` : ''}

  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Historico de Inadimplencia</h3>
  ${d.scr.historicoInadimplencia
    ? `<div class="alert-box warn"><span class="alert-icon">!</span><span>${esc(d.scr.historicoInadimplencia)}</span></div>`
    : `<div class="alert-box clean"><span class="alert-icon">ok</span><span>Nao ha registro de operacoes vencidas ou prejuizos</span></div>`
  }
</div>

<!-- SECAO 06 — PROTESTOS -->
<div class="section">
  <div class="sec-title"><div class="sec-bar" style="background:#DC2626"></div><span class="sec-num">06</span><h2>Protestos</h2></div>
  <table>
    ${row("Vigentes (Qtd)", d.protestos?.vigentesQtd || "0")}
    ${row("Vigentes (R$)", d.protestos?.vigentesValor || "0,00")}
    ${row("Regularizados (Qtd)", d.protestos?.regularizadosQtd || "0")}
    ${row("Regularizados (R$)", d.protestos?.regularizadosValor || "0,00")}
  </table>
  ${protestosVigentes > 0 ? `<div class="alert-box danger"><span class="alert-icon">!</span><span>[ALTA] ${protestosVigentes} protesto(s) vigente(s)</span></div>` : ''}
  ${protestosDet.length > 0 ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Detalhes dos Protestos</h3>
  <table class="data-table danger">
    <thead><tr><th>Data</th><th>Credor</th><th>Valor (R$)</th><th>Status</th></tr></thead>
    <tbody>${protestosDet.map(p => `<tr><td>${esc(p.data)}</td><td>${esc(p.credor)}</td><td>${esc(p.valor)}</td><td>${p.regularizado ? '<span class="badge badge-green">Regularizado</span>' : '<span class="badge badge-red">Vigente</span>'}</td></tr>`).join('')}</tbody>
  </table>` : ''}
</div>

<!-- SECAO 07 — PROCESSOS JUDICIAIS -->
<div class="section">
  <div class="sec-title"><div class="sec-bar" style="background:#D97706"></div><span class="sec-num">07</span><h2>Processos Judiciais</h2></div>
  <table>
    ${row("Passivos (Total)", d.processos?.passivosTotal || "0")}
    ${row("Ativos (Total)", d.processos?.ativosTotal || "0")}
    ${row("Valor Estimado (R$)", d.processos?.valorTotalEstimado || "0,00")}
  </table>
  ${d.processos?.temRJ ? '<div class="alert-box danger"><span class="alert-icon">!</span><span>[ALTA] RECUPERACAO JUDICIAL identificada</span></div>' : ''}
  ${distArr.length > 0 ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Distribuicao por Tipo</h3>
  <table class="data-table warning">
    <thead><tr><th>Tipo</th><th>Quantidade</th><th>Percentual</th></tr></thead>
    <tbody>${distArr.map(dd => `<tr><td>${esc(dd.tipo)}</td><td>${esc(dd.qtd)}</td><td>${dd.pct ? esc(dd.pct) + '%' : '—'}</td></tr>`).join('')}</tbody>
  </table>` : ''}
  ${bancArr.length > 0 ? `
  <h3 style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;margin:20px 0 12px;letter-spacing:0.06em">Processos Bancarios</h3>
  <table class="data-table warning">
    <thead><tr><th>Banco</th><th>Assunto</th><th>Status</th><th>Data</th></tr></thead>
    <tbody>${bancArr.map(b => `<tr><td>${esc(b.banco)}</td><td>${esc(b.assunto)}</td><td>${esc(b.status)}</td><td>${esc(b.data)}</td></tr>`).join('')}</tbody>
  </table>` : ''}
</div>

<!-- SECAO 08 — GRUPO ECONOMICO -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">08</span><h2>Grupo Economico</h2></div>
  ${geArr.length > 0 ? `
  <table class="data-table">
    <thead><tr><th>Razao Social</th><th>CNPJ</th><th>Relacao</th><th>SCR (R$)</th><th>Protestos</th><th>Processos</th></tr></thead>
    <tbody>${geArr.map(e => `<tr><td>${esc(e.razaoSocial)}</td><td style="font-family:monospace">${esc(e.cnpj)}</td><td>${esc(e.relacao)}</td><td>${esc(e.scrTotal || "—")}</td><td>${esc(e.protestos || "0")}</td><td>${esc(e.processos || "0")}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:#94A3B8;font-style:italic">Nenhuma empresa identificada no grupo economico.</p>'}
</div>

<!-- SECAO 09 — PARECER FINAL -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">09</span><h2>Parecer Final</h2></div>
  <div style="display:flex;gap:16px;margin-bottom:16px">
    <span class="badge ${decision === 'APROVADO' ? 'badge-green' : decision === 'PENDENTE' ? 'badge-amber' : 'badge-red'}" style="font-size:16px;padding:8px 24px">${decision}</span>
    <span class="badge ${finalRating >= 7 ? 'badge-green' : finalRating >= 4 ? 'badge-amber' : 'badge-red'}" style="font-size:16px;padding:8px 24px">Rating: ${finalRating}/10</span>
  </div>
  <table>
    ${row("Parecer", d.resumoRisco || "Parecer nao preenchido.")}
  </table>
</div>

<!-- FOOTER -->
<div class="footer-block">
  <table>
    ${row("Data de Geracao", genDt)}
    ${row("Empresa Analisada", d.cnpj.razaoSocial)}
    ${row("CNPJ", d.cnpj.cnpj)}
  </table>
</div>
<div class="footer-text">Capital Financas — Consolidador | ${footerDt} | Confidencial</div>

</div></body></html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.html`);
      setGeneratedFormats(p => new Set(p).add("html"));
    } catch (err) {
      console.error("HTML generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

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
            <div className={`px-4 py-3 rounded-lg border`} style={{ background: decisionBg, borderColor: decisionBorder }}>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">Rating</p>
              <p className="text-[22px] font-bold" style={{ color: decisionColor }}>{finalRating}/10</p>
              <p className="text-[11px] text-[#6B7280]">{finalRating >= 7 ? 'Perfil saudavel' : finalRating >= 4 ? 'Atencao recomendada' : 'Perfil critico'}</p>
            </div>
            <div className={`px-4 py-3 rounded-lg border`} style={{ background: decisionBg, borderColor: decisionBorder }}>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">Decisao</p>
              <p className="text-[18px] font-bold" style={{ color: decisionColor }}>{decision}</p>
            </div>
            <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg ${risk.bg} border ${risk.border}`}>
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
            <div className="space-y-2">
              {alertsHigh.length > 0 && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#DC2626] font-bold mb-1">Alertas de Alta Severidade ({alertsHigh.length})</p>
                  {alertsHigh.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-[#DC2626]">
                      <AlertTriangle size={12} className="text-[#DC2626] flex-shrink-0" />
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {alertsMod.length > 0 && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#D97706] font-bold mb-1">Alertas Moderados ({alertsMod.length})</p>
                  {alertsMod.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-[#92400E]">
                      <AlertTriangle size={12} className="text-[#D97706] flex-shrink-0" />
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Analysis: Resumo + Pontos Fortes/Fracos */}
          {analyzingAI && (
            <div className="bg-cf-surface border border-cf-border rounded-lg px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-cf-navy" />
              <span className="text-xs text-cf-text-2">Gerando análise inteligente com IA...</span>
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
          {/* Hero: Total Dividas Ativas */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Total Dividas Ativas</p>
            <p className={`text-[24px] font-bold leading-tight ${dividaAtiva > 1000000 ? "text-[#D97706]" : "text-[#111827]"}`}>
              {data.scr.totalDividasAtivas ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
            </p>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-5">
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
                  logo: <img src="/logos/word.jpg" alt="Word" width={48} height={48} className="rounded-lg object-contain" /> },
                { fmt: "xlsx" as Format, label: "Excel", sub: "Baixar Excel", fn: generateExcel,
                  logo: <img src="/logos/excel.jpg" alt="Excel" width={48} height={48} className="rounded-lg object-contain" /> },
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="btn-secondary text-xs sm:text-sm">
              <ArrowLeft size={15} /> Voltar
            </button>
            {onReset && (
              <button onClick={onReset} className="btn-secondary text-xs sm:text-sm">
                <RotateCcw size={14} /> Voltar ao inicio
              </button>
            )}
            {savedFeedback && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cf-green">
                <Check size={14} /> Salvo automaticamente
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {collectionId && (
              <button onClick={() => setShowFinishModal(true)} className="btn-green text-xs sm:text-sm">
                <Check size={15} /> Finalizar
              </button>
            )}
            {generatedFormats.size > 0 && (
              <button onClick={() => { generatePDF(); }} disabled={!!generatingFormat} className="btn-primary text-xs sm:text-sm">
                <Download size={15} /> Baixar todos
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Finalizar coleta */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card max-w-md w-full mx-4 overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-cf-navy to-cf-navy-dark px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Finalizar coleta</h3>
              <button onClick={() => setShowFinishModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <XIcon size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-cf-text-2 leading-relaxed">
                Deseja finalizar esta coleta? Voce podera consulta-la a qualquer momento no <span className="font-semibold text-cf-navy">historico</span>.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={() => setShowFinishModal(false)} className="btn-secondary">Cancelar</button>
                <button onClick={handleFinish} disabled={finishing} className="btn-green">
                  {finishing ? <><Loader2 size={15} className="animate-spin" /> Finalizando...</> : <><Check size={15} /> Finalizar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
