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

export default function GenerateStep({ data: initialData, originalFiles, onBack, onReset, onNotify }: GenerateStepProps) {
  const [data, setData] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(initialData)));
  const [editing, setEditing] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<Format | null>(null);
  const [generatedFormats, setGeneratedFormats] = useState<Set<Format>>(new Set());
  const setGenerated = (v: boolean) => { if (v) setGeneratedFormats(p => new Set(p).add("pdf")); };

  const setCNPJ = (k: keyof typeof data.cnpj, v: string) => setData(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof data.contrato, v: string | boolean) => setData(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof data.scr, v: string) => setData(p => ({ ...p, scr: { ...p.scr, [k]: v } }));

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
    if (data.contrato.capitalSocial || data.contrato.socios.some(s => s.nome)) docs.push({ type: "contrato_social", filename: "contrato-social.pdf", extracted_data: asRec(data.contrato), uploaded_at: new Date().toISOString() });
    if (data.scr.totalDividasAtivas || data.scr.operacoesEmAtraso) docs.push({ type: "scr_bacen", filename: "scr-bacen.pdf", extracted_data: asRec(data.scr), uploaded_at: new Date().toISOString() });
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
        const userId = session.user?.id ?? "anonymous";
        const { data: row, error } = await supabase.from("document_collections").insert({
          user_id: session.user?.id ?? null,
          status: "in_progress",
          label: data.cnpj.razaoSocial || null,
          documents,
        }).select("id").single();
        if (error) throw error;
        setCollectionId(row.id);
        _uploadCtx = { userId, collectionId: row.id };

        // Upload original files to Supabase Storage (fire-and-forget)
        if (originalFiles) {
          const fileMap = { cnpj: "cartao-cnpj", contrato: "contrato-social", scr: "scr-bacen" } as const;
          for (const [key, label] of Object.entries(fileMap)) {
            const file = originalFiles[key as keyof typeof originalFiles];
            if (file) {
              uploadFile(userId, row.id, "originals", `${label}.${file.name.split(".").pop() || "pdf"}`, file)
                .catch(() => {}); // non-blocking
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
        bg: [32, 59, 136] as [number, number, number],       // #203B88 navy
        primary: [32, 59, 136] as [number, number, number],  // #203B88
        accent: [115, 184, 21] as [number, number, number],  // #73B815
        "accent-light": [168, 217, 107] as [number, number, number], // #a8d96b
        surface: [255, 255, 255] as [number, number, number], // white
        surface2: [237, 242, 251] as [number, number, number], // #EDF2FB
        surface3: [220, 232, 248] as [number, number, number], // #DCE8F8
        text: [17, 24, 39] as [number, number, number],      // #111827
        textSec: [55, 65, 81] as [number, number, number],   // #374151
        textMuted: [107, 114, 128] as [number, number, number], // #6B7280
        border: [209, 220, 240] as [number, number, number], // #D1DCF0
        warning: [217, 119, 6] as [number, number, number],  // #D97706
        danger: [220, 38, 38] as [number, number, number],   // #DC2626
        white: [255, 255, 255] as [number, number, number],
        navy: [32, 59, 136] as [number, number, number],
        navyLight: [26, 48, 112] as [number, number, number],
      };

      const pageCount = { n: 0 };

      const newPage = () => {
        if (pageCount.n > 0) doc.addPage();
        pageCount.n++;

        // Background
        // White background
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 210, 297, "F");

        // Top navy accent bar
        doc.setFillColor(...colors.navy);
        doc.rect(0, 0, 210, 1.5, "F");

        y = 1.5;
      };

      const checkPageBreak = (needed: number) => {
        if (y + needed > 280) newPage();
      };

      const drawHeader = () => {
        // Navy header background
        doc.setFillColor(...colors.navy);
        doc.rect(0, 1.5, 210, 32, "F");

        // Green accent bottom strip
        doc.setFillColor(...colors.accent);
        doc.rect(0, 33.5, 210, 2, "F");

        // Circle mark (logo)
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.circle(margin + 7, 12, 7);
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 7, 20.5, 1.5, "F");

        // Logo wordmark: "capital" white + "financas" green
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("capital", margin + 17, 16);
        doc.setTextColor(...colors["accent-light"]);
        doc.text("financas", margin + 17 + doc.getTextWidth("capital") + 1, 16);

        // Subtitle
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text("CONSOLIDADOR DE DOCUMENTOS", margin + 17, 21);

        // Document title (right)
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Relatório de Due Diligence", W - margin, 13, { align: "right" });

        // Date
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        const now = new Date();
        const dateStr = now.toLocaleDateString("pt-BR", {
          day: "2-digit", month: "long", year: "numeric",
        });
        doc.text(`Gerado em ${dateStr}`, W - margin, 20, { align: "right" });

        // Company name
        if (data.cnpj.razaoSocial) {
          doc.setFontSize(7);
          doc.setTextColor(180, 200, 240);
          doc.text(data.cnpj.razaoSocial.substring(0, 45), W - margin, 26, { align: "right" });
        }

        y = 42;
      };

      const drawSectionTitle = (num: string, title: string, color: [number, number, number]) => {
        checkPageBreak(16);

        // Background pill
        doc.setFillColor(...colors.surface2);
        doc.roundedRect(margin, y, contentW, 10, 1.5, 1.5, "F");

        // Color bar
        doc.setFillColor(...color);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");

        // Number
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...color);
        doc.text(num, margin + 7, y + 6.5);

        // Title
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
        const displayVal = value.length > (fullWidth ? 80 : 35) ? value.substring(0, fullWidth ? 80 : 35) + "…" : value;
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
          const displayVal = field.value.length > maxChars ? field.value.substring(0, maxChars) + "…" : field.value;
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

      // ===== CAPA =====
      newPage();

      // Full navy background
      doc.setFillColor(...colors.navy);
      doc.rect(0, 0, 210, 297, "F");

      // Green accent bar top
      doc.setFillColor(...colors.accent);
      doc.rect(0, 0, 210, 3, "F");

      // Decorative circles
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(160, 50, 40);
      doc.circle(50, 250, 30);

      // Logo circle
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(2);
      doc.circle(W / 2, 80, 18);
      doc.setFillColor(255, 255, 255);
      doc.circle(W / 2, 99, 3, "F");

      // "capital" + "financas"
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      const capW = doc.getTextWidth("capital");
      doc.text("capital", W / 2 - (capW + doc.getTextWidth("financas") + 2) / 2, 125);
      doc.setTextColor(...colors["accent-light"]);
      doc.text("financas", W / 2 - (capW + doc.getTextWidth("financas") + 2) / 2 + capW + 2, 125);

      // Subtitle
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 200, 240);
      doc.text("CONSOLIDADOR DE DOCUMENTOS", W / 2, 136, { align: "center" });

      // Separator line
      doc.setFillColor(...colors.accent);
      doc.rect(W / 2 - 30, 145, 60, 1.5, "F");

      // Document title
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Relatório de", W / 2, 165, { align: "center" });
      doc.text("Due Diligence", W / 2, 176, { align: "center" });

      // Company name
      if (data.cnpj.razaoSocial) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors["accent-light"]);
        doc.text(data.cnpj.razaoSocial.substring(0, 50), W / 2, 195, { align: "center" });
      }
      if (data.cnpj.cnpj) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text(`CNPJ: ${data.cnpj.cnpj}`, W / 2, 204, { align: "center" });
      }

      // Date
      const coverDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      doc.setFontSize(9);
      doc.setTextColor(140, 170, 220);
      doc.text(`Gerado em ${coverDate}`, W / 2, 230, { align: "center" });

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(100, 140, 200);
      doc.text("Documento confidencial — uso restrito", W / 2, 280, { align: "center" });

      // Green accent bar bottom
      doc.setFillColor(...colors.accent);
      doc.rect(0, 294, 210, 3, "F");

      // ===== SUMÁRIO EXECUTIVO =====
      newPage();
      drawHeader();

      drawSectionTitle("00", "SUMÁRIO EXECUTIVO", colors.primary);

      // Risk score badge
      const riskLabel = riskScore === "alto" ? "RISCO ALTO" : riskScore === "medio" ? "RISCO MODERADO" : "RISCO BAIXO";
      const riskColor: [number, number, number] = riskScore === "alto" ? [220, 38, 38] : riskScore === "medio" ? [217, 119, 6] : [22, 163, 74];
      const riskBg: [number, number, number] = riskScore === "alto" ? [254, 242, 242] : riskScore === "medio" ? [255, 251, 235] : [240, 253, 244];

      checkPageBreak(24);
      doc.setFillColor(...riskBg);
      doc.roundedRect(margin, y, contentW, 18, 2, 2, "F");
      doc.setFillColor(...riskColor);
      doc.roundedRect(margin, y, 4, 18, 1, 1, "F");
      // Risk dot
      doc.circle(margin + 14, y + 9, 3, "F");
      // Risk label
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...riskColor);
      doc.text(riskLabel, margin + 22, y + 7);
      // Risk description
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      const riskDesc = riskScore === "alto" ? "Indicadores críticos detectados no perfil de crédito"
        : riskScore === "medio" ? "Pontos de atenção identificados — análise detalhada recomendada"
        : "Perfil de crédito saudável — sem alertas críticos";
      doc.text(riskDesc, margin + 22, y + 13);
      y += 24;

      // Key metrics summary
      drawSpacer(4);
      drawFieldRow([
        { label: "Empresa", value: data.cnpj.razaoSocial },
        { label: "CNPJ", value: data.cnpj.cnpj },
        { label: "Situação", value: data.cnpj.situacaoCadastral },
      ]);
      drawFieldRow([
        { label: "Sócios", value: String(data.contrato.socios.filter(s => s.nome).length) },
        { label: "Capital Social", value: data.contrato.capitalSocial },
      ]);
      drawFieldRow([
        { label: "Dívida Total (R$)", value: data.scr.totalDividasAtivas },
        { label: "Em Atraso", value: data.scr.operacoesEmAtraso },
        { label: "Prejuízo", value: data.scr.prejuizo },
      ]);
      if (data.scr.classificacaoRisco) {
        drawFieldRow([
          { label: "Classificação de Risco", value: data.scr.classificacaoRisco },
          { label: "Instituições Credoras", value: data.scr.instituicoesCredoras },
        ]);
      }

      drawSpacer(10);

      // ===== CONTEÚDO DETALHADO =====
      newPage();
      drawHeader();

      // SECTION 1: Identificação da Empresa
      drawSectionTitle("01", "IDENTIFICAÇÃO DA EMPRESA", colors.primary);

      drawFieldRow([
        { label: "Razão Social", value: data.cnpj.razaoSocial },
        { label: "Nome Fantasia", value: data.cnpj.nomeFantasia },
      ]);
      drawFieldRow([
        { label: "CNPJ", value: data.cnpj.cnpj },
        { label: "Data de Abertura", value: data.cnpj.dataAbertura },
        { label: "Situação Cadastral", value: data.cnpj.situacaoCadastral },
      ]);
      drawFieldRow([
        { label: "Data da Situação", value: data.cnpj.dataSituacaoCadastral },
        { label: "Motivo da Situação", value: data.cnpj.motivoSituacao },
      ]);
      if (data.cnpj.naturezaJuridica) drawField("Natureza Jurídica", data.cnpj.naturezaJuridica, true);
      if (data.cnpj.cnaePrincipal) drawField("CNAE Principal", data.cnpj.cnaePrincipal, true);
      if (data.cnpj.cnaeSecundarios) drawMultilineField("CNAEs Secundários", data.cnpj.cnaeSecundarios, 3);
      drawFieldRow([
        { label: "Porte", value: data.cnpj.porte },
        { label: "Capital Social (CNPJ)", value: data.cnpj.capitalSocialCNPJ },
      ]);
      if (data.cnpj.endereco) drawField("Endereço Completo", data.cnpj.endereco, true);
      drawFieldRow([
        { label: "Telefone", value: data.cnpj.telefone },
        { label: "E-mail", value: data.cnpj.email },
      ]);

      drawSpacer(8);

      // SECTION 2: Estrutura Societária
      drawSectionTitle("02", "ESTRUTURA SOCIETÁRIA", colors.accent);

      if (data.contrato.temAlteracoes) {
        checkPageBreak(12);
        doc.setFillColor(254, 243, 199); // amarelo claro — equivalente a warning/10
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFillColor(...colors.warning);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.warning);
        doc.text("⚠  ATENÇÃO: Documento com alterações societárias recentes", margin + 8, y + 6.5);
        y += 14;
      }

      // Sócios table
      const validSocios = data.contrato.socios.filter((s) => s.nome);
      if (validSocios.length > 0) {
        checkPageBreak(validSocios.length * 12 + 20);

        doc.setFillColor(...colors.surface2);
        doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
        const colW = [contentW * 0.30, contentW * 0.22, contentW * 0.28, contentW * 0.20];

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("NOME", margin + 4, y + 5.5);
        doc.text("CPF", margin + colW[0] + 4, y + 5.5);
        doc.text("QUALIFICAÇÃO", margin + colW[0] + colW[1] + 4, y + 5.5);
        doc.text("PART.", margin + colW[0] + colW[1] + colW[2] + 4, y + 5.5);
        y += 9;

        validSocios.forEach((s, idx) => {
          checkPageBreak(11);
          const rowColor = idx % 2 === 0 ? colors.surface : colors.surface2;
          doc.setFillColor(...rowColor);
          doc.rect(margin, y, contentW, 10, "F");

          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.text(s.nome.substring(0, 28), margin + 4, y + 6.5);
          doc.text(s.cpf || "—", margin + colW[0] + 4, y + 6.5);
          doc.text((s.qualificacao || "—").substring(0, 22), margin + colW[0] + colW[1] + 4, y + 6.5);
          if (s.participacao) { doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.accent); }
          doc.text(s.participacao || "—", margin + colW[0] + colW[1] + colW[2] + 4, y + 6.5);
          y += 10;
        });
        y += 4;
      }

      drawFieldRow([
        { label: "Capital Social", value: data.contrato.capitalSocial },
        { label: "Data de Constituição", value: data.contrato.dataConstituicao },
      ]);
      drawFieldRow([
        { label: "Prazo de Duração", value: data.contrato.prazoDuracao },
        { label: "Foro", value: data.contrato.foro },
      ]);
      if (data.contrato.objetoSocial) drawMultilineField("Objeto Social", data.contrato.objetoSocial, 5);
      if (data.contrato.administracao) drawMultilineField("Administração e Poderes", data.contrato.administracao, 4);

      drawSpacer(8);

      // Check if need new page for section 3
      checkPageBreak(80);

      // SECTION 3: Perfil de Crédito
      drawSectionTitle("03", "PERFIL DE CRÉDITO — SCR / BACEN", colors.warning);

      drawFieldRow([
        { label: "Total Dívidas Ativas (R$)", value: data.scr.totalDividasAtivas },
        { label: "Classificação Risco (A-H)", value: data.scr.classificacaoRisco },
        { label: "Concentração Crédito", value: data.scr.concentracaoCredito },
      ]);
      drawFieldRow([
        { label: "Operações a Vencer (R$)", value: data.scr.operacoesAVencer },
        { label: "Operações em Atraso", value: data.scr.operacoesEmAtraso },
        { label: "Operações Vencidas (R$)", value: data.scr.operacoesVencidas },
      ]);
      drawFieldRow([
        { label: "Tempo Médio de Atraso", value: data.scr.tempoAtraso },
        { label: "Prejuízo (Baixados)", value: data.scr.prejuizo },
        { label: "Coobrigações (R$)", value: data.scr.coobrigacoes },
      ]);
      if (data.scr.modalidadesCredito) drawField("Modalidades de Crédito", data.scr.modalidadesCredito, true);
      if (data.scr.instituicoesCredoras) drawField("Instituições Credoras", data.scr.instituicoesCredoras, true);
      if (data.scr.historicoInadimplencia) drawMultilineField("Histórico de Inadimplência", data.scr.historicoInadimplencia, 5);

      drawSpacer(8);

      // Footer on all pages — navy brand footer
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);

        // Navy footer background
        doc.setFillColor(...colors.navy);
        doc.rect(0, 284, 210, 13, "F");

        // Green accent line on top of footer
        doc.setFillColor(...colors.accent);
        doc.rect(0, 284, 210, 1, "F");

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text("Capital Finanças — Consolidador de Documentos", margin, 291);
        doc.text(`Página ${p} de ${totalPages}`, W - margin, 291, { align: "right" });
        doc.text("Documento confidencial — uso restrito", W / 2, 291, { align: "center" });
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

  // ── DOCX ──
  const generateDOCX = async () => {
    setGeneratingFormat("docx");
    try {
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Header, Footer } = await import("docx");

      const navy = "203B88";
      const green = "73B815";
      const greenLight = "A8D96B";
      const warning = "D97706";
      const _danger = "DC2626"; void _danger;
      const muted = "6B7280";
      const border1 = "D1DCF0";
      const surface = "EDF2FB";
      const surface2 = "F5F7FB";
      const textDark = "111827";
      const dateFmt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

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

      const validSocios = data.contrato.socios.filter(s => s.nome);
      const sociosTable = validSocios.length > 0 ? new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ["NOME DO SÓCIO", "CPF", "PARTICIPAÇÃO"].map(h =>
            new TableCell({ shading: { type: "clear" as const, fill: navy }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: 60 }, children: [new TextRun({ text: h, size: 15, bold: true, color: "FFFFFF", font: "Arial" })] })] })
          ) }),
          ...validSocios.map((s, i) => new TableRow({ children: [s.nome, s.cpf || "—", s.participacao || "—"].map(v =>
            new TableCell({ shading: { type: "clear" as const, fill: i % 2 === 0 ? "FFFFFF" : surface2 }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: 60 }, children: [new TextRun({ text: v, size: 17, font: "Arial" })] })] })
          ) })),
        ],
      }) : new Paragraph({ children: [new TextRun({ text: "Nenhum sócio encontrado.", italics: true, color: muted, font: "Arial" })] });

      const doc = new Document({
        sections: [
          // ── CAPA ──
          {
            properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
            children: [
              spacer(4000),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "capital", size: 56, bold: true, color: navy, font: "Arial" }),
                new TextRun({ text: "finanças", size: 56, bold: true, color: green, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [
                new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 20, color: greenLight }),
              ] }),
              spacer(400),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "RELATÓRIO DE DUE DILIGENCE", size: 36, bold: true, color: navy, font: "Arial" }),
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
              spacer(1200),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: `Gerado em ${dateFmt}`, size: 18, color: muted, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [
                new TextRun({ text: "Documento confidencial — uso restrito", size: 16, color: "9CA3AF", italics: true, font: "Arial" }),
              ] }),
            ],
          },
          // ── CONTEÚDO ──
          {
            properties: {
              page: { margin: { top: 1200, bottom: 1000, left: 1000, right: 1000 } },
            },
            headers: { default: new Header({ children: [
              new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: green } }, spacing: { after: 100 }, children: [
                new TextRun({ text: "capital", size: 16, bold: true, color: navy, font: "Arial" }),
                new TextRun({ text: "finanças", size: 16, bold: true, color: green, font: "Arial" }),
                new TextRun({ text: "    Relatório de Due Diligence", size: 14, color: muted, font: "Arial" }),
              ] }),
            ] }) },
            footers: { default: new Footer({ children: [
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 } }, spacing: { before: 100 }, children: [
                new TextRun({ text: "Capital Finanças — Consolidador de Documentos", size: 14, color: "9CA3AF", font: "Arial" }),
                new TextRun({ text: "          Documento confidencial", size: 14, color: "9CA3AF", italics: true, font: "Arial" }),
              ] }),
            ] }) },
            children: [
              // Section 1
              sectionTitle("01", "IDENTIFICAÇÃO DA EMPRESA", navy),
              spacer(100),
              fieldTable([
                ["Razão Social", data.cnpj.razaoSocial], ["Nome Fantasia", data.cnpj.nomeFantasia],
                ["CNPJ", data.cnpj.cnpj], ["Data de Abertura", data.cnpj.dataAbertura],
                ["Situação Cadastral", data.cnpj.situacaoCadastral], ["Data da Situação", data.cnpj.dataSituacaoCadastral],
                ["Motivo da Situação", data.cnpj.motivoSituacao], ["Natureza Jurídica", data.cnpj.naturezaJuridica],
                ["CNAE Principal", data.cnpj.cnaePrincipal], ["CNAEs Secundários", data.cnpj.cnaeSecundarios],
                ["Porte", data.cnpj.porte], ["Capital Social (CNPJ)", data.cnpj.capitalSocialCNPJ],
                ["Endereço Completo", data.cnpj.endereco],
                ["Telefone", data.cnpj.telefone], ["E-mail", data.cnpj.email],
              ]),

              spacer(300),
              sectionTitle("02", "ESTRUTURA SOCIETÁRIA", green),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "QUADRO SOCIETÁRIO", size: 15, bold: true, color: muted, font: "Arial" })] }),
              sociosTable,
              spacer(100),
              fieldTable([
                ["Capital Social", data.contrato.capitalSocial], ["Data de Constituição", data.contrato.dataConstituicao],
                ["Prazo de Duração", data.contrato.prazoDuracao], ["Foro", data.contrato.foro],
                ["Objeto Social", data.contrato.objetoSocial], ["Administração e Poderes", data.contrato.administracao],
              ]),
              ...(data.contrato.temAlteracoes ? [spacer(100), new Paragraph({
                shading: { type: "clear" as const, fill: "FEF3C7" }, spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: "  ⚠ ATENÇÃO: Documento com alterações societárias recentes", bold: true, color: warning, size: 18, font: "Arial" })],
              })] : []),

              spacer(300),
              sectionTitle("03", "PERFIL DE CRÉDITO — SCR / BACEN", warning),
              spacer(100),
              fieldTable([
                ["Total Dívidas Ativas (R$)", data.scr.totalDividasAtivas],
                ["Classificação de Risco (A-H)", data.scr.classificacaoRisco],
                ["Operações a Vencer (R$)", data.scr.operacoesAVencer],
                ["Operações em Atraso", data.scr.operacoesEmAtraso],
                ["Operações Vencidas (R$)", data.scr.operacoesVencidas],
                ["Tempo Médio de Atraso", data.scr.tempoAtraso],
                ["Créditos Baixados (Prejuízo)", data.scr.prejuizo],
                ["Coobrigações / Garantias (R$)", data.scr.coobrigacoes],
                ["Concentração de Crédito (%)", data.scr.concentracaoCredito],
                ["Modalidades de Crédito", data.scr.modalidadesCredito],
                ["Instituições Credoras", data.scr.instituicoesCredoras],
                ["Histórico de Inadimplência", data.scr.historicoInadimplencia],
              ]),

            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.docx`);
      setGeneratedFormats(p => new Set(p).add("docx"));
    } catch (err) {
      console.error("DOCX generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ── EXCEL ──
  const generateExcel = async () => {
    setGeneratingFormat("xlsx");
    try {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Capital Finanças";
      wb.created = new Date();

      // type alias for worksheet
      const NAVY = "FF203B88"; const GREEN = "FF73B815"; const WARNING = "FFD97706";
      const SURFACE = "FFF5F7FB"; const STRIPE = "FFEDF2FB";
      const BORDER_C = "FFD1DCF0"; const TEXT = "FF111827"; const MUTED = "FF6B7280"; const WHITE = "FFFFFFFF";

      const F = (c: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: c } });
      const B = { style: "thin" as const, color: { argb: BORDER_C } };
      const BD = { top: B, bottom: B, left: B, right: B };
      const genDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

      // ══════════════════════════════════════════════════════
      // ABA ÚNICA: Relatório Completo — 5 colunas limpas
      // ══════════════════════════════════════════════════════
      const ws = wb.addWorksheet("Relatório Capital Finanças");
      ws.columns = [{ width: 2.5 }, { width: 28 }, { width: 28 }, { width: 20 }, { width: 14 }, { width: 2.5 }];
      ws.views = [{ showGridLines: false }];

      let r = 1;

      // ── HEADER BRANDED ──
      ws.mergeCells(r, 1, r, 6);
      ws.getRow(r).height = 48;
      const h = ws.getRow(r).getCell(1);
      h.value = "     capital finanças"; h.font = { bold: true, size: 20, color: { argb: WHITE }, name: "Arial" };
      h.fill = F(NAVY); h.alignment = { vertical: "middle" };
      r++;

      // Green strip
      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 5; ws.getRow(r).getCell(1).fill = F(GREEN); r++;

      // Subtítulo
      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 24;
      const sub = ws.getRow(r).getCell(1);
      sub.value = "     RELATÓRIO CONSOLIDADO  —  Consolidador de Documentos";
      sub.font = { size: 10, color: { argb: MUTED }, name: "Arial" }; sub.fill = F(SURFACE); sub.alignment = { vertical: "middle" };
      r++;

      // Info bar
      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 22;
      const info = ws.getRow(r).getCell(1);
      info.value = `     ${data.cnpj.razaoSocial || "Empresa"}  |  CNPJ: ${data.cnpj.cnpj || "—"}  |  ${genDate}`;
      info.font = { size: 10, bold: true, color: { argb: NAVY }, name: "Arial" }; info.fill = F(STRIPE); info.alignment = { vertical: "middle" };
      r++; r++; // spacer

      // ── HELPERS ──
      const secTitle = (num: string, title: string, color: string) => {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).height = 30;
        const c = ws.getRow(r).getCell(2);
        c.value = `  ${num}    ${title}`;
        c.font = { bold: true, size: 13, color: { argb: color }, name: "Arial" };
        c.fill = F(SURFACE);
        c.border = { left: { style: "medium" as const, color: { argb: color.replace("FF", "") } }, bottom: B };
        c.alignment = { vertical: "middle" };
        r++; r++; // spacer after
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

      const spacer = () => { ws.getRow(r).height = 10; r++; };

      // ══════════════════════════════════════
      // SEÇÃO 01: IDENTIFICAÇÃO
      // ══════════════════════════════════════
      secTitle("01", "IDENTIFICAÇÃO DA EMPRESA", NAVY);
      [
        ["Razão Social", data.cnpj.razaoSocial], ["Nome Fantasia", data.cnpj.nomeFantasia],
        ["CNPJ", data.cnpj.cnpj], ["Data de Abertura", data.cnpj.dataAbertura],
        ["Situação Cadastral", data.cnpj.situacaoCadastral], ["Data da Situação", data.cnpj.dataSituacaoCadastral],
        ["Motivo da Situação", data.cnpj.motivoSituacao], ["Natureza Jurídica", data.cnpj.naturezaJuridica],
        ["CNAE Principal", data.cnpj.cnaePrincipal], ["CNAEs Secundários", data.cnpj.cnaeSecundarios],
        ["Porte", data.cnpj.porte], ["Capital Social (CNPJ)", data.cnpj.capitalSocialCNPJ],
        ["Endereço Completo", data.cnpj.endereco],
        ["Telefone", data.cnpj.telefone], ["E-mail", data.cnpj.email],
      ].forEach(([l, v], i) => field2(l, v, i));

      spacer(); spacer();

      // ══════════════════════════════════════
      // SEÇÃO 02: ESTRUTURA SOCIETÁRIA
      // ══════════════════════════════════════
      secTitle("02", "ESTRUTURA SOCIETÁRIA", GREEN);

      // Tabela de sócios — 4 colunas reais
      const socH = ws.getRow(r);
      socH.height = 26;
      ["NOME DO SÓCIO", "CPF", "QUALIFICAÇÃO", "PART."].forEach((h, i) => {
        const c = socH.getCell(i + 2);
        c.value = h; c.font = { bold: true, size: 9, color: { argb: WHITE }, name: "Arial" };
        c.fill = F(GREEN); c.border = BD; c.alignment = { vertical: "middle", horizontal: "center" };
      });
      r++;

      const validSocios = data.contrato.socios.filter(s => s.nome);
      if (validSocios.length > 0) {
        validSocios.forEach((s, i) => {
          const row = ws.getRow(r);
          row.height = 24;
          const bg = i % 2 === 0 ? STRIPE : WHITE;
          const vals = [s.nome, s.cpf || "—", s.qualificacao || "—", s.participacao || "—"];
          vals.forEach((v, ci) => {
            const c = row.getCell(ci + 2);
            c.value = v; c.font = { size: 10, color: { argb: TEXT }, name: "Arial" };
            c.fill = F(bg); c.border = BD; c.alignment = { vertical: "middle" };
          });
          r++;
        });
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhum sócio encontrado";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }

      spacer();
      [
        ["Capital Social", data.contrato.capitalSocial], ["Data de Constituição", data.contrato.dataConstituicao],
        ["Prazo de Duração", data.contrato.prazoDuracao], ["Foro", data.contrato.foro],
        ["Objeto Social", data.contrato.objetoSocial], ["Administração e Poderes", data.contrato.administracao],
        ["Alterações Societárias", data.contrato.temAlteracoes ? "SIM — Alterações recentes" : "Não identificadas"],
      ].forEach(([l, v], i) => field2(l, v, i));

      spacer(); spacer();

      // ══════════════════════════════════════
      // SEÇÃO 03: SCR / BACEN
      // ══════════════════════════════════════
      secTitle("03", "PERFIL DE CRÉDITO — SCR / BACEN", WARNING);
      [
        ["Total de Dívidas Ativas (R$)", data.scr.totalDividasAtivas],
        ["Classificação de Risco (A-H)", data.scr.classificacaoRisco],
        ["Operações a Vencer (R$)", data.scr.operacoesAVencer],
        ["Operações em Atraso", data.scr.operacoesEmAtraso],
        ["Operações Vencidas (R$)", data.scr.operacoesVencidas],
        ["Tempo Médio de Atraso", data.scr.tempoAtraso],
        ["Créditos Baixados (Prejuízo)", data.scr.prejuizo],
        ["Coobrigações / Garantias (R$)", data.scr.coobrigacoes],
        ["Concentração de Crédito (%)", data.scr.concentracaoCredito],
        ["Modalidades de Crédito", data.scr.modalidadesCredito],
        ["Instituições Credoras", data.scr.instituicoesCredoras],
        ["Histórico de Inadimplência", data.scr.historicoInadimplencia],
      ].forEach(([l, v], i) => field2(l, v, i));

      spacer(); spacer();

      // ── Rodapé de dados ──
      field2("Data de Geração", genDate, 0);
      field2("Empresa Analisada", data.cnpj.razaoSocial, 1);
      field2("CNPJ", data.cnpj.cnpj, 2);

      spacer(); spacer();

      // ── FOOTER ──
      ws.mergeCells(r, 2, r, 5);
      ws.getRow(r).getCell(2).value = "Capital Finanças  |  Consolidador de Documentos  |  Documento confidencial — uso restrito";
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

  // ── HTML PROFISSIONAL ──
  const generateHTML = () => {
    setGeneratingFormat("html");
    try {
      const d = data;
      const esc = (s: string) => (s || "—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const maskCpf = (cpf: string) => cpf ? cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, "$1.***.*$3-$4") : "—";
      const genDt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const vs = d.contrato.socios.filter(s => s.nome);

      const row = (label: string, value: string) => {
        const isEmpty = !value || value === "—" || value === "0" || value === "0,00";
        return `<tr><td class="lbl">${esc(label)}</td><td class="val${isEmpty ? " muted" : ""}">${isEmpty ? "—" : esc(value)}</td></tr>`;
      };
      const riskBadge = (r: string) => {
        if (!r) return `<span class="muted">—</span>`;
        const bad = ["D","E","F","G","H"].includes(r.toUpperCase());
        return `<span class="badge ${bad ? "badge-red" : "badge-green"}">${esc(r)}</span>`;
      };

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório — ${esc(d.cnpj.razaoSocial || "Capital Finanças")}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',system-ui,sans-serif;background:#F3F4F6;color:#1E293B;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:960px;margin:0 auto;padding:32px;background:#fff}
/* Header */
.header{background:#1E3A5F;color:#fff;padding:28px 32px;border-radius:10px 10px 0 0}
.header .logo{font-size:22px;font-weight:700;letter-spacing:-0.3px}
.header .logo span{color:#84CC16}
.header .subtitle{font-size:11px;color:#94A3B8;margin-top:4px;text-transform:uppercase;letter-spacing:2px}
.info-bar{background:#F0F4F8;padding:14px 32px;display:flex;gap:32px;flex-wrap:wrap;border-bottom:1px solid #E2E8F0}
.info-bar .item{font-size:13px;color:#64748B}
.info-bar .item strong{color:#1E3A5F;font-weight:600}
/* Sections */
.section{padding:28px 0}
.section+.section{border-top:1px solid #E5E7EB}
.sec-title{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.sec-bar{width:4px;height:32px;border-radius:2px;background:#84CC16}
.sec-num{font-size:13px;font-weight:700;color:#1E3A5F}
.sec-title h2{font-size:17px;font-weight:700;color:#1E3A5F}
/* Tables — global */
table{width:100%;border-collapse:collapse;table-layout:fixed}
table tr td{padding:8px 12px;font-size:14px;border-bottom:1px solid #E5E7EB;vertical-align:top;white-space:normal;word-break:break-word;height:auto;min-height:36px}
table tr:nth-child(even) td{background:#F0F4F8}
table tr:nth-child(odd) td{background:#FFFFFF}
table tr:last-child td{border-bottom:none}
td.lbl{width:240px;min-width:240px;color:#6B7280;font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;background:#F8FAFC !important}
td.val{color:#111827;font-weight:600}
td.val.muted{color:#9CA3AF;font-weight:400}
/* Sócios table */
.socios-table{border-radius:8px;overflow:hidden;border:1px solid #E2E8F0;margin-bottom:20px}
.socios-table thead th{background:#1E3A5F;color:#fff;padding:10px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-align:left}
.socios-table thead th:nth-child(1){width:35%}
.socios-table thead th:nth-child(2){width:20%}
.socios-table thead th:nth-child(3){width:25%}
.socios-table thead th:nth-child(4){width:20%}
.socios-table tbody td{padding:10px 12px;font-size:14px;border-bottom:1px solid #E5E7EB;white-space:normal;word-break:break-word}
.socios-table tbody tr:nth-child(even){background:#F0F4F8}
.socios-table tbody tr:nth-child(odd){background:#fff}
/* Badges */
.badge{display:inline-block;padding:3px 12px;border-radius:4px;font-size:12px;font-weight:700}
.badge-red{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA}
.badge-green{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
.badge-amber{background:#FFFBEB;color:#D97706;border:1px solid #FDE68A}
/* Hero number */
.hero-num{font-size:24px;font-weight:700;color:#1E3A5F;letter-spacing:-0.5px}
.hero-num.amber{color:#D97706}
/* Muted text */
.muted{color:#9CA3AF}
/* Chips */
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.chip{display:inline-block;background:#EFF6FF;color:#1D4ED8;font-size:12px;font-weight:500;padding:4px 10px;border-radius:4px}
.chip.gray{background:#F3F4F6;color:#374151}
/* Footer */
.footer-block{margin-top:28px;padding-top:20px;border-top:1px solid #E5E7EB}
.footer-block table tr td{border-bottom:1px solid #E5E7EB;background:#F8FAFC !important}
.footer-block table tr:nth-child(even) td{background:#fff !important}
.footer-text{text-align:center;padding:20px 0;font-size:11px;color:#94A3B8}
/* Inadimplencia box */
.inad-box{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:8px;font-size:13px;line-height:1.6}
.inad-box.clean{background:#F0FDF4;border:1px solid #BBF7D0;color:#16A34A}
.inad-box.alert{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}
.inad-icon{font-size:16px;flex-shrink:0;margin-top:1px}
@media print{body{background:#fff}.page{padding:20px;max-width:100%}}
</style></head><body>
<div class="page">

<!-- HEADER -->
<div class="header">
  <div class="logo">capital<span>finanças</span></div>
  <div class="subtitle">Relatório Consolidado — Consolidador de Documentos</div>
</div>
<div class="info-bar">
  <div class="item"><strong>${esc(d.cnpj.razaoSocial)}</strong></div>
  <div class="item">CNPJ: <strong>${esc(d.cnpj.cnpj)}</strong></div>
  <div class="item">Gerado em <strong>${genDt}</strong></div>
</div>

<!-- SEÇÃO 01 — IDENTIFICAÇÃO -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">01</span><h2>Identificação da Empresa</h2></div>
  <table>
    ${row("Razão Social", d.cnpj.razaoSocial)}
    ${row("Nome Fantasia", d.cnpj.nomeFantasia)}
    ${row("CNPJ", d.cnpj.cnpj)}
    ${row("Data de Abertura", d.cnpj.dataAbertura)}
    ${row("Situação Cadastral", d.cnpj.situacaoCadastral)}
    ${row("Data da Situação", d.cnpj.dataSituacaoCadastral)}
    ${row("Motivo da Situação", d.cnpj.motivoSituacao)}
    ${row("Natureza Jurídica", d.cnpj.naturezaJuridica)}
    ${row("CNAE Principal", d.cnpj.cnaePrincipal)}
    ${row("CNAEs Secundários", d.cnpj.cnaeSecundarios)}
    ${row("Porte", d.cnpj.porte)}
    ${row("Capital Social", d.cnpj.capitalSocialCNPJ)}
    ${row("Endereço", d.cnpj.endereco)}
    ${row("Telefone", d.cnpj.telefone)}
    ${row("E-mail", d.cnpj.email)}
  </table>
</div>

<!-- SEÇÃO 02 — ESTRUTURA SOCIETÁRIA -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">02</span><h2>Estrutura Societária</h2></div>
  <table class="socios-table">
    <thead><tr><th>Nome do Sócio</th><th>CPF</th><th>Qualificação</th><th>Participação</th></tr></thead>
    <tbody>${vs.length > 0 ? vs.map(s => `<tr><td>${esc(s.nome)}</td><td style="font-family:monospace">${maskCpf(s.cpf)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("") : "<tr><td colspan='4' style='text-align:center;color:#94A3B8;padding:20px'>Nenhum sócio encontrado</td></tr>"}</tbody>
  </table>
  <table>
    ${row("Capital Social", d.contrato.capitalSocial)}
    ${row("Data de Constituição", d.contrato.dataConstituicao)}
    ${row("Prazo de Duração", d.contrato.prazoDuracao)}
    ${row("Foro", d.contrato.foro)}
    ${row("Objeto Social", d.contrato.objetoSocial)}
    ${row("Administração e Poderes", d.contrato.administracao)}
    ${d.contrato.temAlteracoes ? '<tr><td class="lbl">Alterações</td><td class="val"><span class="badge badge-amber">Alterações societárias recentes</span></td></tr>' : ""}
  </table>
