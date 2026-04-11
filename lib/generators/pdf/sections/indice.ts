import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak } from "../helpers";

export function renderIndice(ctx: PdfCtx): void {
  const { doc, DS, pos, data, W, margin, contentW } = ctx;
  const colors = DS.colors;

  // Detect which docs are present
  const protestosNaoConsultados = !data.protestos?.vigentesQtd && !data.protestos?.vigentesValor
    && (data.protestos?.detalhes || []).length === 0;
  const processosNaoConsultados = !data.processos?.passivosTotal && !data.processos?.valorTotalEstimado
    && !(data.processos?.temRJ)
    && (data.processos?.distribuicao || []).length === 0;

  newPage(ctx);
  drawHeader(ctx);

  // ── IDX Section Header ────────────────────────────────────────────────────
  const idxHdrH = 12;
  doc.setFillColor(30, 58, 95);
  doc.rect(margin, pos.y, contentW, idxHdrH, "F");

  const idxBadgeW = 14; const idxBadgeH = 6;
  const idxBadgeX = margin + 4;
  const idxBadgeY = pos.y + (idxHdrH - idxBadgeH) / 2;
  doc.setFillColor(245, 158, 11);
  doc.roundedRect(idxBadgeX, idxBadgeY, idxBadgeW, idxBadgeH, 1, 1, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("IDX", idxBadgeX + idxBadgeW / 2, idxBadgeY + 4.1, { align: "center" });

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(
    "INDICE DOCUMENTAL \u2014 DOCUMENTOS ANALISADOS",
    idxBadgeX + idxBadgeW + 4,
    pos.y + idxHdrH / 2 + 2
  );

  doc.setFillColor(245, 158, 11);
  doc.rect(margin, pos.y + idxHdrH, contentW, 0.7, "F");
  pos.y += idxHdrH + 0.7;

  // Subtitle
  const clEmpresa = [
    data.cnpj?.razaoSocial?.substring(0, 45),
    data.cnpj?.cnpj ? "CNPJ: " + data.cnpj.cnpj : "",
  ].filter(Boolean).join("   |   ");
  if (clEmpresa) {
    pos.y += 2.5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textMuted);
    doc.text(clEmpresa, W / 2, pos.y, { align: "center" });
    pos.y += 5.5;
  } else {
    pos.y += 3;
  }

  // Status detection
  const clStatus: Record<string, boolean> = {
    cnpj:            !!data.cnpj?.cnpj,
    qsa:             (data.qsa?.quadroSocietario?.length ?? 0) > 0,
    contrato:        !!data.contrato?.dataConstituicao,
    faturamento:     (data.faturamento?.meses?.length ?? 0) > 0,
    dre:             !!data.dre,
    balanco:         !!data.balanco,
    curvaABC:        !!data.curvaABC,
    irSocios:        (data.irSocios?.length ?? 0) > 0,
    relatorioVisita: !!data.relatorioVisita,
    scr:             !!data.scr?.periodoReferencia,
    scrAnterior:     !!data.scrAnterior,
    protestos:       !protestosNaoConsultados,
    processos:       !processosNaoConsultados,
    grupoEconomico:  (data.grupoEconomico?.empresas?.length ?? 0) > 0,
    scrSocios:       (data.scrSocios?.length ?? 0) > 0,
    score:           !!data.score,
  };

  type ClItem = { key: string; label: string; obrigatorio: boolean };

  const clFrente1: ClItem[] = [
    { key: "cnpj",            label: "Cartao CNPJ",             obrigatorio: true  },
    { key: "qsa",             label: "QSA / Quadro de Socios",  obrigatorio: true  },
    { key: "contrato",        label: "Contrato Social",          obrigatorio: true  },
    { key: "faturamento",     label: "Faturamento",              obrigatorio: true  },
    { key: "dre",             label: "DRE",                      obrigatorio: false },
    { key: "balanco",         label: "Balanco Patrimonial",      obrigatorio: false },
    { key: "curvaABC",        label: "Curva ABC - Top Clientes", obrigatorio: false },
    { key: "irSocios",        label: "IR dos Socios",            obrigatorio: false },
    { key: "relatorioVisita", label: "Relatorio de Visita",      obrigatorio: false },
  ];

  const clFrente2: ClItem[] = [
    { key: "scr",            label: "SCR / BACEN",          obrigatorio: true  },
    { key: "scrAnterior",    label: "SCR Periodo Anterior",  obrigatorio: false },
    { key: "protestos",      label: "Protestos",             obrigatorio: true  },
    { key: "processos",      label: "Processos Judiciais",   obrigatorio: true  },
    { key: "grupoEconomico", label: "Grupo Economico",       obrigatorio: false },
    { key: "scrSocios",      label: "SCR dos Socios",        obrigatorio: false },
    { key: "score",          label: "Score Bureau",          obrigatorio: false },
  ];

  const clGap  = contentW * 0.04;
  const clColW = contentW * 0.48;
  const clRowH = DS.space.tableRowH;
  const clHdrH = 14;

  const clDrawCol = (
    frente: string,
    subtitle: string,
    borderColor: [number, number, number],
    items: ClItem[],
    cx: number,
    startY: number
  ): number => {
    const gradSteps = 6;
    const stepW = clColW / gradSteps;
    for (let s = 0; s < gradSteps; s++) {
      const t = s / (gradSteps - 1);
      const r = Math.round(30  + t * (45  - 30));
      const g = Math.round(58  + t * (82  - 58));
      const b = Math.round(95  + t * (152 - 95));
      doc.setFillColor(r, g, b);
      doc.rect(cx + s * stepW, startY, stepW + 0.4, clHdrH, "F");
    }
    doc.setFillColor(...borderColor);
    doc.rect(cx, startY, 1.1, clHdrH, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(frente, cx + 5.5, startY + 6.2);

    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 235);
    doc.text(subtitle, cx + 5.5, startY + 11.5);

    doc.setFillColor(...borderColor);
    doc.rect(cx, startY + clHdrH, clColW, 0.7, "F");

    let iy = startY + clHdrH + 0.7;

    items.forEach((item, idx) => {
      const ok = !!clStatus[item.key];
      const rowBg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
      doc.setFillColor(...rowBg);
      doc.rect(cx, iy, clColW, clRowH, "F");

      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(cx, iy + clRowH, cx + clColW, iy + clRowH);

      const sqSize = 3.6;
      const sqX = cx + 3.0;
      const sqY = iy + (clRowH - sqSize) / 2;
      if (ok) {
        doc.setFillColor(16, 185, 129);
        doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "F");
        doc.setDrawColor(5, 150, 105);
        doc.setLineWidth(0.2);
        doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "D");
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.65);
        doc.line(sqX + 0.7,              sqY + sqSize * 0.55,
                 sqX + sqSize * 0.42,    sqY + sqSize * 0.82);
        doc.line(sqX + sqSize * 0.42,    sqY + sqSize * 0.82,
                 sqX + sqSize - 0.6,     sqY + sqSize * 0.22);
        doc.setLineWidth(0.2);
      } else {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "F");
        doc.setLineDashPattern([0.6, 0.5], 0);
        doc.setDrawColor(...DS.colors.border);
        doc.setLineWidth(0.3);
        doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "D");
        doc.setLineDashPattern([], 0);
        doc.setLineWidth(0.2);
      }

      const nameY = (!ok && item.obrigatorio) ? iy + clRowH / 2 - 0.5 : iy + clRowH / 2 + 2;
      doc.setFontSize(DS.font.bodySmall);
      doc.setFont("helvetica", ok ? "normal" : "italic");
      doc.setTextColor(...(ok ? DS.colors.textPrimary : DS.colors.textMuted));
      doc.text(item.label, cx + 10, nameY);

      if (!ok && item.obrigatorio) {
        doc.setFontSize(DS.font.micro);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...DS.colors.warning);
        doc.text("Nao enviado", cx + 10, iy + clRowH / 2 + 3.2);
      }

      const missing = item.obrigatorio && !ok;
      const badgeLabel = item.obrigatorio ? "OBR" : "OPC";
      const badgeBg: [number, number, number] = missing ? [254, 243, 199] : item.obrigatorio ? [219, 234, 254] : [243, 244, 246];
      const badgeFg: [number, number, number] = missing ? DS.colors.warning as [number, number, number] : item.obrigatorio ? [29, 78, 216] : DS.colors.textSecondary as [number, number, number];
      const bw = 11; const bh = 4;
      const bx = cx + clColW - bw - 2.5;
      const by = iy + (clRowH - bh) / 2;
      doc.setFillColor(...badgeBg);
      doc.roundedRect(bx, by, bw, bh, 0.8, 0.8, "F");
      doc.setFontSize(DS.font.caption);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...badgeFg);
      doc.text(badgeLabel, bx + bw / 2, by + bh - 0.8, { align: "center" });

      iy += clRowH;
    });

    return iy;
  };

  pos.y += 3.5;
  const clStartY = pos.y;
  const clEndY1 = clDrawCol(
    "FRENTE 1",
    "Consolidacao de Documentos \u2014 dados financeiros e societarios",
    [16, 185, 129] as [number, number, number],
    clFrente1,
    margin,
    clStartY
  );
  const clEndY2 = clDrawCol(
    "FRENTE 2",
    "Tomada de Decisao para Credito \u2014 risco e historico",
    [59, 130, 246] as [number, number, number],
    clFrente2,
    margin + clColW + clGap,
    clStartY
  );
  pos.y = Math.max(clEndY1, clEndY2) + 4;

  // Legend
  {
    doc.setLineDashPattern([0.8, 0.6], 0);
    doc.setDrawColor(...DS.colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pos.y, margin + contentW, pos.y);
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.2);

    const lY = pos.y + 5.5;
    const lSq = 3.0;
    let lX = margin;

    // [✓] Received
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(lX, lY - lSq + 0.5, lSq, lSq, 0.3, 0.3, "F");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.55);
    doc.line(lX + 0.5, lY - lSq + 0.5 + lSq * 0.55, lX + lSq * 0.42, lY - lSq + 0.5 + lSq * 0.82);
    doc.line(lX + lSq * 0.42, lY - lSq + 0.5 + lSq * 0.82, lX + lSq - 0.4, lY - lSq + 0.5 + lSq * 0.22);
    doc.setLineWidth(0.2);
    lX += lSq + 1.8;
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textSecondary);
    doc.text("Documento recebido", lX, lY);
    lX += doc.getTextWidth("Documento recebido") + 6;

    // [☐] Not sent
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(lX, lY - lSq + 0.5, lSq, lSq, 0.3, 0.3, "F");
    doc.setLineDashPattern([0.5, 0.4], 0);
    doc.setDrawColor(...DS.colors.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(lX, lY - lSq + 0.5, lSq, lSq, 0.3, 0.3, "D");
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.2);
    lX += lSq + 1.8;
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textSecondary);
    doc.text("Nao enviado", lX, lY);
    lX += doc.getTextWidth("Nao enviado") + 6;

    // [OBR]
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "bold");
    const obrW = doc.getTextWidth("OBR") + 4;
    const lBh  = 3.2;
    doc.setFillColor(219, 234, 254);
    doc.roundedRect(lX, lY - lBh + 0.5, obrW, lBh, 0.4, 0.4, "F");
    doc.setTextColor(29, 78, 216);
    doc.text("OBR", lX + obrW / 2, lY - 0.1, { align: "center" });
    lX += obrW + 1.8;
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textSecondary);
    doc.text("Obrigatorio", lX, lY);
    lX += doc.getTextWidth("Obrigatorio") + 6;

    // [OPC]
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "bold");
    const opcW = doc.getTextWidth("OPC") + 4;
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(lX, lY - lBh + 0.5, opcW, lBh, 0.4, 0.4, "F");
    doc.setTextColor(...DS.colors.textSecondary);
    doc.text("OPC", lX + opcW / 2, lY - 0.1, { align: "center" });
    lX += opcW + 1.8;
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textSecondary);
    doc.text("Opcional", lX, lY);
    void lX;

    pos.y += 10;
  }

  // Coverage summary
  checkPageBreak(ctx, 30);
  const clTotal   = Object.keys(clStatus).length;
  const clPresent = Object.values(clStatus).filter(Boolean).length;
  const clPct     = Math.round((clPresent / clTotal) * 100);
  const clNivel   = clPresent === clTotal ? "COMPLETA" : clPresent >= 10 ? "PARCIAL" : "INCOMPLETA";

  const clBadgeBg: [number, number, number] = clNivel === "COMPLETA" ? [220, 252, 231] : clNivel === "PARCIAL" ? [254, 243, 199] : [254, 226, 226];
  const clBadgeFg: [number, number, number] = clNivel === "COMPLETA" ? [21, 128, 61] : clNivel === "PARCIAL" ? [217, 119, 6] : [220, 38, 38];
  const clBadgeBorder: [number, number, number] = clNivel === "COMPLETA" ? [134, 239, 172] : clNivel === "PARCIAL" ? [252, 211, 77] : [252, 165, 165];

  const clCardH = 32;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, pos.y, contentW, clCardH, 3, 3, "F");
  doc.setDrawColor(...DS.colors.border);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, pos.y, contentW, clCardH, 3, 3, "D");
  doc.setLineWidth(0.1);

  doc.setFontSize(DS.font.bodySmall);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textSecondary);
  doc.text("COBERTURA DOCUMENTAL TOTAL", margin + 6, pos.y + 6);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 95);
  const clCountStr = `${clPresent}/${clTotal}`;
  doc.text(clCountStr, margin + 6, pos.y + 16);
  const clCountW = doc.getTextWidth(clCountStr);

  doc.setFontSize(DS.font.h3);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textSecondary);
  doc.text("documentos recebidos", margin + 8 + clCountW, pos.y + 16);

  const clBarX = margin + 6;
  const clBarW = contentW - 68;
  const clBarH = 4;
  const clBarY = pos.y + 20;
  const clFillW = clBarW * (clPct / 100);

  doc.setFillColor(...DS.colors.border);
  doc.roundedRect(clBarX, clBarY, clBarW, clBarH, clBarH / 2, clBarH / 2, "F");

  if (clPct < 100 && clFillW < clBarW) {
    doc.setLineDashPattern([1.2, 0.8], 0);
    doc.setDrawColor(...DS.colors.textMuted);
    doc.setLineWidth(0.5);
    const pendX = clBarX + clFillW + 1;
    doc.line(pendX, clBarY + clBarH / 2, clBarX + clBarW - 1, clBarY + clBarH / 2);
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.2);
  }

  if (clPct > 0) {
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(clBarX, clBarY, clFillW, clBarH, clBarH / 2, clBarH / 2, "F");
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129);
  doc.text(`${clPct}%`, clBarX + clBarW + 2.5, clBarY + clBarH - 0.3);

  const clPendentes = clTotal - clPresent;
  doc.setFontSize(DS.font.bodySmall);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textSecondary);
  doc.text(
    `${clPresent} de ${clTotal} documentos recebidos  -  ${clPendentes} pendente${clPendentes !== 1 ? "s" : ""}`,
    clBarX,
    clBarY + clBarH + 5
  );

  const clBadgeW = 28;
  const clBadgeH = 9;
  const clBadgeX = margin + contentW - clBadgeW - 4;
  const clBadgeY = pos.y + (clCardH - clBadgeH) / 2;
  doc.setFillColor(...clBadgeBg);
  doc.roundedRect(clBadgeX, clBadgeY, clBadgeW, clBadgeH, 1.5, 1.5, "F");
  doc.setDrawColor(...clBadgeBorder);
  doc.setLineWidth(0.35);
  doc.roundedRect(clBadgeX, clBadgeY, clBadgeW, clBadgeH, 1.5, 1.5, "D");
  doc.setLineWidth(0.1);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...clBadgeFg);
  doc.text(clNivel, clBadgeX + clBadgeW / 2, clBadgeY + clBadgeH - 2.1, { align: "center" });

  pos.y += clCardH + 4;
  void colors;
}
