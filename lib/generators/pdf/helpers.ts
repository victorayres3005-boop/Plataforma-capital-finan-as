import type { PdfCtx, AutoCell, AlertSeverity, RGB } from "./context";

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function parseMoneyToNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
}

export function fmtBR(n: number, decimals = 0): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtMoney(val: string | undefined | null): string {
  if (!val || val === "N/D" || val === "—") return val || "—";
  // Fix Bug 1: remove duplo "R$" antes de processar
  const cleaned = val.replace(/^R\$\s*R\$/, "R$").trim();
  const n = parseMoneyToNumber(cleaned);
  if (n === 0 && !cleaned.match(/^[0,\.]+$/)) return cleaned;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sanitiza valor percentual — remove duplo "%%" e garante formato limpo */
export function fmtPct(val: string | undefined | null): string {
  if (!val) return "—";
  return val.replace(/%%/g, "%").trim();
}

export function fmtVar(pct: number): string {
  const arrow = pct > 0 ? "↑ +" : pct < 0 ? "↓ " : "→ ";
  return arrow + fmtBR(Math.abs(pct), 1) + "%";
}

export function normalizeTendencia(val: string | undefined | null): string {
  if (!val) return "—";
  const lower = val.toLowerCase();
  if (lower.includes("crescimento") || lower.includes("alta") || lower.includes("positiv"))
    return "↑ Crescimento";
  if (lower.includes("queda") || lower.includes("baixa") || lower.includes("negativ") || lower.includes("declín"))
    return "↓ Queda";
  if (lower.includes("estavel") || lower.includes("estável") || lower.includes("neutro") || lower.includes("estáv"))
    return "→ Estável";
  return "—";
}

// ─── Core page helpers ────────────────────────────────────────────────────────

export function newPage(ctx: PdfCtx): void {
  const { doc, DS, pos, pageCount } = ctx;
  if (pageCount.n > 0) doc.addPage();
  pageCount.n++;
  doc.setFillColor(...DS.colors.pageBg);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...DS.colors.navy);
  doc.rect(0, 0, 210, 1.5, "F");
  pos.y = 1.5;
}

export function drawHeader(ctx: PdfCtx): void {
  const { doc, DS, pos, W, margin, data, pageCount } = ctx;
  const colors = DS.colors;

  doc.setFillColor(...colors.navy);
  doc.rect(0, 1.5, 210, 32, "F");
  doc.setFillColor(...colors.accentRGB);
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
  doc.setTextColor(...colors.accentRGB);
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

  if (data.cnpj?.razaoSocial) {
    doc.setFontSize(7);
    doc.setTextColor(180, 200, 240);
    doc.text(data.cnpj.razaoSocial.substring(0, 45), W - margin, 26, { align: "right" });
  }

  // Page number top-right
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 200, 240);
  doc.text(`Pág. ${pageCount.n}`, W - margin, 33, { align: "right" });

  pos.y = 42;
}

export function drawFooter(ctx: PdfCtx): void {
  const { doc, DS, W, margin, data, footerDateStr } = ctx;

  doc.setFillColor(22, 38, 68);
  doc.rect(0, 284, 210, 13, "F");
  doc.setFillColor(...DS.colors.accentRGB);
  doc.rect(0, 284, 210, 1.2, "F");

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DS.colors.accentRGB);
  doc.text("capital", margin, 291);
  const capFW = doc.getTextWidth("capital");
  doc.setTextColor(168, 200, 240);
  doc.text("financas", margin + capFW + 0.8, 291);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 140, 190);
  doc.text("CONSOLIDADOR DE DOCUMENTOS  |  " + footerDateStr + "  |  CONFIDENCIAL", margin, 294.5);

  if (data.cnpj?.razaoSocial) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(130, 160, 205);
    doc.text(data.cnpj.razaoSocial.substring(0, 40), W / 2, 292, { align: "center" });
  }
}

export function drawFooterAllPages(ctx: PdfCtx): void {
  const { doc, pageCount, W, margin } = ctx;
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    if (pg === 1) continue; // capa has its own footer
    drawFooter(ctx);
    // Page number right
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 220, 245);
    doc.text(`${pg}`, W - margin, 290, { align: "right" });
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 140, 190);
    doc.text(`de ${totalPages}`, W - margin, 294, { align: "right" });
  }
  void pageCount;
}

