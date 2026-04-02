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
      const genDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

      // ── SVG Bar Chart builder ──
      const buildBarChart = (meses: Array<{mes: string, valor: string}>): string => {
        const values = meses.map(m => {
          const num = parseFloat(m.valor.replace(/[.]/g, '').replace(',', '.'));
          return isNaN(num) ? 0 : num;
        });
        const max = Math.max(...values, 1);
        const barW = Math.floor(540 / Math.max(meses.length, 1)) - 4;
        const chartH = 180;

        let bars = '';
        meses.forEach((m, i) => {
          const v = values[i];
          const h = (v / max) * (chartH - 30);
          const x = i * (barW + 4) + 30;
          const yPos = chartH - h - 20;
          const color = v > 0 ? '#203B88' : '#E5E7EB';
          bars += `<rect x="${x}" y="${yPos}" width="${barW}" height="${h}" rx="3" fill="${color}" opacity="0.85"/>`;
          bars += `<text x="${x + barW/2}" y="${chartH - 5}" text-anchor="middle" font-size="8" fill="#6B7280">${m.mes.substring(0,3)}</text>`;
          if (v > 0) {
            const label = v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v.toFixed(0);
            bars += `<text x="${x + barW/2}" y="${yPos - 4}" text-anchor="middle" font-size="7" fill="#374151" font-weight="600">${label}</text>`;
          }
        });

        // Average line
        const avg = values.reduce((a,b) => a+b, 0) / values.length;
        const avgY = chartH - (avg / max) * (chartH - 30) - 20;
        bars += `<line x1="30" y1="${avgY}" x2="${30 + meses.length * (barW + 4)}" y2="${avgY}" stroke="#73B815" stroke-width="1.5" stroke-dasharray="6,3"/>`;
        bars += `<text x="${30 + meses.length * (barW + 4) + 5}" y="${avgY + 3}" font-size="8" fill="#73B815" font-weight="600">FMM</text>`;

        return `<svg width="600" height="${chartH}" viewBox="0 0 600 ${chartH}">${bars}</svg>`;
      };

      // ── SVG Donut Chart builder ──
      const buildDonutChart = (modalidades: Array<{nome: string, participacao: string}>): string => {
        const chartColors = ['#203B88', '#3B82F6', '#73B815', '#D97706', '#DC2626', '#8B5CF6', '#06B6D4', '#F59E0B'];
        const items = modalidades.filter(m => m.nome && m.participacao);
        if (items.length === 0) return '';

        let cumulativeAngle = 0;
        const radius = 70;
        const cx = 100, cy = 100;
        let paths = '';
        let legend = '';

        items.forEach((m, i) => {
          const pct = parseFloat(m.participacao.replace(',', '.').replace('%', '')) || 0;
          const angle = (pct / 100) * 360;
          const startAngle = cumulativeAngle;
          const endAngle = cumulativeAngle + angle;

          const startRad = (startAngle - 90) * Math.PI / 180;
          const endRad = (endAngle - 90) * Math.PI / 180;
          const largeArc = angle > 180 ? 1 : 0;

          const x1 = cx + radius * Math.cos(startRad);
          const y1 = cy + radius * Math.sin(startRad);
          const x2 = cx + radius * Math.cos(endRad);
          const y2 = cy + radius * Math.sin(endRad);

          const innerR = 45;
          const x3 = cx + innerR * Math.cos(endRad);
          const y3 = cy + innerR * Math.sin(endRad);
          const x4 = cx + innerR * Math.cos(startRad);
          const y4 = cy + innerR * Math.sin(startRad);

          const color = chartColors[i % chartColors.length];
          paths += `<path d="M${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} L${x3},${y3} A${innerR},${innerR} 0 ${largeArc},0 ${x4},${y4} Z" fill="${color}"/>`;

          const name = m.nome.length > 25 ? m.nome.substring(0, 25) + '...' : m.nome;
          legend += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:10px;height:10px;border-radius:2px;background:${color};flex-shrink:0"></div><span style="font-size:9px;color:#374151">${name} (${m.participacao})</span></div>`;

          cumulativeAngle = endAngle;
        });

        return `<div style="display:flex;align-items:center;gap:24px"><svg width="200" height="200" viewBox="0 0 200 200">${paths}</svg><div>${legend}</div></div>`;
      };

      // ── Rating gauge SVG ──
      const buildRatingGauge = (rating: number): string => {
        const pct = Math.min(rating / 10, 1);
        const radius = 60;
        const cx = 70, cy = 70;
        const circumference = 2 * Math.PI * radius;
        const arcLength = circumference * 0.75; // 270 degrees
        const filled = arcLength * pct;
        const gaugeColor = rating >= 7 ? '#16A34A' : rating >= 4 ? '#D97706' : '#DC2626';
        return `<svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#E5E7EB" stroke-width="10"
            stroke-dasharray="${arcLength} ${circumference}" stroke-dashoffset="0"
            transform="rotate(135 ${cx} ${cy})" stroke-linecap="round"/>
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${gaugeColor}" stroke-width="10"
            stroke-dasharray="${filled} ${circumference}" stroke-dashoffset="0"
            transform="rotate(135 ${cx} ${cy})" stroke-linecap="round"/>
          <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="28" font-weight="700" fill="white">${rating}</text>
          <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)">/10</text>
        </svg>`;
      };

      // ── Escape HTML ──
      const esc = (s: string | undefined | null): string => {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      };

      // ── Build the complete HTML report ──
      const buildReportHTML = (): string => {
        const validQSA = data.qsa.quadroSocietario.filter(s => s.nome);
        const validMeses = data.faturamento.meses.filter(m => m.mes);
        // protestos/processos/grupo dados disponíveis em data.protestos, data.processos, data.grupoEconomico
        const capitalSocial = data.qsa.capitalSocial || data.contrato.capitalSocial || '';

        // FMM (media mensal)
        const fmm = data.faturamento.mediaAno || '';
        // Alavancagem
        const alavancagem = dividaAtiva > 0 && parseMoneyToNumber(fmm) > 0
          ? (dividaAtiva / parseMoneyToNumber(fmm)).toFixed(2) + 'x'
          : '';
        // Comprometimento
        const comprometimento = dividaAtiva > 0 && parseMoneyToNumber(data.faturamento.somatoriaAno || '0') > 0
          ? ((dividaAtiva / parseMoneyToNumber(data.faturamento.somatoriaAno || '0')) * 100).toFixed(1) + '%'
          : '';

        // MoM variation
        const mesVariations = validMeses.map((m, i) => {
          const cur = parseMoneyToNumber(m.valor);
          if (i === 0) return '';
          const prev = parseMoneyToNumber(validMeses[i-1].valor);
          if (prev === 0) return cur > 0 ? '+100%' : '0%';
          const pctChg = ((cur - prev) / prev * 100).toFixed(1);
          return (cur >= prev ? '+' : '') + pctChg + '%';
        });

        // Decision badge class
        const badgeClass = decision === 'APROVADO' ? 'badge-green' : decision === 'PENDENTE' ? 'badge-amber' : 'badge-red';

        // CP vs LP
        const cpVal = parseMoneyToNumber(data.scr.carteiraCurtoPrazo);
        const lpVal = parseMoneyToNumber(data.scr.carteiraLongoPrazo);
        const totalCPLP = cpVal + lpVal || 1;
        const cpPct = ((cpVal / totalCPLP) * 100).toFixed(1);
        const lpPct = ((lpVal / totalCPLP) * 100).toFixed(1);

        // SCR comparison metrics
        let scrCompHTML = '';
        if (data.scrAnterior) {
          const compMetrics = [
            { label: 'Carteira a Vencer', anterior: data.scrAnterior.carteiraAVencer, atual: data.scr.carteiraAVencer },
            { label: 'Vencidos', anterior: data.scrAnterior.vencidos, atual: data.scr.vencidos },
            { label: 'Prejuizos', anterior: data.scrAnterior.prejuizos, atual: data.scr.prejuizos },
            { label: 'Total Dividas', anterior: data.scrAnterior.totalDividasAtivas, atual: data.scr.totalDividasAtivas },
            { label: 'Limite Credito', anterior: data.scrAnterior.limiteCredito, atual: data.scr.limiteCredito },
            { label: 'Instituicoes', anterior: data.scrAnterior.qtdeInstituicoes, atual: data.scr.qtdeInstituicoes },
            { label: 'Operacoes', anterior: data.scrAnterior.qtdeOperacoes, atual: data.scr.qtdeOperacoes },
          ];

          const compRows = compMetrics.map(m => {
            const antVal = parseMoneyToNumber(m.anterior);
            const atualVal = parseMoneyToNumber(m.atual);
            const diff = atualVal - antVal;
            const varStr = diff === 0 ? '=' : diff > 0 ? `+${diff.toLocaleString('pt-BR')}` : diff.toLocaleString('pt-BR');
            const varColor = diff > 0 ? '#DC2626' : diff < 0 ? '#16A34A' : '#6B7280';
            return `<tr>
              <td>${esc(m.label)}</td>
              <td>${esc(m.anterior) || '&mdash;'}</td>
              <td>${esc(m.atual) || '&mdash;'}</td>
              <td style="color:${varColor};font-weight:600">${varStr}</td>
            </tr>`;
          }).join('');

          scrCompHTML = `
          <div class="page">
            <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">06</span><span class="sec-name">COMPARATIVO SCR</span></div>
            <table>
              <thead><tr><th>Metrica</th><th>Anterior</th><th>Atual</th><th>Variacao</th></tr></thead>
              <tbody>${compRows}</tbody>
            </table>
            <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>Comparativo SCR</span></div>
          </div>`;
        }

        // Section numbering adjusts based on whether SCR comparison exists
        const riskSecNum = data.scrAnterior ? '07' : '06';
        const parecerSecNum = data.scrAnterior ? '08' : '07';

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=210mm">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Open Sans', sans-serif; color: #1F2937; font-size: 11px; line-height: 1.5; }

.page {
  width: 210mm; min-height: 297mm; padding: 20mm;
  page-break-after: always; position: relative; background: white;
}
.page:last-child { page-break-after: avoid; }

.cover {
  background: linear-gradient(135deg, #1E3A6E 0%, #203B88 50%, #2D4BA0 100%);
  color: white; display: flex; flex-direction: column; justify-content: center; align-items: center;
  text-align: center;
}

.sec-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.sec-num { font-family: 'DM Sans', sans-serif; font-size: 24px; font-weight: 700; color: #203B88; }
.sec-name { font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 600; color: #1F2937; }
.sec-bar { width: 4px; height: 28px; background: #203B88; border-radius: 2px; }

table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { background: #203B88; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
td { padding: 6px 10px; border-bottom: 1px solid #E5E7EB; }
tr:nth-child(even) td { background: #F8FAFC; }

.metric-card {
  background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;
  padding: 12px; text-align: center;
}
.metric-label { font-size: 9px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value { font-size: 18px; font-weight: 700; color: #1F2937; margin-top: 4px; }

.alert-box { padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-size: 10px; }
.alert-high { background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; }
.alert-mod { background: #FFFBEB; border: 1px solid #FDE68A; color: #92400E; }

.badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-weight: 700; font-size: 11px; }
.badge-green { background: #DCFCE7; color: #166534; }
.badge-amber { background: #FEF3C7; color: #92400E; }
.badge-red { background: #FEE2E2; color: #991B1B; }

.footer {
  position: absolute; bottom: 10mm; left: 20mm; right: 20mm;
  font-size: 8px; color: #9CA3AF; border-top: 1px solid #E5E7EB;
  padding-top: 6px; display: flex; justify-content: space-between;
}

.grid-2x3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.grid-5 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px; }

.cover-logo { font-family: 'DM Sans', sans-serif; font-size: 36px; font-weight: 700; margin-bottom: 4px; }
.cover-logo .green { color: #73B815; }
.cover-subtitle { font-size: 11px; color: rgba(255,255,255,0.6); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 30px; }
.cover-company { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
.cover-info { font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 4px; }
.cover-gauge { margin: 30px 0 20px 0; }
.cover-decision { margin-top: 10px; }

.point-item { padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; font-size: 10px; display: flex; align-items: flex-start; gap: 8px; }
.point-forte { background: #F0FDF4; border: 1px solid #BBF7D0; color: #166534; }
.point-fraco { background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; }
.point-visita { background: #FFFBEB; border: 1px solid #FDE68A; color: #92400E; }

.rating-bar-container { width: 100%; height: 20px; background: #E5E7EB; border-radius: 10px; position: relative; margin: 10px 0; }
.rating-bar-fill { height: 100%; border-radius: 10px; }
.rating-bar-label { position: absolute; top: 50%; transform: translateY(-50%); right: 10px; font-size: 11px; font-weight: 700; color: #1F2937; }

.parecer-text { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; font-size: 11px; line-height: 1.7; margin-bottom: 16px; white-space: pre-wrap; }
.signature-line { margin-top: 40px; text-align: center; }
.signature-line hr { border: none; border-top: 1px solid #9CA3AF; width: 200px; margin: 0 auto 6px auto; }
.signature-line span { font-size: 9px; color: #6B7280; }

.cp-lp-bar { display: flex; height: 24px; border-radius: 6px; overflow: hidden; margin: 10px 0; font-size: 9px; font-weight: 600; color: white; }
.cp-lp-bar .cp { background: #203B88; display: flex; align-items: center; justify-content: center; }
.cp-lp-bar .lp { background: #3B82F6; display: flex; align-items: center; justify-content: center; }

.highlight-box { background: #EDF2FB; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; }
.highlight-label { font-size: 9px; color: #6B7280; text-transform: uppercase; }
.highlight-value { font-size: 14px; font-weight: 700; color: #203B88; }
</style>
</head>
<body>

<!-- PAGE 1: Cover -->
<div class="page cover">
  <div class="cover-logo"><span style="color:white">capital</span> <span class="green">financas</span></div>
  <div class="cover-subtitle">Consolidador de Documentos</div>
  <div style="width:60px;height:2px;background:#73B815;margin:0 auto 30px auto;"></div>
  <div style="font-size:20px;font-weight:600;color:rgba(255,255,255,0.8);margin-bottom:4px;">Relatorio de Due Diligence</div>
  <div class="cover-company">${esc(data.cnpj.razaoSocial)}</div>
  <div class="cover-info">CNPJ: ${esc(data.cnpj.cnpj)}</div>
  <div class="cover-info">${genDate}</div>
  <div class="cover-info">${esc(data.cnpj.endereco || '')}</div>
  <div class="cover-gauge">${buildRatingGauge(finalRating)}</div>
  <div class="cover-decision">
    <span class="badge ${badgeClass}" style="font-size:16px;padding:8px 28px;">${decision}</span>
  </div>
  <div class="footer" style="color:rgba(255,255,255,0.4);border-top-color:rgba(255,255,255,0.15);">
    <span>Documento confidencial &mdash; uso restrito</span><span>Capital Financas</span>
  </div>
</div>

<!-- PAGE 2: Executive Summary -->
<div class="page">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">01</span><span class="sec-name">SINTESE DA ANALISE</span></div>

  ${resumoExecutivo ? `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px;margin-bottom:16px;font-size:11px;line-height:1.7;">${esc(resumoExecutivo)}</div>` : ''}

  <div class="grid-2x3">
    <div class="metric-card"><div class="metric-label">FMM</div><div class="metric-value">${esc(fmm) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Alavancagem</div><div class="metric-value">${alavancagem || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Comprometimento</div><div class="metric-value">${comprometimento || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Tendencia</div><div class="metric-value">${esc(aiAnalysis?.indicadores?.['tendencia'] || '') || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">IFs</div><div class="metric-value">${esc(data.scr.qtdeInstituicoes) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Operacoes</div><div class="metric-value">${esc(data.scr.qtdeOperacoes) || '&mdash;'}</div></div>
  </div>

  ${alertsHigh.map(a => `<div class="alert-box alert-high"><strong>[ALTA]</strong> ${esc(a.message)}${a.impacto ? ' &mdash; ' + esc(a.impacto) : ''}</div>`).join('')}
  ${alertsMod.map(a => `<div class="alert-box alert-mod"><strong>[${esc(a.severity)}]</strong> ${esc(a.message)}${a.impacto ? ' &mdash; ' + esc(a.impacto) : ''}</div>`).join('')}

  <div class="grid-5" style="margin-top:14px;">
    <div class="metric-card"><div class="metric-label">Situacao</div><div class="metric-value" style="font-size:11px;">${esc(data.cnpj.situacaoCadastral) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">CNAE</div><div class="metric-value" style="font-size:9px;">${esc(data.cnpj.cnaePrincipal ? data.cnpj.cnaePrincipal.substring(0,30) : '') || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Porte</div><div class="metric-value" style="font-size:11px;">${esc(data.cnpj.porte || '') || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Capital</div><div class="metric-value" style="font-size:11px;">${esc(capitalSocial) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Idade</div><div class="metric-value" style="font-size:11px;">${companyAge || '&mdash;'}</div></div>
  </div>

  <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>Sintese</span></div>
</div>

<!-- PAGE 3: QSA + Contrato -->
<div class="page">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">02</span><span class="sec-name">QUADRO SOCIETARIO</span></div>

  <table>
    <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Qualificacao</th><th>Participacao</th></tr></thead>
    <tbody>
      ${validQSA.map(s => `<tr><td>${esc(s.nome)}</td><td>${esc(s.cpfCnpj) || '&mdash;'}</td><td>${esc(s.qualificacao) || '&mdash;'}</td><td>${esc(s.participacao) || '&mdash;'}</td></tr>`).join('')}
      ${validQSA.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#9CA3AF;">Nenhum socio identificado</td></tr>' : ''}
    </tbody>
  </table>

  ${capitalSocial ? `<div class="highlight-box" style="margin-top:12px;"><div class="highlight-label">Capital Social</div><div class="highlight-value">${esc(capitalSocial)}</div></div>` : ''}

  <div style="margin-top:24px;">
    <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">03</span><span class="sec-name">CONTRATO SOCIAL</span></div>

    ${data.contrato.objetoSocial ? `<div style="margin-bottom:10px;"><div style="font-size:9px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Objeto Social</div><div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px;font-size:10px;line-height:1.6;">${esc(data.contrato.objetoSocial)}</div></div>` : ''}
    ${data.contrato.administracao ? `<div style="margin-bottom:10px;"><div style="font-size:9px;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Administracao</div><div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px;font-size:10px;line-height:1.6;">${esc(data.contrato.administracao)}</div></div>` : ''}

    <div class="grid-2">
      <div class="metric-card"><div class="metric-label">Data Constituicao</div><div class="metric-value" style="font-size:13px;">${esc(data.contrato.dataConstituicao) || '&mdash;'}</div></div>
      <div class="metric-card"><div class="metric-label">Foro</div><div class="metric-value" style="font-size:13px;">${esc(data.contrato.foro) || '&mdash;'}</div></div>
    </div>
  </div>

  <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>QSA / Contrato</span></div>
</div>

<!-- PAGE 4: Faturamento -->
<div class="page">
  <div class="sec-title"><div class="sec-bar" style="background:#73B815;"></div><span class="sec-num" style="color:#73B815;">04</span><span class="sec-name">FATURAMENTO</span></div>

  ${validMeses.length > 0 ? buildBarChart(validMeses) : '<div style="text-align:center;color:#9CA3AF;padding:40px;">Sem dados de faturamento</div>'}

  <div style="display:flex;gap:12px;margin:14px 0;">
    ${fmm ? `<div class="badge badge-green">FMM: R$ ${esc(fmm)}</div>` : ''}
    ${data.faturamento.somatoriaAno ? `<div class="highlight-box" style="display:inline-block;padding:6px 14px;"><span class="highlight-label">Total Anual: </span><span style="font-weight:700;color:#203B88;">R$ ${esc(data.faturamento.somatoriaAno)}</span></div>` : ''}
    ${data.faturamento.mediaAno ? `<div class="highlight-box" style="display:inline-block;padding:6px 14px;"><span class="highlight-label">Media: </span><span style="font-weight:700;color:#203B88;">R$ ${esc(data.faturamento.mediaAno)}</span></div>` : ''}
  </div>

  ${validMeses.length > 0 ? `
  <table>
    <thead><tr><th>Mes</th><th>Valor (R$)</th><th>Var. MoM</th></tr></thead>
    <tbody>
      ${validMeses.map((m, i) => {
        const varVal = mesVariations[i];
        const varColor = varVal.startsWith('+') ? '#16A34A' : varVal.startsWith('-') ? '#DC2626' : '#6B7280';
        return `<tr><td>${esc(m.mes)}</td><td>${esc(m.valor) || '0,00'}</td><td style="color:${varColor};font-weight:600;">${varVal || '&mdash;'}</td></tr>`;
      }).join('')}
    </tbody>
  </table>` : ''}

  <div style="margin-top:10px;display:flex;gap:8px;">
    ${data.faturamento.faturamentoZerado ? '<div class="badge badge-red">Faturamento Zerado</div>' : ''}
    ${!data.faturamento.dadosAtualizados ? '<div class="badge badge-amber">Dados Desatualizados</div>' : ''}
  </div>

  <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>Faturamento</span></div>
</div>

<!-- PAGE 5: SCR -->
<div class="page">
  <div class="sec-title"><div class="sec-bar" style="background:#D97706;"></div><span class="sec-num" style="color:#D97706;">05</span><span class="sec-name">SCR / ANALISE DE CREDITO</span></div>

  <div class="grid-2x3">
    <div class="metric-card"><div class="metric-label">Carteira a Vencer</div><div class="metric-value" style="font-size:13px;">${esc(data.scr.carteiraAVencer) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Vencidos</div><div class="metric-value" style="font-size:13px;${vencidosSCR > 0 ? 'color:#DC2626;' : ''}">${esc(data.scr.vencidos) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Prejuizos</div><div class="metric-value" style="font-size:13px;${prejuizosVal > 0 ? 'color:#DC2626;' : ''}">${esc(data.scr.prejuizos) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Limite Credito</div><div class="metric-value" style="font-size:13px;">${esc(data.scr.limiteCredito) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Classificacao Risco</div><div class="metric-value" style="font-size:13px;">${esc(data.scr.classificacaoRisco) || '&mdash;'}</div></div>
    <div class="metric-card"><div class="metric-label">Total Dividas Ativas</div><div class="metric-value" style="font-size:13px;">${esc(data.scr.totalDividasAtivas) || '&mdash;'}</div></div>
  </div>

  ${(data.scr.modalidades && data.scr.modalidades.length > 0) ? `
  <div style="margin-bottom:16px;">
    ${buildDonutChart(data.scr.modalidades)}
  </div>
  <table>
    <thead><tr><th>Modalidade</th><th>Total</th><th>A Vencer</th><th>Vencido</th><th>Part.</th></tr></thead>
    <tbody>
      ${data.scr.modalidades.map(m => `<tr><td>${esc(m.nome)}</td><td>${esc(m.total)}</td><td>${esc(m.aVencer)}</td><td>${esc(m.vencido)}</td><td>${esc(m.participacao)}</td></tr>`).join('')}
    </tbody>
  </table>` : ''}

  ${(data.scr.instituicoes && data.scr.instituicoes.length > 0) ? `
  <div style="margin-top:16px;">
    <div style="font-size:11px;font-weight:600;margin-bottom:6px;">Instituicoes Credoras</div>
    <table>
      <thead><tr><th>Instituicao</th><th>Valor (R$)</th></tr></thead>
      <tbody>
        ${data.scr.instituicoes.map(inst => `<tr><td>${esc(inst.nome)}</td><td>${esc(inst.valor)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div style="margin-top:16px;">
    <div style="font-size:11px;font-weight:600;margin-bottom:6px;">Curto Prazo vs Longo Prazo</div>
    <div class="cp-lp-bar">
      <div class="cp" style="width:${cpPct}%">CP ${cpPct}%</div>
      <div class="lp" style="width:${lpPct}%">LP ${lpPct}%</div>
    </div>
  </div>

  <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>SCR</span></div>
</div>

<!-- PAGE 6 (conditional): SCR Comparison -->
${scrCompHTML}

<!-- PAGE 7: Risk Analysis -->
<div class="page">
  <div class="sec-title"><div class="sec-bar" style="background:#DC2626;"></div><span class="sec-num" style="color:#DC2626;">${riskSecNum}</span><span class="sec-name">ANALISE DE RISCO</span></div>

  ${pontosFortes.length > 0 ? `
  <div style="margin-bottom:16px;">
    <div style="font-size:12px;font-weight:600;color:#166534;margin-bottom:8px;">Pontos Fortes</div>
    ${pontosFortes.map(p => `<div class="point-item point-forte"><span style="flex-shrink:0;">&#10003;</span><span>${esc(p)}</span></div>`).join('')}
  </div>` : ''}

  ${pontosFracos.length > 0 ? `
  <div style="margin-bottom:16px;">
    <div style="font-size:12px;font-weight:600;color:#991B1B;margin-bottom:8px;">Pontos Fracos</div>
    ${pontosFracos.map(p => `<div class="point-item point-fraco"><span style="flex-shrink:0;">&#9888;</span><span>${esc(p)}</span></div>`).join('')}
  </div>` : ''}

  ${perguntasVisita.length > 0 ? `
  <div style="margin-bottom:16px;">
    <div style="font-size:12px;font-weight:600;color:#92400E;margin-bottom:8px;">Perguntas para Visita</div>
    ${perguntasVisita.map((p, i) => `<div class="point-item point-visita"><span style="flex-shrink:0;font-weight:700;">${i+1}.</span><span><strong>${esc(p.pergunta)}</strong>${p.contexto ? '<br/><span style="font-size:9px;color:#92400E;opacity:0.8;">' + esc(p.contexto) + '</span>' : ''}</span></div>`).join('')}
  </div>` : ''}

  ${(pontosFortes.length === 0 && pontosFracos.length === 0 && perguntasVisita.length === 0) ? '<div style="text-align:center;color:#9CA3AF;padding:40px;">Analise de risco nao disponivel &mdash; aguardando IA</div>' : ''}

  <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>Risco</span></div>
</div>

<!-- PAGE 8: Final Opinion -->
<div class="page">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">${parecerSecNum}</span><span class="sec-name">PARECER FINAL</span></div>

  <div style="text-align:center;margin:20px 0;">
    <span class="badge ${badgeClass}" style="font-size:22px;padding:12px 40px;">${decision}</span>
  </div>

  <div style="margin:16px 0;">
    <div style="font-size:10px;color:#6B7280;margin-bottom:4px;">Rating</div>
    <div class="rating-bar-container">
      <div class="rating-bar-fill" style="width:${finalRating * 10}%;background:${decisionColor};"></div>
      <div class="rating-bar-label">${finalRating} / 10</div>
    </div>
  </div>

  <div style="font-size:10px;color:#6B7280;margin-bottom:4px;">Parecer</div>
  <div class="parecer-text">${esc(data.resumoRisco || 'Parecer nao preenchido.')}</div>

  ${alerts.length > 0 ? `
  <div style="margin-top:12px;">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px;">Resumo de Alertas</div>
    ${alerts.map(a => `<div class="alert-box ${a.severity === 'ALTA' ? 'alert-high' : 'alert-mod'}"><strong>[${esc(a.severity)}]</strong> ${esc(a.message)}</div>`).join('')}
  </div>` : ''}

  <div class="signature-line">
    <hr/>
    <span>Analista Responsavel</span>
  </div>

  <div class="footer"><span>Capital Financas &mdash; Consolidador | ${genDate} | Confidencial</span><span>Parecer Final</span></div>
</div>

</body>
</html>`;
      };

      // ── Build HTML and render to PDF via html2canvas ──
      const html = buildReportHTML();

      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:210mm;z-index:-9999;opacity:0;pointer-events:none;';
      document.body.appendChild(container);
      container.innerHTML = html;

      // Wait for fonts & images to load
      await new Promise(r => setTimeout(r, 500));

      const pages = container.querySelectorAll('.page');
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      // Cleanup and save
      document.body.removeChild(container);
      doc.save(`relatorio-${data.cnpj.razaoSocial || 'empresa'}-${genDate}.pdf`);
      setGenerated(true);
      if (generatedFormats.size === 0) onNotify?.(`PDF gerado para "${data.cnpj.razaoSocial || "empresa"}"`);
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Erro ao gerar PDF: " + (err instanceof Error ? err.message : "Erro desconhecido"));
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
