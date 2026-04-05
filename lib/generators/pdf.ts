import type { ExtractedData, AIAnalysis } from "@/types";

type AlertSeverity = "ALTA" | "MODERADA" | "INFO";
interface Alert { message: string; severity: AlertSeverity; impacto?: string; }

export interface PDFReportParams {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  alerts: Alert[];
  alertsHigh: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  resumoExecutivo: string;
  companyAge: string;
  protestosVigentes: number;
  vencidosSCR: number;
  vencidas: number;
  prejuizosVal: number;
  dividaAtiva: number;
  atraso: number;
  riskScore: "alto" | "medio" | "baixo";
  decisionColor: string;
  decisionBg: string;
  decisionBorder: string;
  alavancagem?: number;
}

function parseMoneyToNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
}

export async function buildPDFReport(p: PDFReportParams): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data, aiAnalysis, decision, finalRating, alerts, alertsHigh, pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo, companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal, dividaAtiva, atraso, riskScore, decisionColor, decisionBg, decisionBorder } = p;

      // Parse de mês suportando MM/YYYY e MMM/YY (ex: "Jan/25")
      const parseDateKey = (s: string): number => {
        if (!s) return 0;
        const parts = s.split("/");
        if (parts.length !== 2) return 0;
        const [p1, p2] = parts;
        const monthMap: Record<string, number> = {
          jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,
          jul:7,ago:8,set:9,out:10,nov:11,dez:12
        };
        const month = isNaN(Number(p1)) ? (monthMap[p1.toLowerCase()] || 0) : Number(p1);
        const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
        return year * 100 + month;
      };

      const validMeses = [...(data.faturamento?.meses || [])]
        .filter(m => m?.mes && m?.valor)
        .sort((a, b) => parseDateKey(a.mes) - parseDateKey(b.mes));

      // Usa fmm12m já calculado pelo fillFaturamentoDefaults — não recalcula
      const fmmNum = data.faturamento?.fmm12m
        ? parseMoneyToNumber(data.faturamento.fmm12m)
        : validMeses.slice(-12).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / 12;

      // Todos os meses extraídos
      const mesesFMM = validMeses;

      const scrNum = parseMoneyToNumber(data.scr?.totalDividasAtivas || "0");
      const alavancagem = p.alavancagem ?? (fmmNum > 0 ? scrNum / fmmNum : 0);
      const faturamentoRealmenteZerado = fmmNum === 0 || (data.faturamento.meses || []).length === 0 || (data.faturamento.meses || []).every(m => parseMoneyToNumber(m.valor) === 0);

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


      // ===== PAGE 1 — CAPA =====
      newPage();
      doc.setFillColor(...colors.navy);
      doc.rect(0, 0, 210, 297, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(0, 0, 210, 3, "F");

      // Decorative
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(160, 50, 40);
      doc.circle(50, 250, 30);

      // Logo
      doc.setLineWidth(2);
      doc.circle(W / 2, 65, 18);
      doc.setFillColor(255, 255, 255);
      doc.circle(W / 2, 84, 3, "F");

      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      const capW2 = doc.getTextWidth("capital");
      doc.text("capital", W / 2 - (capW2 + doc.getTextWidth("financas") + 2) / 2, 105);
      doc.setTextColor(...colors["accent-light"]);
      doc.text("financas", W / 2 - (capW2 + doc.getTextWidth("financas") + 2) / 2 + capW2 + 2, 105);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 200, 240);
      doc.text("CONSOLIDADOR DE DOCUMENTOS", W / 2, 116, { align: "center" });

      doc.setFillColor(...colors.accent);
      doc.rect(W / 2 - 30, 123, 60, 1.5, "F");

      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Relatorio de", W / 2, 145, { align: "center" });
      doc.text("Due Diligence", W / 2, 156, { align: "center" });

      if (data.cnpj.razaoSocial) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors["accent-light"]);
        doc.text(data.cnpj.razaoSocial.substring(0, 50), W / 2, 175, { align: "center" });
      }
      if (data.cnpj.cnpj) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 200, 240);
        doc.text("CNPJ: " + data.cnpj.cnpj, W / 2, 184, { align: "center" });
      }

      const coverDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      doc.setFontSize(9);
      doc.setTextColor(140, 170, 220);
      doc.text("Gerado em " + coverDate, W / 2, 198, { align: "center" });
      doc.setFontSize(7);
      doc.setTextColor(100, 140, 200);
      doc.text("Documento confidencial — uso restrito", W / 2, 280, { align: "center" });
      doc.setFillColor(...colors.accent);
      doc.rect(0, 294, 210, 3, "F");

      // ===== PAGE 1b — SINTESE PRELIMINAR =====
      newPage();
      drawHeader();
      drawSectionTitle("00", "SINTESE PRELIMINAR", colors.primary);

      // Rating + Decision
      const ratingColorPDF = finalRating >= 7 ? colors.green : finalRating >= 4 ? colors.amber : colors.red;
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ratingColorPDF);
      doc.text(finalRating + "/10", margin, y + 2);
      const decisionPDFColor = decision === "APROVADO" ? colors.green : decision === "REPROVADO" ? colors.red : colors.amber;
      const decisionPDFBg = decision === "APROVADO" ? [240, 253, 244] as [number,number,number] : decision === "REPROVADO" ? [254, 242, 242] as [number,number,number] : [255, 251, 235] as [number,number,number];
      doc.setFillColor(...decisionPDFBg);
      doc.roundedRect(margin + 28, y - 6, 40, 10, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...decisionPDFColor);
      doc.text(decision, margin + 48, y + 1, { align: "center" });
      y += 16;

      // 6 Alert Cards (3x2 grid)
      const alertCardsData = [
        { label: "PROTESTOS", value: protestosVigentes > 0 ? "R$ " + (data.protestos?.vigentesValor || "0") : "—", isDanger: protestosVigentes > 0, isWarning: false },
        { label: "PROCESSOS", value: data.processos?.passivosTotal || "—", isDanger: parseInt(data.processos?.passivosTotal || "0") > 20, isWarning: false },
        { label: "SCR VENCIDO", value: vencidosSCR > 0 ? data.scr.vencidos : "—", isDanger: vencidosSCR > 0, isWarning: false },
        { label: "SCR PREJUIZO", value: prejuizosVal > 0 ? data.scr.prejuizos : "—", isDanger: prejuizosVal > 0, isWarning: false },
        { label: "REC. JUDICIAL", value: data.processos?.temRJ ? "Sim" : "—", isDanger: !!data.processos?.temRJ, isWarning: false },
        { label: "ALAVANCAGEM", value: alavancagem > 0 ? alavancagem.toFixed(2) + "x" : "—", isDanger: alavancagem > 5, isWarning: alavancagem > 3.5 && alavancagem <= 5 },
      ];
      const cardW2 = (contentW - 8) / 3;
      const cardH2 = 16;
      alertCardsData.forEach((card, i) => {
        const col = i % 3;
        const rowIdx = Math.floor(i / 3);
        const cx = margin + col * (cardW2 + 4);
        const cy = y + rowIdx * (cardH2 + 3);
        const bg = card.isDanger ? [254, 242, 242] as [number,number,number] : card.isWarning ? [255, 251, 235] as [number,number,number] : [248, 250, 252] as [number,number,number];
        doc.setFillColor(...bg);
        doc.roundedRect(cx, cy, cardW2, cardH2, 2, 2, "F");
        const tc = card.isDanger ? colors.danger : card.isWarning ? colors.warning : colors.text;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...tc);
        doc.text(String(card.value).substring(0, 18), cx + cardW2 / 2, cy + 7, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(...colors.textMuted);
        doc.text(card.label, cx + cardW2 / 2, cy + 12.5, { align: "center" });
      });
      y += cardH2 * 2 + 12;

      // Alerts list
      if (alerts.length > 0) {
        alerts.forEach(alert => { drawAlertBox(alert.message, alert.severity); });
        drawSpacer(4);
      }

      // ===== PAGE 2 — CARTAO CNPJ =====
      newPage();
      drawHeader();

      drawSectionTitle("01", "CARTAO CNPJ", colors.primary);

      const cnpjColW = (contentW - 4) / 2;

      const drawCnpjRow = (
        left: { label: string; value: string },
        right: { label: string; value: string }
      ) => {
        checkPageBreak(14);
        const leftVal = left.value || "—";
        const rightVal = right.value || "—";
        const maxChars = Math.floor(cnpjColW / 2.8);
        // Left cell
        doc.setFillColor(...colors.surface);
        doc.roundedRect(margin, y, cnpjColW, 12, 1, 1, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(left.label.toUpperCase(), margin + 4, y + 4.5);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(leftVal.length > maxChars ? leftVal.substring(0, maxChars) + "…" : leftVal, margin + 4, y + 9.5);
        // Right cell
        const rx = margin + cnpjColW + 4;
        doc.setFillColor(...colors.surface);
        doc.roundedRect(rx, y, cnpjColW, 12, 1, 1, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(right.label.toUpperCase(), rx + 4, y + 4.5);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(rightVal.length > maxChars ? rightVal.substring(0, maxChars) + "…" : rightVal, rx + 4, y + 9.5);
        y += 14;
      };

      drawCnpjRow(
        { label: "Nome Fantasia",      value: data.cnpj.nomeFantasia },
        { label: "Situacao Cadastral", value: data.cnpj.situacaoCadastral }
      );
      drawCnpjRow(
        { label: "Data de Abertura",   value: data.cnpj.dataAbertura },
        { label: "Data da Situacao",   value: data.cnpj.dataSituacaoCadastral }
      );
      drawCnpjRow(
        { label: "Natureza Juridica",  value: data.cnpj.naturezaJuridica },
        { label: "Porte",              value: data.cnpj.porte }
      );

      // Endereço — largura total
      {
        checkPageBreak(14);
        const endVal = data.cnpj.endereco || "—";
        const endMaxChars = Math.floor(contentW / 2.2);
        const endDisplay = endVal.length > endMaxChars ? endVal.substring(0, endMaxChars) + "…" : endVal;
        doc.setFillColor(...colors.surface);
        doc.roundedRect(margin, y, contentW, 12, 1, 1, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text("ENDERECO COMPLETO", margin + 4, y + 4.5);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(endDisplay, margin + 4, y + 9.5);
        y += 14;
      }

      drawCnpjRow(
        { label: "Telefone", value: data.cnpj.telefone },
        { label: "E-mail",   value: data.cnpj.email }
      );

      // CNAEs Secundários
      {
        const cnaesRaw = data.cnpj.cnaeSecundarios || "";
        const cnaesStr = Array.isArray(cnaesRaw) ? (cnaesRaw as string[]).join("; ") : String(cnaesRaw);
        if (cnaesStr.trim() !== "") {
          const cnaesLines = doc.splitTextToSize(cnaesStr, contentW - 8);
          const cnaesBoxH = cnaesLines.length * 4 + 14;
          checkPageBreak(cnaesBoxH + 2);
          doc.setFillColor(...colors.surface);
          doc.roundedRect(margin, y, contentW, cnaesBoxH, 1, 1, "F");
          doc.setFontSize(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.textMuted);
          doc.text("CNAES SECUNDARIOS", margin + 4, y + 5);
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.textMuted);
          cnaesLines.forEach((line: string, i: number) => {
            doc.text(line, margin + 4, y + 11 + i * 4);
          });
          y += cnaesBoxH + 2;
        }
      }

      // ===== PAGE 3 — QSA + CONTRATO =====
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
          validQSA.map(s => {
            const part = s.participacao
              ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%")
              : "—";
            return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part];
          }),
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

      // ===== PAGE 3 — FATURAMENTO / SCR =====
      newPage();
      drawHeader();

      // Section header bar
      doc.setFillColor(...colors.navy);
      doc.rect(margin, y, contentW, 10, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(margin, y + 10, contentW, 1.5, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("04", margin + 4, y + 6.5);
      doc.setFontSize(9);
      doc.text("FATURAMENTO / SCR", margin + 14, y + 6.5);
      y += 13;

      // ── Stacked layout ──
      const leftW = contentW;
      const rightW = contentW;
      const leftX = margin;
      const rightX = margin;
      const sectionY = y;
      // Gráfico usa os mesmos 12 meses do FMM
      const chartMeses = mesesFMM;

      // ── LEFT COLUMN: Bar chart ──
      let yLeft = sectionY;

      if (faturamentoRealmenteZerado) {
        doc.setFillColor(254, 242, 242);
        doc.roundedRect(leftX, yLeft, leftW, 8, 1, 1, "F");
        doc.setFillColor(...colors.danger);
        doc.roundedRect(leftX, yLeft, 2.5, 8, 0.5, 0.5, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.danger);
        doc.text("[ALTA] Faturamento zerado no periodo", leftX + 6, yLeft + 5.5);
        yLeft += 10;
      }
      if (!data.faturamento.dadosAtualizados) {
        doc.setFillColor(255, 251, 235);
        doc.roundedRect(leftX, yLeft, leftW, 8, 1, 1, "F");
        doc.setFillColor(...colors.warning);
        doc.roundedRect(leftX, yLeft, 2.5, 8, 0.5, 0.5, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.warning);
        doc.text(`[MOD] Desatualizado — ultimo: ${data.faturamento.ultimoMesComDados || "N/A"}`, leftX + 6, yLeft + 5.5);
        yLeft += 10;
      }

      if (chartMeses.length > 0) {
        const chartVals = chartMeses.map(m => parseMoneyToNumber(m.valor));
        const chartMax = Math.max(...chartVals, 1);
        const fmmChart = parseMoneyToNumber(data.faturamento.fmm12m || "0");
        const barAreaH = 40;
        const barTopPadding = 10; // espaço reservado acima da barra mais alta para o label
        const labelAreaH = mesesFMM.length > 6 ? 12 : 6;
        const n = chartMeses.length;
        const bW = Math.max(2, (leftW / n) - 1.5);
        const chartTopY = yLeft + barTopPadding;
        const mesLabels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

        const parseMesLabel = (mesStr: string): string => {
          const parts = (mesStr || "").split("/");
          const part0 = parts[0] || "";
          const part1 = parts[1] || "";
          const numerico = parseInt(part0);
          if (!isNaN(numerico)) {
            const yr = part1.length === 4 ? part1.slice(2) : part1;
            return (mesLabels[numerico - 1] || part0) + (yr ? "/" + yr : "");
          }
          const capitalizado = part0.charAt(0).toUpperCase() + part0.slice(1).toLowerCase();
          const yr = part1.length === 4 ? part1.slice(2) : part1;
          return capitalizado + (yr ? "/" + yr : "");
        };

        // FMM reference line
        if (fmmChart > 0) {
          const fmmLineY = chartTopY + barAreaH - (fmmChart / chartMax) * barAreaH;
          doc.setDrawColor(150, 150, 150);
          doc.setLineDashPattern([1, 1], 0);
          doc.line(leftX, fmmLineY, leftX + leftW, fmmLineY);
          doc.setLineDashPattern([], 0);
          doc.setFontSize(5);
          doc.setTextColor(130, 130, 130);
          doc.text("FMM", leftX + leftW + 1, fmmLineY + 1);
        }

        // Bars
        chartMeses.forEach((m, i) => {
          const v = chartVals[i];
          const bH = Math.max(1, (v / chartMax) * barAreaH);
          const bX = leftX + i * (bW + 1.5);
          const bY = chartTopY + barAreaH - bH;
          const isMax = v === chartMax && v > 0;
          const isZero = v === 0;
          const barColor: [number, number, number] = isZero ? [217, 119, 6] : isMax ? [20, 40, 100] : colors.navy;
          doc.setFillColor(...barColor);
          doc.roundedRect(bX, bY, bW, bH, 0.5, 0.5, "F");
          // Month label: "Jan/25"
          doc.setFontSize(4.5);
          doc.setTextColor(100, 100, 100);
          const mLabel = parseMesLabel(m.mes);
          const labelX = bX + bW / 2;
          const isEven = i % 2 === 0;
          const labelY = chartTopY + barAreaH + (isEven ? 4 : 8);

          doc.setFontSize(5.5);
          doc.setTextColor(80, 80, 80);
          doc.text(mLabel, labelX, labelY, { align: "center" });
          const vLabel = v >= 1000
            ? (v / 1000).toFixed(0) + "k"
            : v > 0
              ? (v / 1000).toFixed(1) + "k"
              : "0";

          doc.setFontSize(4);
          doc.setTextColor(70, 70, 70);

          if (bH > 6) {
            // valor acima da barra
            doc.text(vLabel, bX + bW / 2, bY - 1, { align: "center" });
          } else if (v > 0) {
            // barra pequena — valor logo acima com fundo branco
            doc.setTextColor(30, 30, 30);
            doc.text(vLabel, bX + bW / 2, chartTopY + barAreaH - bH - 1.5, { align: "center" });
          }
        });

        yLeft = chartTopY + barAreaH + labelAreaH + 1;

        // Summary line below chart
        const fmmK = fmmNum > 0 ? (fmmNum / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
        const fmmMedioNum = data.faturamento?.fmmMedio
          ? parseMoneyToNumber(data.faturamento.fmmMedio)
          : (() => {
              const porAno: Record<string, number[]> = {};
              for (const m of validMeses) {
                const ano = (m.mes || "").split("/")[1];
                if (!ano) continue;
                if (!porAno[ano]) porAno[ano] = [];
                porAno[ano].push(parseMoneyToNumber(m.valor));
              }
              const anosValidos = Object.values(porAno).filter(v => v.length >= 10);
              if (anosValidos.length === 0) return fmmNum;
              return anosValidos.reduce((s, v) => s + v.reduce((a, b) => a + b, 0) / v.length, 0) / anosValidos.length;
            })();
        const fmmMedioK = fmmMedioNum > 0 ? (fmmMedioNum / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
        const totalFat = chartVals.reduce((a, b) => a + b, 0);
        const totalK = (totalFat / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text(`FMM 12M (mil R$): ${fmmK}   |   FMM Médio (mil R$): ${fmmMedioK}   |   Total (mil R$): ${totalK}`, leftX, yLeft);
        yLeft += 6;

        // Tabela faturamento mensal detalhado
        yLeft += 4;
        const tblMesW = 30;
        const tblValW = 60;
        const tblRowH = 5;
        const ultimos12 = new Set(validMeses.slice(-12).map(m => m.mes));

        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.navy);
        doc.text("FATURAMENTO MENSAL DETALHADO", leftX, yLeft);
        yLeft += 5;

        // Cabeçalho
        doc.setFillColor(...colors.navy);
        doc.rect(leftX, yLeft, tblMesW + tblValW, tblRowH, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("MÊS", leftX + 2, yLeft + 3.5);
        doc.text("FATURAMENTO (R$)", leftX + tblMesW + tblValW - 2, yLeft + 3.5, { align: "right" });
        yLeft += tblRowH;

        // Linhas
        validMeses.forEach((mes, idx) => {
          if (yLeft + tblRowH > 275) {
            doc.addPage();
            yLeft = 20;
          }
          const isUltimos12 = ultimos12.has(mes.mes);
          if (isUltimos12) {
            doc.setFillColor(232, 240, 254);
          } else {
            doc.setFillColor(...(idx % 2 === 0 ? colors.surface : [245, 245, 245] as [number, number, number]));
          }
          doc.rect(leftX, yLeft, tblMesW + tblValW, tblRowH, "F");
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.text(parseMesLabel(mes.mes), leftX + 2, yLeft + 3.5);
          doc.text(mes.valor || "—", leftX + tblMesW + tblValW - 2, yLeft + 3.5, { align: "right" });
          doc.setDrawColor(230, 230, 230);
          doc.line(leftX, yLeft + tblRowH, leftX + tblMesW + tblValW, yLeft + tblRowH);
          yLeft += tblRowH;
        });
        yLeft += 4;

        // FMM por ano
        const fmmAnual = data.faturamento?.fmmAnual || {};
        const fmmAnualTexto = Object.entries(fmmAnual)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([ano, valor]) => {
            const qtdMeses = (data.faturamento?.meses || [])
              .filter(m => m.mes?.endsWith(ano)).length;
            return `FMM ${ano}: R$ ${valor} (${qtdMeses} meses)`;
          })
          .join("   |   ");
        if (fmmAnualTexto) {
          doc.setFontSize(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(130, 130, 130);
          doc.text(fmmAnualTexto, leftX, yLeft);
          yLeft += 5;
        }

        // Aviso de meses zerados
        const mesesZeradosPDF = data.faturamento.mesesZerados;
        if (mesesZeradosPDF && mesesZeradosPDF.length > 0) {
          const listaMeses = mesesZeradosPDF.map(mz => mz.mes).join(", ");
          doc.setFontSize(6);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...colors.warning);
          doc.text(`\u26A0 ${mesesZeradosPDF.length} mes(es) com faturamento zero: ${listaMeses}`, leftX, yLeft);
          yLeft += 5;
        }
      } else {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text("Sem dados de faturamento disponiveis", leftX + leftW / 2, yLeft + 20, { align: "center" });
        yLeft += 30;
      }

      // ── SCR (stacked below chart) ──
      let currentSCRPage = doc.getCurrentPageInfo().pageNumber;
      let yRight = yLeft + 6;

      const fmmVal = parseMoneyToNumber(data.faturamento.mediaAno || "0");
      const hasAnterior = !!(data.scrAnterior && data.scrAnterior.periodoReferencia);
      const periodoAnt = hasAnterior ? (data.scrAnterior!.periodoReferencia || "Anterior") : "";
      const periodoAt = data.scr.periodoReferencia || "Atual";

      const scrSemHistorico =
        data.scr?.semHistorico === true ||
        (
          parseMoneyToNumber(data.scr?.totalDividasAtivas || "0") === 0 &&
          parseMoneyToNumber(data.scr?.limiteCredito || "0") === 0 &&
          parseMoneyToNumber(data.scr?.carteiraAVencer || "0") === 0 &&
          (!data.scr?.modalidades || data.scr.modalidades.length === 0)
        );
      if (scrSemHistorico) {
        // ── Header azul ──
        doc.setFillColor(...colors.primary);
        doc.roundedRect(rightX, yRight, rightW, 7, 1, 1, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("\u2713 PERFIL SCR \u2014 SEM OPERAÇÕES BANCÁRIAS", rightX + 3, yRight + 4.8);
        yRight += 9;

        // ── 4 linhas de confirmação ──
        const pctConsulta = data.scr.pctDocumentosProcessados || "99%+";
        const confirmacoes = [
          `\u2713 Consulta realizada: ${pctConsulta} das instituições consultadas`,
          "\u2713 Sem dívida bancária ativa em nenhuma IF",
          "\u2713 Sem coobrigações (não figura como avalista)",
          "\u2713 Sem operações em discordância ou sub judice",
        ];
        doc.setFontSize(6.5);
        confirmacoes.forEach(linha => {
          doc.setFillColor(240, 246, 255);
          doc.rect(rightX, yRight, rightW, 6, "F");
          doc.setFont("helvetica", "normal");
          doc.setTextColor(22, 163, 74);
          doc.text(linha, rightX + 3, yRight + 4.2);
          yRight += 6;
        });

        // ── Separador ──
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.3);
        doc.line(rightX, yRight + 1, rightX + rightW, yRight + 1);
        yRight += 4;

        // ── Interpretação em itálico ──
        const interpretacaoLines = doc.splitTextToSize(
          "Empresa opera sem alavancagem bancária \u2014 indica autofinanciamento ou uso exclusivo de capital próprio. Ausência confirmada pelo Bacen, não presumida.",
          rightW - 4
        );
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6);
        doc.setTextColor(...colors.textMuted);
        interpretacaoLines.forEach((l: string) => { doc.text(l, rightX + 2, yRight); yRight += 4; });

        // ── Confirmação em dois períodos ──
        const antSemHist = data.scrAnterior && data.scrAnterior.semHistorico;
        if (antSemHist) {
          yRight += 2;
          const doisPeriodos = doc.splitTextToSize(
            `Confirmado em dois periodos consecutivos: ${data.scrAnterior!.periodoReferencia} e ${data.scr.periodoReferencia}`,
            rightW - 4
          );
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...colors.primary);
          doisPeriodos.forEach((l: string) => { doc.text(l, rightX + 2, yRight); yRight += 4; });
        }

        yRight += 4;

        // ── Tabela comparativa de métricas ──
        const alturaTabela = 6 + (9 * 5.5) + 10; // header + 9 linhas + padding
        if (alturaTabela > 275 - yRight) {
          doc.addPage();
          yRight = 20;
          currentSCRPage = doc.getCurrentPageInfo().pageNumber;
        }
        yRight += 3;
        doc.setFillColor(...colors.primary);
        doc.roundedRect(rightX, yRight, rightW, 6, 1, 1, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);

        const colMetrica = rightW * 0.40;
        const colAt = rightW * 0.22;
        const colAnt = rightW * 0.22;

        doc.text("MÉTRICA", rightX + 2, yRight + 4);
        doc.text(periodoAt, rightX + colMetrica + 2, yRight + 4);
        if (hasAnterior) {
          doc.text(periodoAnt, rightX + colMetrica + colAt + 2, yRight + 4);
          doc.text("VAR.", rightX + colMetrica + colAt + colAnt + 2, yRight + 4);
        }
        yRight += 6;

        doc.setFontSize(5);
        doc.setTextColor(...colors.textMuted);
        doc.text(
          `[DEBUG] scr.periodo=${data.scr?.periodoReferencia || "?"} | scrAnterior.periodo=${data.scrAnterior?.periodoReferencia || "?"}`,
          rightX + 2,
          yRight + 3
        );
        yRight += 5;

        const fmtSCR = (v: string | undefined) => (v && v !== "0,00" && v !== "") ? `R$ ${v}` : "R$ 0,00";
        const fmtPct = (v: string | undefined) => (v && v !== "") ? `${v}%` : "—";

        const fmmValSCR = data.faturamento?.fmm12m
          ? parseMoneyToNumber(data.faturamento.fmm12m)
          : 0;
        const dividaAt = parseMoneyToNumber(data.scr.totalDividasAtivas || "0");
        const dividaAnt = parseMoneyToNumber(data.scrAnterior?.totalDividasAtivas || "0");
        const alavAt2 = fmmValSCR > 0 ? (dividaAt / fmmValSCR).toFixed(2) + "x" : "0,00x";
        const alavAnt2 = fmmValSCR > 0 ? (dividaAnt / fmmValSCR).toFixed(2) + "x" : "0,00x";

        const linhasComparativo = [
          { label: "Carteira a Vencer",  at: fmtSCR(data.scr.carteiraAVencer),       ant: fmtSCR(data.scrAnterior?.carteiraAVencer),       positiveIsGood: false },
          { label: "Vencidos",           at: fmtSCR(data.scr.vencidos),               ant: fmtSCR(data.scrAnterior?.vencidos),               positiveIsGood: false },
          { label: "Prejuízos",          at: fmtSCR(data.scr.prejuizos),              ant: fmtSCR(data.scrAnterior?.prejuizos),              positiveIsGood: false },
          { label: "Total Dívidas",      at: fmtSCR(data.scr.totalDividasAtivas),     ant: fmtSCR(data.scrAnterior?.totalDividasAtivas),     positiveIsGood: false, bold: true },
          { label: "Limite de Crédito",  at: fmtSCR(data.scr.limiteCredito),          ant: fmtSCR(data.scrAnterior?.limiteCredito),          positiveIsGood: true },
          { label: "Qtde IFs",           at: data.scr.qtdeInstituicoes || "0",        ant: data.scrAnterior?.qtdeInstituicoes || "0",        positiveIsGood: true },
          { label: "Qtde Operações",     at: data.scr.qtdeOperacoes || "0",           ant: data.scrAnterior?.qtdeOperacoes || "0",           positiveIsGood: true },
          { label: "% Docs Processados", at: fmtPct(data.scr.pctDocumentosProcessados), ant: fmtPct(data.scrAnterior?.pctDocumentosProcessados), positiveIsGood: true },
          { label: "Alavancagem vs FMM", at: alavAt2,                                 ant: alavAnt2,                                         positiveIsGood: false, bold: true },
        ];

        linhasComparativo.forEach((linha, idx) => {
          const bgColor: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          doc.setFillColor(...bgColor);
          doc.rect(rightX, yRight, rightW, 5.5, "F");

          doc.setFontSize(5.5);
          doc.setFont("helvetica", linha.bold ? "bold" : "normal");
          doc.setTextColor(...colors.text);
          doc.text(linha.label, rightX + 2, yRight + 3.8);
          doc.text(linha.at, rightX + colMetrica + 2, yRight + 3.8);

          if (hasAnterior) {
            doc.text(linha.ant, rightX + colMetrica + colAt + 2, yRight + 3.8);

            const numAt = parseFloat((linha.at || "0").replace(/[^0-9,]/g, "").replace(",", "."));
            const numAnt = parseFloat((linha.ant || "0").replace(/[^0-9,]/g, "").replace(",", "."));

            if (!isNaN(numAt) && !isNaN(numAnt) && numAnt !== 0) {
              const varPct = ((numAt - numAnt) / numAnt) * 100;
              const varStr = (varPct > 0 ? "+" : "") + varPct.toFixed(1) + "%";
              const igual = Math.abs(varPct) < 0.1;
              const melhorou = linha.positiveIsGood ? varPct > 0 : varPct < 0;
              if (igual) {
                doc.setTextColor(...colors.textMuted);
              } else if (melhorou) {
                doc.setTextColor(22, 163, 74);
              } else {
                doc.setTextColor(220, 38, 38);
              }
              doc.text(varStr, rightX + colMetrica + colAt + colAnt + 2, yRight + 3.8);
              doc.setTextColor(...colors.text);
            } else {
              doc.setTextColor(...colors.textMuted);
              doc.text("—", rightX + colMetrica + colAt + colAnt + 2, yRight + 3.8);
              doc.setTextColor(...colors.text);
            }
          }

          yRight += 5.5;
        });

        yRight += 4;

      } else {
        // Title
        const scrTableTitle = hasAnterior
          ? `COMPARATIVO SCR ${periodoAnt} x ${periodoAt}`
          : `SCR — ${periodoAt}`;
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text(scrTableTitle, rightX, yRight + 4);
        yRight += 7;

        // Column widths
        const cW = hasAnterior
          ? [rightW * 0.33, rightW * 0.22, rightW * 0.22, rightW * 0.23]
          : [rightW * 0.55, rightW * 0.45];

        // Header
        doc.setFillColor(...colors.navy);
        doc.rect(rightX, yRight, rightW, 6, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("METRICA (mil R$)", rightX + 2, yRight + 4);
        if (hasAnterior) {
          doc.text(periodoAnt, rightX + cW[0] + cW[1] - 1, yRight + 4, { align: "right" });
          doc.text(periodoAt, rightX + cW[0] + cW[1] + cW[2] - 1, yRight + 4, { align: "right" });
          doc.text("VAR.", rightX + rightW - 1, yRight + 4, { align: "right" });
        } else {
          doc.text(periodoAt, rightX + rightW - 1, yRight + 4, { align: "right" });
        }
        yRight += 7;

        const toK = (v: string | undefined) => {
          const n = parseMoneyToNumber(v || "0");
          return n > 0 ? (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
        };

        const alavAt = fmmVal > 0
          ? (parseMoneyToNumber(data.scr.totalDividasAtivas || "0") / fmmVal).toFixed(2) + "x"
          : "—";
        const alavAnt = hasAnterior && fmmVal > 0
          ? (parseMoneyToNumber(data.scrAnterior!.totalDividasAtivas || "0") / fmmVal).toFixed(2) + "x"
          : "—";

        type ScrRow = { label: string; antVal: string; atVal: string; antRaw: number; atRaw: number; positiveIsGood: boolean; bold?: boolean; skipVar?: boolean };
        const scrRows: ScrRow[] = [
          { label: "Em Dia",       antVal: toK(data.scrAnterior?.emDia),              atVal: toK(data.scr.emDia),              antRaw: parseMoneyToNumber(data.scrAnterior?.emDia || "0"),              atRaw: parseMoneyToNumber(data.scr.emDia || "0"),              positiveIsGood: true },
          { label: "CP",           antVal: toK(data.scrAnterior?.carteiraCurtoPrazo), atVal: toK(data.scr.carteiraCurtoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraCurtoPrazo || "0"), atRaw: parseMoneyToNumber(data.scr.carteiraCurtoPrazo || "0"), positiveIsGood: false },
          { label: "LP",           antVal: toK(data.scrAnterior?.carteiraLongoPrazo), atVal: toK(data.scr.carteiraLongoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraLongoPrazo || "0"), atRaw: parseMoneyToNumber(data.scr.carteiraLongoPrazo || "0"), positiveIsGood: false },
          { label: "Total Divida", antVal: toK(data.scrAnterior?.totalDividasAtivas), atVal: toK(data.scr.totalDividasAtivas), antRaw: parseMoneyToNumber(data.scrAnterior?.totalDividasAtivas || "0"), atRaw: parseMoneyToNumber(data.scr.totalDividasAtivas || "0"), positiveIsGood: false, bold: true },
          { label: "Vencida",      antVal: toK(data.scrAnterior?.vencidos),           atVal: toK(data.scr.vencidos),           antRaw: parseMoneyToNumber(data.scrAnterior?.vencidos || "0"),           atRaw: parseMoneyToNumber(data.scr.vencidos || "0"),           positiveIsGood: false },
          { label: "Prejuizo",     antVal: toK(data.scrAnterior?.prejuizos),          atVal: toK(data.scr.prejuizos),          antRaw: parseMoneyToNumber(data.scrAnterior?.prejuizos || "0"),          atRaw: parseMoneyToNumber(data.scr.prejuizos || "0"),          positiveIsGood: false },
          { label: "Limite",       antVal: toK(data.scrAnterior?.limiteCredito),      atVal: toK(data.scr.limiteCredito),      antRaw: parseMoneyToNumber(data.scrAnterior?.limiteCredito || "0"),      atRaw: parseMoneyToNumber(data.scr.limiteCredito || "0"),      positiveIsGood: true },
          { label: "IFs",          antVal: data.scrAnterior?.numeroIfs || "—",        atVal: data.scr.numeroIfs || "—",        antRaw: parseFloat(data.scrAnterior?.numeroIfs || "0") || 0,             atRaw: parseFloat(data.scr.numeroIfs || "0") || 0,             positiveIsGood: true },
          { label: "Alavancagem",  antVal: alavAnt,                                   atVal: alavAt,                           antRaw: 0,                                                                 atRaw: 0,                                                       positiveIsGood: false, skipVar: true },
        ];

        const scrRowH = 6;
        scrRows.forEach((row, idx) => {
          doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
          doc.rect(rightX, yRight, rightW, scrRowH, "F");

          doc.setFont("helvetica", row.bold ? "bold" : "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...(row.bold ? colors.text : colors.textSec));
          doc.text(row.label, rightX + 2, yRight + 4);

          if (hasAnterior) {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...colors.textSec);
            doc.text(row.antVal, rightX + cW[0] + cW[1] - 1, yRight + 4, { align: "right" });
            doc.setFont("helvetica", row.bold ? "bold" : "normal");
            doc.setTextColor(...colors.text);
            doc.text(row.atVal, rightX + cW[0] + cW[1] + cW[2] - 1, yRight + 4, { align: "right" });

            let varStr = "—";
            let varColor: [number, number, number] = [150, 150, 150];
            if (!row.skipVar) {
              const diff = row.atRaw - row.antRaw;
              if (diff === 0 && row.atRaw > 0) {
                varStr = "0";
              } else if (diff !== 0 && row.antRaw > 0) {
                const pct = (diff / row.antRaw) * 100;
                varStr = (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
                const isGood = (diff > 0 && row.positiveIsGood) || (diff < 0 && !row.positiveIsGood);
                varColor = isGood ? [22, 163, 74] : [220, 38, 38];
              } else if (diff !== 0) {
                varStr = diff > 0 ? "+" : "-";
                const isGood = (diff > 0 && row.positiveIsGood) || (diff < 0 && !row.positiveIsGood);
                varColor = isGood ? [22, 163, 74] : [220, 38, 38];
              }
            }
            doc.setFont("helvetica", row.bold ? "bold" : "normal");
            doc.setTextColor(...varColor);
            doc.text(varStr, rightX + rightW - 1, yRight + 4, { align: "right" });
          } else {
            doc.setFont("helvetica", row.bold ? "bold" : "normal");
            doc.setTextColor(...colors.text);
            doc.text(row.atVal, rightX + rightW - 1, yRight + 4, { align: "right" });
          }

          doc.setDrawColor(230, 230, 230);
          doc.line(rightX, yRight + scrRowH, rightX + rightW, yRight + scrRowH);
          yRight += scrRowH;
        });
        yRight += 4;
      }

      // Advance y past SCR
      if (doc.getCurrentPageInfo().pageNumber < currentSCRPage) {
        doc.setPage(currentSCRPage);
      }
      y = yRight + 6;

      // Modalidades and Instituicoes — overflow naturally via checkPageBreak
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
          ["INSTITUIÇÃO", "VALOR (R$)"],
          data.scr.instituicoes.map(i => [i.nome, i.valor]),
          instColW,
        );
      }

      if (data.scr.historicoInadimplencia) drawMultilineField("Historico de Inadimplencia", data.scr.historicoInadimplencia, 5);

      // ===== PAGE 5 — PROTESTOS =====
      newPage();
      drawHeader();
      drawSectionTitle("05", "PROTESTOS", colors.danger);

      // ── BLOCO 1 — Totais ──
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

      if (protestoDetalhes.length === 0) {
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
      } else {
        // Helper: parse date string DD/MM/AAAA → Date
        const parseDate = (d: string): Date | null => {
          if (!d) return null;
          const parts = d.split("/");
          if (parts.length !== 3) return null;
          const [dd, mm, aaaa] = parts.map(Number);
          if (!dd || !mm || !aaaa) return null;
          return new Date(aaaa, mm - 1, dd);
        };
        // Helper: parse money string → number
        const parseProt = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
        // Helper: format number as R$ X.XXX
        const fmtProt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const now = new Date();
        const ms30  = 30  * 24 * 60 * 60 * 1000;
        const ms90  = 90  * 24 * 60 * 60 * 1000;
        const ms365 = 365 * 24 * 60 * 60 * 1000;

        // ── BLOCO 2 — Distribuição Temporal ──
        drawSpacer(6);
        checkPageBreak(16);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("DISTRIBUICAO TEMPORAL", margin, y + 4);
        y += 7;

        type TempBucket = { label: string; qtd: number; valor: number };
        const tempBuckets: TempBucket[] = [
          { label: "Ultimo mes (30 dias)",    qtd: 0, valor: 0 },
          { label: "Ultimos 3 meses",         qtd: 0, valor: 0 },
          { label: "Ultimos 12 meses",        qtd: 0, valor: 0 },
          { label: "Mais de 12 meses",        qtd: 0, valor: 0 },
        ];
        protestoDetalhes.forEach(p => {
          const dt = parseDate(p.data || "");
          const val = parseProt(p.valor || "0");
          if (!dt) return;
          const age = now.getTime() - dt.getTime();
          if (age <= ms30)  { tempBuckets[0].qtd++; tempBuckets[0].valor += val; }
          if (age <= ms90)  { tempBuckets[1].qtd++; tempBuckets[1].valor += val; }
          if (age <= ms365) { tempBuckets[2].qtd++; tempBuckets[2].valor += val; }
          else              { tempBuckets[3].qtd++; tempBuckets[3].valor += val; }
        });

        const tempColW = [contentW * 0.52, contentW * 0.16, contentW * 0.32];
        checkPageBreak(8 + tempBuckets.length * 7 + 4);
        // header
        doc.setFillColor(...colors.navy);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("PERIODO", margin + 2, y + 4);
        doc.text("QTD", margin + tempColW[0] + tempColW[1] - 2, y + 4, { align: "right" });
        doc.text("VALOR (R$)", margin + contentW - 2, y + 4, { align: "right" });
        y += 6;
        tempBuckets.forEach((b, idx) => {
          doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
          doc.rect(margin, y, contentW, 6, "F");
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.text(b.label, margin + 2, y + 4);
          doc.text(String(b.qtd), margin + tempColW[0] + tempColW[1] - 2, y + 4, { align: "right" });
          doc.setFont("helvetica", b.qtd > 0 ? "bold" : "normal");
          doc.setTextColor(...(b.qtd > 0 ? colors.danger : colors.textMuted));
          doc.text(b.qtd > 0 ? fmtProt(b.valor) : "—", margin + contentW - 2, y + 4, { align: "right" });
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 6, margin + contentW, y + 6);
          y += 6;
        });
        y += 4;

        // ── BLOCO 3 — Distribuição por Faixa de Valor ──
        drawSpacer(4);
        checkPageBreak(16);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("DISTRIBUICAO POR FAIXA DE VALOR", margin, y + 4);
        y += 7;

        type ValBucket = { label: string; min: number; max: number; qtd: number; valor: number };
        const valBuckets: ValBucket[] = [
          { label: "Abaixo de R$ 1.000",       min: 0,      max: 1000,   qtd: 0, valor: 0 },
          { label: "R$ 1.000 a R$ 10.000",     min: 1000,   max: 10000,  qtd: 0, valor: 0 },
          { label: "R$ 10.000 a R$ 50.000",    min: 10000,  max: 50000,  qtd: 0, valor: 0 },
          { label: "R$ 50.000 a R$ 100.000",   min: 50000,  max: 100000, qtd: 0, valor: 0 },
          { label: "Acima de R$ 100.000",      min: 100000, max: Infinity, qtd: 0, valor: 0 },
        ];
        protestoDetalhes.forEach(p => {
          const val = parseProt(p.valor || "0");
          const bucket = valBuckets.find(b => val >= b.min && val < b.max);
          if (bucket) { bucket.qtd++; bucket.valor += val; }
        });

        const valColW = [contentW * 0.52, contentW * 0.16, contentW * 0.32];
        checkPageBreak(8 + valBuckets.length * 7 + 4);
        doc.setFillColor(...colors.navy);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("FAIXA", margin + 2, y + 4);
        doc.text("QTD", margin + valColW[0] + valColW[1] - 2, y + 4, { align: "right" });
        doc.text("VALOR (R$)", margin + contentW - 2, y + 4, { align: "right" });
        y += 6;
        valBuckets.forEach((b, idx) => {
          doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
          doc.rect(margin, y, contentW, 6, "F");
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.text(b.label, margin + 2, y + 4);
          doc.text(String(b.qtd), margin + valColW[0] + valColW[1] - 2, y + 4, { align: "right" });
          doc.setFont("helvetica", b.qtd > 0 ? "bold" : "normal");
          doc.setTextColor(...(b.qtd > 0 ? colors.text : colors.textMuted));
          doc.text(b.qtd > 0 ? fmtProt(b.valor) : "—", margin + contentW - 2, y + 4, { align: "right" });
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 6, margin + contentW, y + 6);
          y += 6;
        });
        y += 4;

        // Helper: draw protestos detail table (shared by Blocos 4 e 5)
        const drawProtTable = (rows: typeof protestoDetalhes) => {
          const pColW = [contentW * 0.16, contentW * 0.42, contentW * 0.26, contentW * 0.16];
          checkPageBreak(8 + Math.min(rows.length, 3) * 7 + 4);
          doc.setFillColor(...colors.navy);
          doc.rect(margin, y, contentW, 6, "F");
          doc.setFontSize(6);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text("DATA", margin + 2, y + 4);
          doc.text("CREDOR", margin + pColW[0] + 2, y + 4);
          doc.text("VALOR (R$)", margin + pColW[0] + pColW[1] + pColW[2] - 2, y + 4, { align: "right" });
          doc.text("REG.", margin + contentW - 2, y + 4, { align: "right" });
          y += 6;
          rows.forEach((p, idx) => {
            checkPageBreak(7);
            doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
            doc.rect(margin, y, contentW, 6, "F");
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...colors.text);
            doc.text(p.data || "—", margin + 2, y + 4);
            const credorMax = Math.floor(pColW[1] / 2.2);
            const credorStr = (p.credor || "—").length > credorMax ? (p.credor || "").substring(0, credorMax) + "…" : (p.credor || "—");
            doc.text(credorStr, margin + pColW[0] + 2, y + 4);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...(p.regularizado ? colors.textMuted : colors.danger));
            doc.text(p.valor || "—", margin + pColW[0] + pColW[1] + pColW[2] - 2, y + 4, { align: "right" });
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...(p.regularizado ? [22, 163, 74] as [number, number, number] : colors.danger));
            doc.text(p.regularizado ? "Sim" : "Nao", margin + contentW - 2, y + 4, { align: "right" });
            doc.setDrawColor(230, 230, 230);
            doc.line(margin, y + 6, margin + contentW, y + 6);
            y += 6;
          });
          y += 4;
        };

        // ── BLOCO 4 — Top 10 por Valor ──
        drawSpacer(4);
        checkPageBreak(16);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("TOP 10 POR VALOR", margin, y + 4);
        y += 7;
        const top10Valor = [...protestoDetalhes]
          .sort((a, b) => parseProt(b.valor || "0") - parseProt(a.valor || "0"))
          .slice(0, 10);
        drawProtTable(top10Valor);

        // ── BLOCO 5 — Top 10 Mais Recentes ──
        drawSpacer(4);
        checkPageBreak(16);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("TOP 10 MAIS RECENTES", margin, y + 4);
        y += 7;
        const top10Recentes = [...protestoDetalhes]
          .sort((a, b) => {
            const da = parseDate(a.data || "");
            const db = parseDate(b.data || "");
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return db.getTime() - da.getTime();
          })
          .slice(0, 10);
        drawProtTable(top10Recentes);
      }

      // ===== PAGE 6 — PROCESSOS =====
      newPage();
      drawHeader();
      drawSectionTitle("06", "PROCESSOS JUDICIAIS", colors.warning);

      // ── BLOCO 1 — Totais ──
      drawFieldRow([
        { label: "Passivos (Total)", value: data.processos?.passivosTotal || "0" },
        { label: "Ativos (Total)", value: data.processos?.ativosTotal || "0" },
        { label: "Valor Estimado (R$)", value: data.processos?.valorTotalEstimado || "0,00" },
        { label: "Rec. Judicial", value: data.processos?.temRJ ? "SIM" : "Nao" },
      ]);

      if (data.processos?.temRJ) {
        drawAlertBox("RECUPERACAO JUDICIAL identificada", "ALTA");
      }

      const proc = data.processos;
      const distribuicao = proc?.distribuicao || [];
      const bancarios   = proc?.bancarios   || [];
      const fiscais     = proc?.fiscais     || [];
      const fornecedores = proc?.fornecedores || [];
      const outrosProc  = proc?.outros      || [];

      const semDados = !proc
        || (parseInt(proc.passivosTotal || "0") === 0
          && parseInt(proc.ativosTotal || "0") === 0
          && distribuicao.length === 0
          && bancarios.length === 0
          && fiscais.length === 0
          && fornecedores.length === 0
          && outrosProc.length === 0);

      if (semDados) {
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
      } else {
        // Helper: truncate text to max chars
        const trunc = (s: string, max: number) => s.length > max ? s.substring(0, max) + "…" : s;

        // Helper: draw a proc section header label
        const drawProcLabel = (title: string) => {
          drawSpacer(4);
          checkPageBreak(14);
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...colors.textMuted);
          doc.text(title.toUpperCase(), margin, y + 4);
          y += 7;
        };

        // Helper: draw a navy-header table row by row with per-cell color control
        const drawProcTableHeader = (headers: string[], colWidths: number[]) => {
          checkPageBreak(8 + 8);
          doc.setFillColor(...colors.navy);
          doc.rect(margin, y, contentW, 6, "F");
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          let hx = margin;
          headers.forEach((h, i) => {
            doc.text(h, hx + 2, y + 4);
            hx += colWidths[i];
          });
          y += 6;
        };

        const drawProcRow = (cells: Array<{ text: string; color?: [number, number, number]; bold?: boolean; align?: "left" | "right" }>, colWidths: number[], idx: number) => {
          checkPageBreak(7);
          doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
          doc.rect(margin, y, contentW, 6, "F");
          let rx = margin;
          cells.forEach((cell, ci) => {
            doc.setFontSize(6.5);
            doc.setFont("helvetica", cell.bold ? "bold" : "normal");
            doc.setTextColor(...(cell.color || colors.text));
            if (cell.align === "right") {
              doc.text(cell.text, rx + colWidths[ci] - 2, y + 4, { align: "right" });
            } else {
              doc.text(cell.text, rx + 2, y + 4);
            }
            rx += colWidths[ci];
          });
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 6, margin + contentW, y + 6);
          y += 6;
        };

        // Status color helper
        const statusColor = (s: string): [number, number, number] =>
          /arquivado/i.test(s) ? [22, 163, 74] : colors.warning;

        // ── BLOCO 2 — Distribuição por Tipo ──
        if (distribuicao.length > 0) {
          drawProcLabel("DISTRIBUICAO POR TIPO");
          const distCW = [contentW * 0.55, contentW * 0.20, contentW * 0.25];
          drawProcTableHeader(["TIPO", "QTD", "%"], distCW);
          const totalQtd = distribuicao.reduce((s, d) => s + (parseInt(d.qtd || "0") || 0), 0);
          distribuicao.forEach((d, idx) => {
            const qtdN = parseInt(d.qtd || "0") || 0;
            const isHigh = qtdN > 10;
            drawProcRow([
              { text: d.tipo || "—", color: isHigh ? colors.danger : colors.text, bold: isHigh },
              { text: String(qtdN), color: isHigh ? colors.danger : colors.text, bold: isHigh },
              { text: d.pct ? `${d.pct}%` : "—" },
            ], distCW, idx);
          });
          // Total row
          checkPageBreak(7);
          doc.setFillColor(...colors.surface2);
          doc.rect(margin, y, contentW, 6, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(...colors.text);
          doc.text("TOTAL", margin + 2, y + 4);
          doc.text(String(totalQtd), margin + distCW[0] + 2, y + 4);
          doc.text("100%", margin + distCW[0] + distCW[1] + 2, y + 4);
          y += 6;
          y += 4;
        }

        // ── BLOCO 3 — Processos Bancários ──
        if (bancarios.length > 0) {
          drawProcLabel(`PROCESSOS BANCARIOS (${bancarios.length})`);
          const bancCW = [contentW * 0.22, contentW * 0.28, contentW * 0.18, contentW * 0.18, contentW * 0.14];
          drawProcTableHeader(["BANCO", "ASSUNTO", "VALOR", "STATUS", "DATA"], bancCW);
          bancarios.forEach((b, idx) => {
            drawProcRow([
              { text: trunc(b.banco || "—", 18) },
              { text: trunc(b.assunto || "—", 22) },
              { text: b.valor || "—" },
              { text: trunc(b.status || "—", 14), color: statusColor(b.status || "") },
              { text: b.data || "—" },
            ], bancCW, idx);
          });
          y += 4;
        }

        // ── BLOCO 4 — Processos Fiscais ──
        if (fiscais.length > 0) {
          const fiscalQtdDist = distribuicao.find(d => /fiscal/i.test(d.tipo || ""))?.qtd || String(fiscais.length);
          const fiscaisShow = fiscais.slice(0, 3);
          drawProcLabel(`TOP ${fiscaisShow.length} FISCAIS (de ${fiscalQtdDist} total)`);
          const fiscCW = [contentW * 0.38, contentW * 0.22, contentW * 0.20, contentW * 0.20];
          drawProcTableHeader(["CONTRAPARTE", "VALOR", "STATUS", "DATA"], fiscCW);
          fiscaisShow.forEach((f, idx) => {
            drawProcRow([
              { text: trunc(f.contraparte || "—", 28) },
              { text: f.valor || "—" },
              { text: trunc(f.status || "—", 14), color: statusColor(f.status || "") },
              { text: f.data || "—" },
            ], fiscCW, idx);
          });
          y += 4;
        }

        // ── BLOCO 5 — Processos Fornecedores ──
        if (fornecedores.length > 0) {
          drawProcLabel(`PROCESSOS FORNECEDORES (${fornecedores.length})`);
          const fornCW = [contentW * 0.28, contentW * 0.24, contentW * 0.16, contentW * 0.18, contentW * 0.14];
          drawProcTableHeader(["CONTRAPARTE", "ASSUNTO", "VALOR", "STATUS", "DATA"], fornCW);
          fornecedores.forEach((f, idx) => {
            drawProcRow([
              { text: trunc(f.contraparte || "—", 22) },
              { text: trunc(f.assunto || "—", 18) },
              { text: f.valor || "—" },
              { text: trunc(f.status || "—", 14), color: statusColor(f.status || "") },
              { text: f.data || "—" },
            ], fornCW, idx);
          });
          y += 4;
        }

        // ── BLOCO 6 — Top 5 Outros ──
        if (outrosProc.length > 0) {
          drawProcLabel("TOP 5 OUTROS");
          const outrCW = [contentW * 0.28, contentW * 0.24, contentW * 0.16, contentW * 0.18, contentW * 0.14];
          drawProcTableHeader(["CONTRAPARTE", "ASSUNTO", "VALOR", "STATUS", "DATA"], outrCW);
          outrosProc.slice(0, 5).forEach((o, idx) => {
            drawProcRow([
              { text: trunc(o.contraparte || "—", 22) },
              { text: trunc(o.assunto || "—", 18) },
              { text: o.valor || "—" },
              { text: trunc(o.status || "—", 14), color: statusColor(o.status || "") },
              { text: o.data || "—" },
            ], outrCW, idx);
          });
          y += 4;
        }
      }

      // ===== PAGE 7 — GRUPO ECONOMICO =====
      newPage();
      drawHeader();
      drawSectionTitle("07", "GRUPO ECONOMICO", colors.primary);

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

      // Section header bar
      doc.setFillColor(...colors.navy);
      doc.rect(margin, y, contentW, 10, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(margin, y + 10, contentW, 1.5, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("08", margin + 4, y + 6.5);
      doc.setFontSize(9);
      doc.text("PARECER PRELIMINAR", margin + 14, y + 6.5);
      y += 13;

      // ── BLOCO 1 — Decisão + Rating + Resumo ──
      checkPageBreak(20);
      const decisionColors: Record<string, { bg: [number,number,number]; text: [number,number,number] }> = {
        APROVADO:              { bg: [240, 253, 244], text: [22, 163, 74] },
        APROVACAO_CONDICIONAL: { bg: [254, 249, 195], text: [161, 98, 7] },
        PENDENTE:              { bg: [255, 247, 237], text: [194, 65, 12] },
        REPROVADO:             { bg: [254, 242, 242], text: [220, 38, 38] },
      };
      const dc = decisionColors[decision] ?? decisionColors.PENDENTE;

      // Decision badge
      doc.setFillColor(...dc.bg);
      doc.roundedRect(margin, y, 70, 10, 2, 2, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...dc.text);
      doc.text(decision.replace("_", " "), margin + 35, y + 6.5, { align: "center" });

      // Rating badge
      const ratingColor: [number,number,number] = finalRating >= 7 ? colors.green : finalRating >= 4 ? colors.amber : colors.red;
      doc.setFillColor(...colors.surface2);
      doc.roundedRect(margin + 74, y, 28, 10, 2, 2, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ratingColor);
      doc.text(finalRating + "/10", margin + 88, y + 6.5, { align: "center" });
      y += 14;

      if (resumoExecutivo) {
        checkPageBreak(12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...colors.text);
        const rLines = doc.splitTextToSize(resumoExecutivo, contentW);
        rLines.slice(0, 12).forEach((line: string) => { checkPageBreak(5); doc.text(line, margin, y); y += 4.5; });
        y += 4;
      }

      // ── BLOCO 2 — Pontos Fortes | Pontos Fracos (duas colunas) ──
      if (pontosFortes.length > 0 || pontosFracos.length > 0) {
        checkPageBreak(16);
        const halfW = (contentW - 4) / 2;
        const leftXp = margin;
        const rightXp = margin + halfW + 4;

        // Column headers
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(leftXp, y, halfW, 7, 1, 1, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.green);
        doc.text("PONTOS FORTES", leftXp + halfW / 2, y + 4.8, { align: "center" });

        doc.setFillColor(254, 242, 242);
        doc.roundedRect(rightXp, y, halfW, 7, 1, 1, "F");
        doc.setTextColor(...colors.danger);
        doc.text("PONTOS FRACOS", rightXp + halfW / 2, y + 4.8, { align: "center" });
        y += 9;

        // Render both columns, tracking y independently
        const colStartY = y;
        let yLeft_p = colStartY;
        let yRight_p = colStartY;

        pontosFortes.forEach((pf: string) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...colors.text);
          const lines = doc.splitTextToSize("• " + pf, halfW - 4);
          lines.forEach((line: string) => { doc.text(line, leftXp + 2, yLeft_p); yLeft_p += 4; });
          yLeft_p += 2;
        });

        pontosFracos.forEach((pf: string) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...colors.text);
          const lines = doc.splitTextToSize("• " + pf, halfW - 4);
          lines.forEach((line: string) => { doc.text(line, rightXp + 2, yRight_p); yRight_p += 4; });
          yRight_p += 2;
        });

        y = Math.max(yLeft_p, yRight_p) + 4;
      }

      // ── BLOCO 3 — Tabela de Alertas ──
      const aiAlertas = aiAnalysis?.alertas ?? [];
      if (aiAlertas.length > 0) {
        checkPageBreak(16);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("ALERTAS", margin, y + 4);
        y += 7;

        const alertCW = [contentW * 0.15, contentW * 0.30, contentW * 0.25, contentW * 0.30];

        // Header
        doc.setFillColor(...colors.navy);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("TIPO", margin + 2, y + 4);
        doc.text("DESCRICAO", margin + alertCW[0] + 2, y + 4);
        doc.text("IMPACTO", margin + alertCW[0] + alertCW[1] + 2, y + 4);
        doc.text("MITIGACAO", margin + alertCW[0] + alertCW[1] + alertCW[2] + 2, y + 4);
        y += 6;

        const lineH = 4;
        const cellPad = 3;

        aiAlertas.forEach((a, idx) => {
          const sevStr = (a.severidade || "INFO").toUpperCase();
          const descLines = doc.splitTextToSize(a.descricao || "—", alertCW[1] - 4);
          const impLines  = doc.splitTextToSize(a.impacto   || "—", alertCW[2] - 4);
          const mitLines  = doc.splitTextToSize(a.mitigacao || "—", alertCW[3] - 4);
          const maxLines  = Math.max(1, descLines.length, impLines.length, mitLines.length);
          const rowH = maxLines * lineH + cellPad * 2;

          checkPageBreak(rowH + 2);
          doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
          doc.rect(margin, y, contentW, rowH, "F");

          // Severity
          const sevColor: [number,number,number] = sevStr === "ALTA" ? colors.danger : sevStr === "MODERADA" ? colors.warning : [37, 99, 235];
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6);
          doc.setTextColor(...sevColor);
          doc.text(sevStr, margin + 2, y + cellPad + lineH);

          // Text cells
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...colors.text);
          descLines.forEach((l: string, li: number) => doc.text(l, margin + alertCW[0] + 2, y + cellPad + (li + 1) * lineH));
          impLines.forEach((l: string, li: number) => doc.text(l, margin + alertCW[0] + alertCW[1] + 2, y + cellPad + (li + 1) * lineH));
          doc.setTextColor(...colors.primary);
          mitLines.forEach((l: string, li: number) => doc.text(l, margin + alertCW[0] + alertCW[1] + alertCW[2] + 2, y + cellPad + (li + 1) * lineH));

          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + rowH, margin + contentW, y + rowH);
          y += rowH;
        });
        y += 4;
      }

      // ── BLOCO 4 — Perguntas para Visita ──
      if (perguntasVisita.length > 0) {
        checkPageBreak(14);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("PERGUNTAS PARA A VISITA", margin, y + 4);
        y += 7;

        perguntasVisita.forEach((q, i) => {
          checkPageBreak(14);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...colors.text);
          const qLines = doc.splitTextToSize(`${i + 1}. ${q.pergunta}`, contentW - 4);
          qLines.forEach((line: string) => { doc.text(line, margin + 2, y); y += 4; });
          if (q.contexto) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7.5);
            doc.setTextColor(...colors.textMuted);
            const cLines = doc.splitTextToSize("Contexto: " + q.contexto, contentW - 8);
            cLines.forEach((line: string) => { doc.text(line, margin + 4, y); y += 3.5; });
          }
          y += 3;
        });
        y += 2;
      }

      // ── BLOCO 5 — Parâmetros Operacionais ──
      const paramOp = aiAnalysis?.parametrosOperacionais;
      const hasParamOp = paramOp && Object.values(paramOp).some(v => v && v.trim() !== "");
      if (hasParamOp) {
        checkPageBreak(16);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("PARAMETROS OPERACIONAIS ORIENTATIVOS", margin, y + 4);
        y += 7;

        const paramCW = [contentW * 0.30, contentW * 0.35, contentW * 0.35];

        // Header
        doc.setFillColor(...colors.navy);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("PARAMETRO", margin + 2, y + 4);
        doc.text("VALOR SUGERIDO", margin + paramCW[0] + 2, y + 4);
        doc.text("BASE DE CALCULO", margin + paramCW[0] + paramCW[1] + 2, y + 4);
        y += 6;

        const paramRows: Array<{ label: string; key: string; base: string }> = [
          { label: "Limite aproximado",    key: "limiteAproximado",   base: "FMM × fatores de score e risco" },
          { label: "Prazo maximo",         key: "prazoMaximo",        base: "Baseado no rating" },
          { label: "Concentracao/sacado",  key: "concentracaoSacado", base: "Perfil de risco" },
          { label: "Garantias",            key: "garantias",          base: "Estrutura societaria" },
          { label: "Revisao",              key: "revisao",            base: "Alertas ativos" },
        ];

        paramRows.forEach((row, idx) => {
          const val = (paramOp as Record<string, string>)[row.key] || "—";
          checkPageBreak(7);
          doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
          doc.rect(margin, y, contentW, 6, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(...colors.text);
          doc.text(row.label, margin + 2, y + 4);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.primary);
          doc.text(val, margin + paramCW[0] + 2, y + 4);
          doc.setTextColor(...colors.textMuted);
          doc.text(row.base, margin + paramCW[0] + paramCW[1] + 2, y + 4);
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 6, margin + contentW, y + 6);
          y += 6;
        });

        // Footnote
        y += 3;
        checkPageBreak(8);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6);
        doc.setTextColor(...colors.textMuted);
        doc.text("Parametros indicativos. Limite e condicoes formais definidos pelo Comite.", margin, y);
        y += 6;
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

      const pdfBlob = doc.output("blob");
      return new Blob([pdfBlob], { type: "application/pdf" });
}