export function checkPageBreak(ctx: PdfCtx, needed: number): void {
  const maxY = 297 - 20; // pageH - marginBottom (20mm para footer)
  if (ctx.pos.y + needed > maxY) {
    newPage(ctx);
    drawHeader(ctx);
  }
}

export function drawSectionTitle(ctx: PdfCtx, code: string, title: string): void {
  const { doc, DS, pos, margin, contentW } = ctx;
  checkPageBreak(ctx, 17);

  doc.setFillColor(228, 238, 252);
  doc.rect(margin, pos.y, contentW, 12, "F");
  doc.setFillColor(...DS.colors.accentRGB);
  doc.rect(margin, pos.y, 3.5, 12, "F");
  doc.setFillColor(...DS.colors.headerBg);
  doc.roundedRect(margin + 6, pos.y + 2.5, 16, 7, 1.5, 1.5, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(code, margin + 14, pos.y + 7.6, { align: "center" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DS.colors.headerBg);
  doc.text(title, margin + 26, pos.y + 8.2);
  doc.setDrawColor(190, 210, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, pos.y + 12, margin + contentW, pos.y + 12);
  doc.setLineWidth(0.1);
  pos.y += 16;
}

export interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  color?: RGB;
}

export function drawKpiGrid(ctx: PdfCtx, kpis: KpiItem[], columns = 4): void {
  const { doc, DS, pos, margin, contentW } = ctx;
  const gap = 3;
  const itemW = (contentW - gap * (columns - 1)) / columns;
  const itemH = 22;
  const rows = Math.ceil(kpis.length / columns);

  checkPageBreak(ctx, rows * (itemH + gap) + 4);

  kpis.forEach((item, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ix = margin + col * (itemW + gap);
    const iy = pos.y + row * (itemH + gap);

    doc.setFillColor(...DS.colors.cardBg);
    doc.roundedRect(ix, iy, itemW, itemH, 1.5, 1.5, "F");
    doc.setDrawColor(...DS.colors.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(ix, iy, itemW, itemH, 1.5, 1.5, "D");
    doc.setLineWidth(0.1);
    doc.setFillColor(...DS.colors.borderStrong);
    doc.rect(ix, iy, 2.5, itemH, "F");

    doc.setFontSize(DS.font.small);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textMuted);
    doc.text(item.label.toUpperCase(), ix + 5, iy + 5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(item.color ?? DS.colors.textPrimary));
    // Ajusta font-size para caber sem truncar
    const kpiMaxW = itemW - 8;
    let kpiFontSize = DS.font.h2;
    doc.setFontSize(kpiFontSize);
    while (doc.getTextWidth(item.value) > kpiMaxW && kpiFontSize > 7) {
      kpiFontSize -= 0.5;
      doc.setFontSize(kpiFontSize);
    }
    doc.text(item.value, ix + 5, iy + 14);

    if (item.sub) {
      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textSecondary);
      doc.text(item.sub, ix + 5, iy + 19.5);
    }
  });

  pos.y += rows * (itemH + gap) - gap + 6;
}

export function drawDivider(ctx: PdfCtx): void {
  const { doc, DS, pos, margin, contentW } = ctx;
  doc.setDrawColor(...DS.colors.border);
  doc.setLineWidth(0.3);
  doc.line(margin, pos.y, margin + contentW, pos.y);
  doc.setLineWidth(0.1);
  pos.y += 2;
}

export type AlertSev = "high" | "medium" | "info";

