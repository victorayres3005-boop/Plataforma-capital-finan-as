"use client";

import { useState } from "react";
import { ArrowLeft, Download, FileDown, FileText, Sheet, Globe, Loader2, CheckCircle2, AlertTriangle, Pencil, Clock, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ExtractedData, CollectionDocument } from "@/types";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface GenerateStepProps {
  data: ExtractedData;
  onBack: () => void;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GenerateStep({ data: initialData, onBack }: GenerateStepProps) {
  const [data, setData] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(initialData)));
  const [resumo, setResumo] = useState(initialData.resumoRisco || "");
  const [editing, setEditing] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<Format | null>(null);
  const [generatedFormats, setGeneratedFormats] = useState<Set<Format>>(new Set());
  const setGenerated = (v: boolean) => { if (v) setGeneratedFormats(p => new Set(p).add("pdf")); };

  const setCNPJ = (k: keyof typeof data.cnpj, v: string) => setData(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof data.contrato, v: string | boolean) => setData(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof data.scr, v: string) => setData(p => ({ ...p, scr: { ...p.scr, [k]: v } }));

  // ── Supabase: Salvar / Finalizar coleta ──
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
        const { error } = await supabase.from("document_collections").update({ documents, label: data.cnpj.razaoSocial || null }).eq("id", collectionId);
        if (error) throw error;
        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return collectionId;
      } else {
        const { data: session } = await supabase.auth.getUser();
        const { data: row, error } = await supabase.from("document_collections").insert({
          user_id: session.user?.id ?? null,
          status: "in_progress",
          label: data.cnpj.razaoSocial || null,
          documents,
        }).select("id").single();
        if (error) throw error;
        setCollectionId(row.id);
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
      window.location.href = `/historico?highlight=${idToFinish}`;
    } catch (err) {
      toast.error("Erro ao finalizar: " + (err instanceof Error ? err.message : "Verifique a conexão"));
    } finally {
      setFinishing(false);
    }
  };

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

      // ===== PAGE 1 =====
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

      // SECTION 4: Resumo de Risco
      checkPageBreak(50);
      drawSectionTitle("04", "RESUMO DE RISCO — ANÁLISE DO ANALISTA", colors.danger);

      if (resumo) {
        drawMultilineField("Análise e Parecer", resumo, 20);
      } else {
        checkPageBreak(20);
        doc.setFillColor(...colors.surface);
        doc.roundedRect(margin, y, contentW, 16, 1, 1, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...colors.textMuted);
        doc.text("Nenhum parecer preenchido.", margin + 4, y + 10);
        y += 20;
      }

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
      const danger = "DC2626";
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

              spacer(300),
              sectionTitle("04", "RESUMO DE RISCO — ANÁLISE DO ANALISTA", danger),
              spacer(100),
              new Paragraph({
                shading: { type: "clear" as const, fill: resumo ? surface2 : "FFFFFF" },
                spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: resumo || "Nenhum parecer preenchido.", italics: !resumo, size: 19, font: "Arial", color: resumo ? textDark : muted })],
              }),
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
      const DANGER = "FFDC2626"; const SURFACE = "FFF5F7FB"; const STRIPE = "FFEDF2FB";
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

      // ══════════════════════════════════════
      // SEÇÃO 04: RESUMO DE RISCO
      // ══════════════════════════════════════
      secTitle("04", "RESUMO DE RISCO — ANÁLISE DO ANALISTA", DANGER);

      // Label
      ws.mergeCells(r, 2, r, 5);
      ws.getRow(r).getCell(2).value = "PARECER DO ANALISTA";
      ws.getRow(r).getCell(2).font = { bold: true, size: 9, color: { argb: MUTED }, name: "Arial" };
      r++;

      // Texto do parecer
      ws.mergeCells(r, 2, r, 5);
      const txt = resumo || "Nenhum parecer preenchido.";
      ws.getRow(r).height = Math.max(50, Math.ceil(txt.length / 70) * 18);
      const pc = ws.getRow(r).getCell(2);
      pc.value = txt;
      pc.font = { size: 11, color: { argb: resumo ? TEXT : MUTED }, italic: !resumo, name: "Arial" };
      pc.fill = F(SURFACE); pc.border = BD; pc.alignment = { vertical: "top", wrapText: true };
      r++;

      spacer();
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

      const row = (label: string, value: string) => `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value)}</td></tr>`;
      const riskBadge = (r: string) => {
        if (!r) return "—";
        const bad = ["D","E","F","G","H"].includes(r.toUpperCase());
        return `<span class="badge ${bad ? "badge-red" : "badge-green"}">${esc(r)}</span>`;
      };

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório — ${esc(d.cnpj.razaoSocial || "Capital Finanças")}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#fff;color:#1E293B;line-height:1.6}
.page{max-width:900px;margin:0 auto;padding:40px}
.header{background:#0A1628;color:#fff;padding:32px 40px;border-radius:12px 12px 0 0}
.header .logo{font-size:24px;font-weight:700;letter-spacing:-0.5px}
.header .logo span{color:#16A34A}
.header .subtitle{font-size:12px;color:#94A3B8;margin-top:4px;text-transform:uppercase;letter-spacing:2px}
.info-bar{background:#F1F5F9;padding:16px 40px;display:flex;gap:32px;flex-wrap:wrap;border-bottom:1px solid #E2E8F0}
.info-bar .item{font-size:13px;color:#64748B}
.info-bar .item strong{color:#0A1628;font-weight:600}
.section{padding:32px 0}
.section+.section{border-top:1px solid #E2E8F0}
.sec-title{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.sec-num{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff}
.sec-num.navy{background:#0A1628}
.sec-num.green{background:#16A34A}
.sec-num.amber{background:#D97706}
.sec-num.red{background:#DC2626}
.sec-title h2{font-size:18px;font-weight:700;color:#0A1628}
table{width:100%;border-collapse:collapse}
table tr td{padding:14px 16px;font-size:14px;border-bottom:1px solid #E2E8F0}
table tr:last-child td{border-bottom:none}
td.lbl{width:260px;background:#F8FAFC;color:#64748B;font-weight:500}
td.val{color:#1E293B;font-weight:600}
.socios-table{border-radius:8px;overflow:hidden;border:1px solid #E2E8F0}
.socios-table thead th{background:#0A1628;color:#fff;padding:12px 16px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:left}
.socios-table tbody td{padding:12px 16px;font-size:14px;border-bottom:1px solid #E2E8F0}
.socios-table tbody tr:nth-child(even){background:#F8FAFC}
.badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700}
.badge-red{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA}
.badge-green{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}
.parecer-box{background:#FFFBEB;border:2px dashed #FDE68A;border-radius:8px;padding:20px 24px;font-size:14px;line-height:1.8;color:#1E293B;min-height:80px}
.parecer-box.filled{border-style:solid;border-color:#E2E8F0;background:#F8FAFC}
.footer{text-align:center;padding:24px 0;margin-top:32px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8}
.big-num{font-size:28px;font-weight:700;color:#0A1628;letter-spacing:-0.5px}
.highlight-row td.val{display:flex;align-items:center;gap:12px}
@media print{.page{padding:20px}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="page">
<div class="header">
  <div class="logo">capital<span>finanças</span></div>
  <div class="subtitle">Relatório Consolidado</div>
</div>
<div class="info-bar">
  <div class="item"><strong>${esc(d.cnpj.razaoSocial)}</strong></div>
  <div class="item">CNPJ: <strong>${esc(d.cnpj.cnpj)}</strong></div>
  <div class="item">Gerado em <strong>${genDt}</strong></div>
</div>

<div class="section">
  <div class="sec-title"><div class="sec-num navy">01</div><h2>Identificação da Empresa</h2></div>
  <table>
    ${row("Razão Social", d.cnpj.razaoSocial)}${row("Nome Fantasia", d.cnpj.nomeFantasia)}
    ${row("CNPJ", d.cnpj.cnpj)}${row("Data de Abertura", d.cnpj.dataAbertura)}
    ${row("Situação Cadastral", d.cnpj.situacaoCadastral)}${row("Data da Situação", d.cnpj.dataSituacaoCadastral)}
    ${row("Natureza Jurídica", d.cnpj.naturezaJuridica)}${row("CNAE Principal", d.cnpj.cnaePrincipal)}
    ${row("Porte", d.cnpj.porte)}${row("Capital Social", d.cnpj.capitalSocialCNPJ)}
    ${row("Endereço", d.cnpj.endereco)}
    ${row("Telefone", d.cnpj.telefone)}${row("E-mail", d.cnpj.email)}
  </table>
</div>

<div class="section">
  <div class="sec-title"><div class="sec-num green">02</div><h2>Estrutura Societária</h2></div>
  <table class="socios-table">
    <thead><tr><th>Nome</th><th>CPF</th><th>Qualificação</th><th>Participação</th></tr></thead>
    <tbody>${vs.length > 0 ? vs.map(s => `<tr><td>${esc(s.nome)}</td><td>${maskCpf(s.cpf)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("") : "<tr><td colspan='4' style='text-align:center;color:#94A3B8'>Nenhum sócio encontrado</td></tr>"}</tbody>
  </table>
  <table style="margin-top:20px">
    ${row("Capital Social", d.contrato.capitalSocial)}${row("Data de Constituição", d.contrato.dataConstituicao)}
    ${row("Prazo de Duração", d.contrato.prazoDuracao)}${row("Foro", d.contrato.foro)}
    ${row("Objeto Social", d.contrato.objetoSocial)}${row("Administração", d.contrato.administracao)}
    ${d.contrato.temAlteracoes ? '<tr><td class="lbl">Alterações</td><td class="val"><span class="badge badge-red">Alterações societárias recentes</span></td></tr>' : ""}
  </table>
</div>

<div class="section">
  <div class="sec-title"><div class="sec-num amber">03</div><h2>Perfil de Crédito — SCR / Bacen</h2></div>
  <table>
    <tr class="highlight-row"><td class="lbl">Total de Dívidas Ativas</td><td class="val"><span class="big-num">R$ ${esc(d.scr.totalDividasAtivas)}</span></td></tr>
    <tr><td class="lbl">Classificação de Risco</td><td class="val">${riskBadge(d.scr.classificacaoRisco)}</td></tr>
    ${row("Operações a Vencer (R$)", d.scr.operacoesAVencer)}
    ${row("Operações em Atraso", d.scr.operacoesEmAtraso)}
    ${row("Operações Vencidas (R$)", d.scr.operacoesVencidas)}
    ${row("Tempo de Atraso", d.scr.tempoAtraso)}
    ${row("Prejuízo (Baixados)", d.scr.prejuizo)}
    ${row("Coobrigações (R$)", d.scr.coobrigacoes)}
    ${row("Concentração de Crédito", d.scr.concentracaoCredito)}
    ${row("Modalidades", d.scr.modalidadesCredito)}
    ${row("Instituições Credoras", d.scr.instituicoesCredoras)}
    ${row("Histórico de Inadimplência", d.scr.historicoInadimplencia)}
  </table>
</div>

<div class="section">
  <div class="sec-title"><div class="sec-num red">04</div><h2>Resumo de Risco — Análise do Analista</h2></div>
  <div class="parecer-box ${resumo ? "filled" : ""}">${esc(resumo || "Nenhum parecer preenchido.")}</div>
</div>

<div class="footer">Capital Finanças · Consolidador de Documentos · Documento confidencial · uso restrito</div>
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

  return (
    <div className="animate-slide-up space-y-4">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Empresa", value: data.cnpj.razaoSocial || "—", sub: data.cnpj.cnpj || "—", bar: "bg-cf-navy" },
          { label: "Sócios", value: String(data.contrato.socios.filter(s => s.nome).length || 0), sub: `Capital: ${data.contrato.capitalSocial || "—"}`, bar: "bg-cf-green" },
          { label: "Dívidas Ativas", value: data.scr.totalDividasAtivas || "—", sub: `Atrasos: ${data.scr.operacoesEmAtraso || "0"}`, bar: "bg-cf-warning" },
        ].map(c => (
          <div key={c.label} className="card p-4 overflow-hidden relative">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bar}`} />
            <p className="section-label mb-1">{c.label}</p>
            <p className="text-sm font-bold text-cf-text-1 truncate">{c.value}</p>
            <p className="text-xs text-cf-text-3 mt-0.5 truncate">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Editar dados do relatório */}
      <div className="card overflow-hidden">
        <button onClick={() => setEditing(p => !p)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-cf-bg transition-colors text-left">
          <div className="flex items-center gap-2">
            <Pencil size={14} className="text-cf-navy" />
            <span className="text-sm font-semibold text-cf-text-1">Editar dados do relatório</span>
          </div>
          <span className="text-xs text-cf-text-3">{editing ? "Fechar" : "Abrir"}</span>
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

      {/* Resumo de risco */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-cf-danger/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={17} className="text-cf-danger" />
          </div>
          <div>
            <p className="section-label">Seção 04</p>
            <h3 className="text-sm font-semibold text-cf-text-1">Resumo de Risco — Parecer do Analista</h3>
          </div>
        </div>
        <textarea
          value={resumo}
          onChange={e => setResumo(e.target.value)}
          placeholder="Descreva a análise de risco, pontos de atenção, recomendação de crédito e observações relevantes para o processo de due diligence..."
          rows={6}
          className="input-field resize-none"
        />
        <p className="text-xs text-cf-text-4 mt-2 text-right">{resumo.length} caracteres</p>
      </div>

      {/* Conteúdo do relatório */}
      <div className="card p-5">
        <p className="section-label mb-3">Conteúdo do relatório</p>
        <div className="space-y-2">
          {[
            { n:"01", title:"Identificação da Empresa",  desc:"Dados do Cartão CNPJ",      dot:"bg-cf-navy" },
            { n:"02", title:"Estrutura Societária",       desc:"Dados do Contrato Social",  dot:"bg-cf-green" },
            { n:"03", title:"Perfil de Crédito",          desc:"Dados do SCR/Bacen",        dot:"bg-cf-warning" },
            { n:"04", title:"Resumo de Risco",            desc: resumo ? "Parecer preenchido ✓" : "Aguardando parecer", dot:"bg-cf-danger" },
          ].map(s => (
            <div key={s.n} className="flex items-center gap-3 bg-cf-bg rounded-xl px-4 py-3 border border-cf-border">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <span className="text-xs font-bold text-cf-text-3 w-6">{s.n}</span>
              <div>
                <p className="text-sm font-semibold text-cf-text-1">{s.title}</p>
                <p className="text-xs text-cf-text-3">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-1">
        {generatedFormats.size > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-cf-green">
            <CheckCircle2 size={15} /> Relatório gerado com sucesso!
          </div>
        )}

        <div className="card p-4">
          <p className="section-label mb-3">Formato de download</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { fmt: "pdf" as Format, label: "PDF", icon: <FileDown size={16} />, fn: generatePDF },
              { fmt: "docx" as Format, label: "Word", icon: <FileText size={16} />, fn: generateDOCX },
              { fmt: "xlsx" as Format, label: "Excel", icon: <Sheet size={16} />, fn: generateExcel },
              { fmt: "html" as Format, label: "HTML", icon: <Globe size={16} />, fn: generateHTML },
            ]).map(({ fmt, label, icon, fn }) => (
              <button key={fmt} onClick={fn} disabled={!!generatingFormat}
                className={`btn-green flex-col gap-1 py-3 ${generatedFormats.has(fmt) ? "!bg-cf-green-dark" : ""}`}>
                {generatingFormat === fmt ? <Loader2 size={16} className="animate-spin" /> : icon}
                <span className="text-xs">{generatingFormat === fmt ? "Gerando..." : generatedFormats.has(fmt) ? `Baixar ${label}` : `Gerar ${label}`}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="btn-secondary text-xs sm:text-sm">
              <ArrowLeft size={15} /> Voltar
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-secondary text-xs sm:text-sm">
              {saving ? <Loader2 size={15} className="animate-spin" />
                : savedFeedback ? <><Check size={15} className="text-cf-green" /> Salvo!</>
                : <><Clock size={15} /> Salvar<span className="hidden sm:inline"> no histórico</span></>}
            </button>
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
          <div className="card max-w-md w-full mx-4 p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-cf-text-1">Finalizar coleta</h3>
              <button onClick={() => setShowFinishModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-cf-text-3 hover:bg-cf-surface transition-colors">
                <XIcon size={16} />
              </button>
            </div>
            <p className="text-sm text-cf-text-2 leading-relaxed">
              Deseja finalizar esta coleta? Você poderá consultá-la a qualquer momento no histórico.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowFinishModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleFinish} disabled={finishing} className="btn-green">
                {finishing ? <><Loader2 size={15} className="animate-spin" /> Finalizando...</> : <><Check size={15} /> Finalizar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