</div>

<!-- SEÇÃO 03 — PERFIL DE CRÉDITO SCR/BACEN -->
<div class="section">
  <div class="sec-title"><div class="sec-bar"></div><span class="sec-num">03</span><h2>Perfil de Crédito — SCR / BACEN</h2></div>
  <table>
    <tr><td class="lbl">Total de Dívidas Ativas</td><td class="val"><span class="hero-num${parseFloat((d.scr.totalDividasAtivas||"0").replace(/\./g,"").replace(",",".")) > 1000000 ? " amber" : ""}">${d.scr.totalDividasAtivas ? "R$ " + esc(d.scr.totalDividasAtivas) : "—"}</span></td></tr>
    <tr><td class="lbl">Classificação de Risco</td><td class="val">${riskBadge(d.scr.classificacaoRisco)}</td></tr>
    ${row("Operações a Vencer (R$)", d.scr.operacoesAVencer)}
    ${row("Operações em Atraso (R$)", d.scr.operacoesEmAtraso)}
    ${row("Operações Vencidas (R$)", d.scr.operacoesVencidas)}
    ${row("Tempo Médio de Atraso", d.scr.tempoAtraso)}
    ${row("Prejuízo (Baixados)", d.scr.prejuizo)}
    ${row("Coobrigações / Garantias (R$)", d.scr.coobrigacoes)}
    ${row("Concentração de Crédito", d.scr.concentracaoCredito)}
    ${row("Instituições Credoras", d.scr.instituicoesCredoras)}
    <tr><td class="lbl">Modalidades de Crédito</td><td class="val">${d.scr.modalidadesCredito ? `<div class="chips">${d.scr.modalidadesCredito.split(",").map(m => `<span class="chip">${esc(m.trim())}</span>`).join("")}</div>` : '<span class="muted">—</span>'}</td></tr>
    <tr><td class="lbl">Histórico de Inadimplência</td><td class="val">${d.scr.historicoInadimplencia
      ? `<div class="inad-box alert"><span class="inad-icon">⚠</span><span>${esc(d.scr.historicoInadimplencia)}</span></div>`
      : `<div class="inad-box clean"><span class="inad-icon">✓</span><span>Não há registro de operações vencidas ou prejuízos</span></div>`
    }</td></tr>
  </table>