export function drawAlert(ctx: PdfCtx, severity: AlertSev, message: string, subtitle?: string): void {
  const { doc, DS, pos, margin, contentW } = ctx;

  const accentC: RGB = severity === "high" ? DS.colors.danger : severity === "medium" ? DS.colors.warn : DS.colors.info;
  const badgeBg: RGB = severity === "high" ? DS.colors.dangerBg : severity === "medium" ? DS.colors.warnBg : DS.colors.infoBg;
  const badgeTxt: RGB = severity === "high" ? DS.colors.dangerText : severity === "medium" ? DS.colors.warnText : DS.colors.infoText;
  const rowBg: RGB = severity === "high" ? [255, 250, 250] : severity === "medium" ? [255, 253, 244] : [248, 251, 255];
  const badgeLabel = severity === "high" ? "ALTA" : severity === "medium" ? "MODERADO" : "INFO";
  const pillW = severity === "medium" ? 22 : 14;

  const textX = margin + 3 + pillW + 4;
  const textAvailW = contentW - (textX - margin) - 6;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  const mainLines: string[] = doc.splitTextToSize(message, textAvailW);

  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  const subLines: string[] = subtitle ? doc.splitTextToSize(subtitle, textAvailW) : [];

  const lineH = 4.2;
  const rowH = Math.max(9, (mainLines.length + subLines.length) * lineH + 4);
  checkPageBreak(ctx, rowH + 1);

  doc.setFillColor(...rowBg);
  doc.rect(margin, pos.y, contentW, rowH, "F");
  doc.setFillColor(...accentC);
  doc.rect(margin, pos.y, 3, rowH, "F");

  doc.setFillColor(...badgeBg);
  doc.roundedRect(margin + 4, pos.y + (rowH - 5) / 2, pillW, 5, 1, 1, "F");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...badgeTxt);
  doc.text(badgeLabel, margin + 4 + pillW / 2, pos.y + (rowH - 5) / 2 + 3.5, { align: "center" });

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  let ty = pos.y + 3 + lineH * 0.5;
  mainLines.forEach((l: string) => { doc.text(l, textX, ty); ty += lineH; });

  if (subLines.length > 0) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    subLines.forEach((l: string) => { doc.text(l, textX, ty); ty += lineH; });
  }

  doc.setDrawColor(235, 235, 240);
  doc.setLineWidth(0.2);
  doc.line(margin + 3, pos.y + rowH, margin + contentW, pos.y + rowH);
  doc.setLineWidth(0.1);

  pos.y += rowH;
}

// Alert severity mapping from legacy ALTA/MODERADA/INFO to new format
export function drawAlertLegacy(ctx: PdfCtx, text: string, severity: AlertSeverity, subtitle?: string): void {
  const sev: AlertSev = severity === "ALTA" ? "high" : severity === "MODERADA" ? "medium" : "info";
  drawAlert(ctx, sev, text, subtitle);
}

// Deduplication set for alerts
const _alertasVistos = new Set<string>();
export function clearAlertDedup(): void { _alertasVistos.clear(); }

export function drawAlertDeduped(ctx: PdfCtx, text: string, severity: AlertSeverity, subtitle?: string): void {
  const dedupKey = text.trim().toLowerCase().replace(/\s+/g, " ").substring(0, 120);
  if (_alertasVistos.has(dedupKey)) return;
  _alertasVistos.add(dedupKey);
  drawAlertLegacy(ctx, text, severity, subtitle);
}

// ─── AutoTable wrapper ────────────────────────────────────────────────────────

export const TABLE_DEFAULTS = {
  headStyles: { fillColor: [12, 27, 58] as RGB, textColor: [255, 255, 255] as RGB, fontSize: 8, fontStyle: "bold" as const, cellPadding: 3 },
  bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [17, 24, 39] as RGB },
  alternateRowStyles: { fillColor: [249, 250, 251] as RGB },
  tableLineColor: [229, 231, 235] as RGB,
  tableLineWidth: 0.2,
};

export function autoT(
  ctx: PdfCtx,
  headers: string[],
  rows: AutoCell[][],
  colWidths: number[],
  opts?: {
    headFill?: RGB;
    headTextColor?: RGB;
    fontSize?: number;
    headFontSize?: number;
    gap?: number;
    minCellHeight?: number;
  }
): void {
  const { doc, DS, pos, margin, contentW, autoTable } = ctx;

  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const scale = contentW / (totalW || contentW);
  const scaledWidths = colWidths.map(w => w * scale);

  const headFill = opts?.headFill ?? DS.colors.navy;
  const headText = opts?.headTextColor ?? ([255, 255, 255] as RGB);
  const fs = opts?.fontSize ?? 7;
  const hfs = opts?.headFontSize ?? 5.5;
  const gap = opts?.gap ?? 4;

  autoTable(doc, {
    startY: pos.y,
    head: [headers],
    body: rows,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    theme: "plain",
    styles: {
      fontSize: fs,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      overflow: "linebreak",
      lineColor: [230, 230, 230],
      lineWidth: 0.1,
      textColor: DS.colors.text,
      font: "helvetica",
      minCellHeight: opts?.minCellHeight ?? 6,
    },
    headStyles: {
      fillColor: headFill,
      textColor: headText,
      fontStyle: "bold",
      fontSize: hfs,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
    },
    alternateRowStyles: {
      fillColor: DS.colors.surface2,
    },
    bodyStyles: {
      fillColor: DS.colors.surface,
    },
    columnStyles: scaledWidths.reduce((acc, w, i) => {
      acc[i] = { cellWidth: w };
      return acc;
    }, {} as Record<number, { cellWidth: number }>),
  });
  pos.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + gap;
}

export function drawTable(ctx: PdfCtx, headers: string[], rows: string[][], colWidths: number[]): void {
  autoT(ctx, headers, rows, colWidths, {
    headFill: ctx.DS.colors.surface2,
    headTextColor: ctx.DS.colors.textMuted,
    headFontSize: 6.5,
    fontSize: 7.5,
  });
}

// ─── Mini-section header ──────────────────────────────────────────────────────

export function dsMiniHeader(ctx: PdfCtx, title: string): number {
  const { doc, DS, pos, margin, contentW } = ctx;
  doc.setFillColor(...DS.colors.headerBg);
  doc.rect(margin, pos.y, contentW, 7, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin + 3, pos.y + 4.8);
  const newY = pos.y + 7;
  pos.y = newY;
  return newY;
}

// ─── Metric card ─────────────────────────────────────────────────────────────

export function dsMetricCard(
  ctx: PdfCtx,
  cx: number, cy: number, cw: number, ch: number,
  label: string, value: string, sub?: string,
  borderColor?: RGB, valueColor?: RGB
): void {
  const { doc, DS } = ctx;
  const bc = borderColor ?? DS.colors.info;
  const vc = valueColor ?? DS.colors.textPrimary;
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, "F");
  doc.setDrawColor(...DS.colors.borderRGB);
  doc.setLineWidth(0.3);
  doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, "D");
  doc.setLineWidth(0.1);
  doc.setFillColor(...bc);
  doc.rect(cx, cy, 3, ch, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textMuted);
  doc.text(label.toUpperCase(), cx + 5, cy + 5.5);
  // Ajusta font-size para caber sem truncar
  const maxValW = cw - 8;
  let valFontSize = 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(valFontSize);
  while (doc.getTextWidth(value) > maxValW && valFontSize > 7) {
    valFontSize -= 0.5;
    doc.setFontSize(valFontSize);
  }
  doc.setTextColor(...vc);
  if (doc.getTextWidth(value) > maxValW) {
    // Ainda não cabe — quebra em 2 linhas
    const lines: string[] = doc.splitTextToSize(value, maxValW);
    doc.text(lines[0], cx + 5, cy + 11);
    if (lines[1]) { doc.setFontSize(valFontSize - 1); doc.text(lines[1], cx + 5, cy + 15); }
  } else {
    doc.text(value, cx + 5, cy + 12);
  }
  if (sub) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textLight2);
    doc.text(sub, cx + 5, cy + 17);
  }
}

// ─── Banner "not consulted" ───────────────────────────────────────────────────

export function drawBannerNaoConsultado(ctx: PdfCtx, secao: string): void {
  const { doc, DS, pos, margin, contentW } = ctx;
  const padV = 10;
  const padH = 14;
  const textW = contentW - padH * 2 - 3;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const descText = `${secao}: consulta não realizada nesta análise — dado não disponível no momento da geração do relatório.`;
  const descLines = doc.splitTextToSize(descText, textW);
  const bannerH = padV + 8 + descLines.length * 4 + padV;
  checkPageBreak(ctx, bannerH + 4);
  doc.setFillColor(255, 251, 235);
  doc.roundedRect(margin, pos.y, contentW, bannerH, 1.5, 1.5, "F");
  doc.setFillColor(...DS.colors.warn);
  doc.roundedRect(margin, pos.y, 3, bannerH, 0.5, 0.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DS.colors.warn);
  doc.text("Consulta não realizada", margin + padH, pos.y + padV);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 80, 0);
  descLines.forEach((l: string, i: number) => {
    doc.text(l, margin + padH, pos.y + padV + 7 + i * 4);
  });
  pos.y += bannerH + 4;
}

// ─── Deterministic alert helpers ─────────────────────────────────────────────

type NivelAlerta = "alta" | "media" | "info";
export type AlertaDet = { nivel: NivelAlerta; mensagem: string };

export function drawDetAlerts(ctx: PdfCtx, alertas: AlertaDet[]): void {
  if (!alertas.length) return;
  alertas.forEach(al => {
    const sev: AlertSeverity = al.nivel === "alta" ? "ALTA" : al.nivel === "media" ? "MODERADA" : "INFO";
    drawAlertDeduped(ctx, al.mensagem, sev);
  });
}