</div>

<!-- FOOTER -->
<div class="footer-block">
  <table>
    ${row("Data de Geração", genDt)}
    ${row("Empresa Analisada", d.cnpj.razaoSocial)}
    ${row("CNPJ", d.cnpj.cnpj)}
  </table>
</div>
<div class="footer-text">Capital Finanças | Consolidador de Documentos | Documento confidencial — uso restrito</div>

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

  const socioCount = data.contrato.socios.filter(s => s.nome).length;

  // ── Cálculo do score de risco ──
  const parseMoneyToNumber = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const dividaAtiva = parseMoneyToNumber(data.scr.totalDividasAtivas);
  const atraso = parseMoneyToNumber(data.scr.operacoesEmAtraso);
  const prejuizoVal = parseMoneyToNumber(data.scr.prejuizo);
  const vencidas = parseMoneyToNumber(data.scr.operacoesVencidas);

  const riskScore = (() => {
    let score = 0;
    // Dívidas ativas altas
    if (dividaAtiva > 500000) score += 1;
    if (dividaAtiva > 2000000) score += 1;
    // Operações em atraso
    if (atraso > 0) score += 2;
    if (atraso > 50000) score += 1;
    // Operações vencidas
    if (vencidas > 0) score += 2;
    if (vencidas > 100000) score += 1;
    // Prejuízo registrado
    if (prejuizoVal > 0) score += 3;
    // Classificação de risco ruim (D-H)
    const riskLetter = data.scr.classificacaoRisco?.toUpperCase();
    if (riskLetter && ["D", "E", "F", "G", "H"].includes(riskLetter)) score += 2;
    // Tempo de atraso alto
    if (data.scr.tempoAtraso && /180\+|91.180/i.test(data.scr.tempoAtraso)) score += 2;

    if (score >= 5) return "alto";
    if (score >= 2) return "medio";
    return "baixo";
  })();

  // ── Risk config ──
  const riskNumericScore = (() => {
    let s = 0;
    if (dividaAtiva > 500000) s += 10;
    if (dividaAtiva > 2000000) s += 10;
    if (atraso > 0) s += 20;
    if (atraso > 50000) s += 10;
    if (vencidas > 0) s += 15;
    if (prejuizoVal > 0) s += 25;
    const rl = data.scr.classificacaoRisco?.toUpperCase();
    if (rl && ["D","E","F","G","H"].includes(rl)) s += 20;
    return Math.max(0, 100 - s);
  })();

  const alertCount = [
    atraso > 0,
    vencidas > 0,
    prejuizoVal > 0,
    dividaAtiva > 2000000,
    data.scr.classificacaoRisco && ["D","E","F","G","H"].includes(data.scr.classificacaoRisco.toUpperCase()),
  ].filter(Boolean).length;

  const riskCfg = {
    alto:  { label: "RISCO ALTO",     labelColor: "text-[#DC2626]", bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", dot: "bg-[#DC2626]", heroColor: "text-[#DC2626]" },
    medio: { label: "RISCO MODERADO", labelColor: "text-[#D97706]", bg: "bg-[#FFFBEB]",  border: "border-[#FDE68A]", dot: "bg-[#F59E0B]", heroColor: "text-[#D97706]" },
    baixo: { label: "RISCO BAIXO",    labelColor: "text-[#16A34A]", bg: "bg-[#F0FDF4]",  border: "border-[#BBF7D0]", dot: "bg-[#16A34A]", heroColor: "text-[#16A34A]" },
  };
  const risk = riskCfg[riskScore];

  const MutedValue = ({ v }: { v: string }) => {
    const isZero = !v || v === "0" || v === "0,00" || v === "R$ 0,00";
    return <span className={isZero ? "text-[#9CA3AF]" : "text-[#111827] font-semibold"}>{isZero ? "—" : v}</span>;
  };

  return (
    <div className="animate-slide-up space-y-5">

      {/* ══════════════════════════════════════════════════════
          CARD 00 — SUMÁRIO EXECUTIVO
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[#E5E7EB]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E5E7EB] rounded-t-xl">
          <div className="w-1 h-8 rounded-full bg-[#F59E0B]" />
          <span className="text-xs font-bold text-[#1E3A5F] uppercase tracking-[0.08em]">00</span>
          <span className="text-sm font-bold text-[#111827]">Sumário Executivo</span>
        </div>

        <div className="p-5 space-y-5">
          {/* Risk badge row */}
          <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg ${risk.bg} border ${risk.border}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${risk.dot}`} />
              <span className={`text-sm font-bold tracking-wide ${risk.labelColor}`}>{risk.label}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">Score</span>
                <p className={`text-base font-bold ${risk.labelColor}`}>{riskNumericScore}/100</p>
              </div>
              {alertCount > 0 && (
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">Alertas</span>
                  <p className="text-base font-bold text-[#D97706]">{alertCount}</p>
                </div>
              )}
            </div>
          </div>

          {/* Hero number: Dívida Total */}
          {dividaAtiva > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Dívida Total</p>
              <p className={`text-[22px] font-bold leading-tight ${dividaAtiva > 1000000 ? "text-[#D97706]" : "text-[#111827]"}`}>
                R$ {data.scr.totalDividasAtivas}
              </p>
            </div>
          )}

          {/* Grid row 1: 3 colunas */}
          <div className="grid grid-cols-3 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Empresa</p>
              <p className="text-[14px] font-semibold text-[#111827] leading-snug break-words">{data.cnpj.razaoSocial || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">CNPJ</p>
              <p className="text-[14px] font-semibold text-[#111827] font-mono">{data.cnpj.cnpj || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Situação</p>
              <p className="text-[14px] font-semibold text-[#111827]">{data.cnpj.situacaoCadastral || "—"}</p>
            </div>
          </div>

          {/* Grid row 2: 3 colunas */}
          <div className="grid grid-cols-3 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Sócios</p>
              <p className="text-[14px] font-semibold text-[#111827]">{socioCount}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Capital Social</p>
              <p className="text-[14px] font-semibold text-[#111827] break-words">{data.contrato.capitalSocial || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Em Atraso</p>
              <p className="text-[14px]"><MutedValue v={data.scr.operacoesEmAtraso ? `R$ ${data.scr.operacoesEmAtraso}` : ""} /></p>
            </div>
          </div>

          {/* Grid row 3: 2 colunas */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Prejuízo</p>
              <p className="text-[14px]"><MutedValue v={data.scr.prejuizo ? `R$ ${data.scr.prejuizo}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Classificação de Risco</p>
              <p className="text-[14px] font-semibold text-[#111827]">{data.scr.classificacaoRisco || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CARD 03 — PERFIL DE CRÉDITO SCR/BACEN
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[#E5E7EB]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E5E7EB] rounded-t-xl">
          <div className="w-1 h-8 rounded-full bg-[#F59E0B]" />
          <span className="text-xs font-bold text-[#1E3A5F] uppercase tracking-[0.08em]">03</span>
          <span className="text-sm font-bold text-[#111827]">Perfil de Crédito — SCR / BACEN</span>
        </div>

        <div className="p-5 space-y-5">
          {/* Hero: Total Dívidas Ativas */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Total Dívidas Ativas</p>
            <p className={`text-[24px] font-bold leading-tight ${dividaAtiva > 1000000 ? "text-[#D97706]" : "text-[#111827]"}`}>
              {data.scr.totalDividasAtivas ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
            </p>
          </div>

          {/* Grid: 3 colunas — Operações */}
          <div className="grid grid-cols-3 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Operações a Vencer</p>
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

          {/* Grid: 2 colunas — Prejuízo + Coobrigações */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Prejuízo (Baixados)</p>
              <p className="text-[15px]"><MutedValue v={data.scr.prejuizo ? `R$ ${data.scr.prejuizo}` : ""} /></p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-1">Coobrigações / Garantias</p>
              <p className="text-[15px]"><MutedValue v={data.scr.coobrigacoes ? `R$ ${data.scr.coobrigacoes}` : ""} /></p>
            </div>
          </div>

          {/* Modalidades de Crédito — Chips */}
          {data.scr.modalidadesCredito && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2">Modalidades de Crédito</p>
              <div className="flex flex-wrap gap-1.5">
                {data.scr.modalidadesCredito.split(",").map((m, i) => (
                  <span key={i} className="inline-block bg-[#EFF6FF] text-[#1D4ED8] text-[12px] font-medium px-2.5 py-1 rounded" style={{ letterSpacing: "0.01em" }}>
                    {m.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Instituições Credoras — Chips */}
          {data.scr.instituicoesCredoras && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2">Instituições Credoras</p>
              <div className="flex flex-wrap gap-1.5">
                {data.scr.instituicoesCredoras.split(",").map((inst, i) => (
                  <span key={i} className="inline-block bg-[#F3F4F6] text-[#374151] text-[12px] font-medium px-2.5 py-1 rounded">
                    {inst.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Histórico de Inadimplência */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280] mb-2">Histórico de Inadimplência</p>
            {data.scr.historicoInadimplencia ? (
              <div className="flex items-start gap-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-4 py-3">
                <AlertTriangle size={14} className="text-[#D97706] flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-[#374151] leading-relaxed break-words">{data.scr.historicoInadimplencia}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-4 py-3">
                <CheckCircle2 size={14} className="text-[#16A34A] flex-shrink-0" />
                <p className="text-[13px] text-[#16A34A] font-medium">Não há registro de operações vencidas ou prejuízos</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Editar dados do relatório ── */}
      <div className="card overflow-hidden">
        <button onClick={() => setEditing(p => !p)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-cf-bg transition-colors text-left group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cf-surface flex items-center justify-center group-hover:bg-cf-navy/10 transition-colors">
              <Pencil size={14} className="text-cf-navy" />
            </div>
            <div>
              <span className="text-sm font-semibold text-cf-text-1 block">Editar dados do relatório</span>
              <span className="text-[11px] text-cf-text-3">Ajuste os campos antes de gerar</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-cf-navy bg-cf-surface px-3 py-1.5 rounded-full group-hover:bg-cf-navy group-hover:text-white transition-all">{editing ? "Fechar" : "Abrir"}</span>
        </button>
        {editing && (
          <div className="border-t border-cf-border px-5 pb-5 pt-4 space-y-5 animate-fade-in">
            {/* Seção CNPJ */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" /> Identificação da Empresa</p>
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

            {/* Seção Contrato */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block" /> Estrutura Societária</p>
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

            {/* Seção SCR */}
            <div>
              <p className="section-label mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cf-warning inline-block" /> Perfil de Crédito</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ["Total Dívidas (R$)", "totalDividasAtivas"], ["Classificação Risco", "classificacaoRisco"],
                  ["A Vencer (R$)", "operacoesAVencer"], ["Em Atraso", "operacoesEmAtraso"],
                  ["Vencidas (R$)", "operacoesVencidas"], ["Tempo Atraso", "tempoAtraso"],
                  ["Prejuízo", "prejuizo"], ["Coobrigações", "coobrigacoes"],
                  ["Concentração", "concentracaoCredito"], ["Modalidades", "modalidadesCredito"],
                  ["Instituições Credoras", "instituicoesCredoras"], ["Histórico", "historicoInadimplencia"],
                ] as [string, keyof typeof data.scr][]).map(([label, key]) => (
                  <div key={key} className={key === "instituicoesCredoras" || key === "historicoInadimplencia" || key === "modalidadesCredito" ? "col-span-2" : ""}>
                    <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                    {key === "historicoInadimplencia"
                      ? <textarea value={data.scr[key]} onChange={e => setSCR(key, e.target.value)} rows={2} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                      : <input value={data.scr[key]} onChange={e => setSCR(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Conteúdo do relatório ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-cf-border bg-cf-bg/50">
          <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest">Conteúdo do relatório</p>
        </div>
        <div className="p-4 space-y-2">
          {[
            { n: "01", title: "Identificação da Empresa", desc: "Dados do Cartão CNPJ", color: "bg-cf-navy", bgLight: "bg-cf-navy/5" },
            { n: "02", title: "Estrutura Societária", desc: "Dados do Contrato Social", color: "bg-cf-green", bgLight: "bg-cf-green/5" },
            { n: "03", title: "Perfil de Crédito", desc: "Dados do SCR/Bacen", color: "bg-cf-warning", bgLight: "bg-cf-warning/5" },
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

      {/* ── Download & Ações ── */}
      <div className="space-y-4 pt-1">
        {generatedFormats.size > 0 && (
          <div className="flex items-center justify-center gap-2 py-2.5 bg-cf-green/5 rounded-xl border border-cf-green/20">
            <CheckCircle2 size={16} className="text-cf-green" />
            <span className="text-sm font-semibold text-cf-green">Relatório gerado com sucesso!</span>
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

        {/* Ações finais */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="btn-secondary text-xs sm:text-sm">
              <ArrowLeft size={15} /> Voltar
            </button>
            {onReset && (
              <button onClick={onReset} className="btn-secondary text-xs sm:text-sm">
                <RotateCcw size={14} /> Voltar ao início
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
                Deseja finalizar esta coleta? Você poderá consultá-la a qualquer momento no <span className="font-semibold text-cf-navy">histórico</span>.
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