export function drawSpacer(ctx: PdfCtx, h = 6): void {
  ctx.pos.y += h;
}

// ─── Deterministic alert generators ──────────────────────────────────────────

export function gerarAlertasFaturamento(
  fat: { meses?: { mes: string; valor: string }[]; fmm12m?: string; fmmMedio?: string } | undefined,
  validMeses: { mes: string; valor: string }[]
): AlertaDet[] {
  const out: AlertaDet[] = [];
  const ultimos6 = validMeses.slice(-6);
  ultimos6.filter(m => parseMoneyToNumber(m.valor) === 0).forEach(m => {
    out.push({ nivel: "alta", mensagem: `Faturamento zerado em ${m.mes} — verificar interrupção de operação` });
  });
  if (validMeses.length >= 6) {
    const rec = validMeses.slice(-3).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0);
    const ant = validMeses.slice(-6, -3).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0);
    if (ant > 0) {
      const pct = ((rec - ant) / ant) * 100;
      if (pct < -20) out.push({ nivel: "media", mensagem: `Queda de ${fmtBR(Math.abs(pct), 0)}% no faturamento recente — monitorar tendência` });
      if (pct > 50) out.push({ nivel: "info", mensagem: `Crescimento acelerado de ${fmtBR(pct, 0)}% — validar sustentabilidade` });
    }
  }
  const fmm = parseMoneyToNumber(fat?.fmm12m || fat?.fmmMedio || "0");
  if (fmm >= 300000 && fmm < 500000) {
    out.push({ nivel: "info", mensagem: `FMM próximo ao limite mínimo (R$${fmtBR(fmm / 1000, 0)}k) — margem reduzida` });
  }
  return out;
}

export function gerarAlertasSCR(
  scr: { vencidos?: string; prejuizos?: string; limiteCredito?: string; totalDividasAtivas?: string } | undefined,
  scrAnterior: { limiteCredito?: string; totalDividasAtivas?: string } | null | undefined,
  fmmVal: number
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!scr) return out;
  const vencidos = parseMoneyToNumber(scr.vencidos || "0");
  if (vencidos > 0) out.push({ nivel: "alta", mensagem: `SCR com R$ ${fmtMoney(scr.vencidos)} em operações vencidas` });
  const prej = parseMoneyToNumber(scr.prejuizos || "0");
  if (prej > 0) out.push({ nivel: "alta", mensagem: `Operações em prejuízo identificadas no SCR — R$ ${fmtMoney(scr.prejuizos)}` });
  if (scrAnterior?.limiteCredito) {
    const limAt = parseMoneyToNumber(scr.limiteCredito || "0");
    const limAnt = parseMoneyToNumber(scrAnterior.limiteCredito);
    if (limAnt > 0 && limAt < limAnt) {
      const pct = ((limAnt - limAt) / limAnt) * 100;
      if (pct > 50) out.push({ nivel: "media", mensagem: `Limite de crédito reduzido em ${fmtBR(pct, 0)}% nos últimos 12 meses` });
    }
  }
  if (fmmVal > 0) {
    const alav = parseMoneyToNumber(scr.totalDividasAtivas || "0") / fmmVal;
    if (alav > 1.5) out.push({ nivel: "media", mensagem: `Alavancagem de ${fmtBR(alav, 1)}x — acima do patamar conservador` });
  }
  if (scrAnterior?.totalDividasAtivas) {
    const divAt = parseMoneyToNumber(scr.totalDividasAtivas || "0");
    const divAnt = parseMoneyToNumber(scrAnterior.totalDividasAtivas);
    if (divAnt > 0 && divAt < divAnt) {
      const pct = ((divAnt - divAt) / divAnt) * 100;
      if (pct > 50) out.push({ nivel: "info", mensagem: `Redução expressiva de dívida (${fmtBR(pct, 0)}%) — pode indicar renegociação` });
    }
  }
  return out;
}

export function gerarAlertasDRE(
  dre: { anos?: { margemLiquida?: string; margemBruta?: string; ebitda?: string }[] } | undefined
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!dre?.anos?.length) return out;
  const u = dre.anos[dre.anos.length - 1];
  const ml = parseFloat(String(u.margemLiquida || "0").replace(",", ".")) || 0;
  const mb = parseFloat(String(u.margemBruta || "0").replace(",", ".")) || 0;
  if (ml < 0) {
    out.push({ nivel: "alta", mensagem: `Empresa com prejuízo líquido — margem de ${fmtBR(ml, 1)}%` });
  } else if (ml > 0 && ml < 3) {
    out.push({ nivel: "info", mensagem: `Margem líquida reduzida (${fmtBR(ml, 1)}%) — baixa tolerância a choques` });
  }
  if (!u.ebitda || parseMoneyToNumber(u.ebitda) === 0) {
    out.push({ nivel: "media", mensagem: `EBITDA não calculado — dados de depreciação/amortização ausentes` });
  }
  if (mb > 0 && mb < 10) {
    out.push({ nivel: "media", mensagem: `Margem bruta baixa (${fmtBR(mb, 1)}%) — estrutura de custos pressionada` });
  }
  return out;
}

export function gerarAlertasBalanco(
  balanco: { anos?: { patrimonioLiquido?: string; liquidezCorrente?: string; capitalDeGiroLiquido?: string; endividamentoTotal?: string }[] } | undefined
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!balanco?.anos?.length) return out;
  const u = balanco.anos[balanco.anos.length - 1];
  const pl = parseMoneyToNumber(u.patrimonioLiquido || "0");
  const lc = parseFloat(String(u.liquidezCorrente || "0").replace(",", ".")) || 0;
  const cg = parseMoneyToNumber(u.capitalDeGiroLiquido || "0");
  const end = parseFloat(String(u.endividamentoTotal || "0").replace(",", ".")) || 0;
  if (pl < 0) out.push({ nivel: "alta", mensagem: `Patrimônio Líquido negativo (R$ ${fmtMoney(u.patrimonioLiquido)}) — passivo a descoberto` });
  if (lc > 0 && lc < 0.5) {
    out.push({ nivel: "alta", mensagem: `Liquidez Corrente de ${fmtBR(lc, 2)} — risco elevado de inadimplência de curto prazo` });
  } else if (lc >= 0.5 && lc < 1.0) {
    out.push({ nivel: "info", mensagem: `Liquidez Corrente de ${fmtBR(lc, 2)} — abaixo do ideal (> 1,0)` });
  }
  if (cg < 0) out.push({ nivel: "media", mensagem: `Capital de Giro negativo (R$ ${fmtMoney(u.capitalDeGiroLiquido)}) — dependência de financiamento externo` });
  if (end > 150) out.push({ nivel: "media", mensagem: `Endividamento de ${fmtBR(end, 0)}% — estrutura de capital alavancada` });
  return out;
}

export function gerarAlertasQSA(
  qsa: { quadroSocietario?: { nome?: string }[] } | undefined,
  contrato: { temAlteracoes?: boolean } | undefined
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (contrato?.temAlteracoes) out.push({ nivel: "media", mensagem: `Alteração societária recente — verificar motivação e impacto` });
  const socios = (qsa?.quadroSocietario || []).filter(s => s.nome);
  if (socios.length === 1) out.push({ nivel: "info", mensagem: `Empresa com sócio único — risco de concentração de gestão` });
  return out;
}

export function gerarAlertasIRSocios(
  irSocios: { nomeSocio?: string; anoBase?: string; debitosEmAberto?: boolean }[] | undefined,
  anoAtual: number
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!irSocios?.length) return out;
  irSocios.forEach(ir => {
    if (!ir.nomeSocio && !ir.anoBase) return;
    const nome = ir.nomeSocio || "Sócio";
    if (ir.debitosEmAberto) out.push({ nivel: "alta", mensagem: `Sócio ${nome} — Débitos em aberto perante a Receita Federal / PGFN` });
    if (ir.anoBase) {
      const ano = parseInt(ir.anoBase);
      if (!isNaN(ano) && (anoAtual - ano) > 2) out.push({ nivel: "media", mensagem: `IR do sócio ${nome} desatualizado — ano-base ${ir.anoBase}` });
    }
  });
  return out;
}

// ─── parseDateKey ─────────────────────────────────────────────────────────────

export function parseDateKey(s: string): number {
  if (!s) return 0;
  const parts = s.split("/");
  if (parts.length !== 2) return 0;
  const [p1, p2] = parts;
  const monthMap: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12
  };
  const month = isNaN(Number(p1)) ? (monthMap[p1.toLowerCase()] || 0) : Number(p1);
  const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
  return year * 100 + month;
}
