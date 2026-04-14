/**
 * Seção 00 — SÍNTESE PRELIMINAR + PARÂMETROS DO FUNDO + LIMITE DE CRÉDITO + CARTÃO CNPJ + QSA + GESTÃO
 * Contém toda a lógica do bloco sintético inicial do relatório.
 */
import type { PdfCtx, RGB } from "../context";
import {
  newPage, drawHeader, drawHeaderCompact, checkPageBreak, drawSectionTitle, drawSpacer,
  drawAlert, drawAlertDeduped, drawDetAlerts, drawTable, autoT, dsMiniHeader,
  dsMetricCard, fmtMoney, fmtBR, parseMoneyToNumber,
  gerarAlertasQSA,
} from "../helpers";

// ───────────────────────────────────────────────────────────────────────────
// Local formatters (compact money + percent) for the synthesis body
function fmtPct(v: number, decimals = 1): string {
  if (!isFinite(v)) return "—";
  return fmtBR(v, decimals) + "%";
}

function extractLocal(endereco: string | undefined): string {
  if (!endereco) return "—";
  // Tenta extrair "CIDADE/UF" ou ", CIDADE - UF," etc.
  const ufMatch = endereco.match(/([A-ZÁÂÃÇÉÍÓÔÚ][A-Za-zÁÂÃÇÉÍÓÔÚáâãçéíóôú \-']{2,})[\s/-]+([A-Z]{2})\b/);
  if (ufMatch) return `${ufMatch[1].trim()}/${ufMatch[2]}`;
  const parts = endereco.split(/[,\-/]/).map(s => s.trim()).filter(Boolean);
  return parts.slice(-2).join("/") || endereco.substring(0, 22);
}
// ───────────────────────────────────────────────────────────────────────────
// helper: sort faturamento meses ascending
function sortMesesAsc<T extends { mes: string; valor: string }>(ms: T[]): T[] {
  const dk = (s: string) => {
    if (!s) return 0;
    const parts = s.split("/");
    if (parts.length !== 2) return 0;
    const [p1, p2] = parts;
    const mm: Record<string, number> = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
    const month = isNaN(Number(p1)) ? (mm[p1.toLowerCase()] || 0) : Number(p1);
    const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
    return year * 100 + month;
  };
  return [...ms].sort((a, b) => dk(a.mes) - dk(b.mes));
}

function truncateText(s: string, max: number): string {
  const t = (s || "").trim();
  if (!t) return "";
  return t.length > max ? t.substring(0, max - 1).trimEnd() + "…" : t;
}

export function renderSintese(ctx: PdfCtx): void {
  const { doc, pos, params, data, margin, contentW } = ctx;
  const {
    decision, finalRating, companyAge, resumoExecutivo,
    protestosVigentes, vencidosSCR, alavancagem,
  } = params;

  // ── Local color palette (block spec) ────────────────────────────────────
  const C = {
    navy900:  [12, 27, 58]    as [number, number, number],
    navy800:  [19, 41, 82]    as [number, number, number],
    navy700:  [26, 58, 107]   as [number, number, number],
    navy100:  [220, 230, 245] as [number, number, number],
    navy50:   [238, 243, 251] as [number, number, number],
    amber500: [212, 149, 10]  as [number, number, number],
    amber100: [253, 243, 215] as [number, number, number],
    amber50:  [254, 249, 236] as [number, number, number],
    red600:   [197, 48, 48]   as [number, number, number],
    red100:   [254, 226, 226] as [number, number, number],
    red50:    [254, 242, 242] as [number, number, number],
    green600: [22, 101, 58]   as [number, number, number],
    green100: [209, 250, 229] as [number, number, number],
    green50:  [236, 253, 245] as [number, number, number],
    gray900:  [17, 24, 39]    as [number, number, number],
    gray700:  [55, 65, 81]    as [number, number, number],
    gray500:  [107, 114, 128] as [number, number, number],
    gray400:  [156, 163, 175] as [number, number, number],
    gray300:  [209, 213, 219] as [number, number, number],
    gray200:  [229, 231, 235] as [number, number, number],
    gray100:  [243, 244, 246] as [number, number, number],
    gray50:   [249, 250, 251] as [number, number, number],
    white:    [255, 255, 255] as [number, number, number],
    greenLogo:[115, 184, 21]  as [number, number, number],
  };

  // ── Font/spacing tokens (Bug 1) ─────────────────────────────────────────
  const F = { label: 7.5, body: 10, value: 10, valueLg: 16, rating: 22, blockTitle: 9, tableHead: 8.5, tableCell: 9 } as const;
  const S = { blockGap: 12, cardPad: 5, cardInfoH: 16, cardRiskH: 24, cardGap: 4 } as const;

  // ── Local money helper (Bug 4): always "R$ " + stripped value, no doubles
  const money = (v: string | number | undefined | null): string => {
    if (v == null || v === "") return "—";
    const n = typeof v === "number" ? v : parseMoneyToNumber(String(v));
    if (!isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n);
    let body: string;
    if (abs >= 1_000_000) body = `${fmtBR(n / 1_000_000, 1)}M`;
    else if (abs >= 1_000) body = `${fmtBR(Math.round(n / 1_000), 0)}k`;
    else body = `${fmtBR(Math.round(n), 0)}`;
    return `R$ ${body}`;
  };

  newPage(ctx);
  drawHeader(ctx);
  drawSectionTitle(ctx, "00", "Síntese Preliminar");

  // Pré-computa faturamento (reutilizado pelo downstream renderParametrosFundo)
  const validMeses = sortMesesAsc((data.faturamento?.meses || []).filter(m => m?.mes && m?.valor));
  const last12 = validMeses.slice(-12);
  const fmm12m = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : (last12.length > 0 ? last12.reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / last12.length : 0);
  const fatTotal12 = last12.reduce((s, m) => s + parseMoneyToNumber(m.valor), 0);

  // Debug — verificar se os valores de faturamento/protestos/processos estao chegando certos
  if (typeof console !== "undefined") {
    const last3 = last12.slice(-3).map(m => ({ mes: m.mes, raw: m.valor, parsed: parseMoneyToNumber(m.valor) }));
    console.log("[sintese] faturamento last3:", JSON.stringify(last3), "fmm:", fmm12m, "total12:", fatTotal12, "fmm12mRaw:", data.faturamento?.fmm12m || "—");
    console.log("[sintese] protestos:", {
      raw: data.protestos?.vigentesValor || "—",
      parsed: parseMoneyToNumber(data.protestos?.vigentesValor || "0"),
      qtd: data.protestos?.vigentesQtd || "—",
    });
    console.log("[sintese] processos:", {
      passivos: data.processos?.passivosTotal || "—",
      valorTotalRaw: data.processos?.valorTotalEstimado || "—",
      valorTotalParsed: parseMoneyToNumber(data.processos?.valorTotalEstimado || "0"),
    });
  }

  const cw = contentW;
  const ml = margin;

  // Decision/score helpers
  const dec = (decision || "—").replace(/_/g, " ").toUpperCase();
  const decAprov = /APROV/i.test(dec) && !/CONDIC/i.test(dec);
  const decReprov = /REPROV/i.test(dec);
  const decColor: [number, number, number] = decAprov ? C.green600 : decReprov ? C.red600 : C.amber500;

  const score = finalRating || 0;
  const scoreColor: [number, number, number] = score >= 6.5 ? C.green600 : score >= 5 ? C.amber500 : C.red600;
  const scoreLabel = score >= 8 ? "EXCELENTE" : score >= 6.5 ? "SATISFATÓRIO" : score >= 5 ? "MODERADO" : "ALTO RISCO";

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 1 — Empresa + Rating
  // ══════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 30);
    const y0 = pos.y;
    const blockH = 28;
    const leftW = (cw * 2) / 3;
    const rightX = ml + leftW;
    const rightW = cw - leftW;

    // Left: razão social
    const razao = (data.cnpj?.razaoSocial || "—").trim();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...C.navy900);
    doc.text(razao.length > 60 ? razao.substring(0, 59) + "…" : razao, ml, y0 + 6);

    // Nome fantasia
    const fantasia = (data.cnpj?.nomeFantasia || "").trim();
    if (fantasia) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.gray500);
      doc.text(fantasia.length > 70 ? fantasia.substring(0, 69) + "…" : fantasia, ml, y0 + 11);
    }

    // CNPJ + situação badge inline
    const cnpjStr = data.cnpj?.cnpj || "—";
    doc.setFont("courier", "normal");
    doc.setFontSize(F.body);
    doc.setTextColor(...C.gray700);
    doc.text(cnpjStr, ml, y0 + 17);
    const cnpjW = doc.getTextWidth(cnpjStr);

    const situ = (data.cnpj?.situacaoCadastral || "").toUpperCase().trim();
    if (situ) {
      const isAtiva = situ.includes("ATIVA");
      const badgeBg = isAtiva ? C.green100 : C.amber100;
      const badgeFg: [number, number, number] = isAtiva ? C.green600 : C.amber500;
      const lblTxt = situ.length > 14 ? situ.substring(0, 14) : situ;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.label);
      const txtW = doc.getTextWidth(lblTxt);
      const padX = 2.5;
      const bx = ml + cnpjW + 3;
      const bw = txtW + padX * 2;
      const bh = 4.8;
      const by = y0 + 13.5;
      doc.setFillColor(...badgeBg);
      doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, "F");
      doc.setTextColor(...badgeFg);
      doc.text(lblTxt, bx + padX, by + 3.4);
    }

    // Right: rating circle
    const cxC = rightX + rightW / 2;
    const cyC = y0 + 12;
    doc.setDrawColor(...scoreColor);
    doc.setLineWidth(1.2);
    doc.circle(cxC, cyC, 11, "S");
    doc.setLineWidth(0.1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(F.rating);
    doc.setTextColor(...scoreColor);
    doc.text(String(score.toFixed(1)).replace(".", ","), cxC, cyC + 2.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(F.label);
    doc.setTextColor(...C.gray400);
    doc.text("/10", cxC, cyC + 7, { align: "center" });

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(F.label);
    doc.setTextColor(...scoreColor);
    doc.text(scoreLabel, cxC, cyC + 13, { align: "center" });

    // Decision badge
    {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.label);
      const txtW = doc.getTextWidth(dec);
      const padX = 3;
      const bw = txtW + padX * 2;
      const bh = 5;
      const bx = cxC - bw / 2;
      const by = cyC + 15.5;
      doc.setFillColor(...decColor);
      doc.roundedRect(bx, by, bw, bh, 1.2, 1.2, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(dec, bx + padX, by + 3.6);
    }

    // Bottom divider
    doc.setDrawColor(...C.gray200);
    doc.setLineWidth(0.2);
    doc.line(ml, y0 + blockH, ml + cw, y0 + blockH);
    doc.setLineWidth(0.1);

    pos.y = y0 + blockH + S.blockGap;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 2 — Fundação & Dados Básicos (6 cards)
  // ══════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 18);
    const y0 = pos.y;
    const cardH = S.cardInfoH;
    const gap = S.cardGap;
    const cardW = (cw - gap * 5) / 6;

    const capSocRaw = data.cnpj?.capitalSocialCNPJ || data.qsa?.capitalSocial || "";
    const capSoc = capSocRaw ? money(capSocRaw) : "—";
    const local = extractLocal(data.cnpj?.endereco);

    const cells: Array<{ label: string; value: string; mono?: boolean }> = [
      { label: "DATA FUND.", value: data.cnpj?.dataAbertura || "—" },
      { label: "IDADE", value: companyAge || "—" },
      { label: "PORTE", value: (data.cnpj?.porte || "—").substring(0, 14) },
      { label: "CAP. SOCIAL", value: capSoc, mono: true },
      { label: "TIPO", value: (data.cnpj?.tipoEmpresa || "—").substring(0, 14) },
      { label: "LOCAL", value: local },
    ];

    cells.forEach((c, i) => {
      const cx = ml + i * (cardW + gap);
      doc.setFillColor(...C.gray50);
      doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "F");
      doc.setDrawColor(...C.gray100);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "S");
      doc.setLineWidth(0.1);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.label);
      doc.setTextColor(...C.gray400);
      doc.text(c.label, cx + 2.5, y0 + 4.5);

      doc.setFont(c.mono ? "courier" : "helvetica", "bold");
      doc.setFontSize(F.body);
      doc.setTextColor(...(c.value === "—" ? C.gray400 : C.gray900));
      const maxC = Math.floor((cardW - 5) / (c.mono ? 1.9 : 1.75));
      const v = c.value.length > maxC ? c.value.substring(0, maxC - 1) + "…" : c.value;
      doc.text(v, cx + 2.5, y0 + 11.5);
    });

    pos.y = y0 + cardH + S.blockGap;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 3 — Segmento (CNAE)
  // ══════════════════════════════════════════════════════════════════════
  {
    const cnaePr = (data.cnpj?.cnaePrincipal || "").trim();
    const cnaeSec = (data.cnpj?.cnaeSecundarios || "").trim();
    if (cnaePr || cnaeSec) {
      checkPageBreak(ctx, 14);
      doc.setFontSize(F.body);
      const innerW = cw - 2 * S.cardPad;
      // Try to split into "code" and "description"
      let codeStr = "";
      let descStr = cnaePr;
      const m = cnaePr.match(/^([\d./-]{6,})\s+(.*)$/);
      if (m) { codeStr = m[1]; descStr = m[2]; }
      const descLines = doc.splitTextToSize(descStr || "—", innerW) as string[];
      const secLines = cnaeSec ? doc.splitTextToSize(`CNAEs sec.: ${cnaeSec}`, innerW) as string[] : [];
      const totalLines = (codeStr ? 1 : 0) + descLines.length + secLines.length;
      const lineH = 4.2;
      const blockH = Math.max(12, 2 * S.cardPad + totalLines * lineH);

      const y0 = pos.y;
      doc.setFillColor(...C.navy50);
      doc.roundedRect(ml, y0, cw, blockH, 2, 2, "F");
      doc.setDrawColor(...C.navy100);
      doc.setLineWidth(0.2);
      doc.roundedRect(ml, y0, cw, blockH, 2, 2, "S");
      doc.setLineWidth(0.1);

      let ty = y0 + S.cardPad + 1;
      if (codeStr) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.body);
        doc.setTextColor(...C.navy900);
        doc.text(`CNAE ${codeStr}`, ml + S.cardPad, ty);
        ty += lineH;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.navy700);
      descLines.forEach(l => { doc.text(l, ml + S.cardPad, ty); ty += lineH; });
      if (secLines.length) {
        doc.setTextColor(...C.navy700);
        secLines.forEach(l => { doc.text(l, ml + S.cardPad, ty); ty += lineH; });
      }
      pos.y = y0 + blockH + S.blockGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 4 — Foto + Endereço (CONDITIONAL)
  // ══════════════════════════════════════════════════════════════════════
  {
    const sv = params.streetViewBase64;
    const hasValidImage = typeof sv === "string" && sv.length > 100
      && (sv.startsWith("data:image") || sv.startsWith("/9j/") || sv.startsWith("iVBOR"));

    const endereco = (data.cnpj?.endereco || "—").trim();

    const renderAddressFullWidth = () => {
      checkPageBreak(ctx, 24);
      const y0 = pos.y;
      const rh = 22;
      doc.setFillColor(...C.gray50);
      doc.roundedRect(ml, y0, cw, rh, 2, 2, "F");
      doc.setDrawColor(...C.gray100);
      doc.setLineWidth(0.2);
      doc.roundedRect(ml, y0, cw, rh, 2, 2, "S");
      doc.setLineWidth(0.1);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.label);
      doc.setTextColor(...C.gray400);
      doc.text("ENDEREÇO", ml + S.cardPad, y0 + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.gray700);
      const lines = doc.splitTextToSize(endereco, cw - 2 * S.cardPad) as string[];
      let ty = y0 + 10;
      lines.slice(0, 4).forEach(l => { doc.text(l, ml + S.cardPad, ty); ty += 4.2; });

      pos.y = y0 + rh + S.blockGap;
    };

    if (hasValidImage) {
      checkPageBreak(ctx, 45);
      const y0 = pos.y;
      const imgW = 82;
      const imgH = 35;
      let drew = false;
      try {
        const imgData = sv!.startsWith("data:") ? sv! : `data:image/jpeg;base64,${sv}`;
        doc.addImage(imgData, "JPEG", ml, y0, imgW, imgH);
        drew = true;
      } catch (e) {
        console.error("[sintese] Street View addImage failed:", e);
      }

      if (!drew) {
        renderAddressFullWidth();
      } else {
        const rx = ml + imgW + S.cardGap;
        const rw = cw - imgW - S.cardGap;
        const rh = imgH;
        doc.setFillColor(...C.gray50);
        doc.roundedRect(rx, y0, rw, rh, 2, 2, "F");
        doc.setDrawColor(...C.gray100);
        doc.setLineWidth(0.2);
        doc.roundedRect(rx, y0, rw, rh, 2, 2, "S");
        doc.setLineWidth(0.1);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.label);
        doc.setTextColor(...C.gray400);
        doc.text("ENDEREÇO", rx + S.cardPad, y0 + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(F.body);
        doc.setTextColor(...C.gray700);
        const lines = doc.splitTextToSize(endereco, rw - 2 * S.cardPad) as string[];
        let ty = y0 + 10;
        lines.slice(0, 6).forEach(l => { doc.text(l, rx + S.cardPad, ty); ty += 4.2; });

        pos.y = y0 + rh + S.blockGap;
      }
    } else {
      renderAddressFullWidth();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 5 — Estrutura Societária (Gestão & Grupo Econômico)
  // ══════════════════════════════════════════════════════════════════════
  {
    const socios = (data.qsa?.quadroSocietario || []).filter(s => s?.nome || s?.cpfCnpj);
    const empresas = data.grupoEconomico?.empresas || [];

    if (socios.length > 0 || empresas.length > 0) {
      checkPageBreak(ctx, Math.max(30, 25 + socios.length * 7));

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.blockTitle);
      doc.setTextColor(...C.gray500);
      doc.text("GESTÃO & GRUPO ECONÔMICO", ml, pos.y + 4);
      pos.y += 7;

      if (socios.length > 0) {
        const rows: string[][] = socios.map(s => [
          truncateText(s.nome || "—", 38),
          s.cpfCnpj || "—",
          truncateText(s.qualificacao || "—", 26),
          s.participacao || "—",
        ]);
        autoT(
          ctx,
          ["NOME", "CPF/CNPJ", "QUALIFICAÇÃO", "PART."],
          rows,
          [70, 35, 45, 24],
          { headFill: C.navy900 as RGB, fontSize: F.tableCell, headFontSize: F.tableHead },
        );
      }

      const capSocStrRaw = data.qsa?.capitalSocial
        ? data.qsa.capitalSocial
        : data.cnpj?.capitalSocialCNPJ || "";
      const capSocStr = capSocStrRaw ? `R$ ${fmtMoney(capSocStrRaw)}` : "—";
      const grupoStr = empresas.length > 0 ? `${empresas.length} empresa(s)` : "Não identificado";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.gray500);
      doc.text(`Capital Social: ${capSocStr} · Grupo Econômico: ${grupoStr}`, ml, pos.y + 4);
      pos.y += 4 + S.blockGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 6 — Indicadores de Risco
  // ══════════════════════════════════════════════════════════════════════
  {
    const numAlertas = Math.min(4, ((params.alertsHigh || []).length) + ((params.alerts || []).filter(a => a.severity === "MODERADA").length));
    checkPageBreak(ctx, 26 + numAlertas * 12 + S.blockGap);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(F.blockTitle);
    doc.setTextColor(...C.gray500);
    doc.text("INDICADORES DE RISCO", ml, pos.y + 4);
    pos.y += 7;

    const protQtd = protestosVigentes || 0;
    const protVal = parseMoneyToNumber(data.protestos?.vigentesValor || "0");
    const ccfQtd = data.ccf?.qtdRegistros ?? null;
    const procPass = parseInt(data.processos?.passivosTotal || "0") || 0;
    const scrVenc = vencidosSCR || 0;
    const scrTotalAt = parseMoneyToNumber(data.scr?.totalDividasAtivas || "0");
    const scrVencPct = scrTotalAt > 0 ? (scrVenc / scrTotalAt) * 100 : 0;
    const alav = alavancagem ?? 0;

    type Tone = "red" | "green" | "amber" | "gray";
    const tone = (t: Tone) => {
      switch (t) {
        case "red":   return { fill: C.red50,    border: C.red100,    fg: C.red600   };
        case "green": return { fill: C.green50,  border: C.green100,  fg: C.green600 };
        case "amber": return { fill: C.amber50,  border: C.amber100,  fg: C.amber500 };
        default:      return { fill: C.gray50,   border: C.gray100,   fg: C.gray400  };
      }
    };

    const cells: Array<{ label: string; value: string; sub: string; tone: Tone }> = [
      {
        label: "PROTESTOS",
        value: protQtd > 0 ? String(protQtd) : "0",
        sub: protQtd > 0 ? money(protVal) : "sem ocorr.",
        tone: protQtd > 2 ? "red" : "green",
      },
      {
        label: "CCF",
        value: ccfQtd == null ? "—" : String(ccfQtd),
        sub: ccfQtd == null ? "n/c" : ccfQtd > 0 ? "ocorr." : "limpo",
        tone: ccfQtd == null ? "gray" : ccfQtd > 0 ? "red" : "green",
      },
      {
        label: "PROCESSOS",
        value: String(procPass),
        sub: "polo passivo",
        tone: procPass > 0 ? "red" : data.processos ? "green" : "gray",
      },
      {
        label: "SCR VENC.",
        value: scrVenc > 0 ? money(scrVenc) : "—",
        sub: scrTotalAt > 0 ? `${fmtPct(scrVencPct, 1)} do total` : "em dia",
        tone: scrVencPct > 10 ? "red" : scrVenc > 0 ? "amber" : "green",
      },
      {
        label: "ALAVANCAGEM",
        value: alav > 0 ? `${fmtBR(alav, 2)}x` : "—",
        sub: alav > 5 ? "alto" : alav > 3 ? "atenção" : alav > 0 ? "saudável" : "s/ dados",
        tone: alav > 5 ? "red" : alav > 3 ? "amber" : alav > 0 ? "green" : "gray",
      },
    ];

    const gap = S.cardGap;
    const cardW = (cw - gap * 4) / 5;
    const cardH = S.cardRiskH;
    const y0 = pos.y;

    cells.forEach((c, i) => {
      const t = tone(c.tone);
      const cx = ml + i * (cardW + gap);
      doc.setFillColor(...t.fill);
      doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "F");
      doc.setDrawColor(...t.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "S");
      doc.setLineWidth(0.1);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.label);
      doc.setTextColor(...C.gray400);
      doc.text(c.label, cx + S.cardPad, y0 + 5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.valueLg);
      doc.setTextColor(...t.fg);
      const maxC = Math.floor((cardW - 2 * S.cardPad) / 2.9);
      const v = c.value.length > maxC ? c.value.substring(0, maxC - 1) + "…" : c.value;
      doc.text(v, cx + S.cardPad, y0 + 14);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.label);
      doc.setTextColor(...C.gray500);
      doc.text(c.sub, cx + S.cardPad, y0 + 20);
    });

    pos.y = y0 + cardH + S.cardGap;

    // Top alerts (high first, then medium up to 4 total)
    const allHigh = (params.alertsHigh || []).slice(0, 2);
    const allMed = (params.alerts || []).filter(a => a.severity === "MODERADA").slice(0, 2);
    [...allHigh, ...allMed].slice(0, 4).forEach(a => {
      drawAlertDeduped(ctx, a.message, a.severity, a.impacto);
    });
    pos.y += S.blockGap;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 7 — Faturamento + SCR comparativo
  // ══════════════════════════════════════════════════════════════════════
  {
    const scr = data.scr;
    const scrAnt = data.scrAnterior;
    const hasFat = last12.length > 0;
    const hasScrAnt = !!(scrAnt && scrAnt.periodoReferencia);
    const hasScr = !!(scr && scr.periodoReferencia);

    if (hasFat || hasScr) {
      const blockH = 55;
      checkPageBreak(ctx, blockH + S.blockGap);
      const y0 = pos.y;
      const gap = S.cardGap;
      const useTwoCols = hasFat && hasScrAnt && hasScr;
      const colW = useTwoCols ? (cw - gap) / 2 : cw;

      // ── Left container (Faturamento) ──
      if (hasFat) {
        const colX = ml;
        doc.setFillColor(...C.gray50);
        doc.roundedRect(colX, y0, colW, blockH, 3, 3, "F");
        doc.setDrawColor(...C.gray100);
        doc.setLineWidth(0.2);
        doc.roundedRect(colX, y0, colW, blockH, 3, 3, "S");
        doc.setLineWidth(0.1);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.blockTitle);
        doc.setTextColor(...C.gray500);
        doc.text("FATURAMENTO", colX + S.cardPad, y0 + 6);

        // Bug 2: use parseMoneyToNumber (BR format aware), guard empty
        const values = last12.map(m => parseMoneyToNumber(m.valor));
        const maxVal = Math.max(...values, 0);
        console.log("[sintese] fat values:", values, "max:", maxVal);

        const barArea = colW - 2 * S.cardPad;
        const n = last12.length;
        const barGap = 1.5;
        const barW = (barArea - barGap * Math.max(0, n - 1)) / Math.max(1, n);
        const chartAreaH = 30;
        const labelsAreaH = 8;
        const kpiAreaH = 7;
        const headerH = 10;
        const chartTop = y0 + headerH;
        const baseY = chartTop + chartAreaH;

        if (maxVal === 0) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(F.body);
          doc.setTextColor(...C.gray400);
          doc.text("Faturamento não disponível", colX + colW / 2, chartTop + chartAreaH / 2, { align: "center" });
        } else {
          // Trend
          let varPctLocal = 0;
          if (n >= 6) {
            const rec = values.slice(-3).reduce((a, b) => a + b, 0);
            const ant = values.slice(-6, -3).reduce((a, b) => a + b, 0);
            if (ant > 0) varPctLocal = ((rec - ant) / ant) * 100;
          }
          const upTrend = varPctLocal > 2;

          last12.forEach((m, i) => {
            const v = values[i];
            const rawH = (v / maxVal) * chartAreaH;
            const bh = v === 0 ? 0.5 : Math.max(rawH, 0.5);
            const bx = colX + S.cardPad + i * (barW + barGap);
            const by = baseY - bh;
            const isHi = i >= n - 3 && upTrend;
            const col: [number, number, number] = v === 0 ? C.gray300 : isHi ? C.greenLogo : C.navy800;
            doc.setFillColor(...col);
            doc.rect(bx, by, barW, bh, "F");

            doc.setFont("helvetica", "normal");
            doc.setFontSize(F.label - 1);
            doc.setTextColor(...C.gray500);
            const lbl = (m.mes || "").substring(0, 5);
            doc.text(lbl, bx + barW / 2, baseY + labelsAreaH / 2 + 1, { align: "center" });
          });

          const trend = varPctLocal > 2 ? "↑" : varPctLocal < -2 ? "↓" : "→";
          doc.setFont("helvetica", "normal");
          doc.setFontSize(F.label);
          doc.setTextColor(...C.gray700);
          doc.text(
            `FMM ${money(fmm12m)} · Total ${money(fatTotal12)} · ${trend} ${fmtPct(varPctLocal, 0)}`,
            colX + S.cardPad, baseY + labelsAreaH + kpiAreaH - 1,
          );
        }
      }

      // ── Right container (SCR comparativo) ──
      if (useTwoCols) {
        const colX = ml + colW + gap;
        doc.setFillColor(...C.gray50);
        doc.roundedRect(colX, y0, colW, blockH, 3, 3, "F");
        doc.setDrawColor(...C.gray100);
        doc.setLineWidth(0.2);
        doc.roundedRect(colX, y0, colW, blockH, 3, 3, "S");
        doc.setLineWidth(0.1);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.blockTitle);
        doc.setTextColor(...C.gray500);
        doc.text(`SCR ${scrAnt!.periodoReferencia} → ${scr!.periodoReferencia}`, colX + S.cardPad, y0 + 6);

        const sr = (k: string) => parseMoneyToNumber(String((scr as unknown as Record<string, string>)?.[k] || "0"));
        const srAnt = (k: string) => parseMoneyToNumber(String((scrAnt as unknown as Record<string, string> | null)?.[k] || "0"));
        type Row = { label: string; cur: number; prev: number; bold?: boolean };
        const rows: Row[] = [
          { label: "Carteira A/V",  cur: sr("carteiraAVencer"),    prev: srAnt("carteiraAVencer") },
          { label: "Vencidos",      cur: sr("vencidos"),           prev: srAnt("vencidos") },
          { label: "Prejuízos",     cur: sr("prejuizos"),          prev: srAnt("prejuizos") },
          { label: "Total Dívidas", cur: sr("totalDividasAtivas"), prev: srAnt("totalDividasAtivas"), bold: true },
        ];

        const colLab = colX + S.cardPad;
        const colCur = colX + colW * 0.42;
        const colPrev = colX + colW * 0.66;
        const colVar = colX + colW * 0.86;

        // Navy header band (Bug 5)
        const headH = 7;
        const headY = y0 + 11;
        doc.setFillColor(...C.navy900);
        doc.rect(colX + S.cardPad - 1, headY, colW - 2 * (S.cardPad - 1), headH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.tableHead);
        doc.setTextColor(255, 255, 255);
        doc.text("MÉTRICA", colLab, headY + headH - 2);
        doc.text("ATUAL", colCur, headY + headH - 2);
        doc.text("ANT.", colPrev, headY + headH - 2);
        doc.text("VAR%", colVar, headY + headH - 2);

        rows.forEach((r, i) => {
          const ry = headY + headH + 5 + i * 6;
          doc.setFont("helvetica", r.bold ? "bold" : "normal");
          doc.setFontSize(F.tableCell);
          doc.setTextColor(...C.gray900);
          doc.text(r.label, colLab, ry);
          doc.text(r.cur > 0 ? money(r.cur) : "—", colCur, ry);
          doc.text(r.prev > 0 ? money(r.prev) : "—", colPrev, ry);
          if (r.prev > 0 && r.cur > 0) {
            const pct = ((r.cur - r.prev) / r.prev) * 100;
            const vc: [number, number, number] = pct > 2 ? C.red600 : pct < -2 ? C.green600 : C.gray500;
            doc.setTextColor(...vc);
            doc.text(`${pct > 0 ? "+" : ""}${fmtBR(pct, 0)}%`, colVar, ry);
          } else {
            doc.setTextColor(...C.gray400);
            doc.text("—", colVar, ry);
          }
        });
      }

      pos.y = y0 + blockH + S.blockGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 8 — Curva ABC (CONDITIONAL)
  // ══════════════════════════════════════════════════════════════════════
  {
    const clientes = data.curvaABC?.clientes || [];
    if (clientes.length > 0) {
      console.log("[sintese] ABC sample client:", JSON.stringify(clientes[0]));
      const top5 = clientes.slice(0, 5);
      checkPageBreak(ctx, 45);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.blockTitle);
      doc.setTextColor(...C.gray500);
      doc.text("CURVA ABC — TOP 5 CLIENTES", ml, pos.y + 4);
      pos.y += 7;

      // Field name: valorFaturado (confirmed in types/index.ts ClienteCurvaABC)
      const abcValor = (c: unknown): string => {
        const rec = c as Record<string, unknown>;
        return String(rec?.valorFaturado || rec?.faturamento || rec?.valor || "0");
      };

      const baseTotal = parseMoneyToNumber(data.curvaABC?.receitaTotalBase || "0");
      let acum = 0;
      const rows: string[][] = top5.map((c, i) => {
        const valor = parseMoneyToNumber(abcValor(c));
        const pct = baseTotal > 0
          ? (valor / baseTotal) * 100
          : parseFloat(String(c.percentualReceita).replace(",", ".").replace("%", "")) || 0;
        acum += pct;
        return [
          String(i + 1),
          truncateText(c.nome || "—", 36),
          money(valor),
          fmtPct(pct, 1),
          fmtPct(acum, 1),
          c.classe || "—",
        ];
      });
      autoT(
        ctx,
        ["#", "CLIENTE", "FATURAMENTO", "% REC.", "% ACUM.", "CL."],
        rows,
        [8, 58, 35, 25, 25, 15],
        { headFill: C.navy900 as RGB, fontSize: F.tableCell, headFontSize: F.tableHead },
      );

      const top3 = top5.slice(0, 3).reduce((s, c) => {
        const v = parseMoneyToNumber(abcValor(c));
        return s + (baseTotal > 0 ? (v / baseTotal) * 100 : parseFloat(String(c.percentualReceita).replace(",", ".").replace("%", "")) || 0);
      }, 0);
      const top5Sum = rows.length > 0 ? acum : 0;
      const totalCli = data.curvaABC?.totalClientesNaBase || clientes.length;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.gray500);
      doc.text(
        `Top 3: ${fmtPct(top3, 0)} · Top 5: ${fmtPct(top5Sum, 0)} · Total clientes: ${totalCli}`,
        ml, pos.y + 4,
      );
      pos.y += 6;

      // Concentration alert
      const top1Pct = baseTotal > 0
        ? (parseMoneyToNumber(abcValor(top5[0])) / baseTotal) * 100
        : parseFloat(String(top5[0].percentualReceita).replace(",", ".").replace("%", "")) || 0;
      if (top1Pct > 30) {
        drawAlert(ctx, "high", `Concentração elevada: maior cliente representa ${fmtPct(top1Pct, 0)} da receita`);
      }
      pos.y += S.blockGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 9 — Pleito (CONDITIONAL)
  // ══════════════════════════════════════════════════════════════════════
  {
    const rv = data.relatorioVisita;
    const hasPleito = !!(rv && (rv.pleito || rv.limiteTotal || rv.modalidade || rv.prazoMaximoOp || rv.taxaConvencional));
    if (hasPleito) {
      checkPageBreak(ctx, 20);

      const cards: Array<{ label: string; value: string; mono?: boolean }> = [
        { label: "VALOR PLEITEADO", value: rv!.limiteTotal ? `R$ ${fmtMoney(rv!.limiteTotal)}` : (rv!.pleito || "—"), mono: !!rv!.limiteTotal },
        { label: "MODALIDADE", value: (rv!.modalidade || "—").toUpperCase() },
        { label: "PRAZO MÁX.", value: rv!.prazoMaximoOp ? `${rv!.prazoMaximoOp} dias` : "—" },
        { label: "TAXA", value: rv!.taxaConvencional ? `${rv!.taxaConvencional}%` : "—" },
      ];
      const gap = S.cardGap;
      const cardW = (cw - gap * 3) / 4;
      const cardH = S.cardInfoH;
      const y0 = pos.y;

      cards.forEach((c, i) => {
        const cx = ml + i * (cardW + gap);
        doc.setFillColor(...C.navy50);
        doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "F");
        doc.setDrawColor(...C.navy100);
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "S");
        doc.setLineWidth(0.1);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.label);
        doc.setTextColor(...C.gray400);
        doc.text(c.label, cx + S.cardPad, y0 + 5);

        doc.setFont(c.mono ? "courier" : "helvetica", "bold");
        doc.setFontSize(F.body);
        doc.setTextColor(...C.navy900);
        const maxC = Math.floor((cardW - 2 * S.cardPad) / (c.mono ? 1.9 : 1.75));
        const v = c.value.length > maxC ? c.value.substring(0, maxC - 1) + "…" : c.value;
        doc.text(v, cx + S.cardPad, y0 + 12);
      });

      pos.y = y0 + cardH + S.blockGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 10 — Análise (Fortes / Fracos / Alertas)
  // ══════════════════════════════════════════════════════════════════════
  {
    const fortes = (params.pontosFortes || []).slice(0, 6);
    const fracos = (params.pontosFracos || []).slice(0, 6);
    const moderados = (params.alerts || [])
      .filter(a => a.severity === "MODERADA")
      .map(a => a.message)
      .slice(0, 6);

    if (fortes.length > 0 || fracos.length > 0 || moderados.length > 0) {
      const cardH = 40;
      checkPageBreak(ctx, cardH + S.blockGap);
      const y0 = pos.y;
      const gap = S.cardGap;
      const cardW = (cw - gap * 2) / 3;

      const cols: Array<{
        title: string;
        items: string[];
        bg: [number, number, number];
        border: [number, number, number];
        fg: [number, number, number];
      }> = [
        { title: "PONTOS FORTES", items: fortes,    bg: C.green50, border: C.green100, fg: C.green600 },
        { title: "PONTOS FRACOS", items: fracos,    bg: C.red50,   border: C.red100,   fg: C.red600 },
        { title: "ALERTAS",       items: moderados, bg: C.amber50, border: C.amber100, fg: C.amber500 },
      ];

      cols.forEach((col, i) => {
        const cx = ml + i * (cardW + gap);
        doc.setFillColor(...col.bg);
        doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "F");
        doc.setDrawColor(...col.border);
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, y0, cardW, cardH, 2, 2, "S");
        doc.setLineWidth(0.1);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(F.blockTitle);
        doc.setTextColor(...col.fg);
        doc.text(col.title, cx + S.cardPad, y0 + 5);
        doc.setDrawColor(...col.border);
        doc.setLineWidth(0.2);
        doc.line(cx + S.cardPad, y0 + 6.8, cx + cardW - S.cardPad, y0 + 6.8);
        doc.setLineWidth(0.1);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(F.body - 1.5);
        doc.setTextColor(...C.gray700);
        let ty = y0 + 11;
        col.items.slice(0, 5).forEach(item => {
          if (ty > y0 + cardH - 3) return;
          const lines = doc.splitTextToSize(`• ${truncateText(item, 200)}`, cardW - 2 * S.cardPad) as string[];
          lines.slice(0, 2).forEach(l => {
            if (ty > y0 + cardH - 3) return;
            doc.text(l, cx + S.cardPad, ty);
            ty += 4;
          });
        });
      });
      pos.y = y0 + cardH + S.blockGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO 11 — Percepção do Analista (CONDITIONAL)
  // ══════════════════════════════════════════════════════════════════════
  {
    let parecerTxt = (resumoExecutivo || "").trim();
    if (!parecerTxt) {
      const raw = ctx.aiAnalysis?.parecer;
      if (typeof raw === "string") {
        parecerTxt = raw.trim();
      } else if (raw && typeof raw === "object") {
        const obj = raw as { resumoExecutivo?: string; textoCompleto?: string };
        parecerTxt = (obj.resumoExecutivo || obj.textoCompleto || "").trim();
      }
    }

    if (parecerTxt) {
      const innerW = cw - 2 * S.cardPad;
      const lineH = 4.3;
      const allLines = doc.splitTextToSize(parecerTxt, innerW) as string[];
      const maxLines = 6;
      const shown = allLines.slice(0, maxLines);
      if (allLines.length > maxLines) {
        shown[shown.length - 1] = shown[shown.length - 1].replace(/\s*\S*$/, "") + "…";
      }
      const blockH = S.cardPad + 2 + shown.length * lineH + 14;

      checkPageBreak(ctx, blockH + S.blockGap);
      const y0 = pos.y;
      doc.setFillColor(...C.gray50);
      doc.roundedRect(ml, y0, cw, blockH, 3, 3, "F");
      doc.setDrawColor(...C.gray200);
      doc.setLineWidth(0.3);
      doc.roundedRect(ml, y0, cw, blockH, 3, 3, "S");
      doc.setLineWidth(0.1);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.gray700);
      let ty = y0 + S.cardPad + 3;
      shown.forEach(l => { doc.text(l, ml + S.cardPad, ty); ty += lineH; });

      // Recommendation line
      const recY = y0 + blockH - 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.body);
      doc.setTextColor(...C.gray500);
      doc.text("Recomendação:", ml + S.cardPad, recY);
      const labelW = doc.getTextWidth("Recomendação:");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(F.label);
      const txtW = doc.getTextWidth(dec);
      const padX = 3;
      const bw = txtW + padX * 2;
      const bh = 5;
      const bx = ml + S.cardPad + labelW + 3;
      const by = recY - 3.6;
      doc.setFillColor(...decColor);
      doc.roundedRect(bx, by, bw, bh, 1.2, 1.2, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(dec, bx + padX, by + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(F.label);
      doc.setTextColor(...C.gray400);
      doc.text("Ver parecer completo na seção 02.", ml + S.cardPad, y0 + blockH - 2);

      pos.y = y0 + blockH + S.blockGap;
    }
  }

  void fatTotal12;

  // ── Downstream subsections (kept) ─────────────────────────────────────
  // Seção Parâmetros do Fundo
  if (params.fundValidation && params.fundValidation.criteria.length > 0) {
    renderParametrosFundo(ctx, fmm12m);
  }

  // Seção Limite de Crédito
  if (params.creditLimit) {
    renderLimiteCredito(ctx);
  }

  // Seção CNPJ
  renderCNPJ(ctx);

  // Seção QSA + Contrato + Gestão
  renderQSAGestao(ctx);
}


function renderParametrosFundo(ctx: PdfCtx, fmmNum: number): void {
  void fmmNum;
  const { doc, DS, pos, params, margin, contentW } = ctx;
  const fv = params.fundValidation!;

  const normalizeThreshold = (t: string) => t.replace(/≥/g, ">=").replace(/≤/g, "<=");

  drawSpacer(ctx, 10);

  const fsRowH = 15;
  const fsSummaryH = 18;
  const fsHasAnyElim = fv.criteria.some(c => c.eliminatoria);
  const fsAlturaTotal = 13 + fsSummaryH + 4 + 8 + fv.criteria.length * (fsRowH + 1) + 18 + (fsHasAnyElim ? 8 : 0);
  if (pos.y + fsAlturaTotal > 265) { newPage(ctx); drawHeaderCompact(ctx); }

  drawSectionTitle(ctx, "FS", "CONFORMIDADE COM PARAMETROS DO FUNDO");

  // 3 pills summary
  {
    const pillW = (contentW - 8) / 3;
    const pillH = fsSummaryH;
    const pillGap = 4;
    const pills = [
      { label: "Aprovados",  value: fv.passCount, bg: [220,252,231] as [number,number,number], txt: [22,101,52]  as [number,number,number], bar: [22,163,74]  as [number,number,number] },
      { label: "Em Atencao", value: fv.warnCount, bg: [254,243,199] as [number,number,number], txt: [133,77,14]  as [number,number,number], bar: [217,119,6]  as [number,number,number] },
      { label: "Reprovados", value: fv.failCount, bg: [254,226,226] as [number,number,number], txt: [220,38,38]  as [number,number,number], bar: [220,38,38]  as [number,number,number] },
    ];
    pills.forEach((pill, i) => {
      const px = margin + i * (pillW + pillGap);
      const pct = fv.criteria.length > 0 ? pill.value / fv.criteria.length : 0;
      doc.setFillColor(...pill.bg);
      doc.roundedRect(px, pos.y, pillW, pillH, 2, 2, "F");
      if (pct > 0) {
        doc.setFillColor(...pill.bar);
        doc.setGState(doc.GState({ opacity: 0.15 }));
        doc.roundedRect(px, pos.y + pillH - 4, pillW * pct, 4, 1, 1, "F");
        doc.setGState(doc.GState({ opacity: 1 }));
      }
      doc.setFontSize(DS.font.h1); doc.setFont("helvetica", "bold"); doc.setTextColor(...pill.txt);
      doc.text(String(pill.value), px + pillW / 2, pos.y + 11, { align: "center" });
      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setTextColor(...pill.txt);
      doc.text(pill.label.toUpperCase(), px + pillW / 2, pos.y + 15.5, { align: "center" });
    });
    pos.y += pillH + 5;
  }

  // Column header
  const fsColBadge = margin + 4;
  const fsColCrit  = margin + 14;
  const fsColLim   = margin + 68;
  const fsColApur  = margin + 112;
  const fsColStat  = margin + 144;

  doc.setFillColor(...DS.colors.pageBg);
  doc.roundedRect(margin, pos.y, contentW, 8, DS.radius.md, DS.radius.md, "F");
  doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "bold"); doc.setTextColor(...DS.colors.textSecondary);
  doc.text("CRITERIO DE ELEGIBILIDADE", fsColCrit, pos.y + 5.5);
  doc.text("LIMITE DO FUNDO",           fsColLim,  pos.y + 5.5);
  doc.text("APURADO",                   fsColApur, pos.y + 5.5);
  doc.text("STATUS",                    fsColStat, pos.y + 5.5);
  pos.y += 9;

  // Criteria rows
  fv.criteria.forEach((cr, idx) => {
    const isOk   = cr.status === "ok";
    const isErr  = cr.status === "error";
    const isWarn = cr.status === "warning";
    const isElim = cr.eliminatoria;
    const hasDetail = !!cr.detail;
    const rowH = hasDetail ? fsRowH + 5 : fsRowH;
    checkPageBreak(ctx, rowH + 1);

    const rowBg: [number,number,number] = (isErr && isElim) ? [255, 235, 235] : isErr ? [255, 245, 245] : isWarn ? [255, 251, 235] : idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
    doc.setFillColor(...rowBg);
    doc.rect(margin, pos.y, contentW, rowH, "F");

    const stripC: [number,number,number] = isErr ? [220,38,38] : isWarn ? [217,119,6] : isOk ? [16,185,129] : [156,163,175];
    doc.setFillColor(...stripC);
    doc.rect(margin, pos.y, 4, rowH, "F");

    const iconLabel = isOk ? "OK" : isErr ? "FAIL" : isWarn ? "AVS" : "—";
    const iconBg:  [number,number,number] = isOk ? [220,252,231] : isErr ? [254,226,226] : isWarn ? [254,243,199] : [243,244,246];
    const iconTxt: [number,number,number] = isOk ? [21,128,61]   : isErr ? [220,38,38]   : isWarn ? [133,77,14]   : [107,114,128];
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "bold");
    const iconW = doc.getTextWidth(iconLabel) + 5;
    doc.setFillColor(...iconBg);
    doc.roundedRect(fsColBadge, pos.y + (rowH - 6) / 2, iconW, 6, DS.radius.md, DS.radius.md, "F");
    doc.setTextColor(...iconTxt);
    doc.text(iconLabel, fsColBadge + iconW / 2, pos.y + (rowH - 6) / 2 + 4.2, { align: "center" });

    const labelText = (isElim ? "* " : "") + cr.label;
    doc.setFontSize(isErr ? DS.font.h3 : DS.font.body); doc.setFont("helvetica", isErr ? "bold" : "normal");
    doc.setTextColor(...((isErr && isElim) ? DS.colors.dangerText : isErr ? DS.colors.danger : DS.colors.textPrimary));
    const labelLines = doc.splitTextToSize(labelText, fsColLim - fsColCrit - 3) as string[];
    doc.text(labelLines[0], fsColCrit, pos.y + rowH / 2 + 1.5);
    if (labelLines[1]) { doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.text(labelLines[1], fsColCrit, pos.y + rowH / 2 + 5.5); }

    if (hasDetail) {
      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "italic"); doc.setTextColor(...DS.colors.textSecondary);
      const detailLines = doc.splitTextToSize(cr.detail!, fsColLim - fsColCrit - 3) as string[];
      doc.text(detailLines[0], fsColCrit, pos.y + rowH - 4);
    }

    doc.setFontSize(DS.font.bodySmall); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textSecondary);
    const threshNorm = normalizeThreshold(cr.threshold);
    const threshLines = doc.splitTextToSize(threshNorm, fsColApur - fsColLim - 4) as string[];
    doc.text(threshLines[0], fsColLim, pos.y + rowH / 2 + 1.5);

    doc.setFontSize(DS.font.h3); doc.setFont("helvetica", "bold"); doc.setTextColor(...stripC);
    doc.text(cr.actual, fsColApur, pos.y + rowH / 2 + 1.5);

    const sLabel = isOk ? "APROVADO" : isWarn ? "ATENCAO" : isErr ? "REPROVADO" : "S/DADO";
    const sBg:  [number,number,number] = isOk ? DS.colors.successBg : isWarn ? DS.colors.warningBg : isErr ? DS.colors.dangerBg : [243,244,246];
    const sTxt: [number,number,number] = isOk ? DS.colors.successText : isWarn ? DS.colors.warningText : isErr ? DS.colors.danger : DS.colors.textSecondary;
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "bold");
    const sPw = doc.getTextWidth(sLabel) + 10;
    doc.setFillColor(...sBg);
    doc.roundedRect(fsColStat, pos.y + (rowH - 7) / 2, sPw, 7, DS.radius.md, DS.radius.md, "F");
    doc.setTextColor(...sTxt);
    doc.text(sLabel, fsColStat + 5, pos.y + rowH / 2 + 1.5);

    doc.setDrawColor(...DS.colors.border); doc.setLineWidth(0.2);
    doc.line(margin, pos.y + rowH, margin + contentW, pos.y + rowH);
    pos.y += rowH + 1;
  });

  // Final verdict
  const fsElimFails = fv.criteria.filter(c => c.eliminatoria && c.status === "error").length;
  const fsFinalStatus = (fv.hasEliminatoria && fv.failCount > 0) ? "EMPRESA NAO ELEGIVEL — CRITERIO ELIMINATORIO"
    : fv.failCount > 0 ? "REPROVADO PELOS PARAMETROS DO FUNDO"
    : fv.warnCount > 0 ? "APROVACAO CONDICIONAL"
    : "EMPRESA ELEGIVEL — TODOS OS CRITERIOS ATENDIDOS";
  const fsFinalBg:  [number,number,number] = (fv.failCount > 0) ? [254,226,226] : fv.warnCount > 0 ? [254,243,199] : [220,252,231];
  const fsFinalTxt: [number,number,number] = (fv.failCount > 0) ? [153,27,27]   : fv.warnCount > 0 ? [133,77,14]   : [22,101,52];
  const fsFinalBrd: [number,number,number] = (fv.failCount > 0) ? [220,38,38]   : fv.warnCount > 0 ? [217,119,6]   : [22,163,74];

  checkPageBreak(ctx, 18);
  doc.setDrawColor(...fsFinalBrd); doc.setLineWidth(0.8);
  doc.line(margin, pos.y, margin + contentW, pos.y); doc.setLineWidth(0.1);
  pos.y += 1;

  doc.setFillColor(...fsFinalBg);
  doc.roundedRect(margin, pos.y, contentW, 14, 2, 2, "F");
  doc.setFillColor(...fsFinalBrd);
  doc.rect(margin, pos.y, 4, 14, "F");

  doc.setFontSize(DS.font.caption); doc.setFont("helvetica", "normal"); doc.setTextColor(...fsFinalTxt);
  doc.text(`${fv.passCount}/${fv.criteria.length} criterios aprovados${fsElimFails > 0 ? ` · ${fsElimFails} eliminatorio(s) reprovado(s)` : ""}`, margin + 9, pos.y + 5.5);
  doc.setFontSize(DS.font.h3); doc.setFont("helvetica", "bold");
  doc.text(fsFinalStatus, margin + 9, pos.y + 11);
  pos.y += 15;

  if (fsHasAnyElim) {
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "italic"); doc.setTextColor(...DS.colors.textMuted);
    doc.text("* Criterio eliminatorio: nao atendimento impede aprovacao independente dos demais resultados.", margin + 4, pos.y + 4);
    pos.y += 8;
  }
  pos.y += 4;
  void DS;
}

function renderLimiteCredito(ctx: PdfCtx): void {
  const { doc, DS, pos, params, margin, contentW } = ctx;
  const lc = params.creditLimit!;
  const lcColor = lc.classificacao === "APROVADO" ? [22, 101, 52] as [number,number,number]
    : lc.classificacao === "CONDICIONAL" ? [120, 53, 15] as [number,number,number]
    : [127, 29, 29] as [number,number,number];
  const fmtM = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 55);
  drawSectionTitle(ctx, "LC", "LIMITE DE CREDITO SUGERIDO");
  pos.y += 4;
  checkPageBreak(ctx, 40);

  const bannerBg = lc.classificacao === "APROVADO" ? [220, 252, 231] as [number,number,number]
    : lc.classificacao === "CONDICIONAL" ? [254, 243, 199] as [number,number,number]
    : [254, 226, 226] as [number,number,number];
  doc.setFillColor(...bannerBg);
  doc.rect(margin, pos.y, contentW, 10, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...lcColor);
  const bannerText = lc.classificacao === "REPROVADO"
    ? "NAO ELEGIVEL — Criterio eliminatorio nao atendido"
    : lc.classificacao === "CONDICIONAL"
      ? `APROVACAO CONDICIONAL — Limite de ${fmtM(lc.limiteAjustado)} (reduzido 30%)`
      : `APROVADO — Limite de ${fmtM(lc.limiteAjustado)}`;
  doc.text(bannerText, margin + 4, pos.y + 6.5);
  pos.y += 14;

  if (lc.classificacao !== "REPROVADO") {
    const cols = [
      { label: "PRAZO MAXIMO", value: lc.prazo + " dias" },
      { label: "REVISAO EM", value: new Date(lc.dataRevisao).toLocaleDateString("pt-BR") },
      { label: "CONC. MAX/SACADO", value: fmtM(lc.limiteConcentracao) },
      { label: "BASE (FMM x FATOR)", value: `${fmtM(lc.fmmBase)} x ${lc.fatorBase}` },
    ];
    const cellW = contentW / 4;
    cols.forEach((col, i) => {
      const cx = margin + i * cellW;
      doc.setFillColor(...DS.colors.pageBg);
      doc.rect(cx, pos.y, cellW - 1, 16, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(DS.font.micro); doc.setTextColor(...DS.colors.textMuted);
      doc.text(col.label, cx + 3, pos.y + 5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(DS.font.md); doc.setTextColor(...lcColor);
      doc.text(col.value, cx + 3, pos.y + 12);
    });
    pos.y += 20;
  }

  doc.setFont("helvetica", "italic"); doc.setFontSize(DS.font.bodySmall); doc.setTextColor(...DS.colors.textSecondary);
  const noteText = lc.classificacao === "REPROVADO"
    ? `Perfil: ${lc.presetName} — revise os criterios eliminatorios antes de prosseguir.`
    : `Perfil: ${lc.presetName} | Base: FMM ${fmtM(lc.fmmBase)} x ${lc.fatorBase} = ${fmtM(lc.limiteBase)}${lc.fatorReducao < 1 ? ` | Fator reducao: ${Math.round((1 - lc.fatorReducao) * 100)}%` : ""}`;
  doc.text(noteText, margin + 2, pos.y + 3);
  pos.y += 8;
  void DS;
}

function renderCNPJ(ctx: PdfCtx): void {
  const { doc, DS, pos, params, data, margin, contentW } = ctx;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 120);
  drawSectionTitle(ctx, "01", "CARTAO CNPJ");

  // Hero: Razão Social + CNPJ + Badge Situação
  {
    const heroH = 24;
    const situ = (data.cnpj?.situacaoCadastral || "").toUpperCase();
    const situOk = situ.includes("ATIVA");
    const situColor: [number,number,number] = situOk ? [22,163,74] : [220,38,38];
    const situBg:    [number,number,number] = situOk ? [220,252,231] : [254,226,226];

    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(margin, pos.y, contentW, heroH, "F");
    doc.setFillColor(...situColor);
    doc.rect(margin, pos.y, 3.5, heroH, "F");

    doc.setFontSize(DS.font.lg); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    const rzStr = data.cnpj?.razaoSocial || "—";
    const rzLines = doc.splitTextToSize(rzStr, contentW - 68) as string[];
    doc.text(rzLines[0], margin + 8, pos.y + 10);
    if (rzLines[1]) { doc.setFontSize(DS.font.h3); doc.text(rzLines[1], margin + 8, pos.y + 17); }

    const nf = data.cnpj?.nomeFantasia;
    if (nf && nf.toLowerCase() !== (data.cnpj?.razaoSocial || "").toLowerCase()) {
      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "italic"); doc.setTextColor(...DS.colors.textOnDark);
      doc.text(`"${nf}"`, margin + 8, pos.y + 21);
    }
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textOnDark);
    doc.text("CNPJ: " + (data.cnpj?.cnpj || "—"), margin + 8, pos.y + (nf ? 21 : 20));

    const bw = 44; const bh = 11;
    const bx = margin + contentW - bw - 5;
    const by = pos.y + (heroH - bh) / 2;
    doc.setFillColor(...situBg);
    doc.roundedRect(bx, by, bw, bh, DS.radius.lg, DS.radius.lg, "F");
    doc.setFontSize(DS.font.caption); doc.setFont("helvetica", "bold"); doc.setTextColor(...situColor);
    const situLabel = situ || "N/D";
    doc.text(situLabel.length > 12 ? situLabel.substring(0, 12) + "…" : situLabel, bx + bw / 2, by + 7.5, { align: "center" });
    pos.y += heroH + 5;
  }

  // Metric cards row 1
  {
    const mgGap = 3;
    const mgW = (contentW - mgGap * 3) / 4;
    const mgH = 19;
    checkPageBreak(ctx, mgH + 4);
    const capitalSocial = data.qsa?.capitalSocial || "";
    const mg1 = [
      { label: "Data de Abertura",  value: data.cnpj?.dataAbertura || "—",    border: DS.colors.info },
      { label: "Natureza Jurídica", value: data.cnpj?.naturezaJuridica || "—", border: DS.colors.borderStrong },
      { label: "Porte",             value: data.cnpj?.porte || "—",            border: DS.colors.borderStrong },
      { label: "Capital Social",    value: capitalSocial ? `R$ ${fmtMoney(capitalSocial)}` : "—", border: DS.colors.success },
    ];
    mg1.forEach((item, i) => {
      dsMetricCard(ctx, margin + i * (mgW + mgGap), pos.y, mgW, mgH, item.label, item.value, undefined, item.border);
    });
    pos.y += mgH + 4;
  }

  // Metric cards row 2
  {
    const items2 = [
      data.cnpj?.tipoEmpresa   ? { label: "Tipo Empresa",     value: data.cnpj.tipoEmpresa }   : null,
      data.cnpj?.funcionarios  ? { label: "Funcionários",     value: data.cnpj.funcionarios }  : null,
      data.cnpj?.regimeTributario ? { label: "Regime Tributário", value: data.cnpj.regimeTributario } : null,
      data.cnpj?.telefone      ? { label: "Telefone",         value: data.cnpj.telefone }      : null,
      data.cnpj?.email         ? { label: "E-mail",           value: data.cnpj.email }         : null,
      data.cnpj?.dataSituacaoCadastral ? { label: "Data da Situação", value: data.cnpj.dataSituacaoCadastral } : null,
    ].filter(Boolean) as { label: string; value: string }[];
    if (items2.length > 0) {
      const n = Math.min(items2.length, 4);
      const mgGap2 = 3;
      const mgW2 = (contentW - mgGap2 * (n - 1)) / n;
      const mgH2 = 17;
      checkPageBreak(ctx, mgH2 + 4);
      items2.slice(0, n).forEach((item, i) => {
        dsMetricCard(ctx, margin + i * (mgW2 + mgGap2), pos.y, mgW2, mgH2, item.label, item.value, undefined, DS.colors.borderStrong);
      });
      pos.y += mgH2 + 4;
    }
  }

  // Address + StreetView
  {
    const hasStreetView = !!params.streetViewBase64;
    const svW   = hasStreetView ? 58 : 0;
    const svGap = hasStreetView ? 4 : 0;
    const endW  = contentW - svW - svGap;
    const endVal = data.cnpj?.endereco || "—";
    const endMinH = hasStreetView ? 46 : 18;
    checkPageBreak(ctx, endMinH + 6);

    const endLines = doc.splitTextToSize(endVal, endW - 10) as string[];
    const endBoxH  = Math.max(endMinH, endLines.length * 4.5 + 14);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, pos.y, endW, endBoxH, 2, 2, "F");
    doc.setDrawColor(...DS.colors.borderRGB);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, pos.y, endW, endBoxH, 2, 2, "D");
    doc.setLineWidth(0.1);
    doc.setFillColor(...DS.colors.accentRGB);
    doc.rect(margin, pos.y, 3, endBoxH, "F");

    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textMuted);
    doc.text("ENDEREÇO PRINCIPAL", margin + 7, pos.y + 5.5);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...DS.colors.textPrimary);
    endLines.forEach((line, i) => doc.text(line, margin + 7, pos.y + 11 + i * 5));

    if (hasStreetView) {
      const svX = margin + endW + svGap;
      doc.setFillColor(26, 46, 74);
      doc.rect(svX, pos.y, svW, 8, "F");
      doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("ESTABELECIMENTO — STREET VIEW", svX + svW / 2, pos.y + 5.2, { align: "center" });
      doc.addImage(params.streetViewBase64!, "JPEG", svX, pos.y + 8, svW, endBoxH - 8);
    }
    pos.y += endBoxH + 4;
  }

  // Additional addresses
  const endExtras: string[] = data.cnpj?.enderecos || [];
  if (endExtras.length > 1) {
    endExtras.slice(1).forEach((end, idx) => {
      checkPageBreak(ctx, 10);
      const el = doc.splitTextToSize(end, contentW - 8) as string[];
      const eh = Math.max(9, el.length * 4.5 + 6);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, pos.y, contentW, eh, 1, 1, "F");
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textMuted);
      doc.text(`ENDEREÇO ${idx + 2}`, margin + 4, pos.y + 3.5);
      doc.setFontSize(7); doc.setTextColor(...DS.colors.textPrimary);
      doc.text(el, margin + 4, pos.y + 7);
      pos.y += eh + 2;
    });
  }

  // CNAEs secundários
  const cnaesRaw = data.cnpj?.cnaeSecundarios || "";
  const cnaesStr = Array.isArray(cnaesRaw) ? (cnaesRaw as string[]).join("; ") : String(cnaesRaw);
  if (cnaesStr.trim() !== "") {
    const cl = doc.splitTextToSize(cnaesStr, contentW - 8) as string[];
    const ch = cl.length * 4 + 14;
    checkPageBreak(ctx, ch + 2);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, pos.y, contentW, ch, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textMuted);
    doc.text("CNAES SECUNDÁRIOS", margin + 4, pos.y + 5);
    doc.setFontSize(7); doc.setTextColor(...DS.colors.textPrimary);
    cl.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + 10 + i * 4));
    pos.y += ch + 2;
  }
}

function renderQSAGestao(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  const alertasQSA = gerarAlertasQSA(data.qsa, data.contrato);

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 60);
  drawSectionTitle(ctx, "02", "QUADRO SOCIETARIO (QSA)");

  if (data.qsa?.capitalSocial) {
    checkPageBreak(ctx, 16);
    const fieldW = contentW;
    const textMaxW = fieldW - 8;
    const lineH = 4.5;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(data.qsa.capitalSocial, textMaxW);
    const boxH = Math.max(12, 6 + lines.length * lineH + 3);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, fieldW, boxH, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
    doc.text("CAPITAL SOCIAL", margin + 4, pos.y + 4.5);
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + 9 + i * lineH));
    pos.y += boxH + 2;
  }

  const validQSA = data.qsa?.quadroSocietario?.filter(s => s.nome) || [];
  if (validQSA.length > 0) {
    const temDatas = validQSA.some(s => s.dataEntrada || s.dataSaida);
    if (temDatas) {
      const qsaColW = [contentW * 0.26, contentW * 0.18, contentW * 0.22, contentW * 0.14, contentW * 0.10, contentW * 0.10];
      drawTable(ctx, ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART.", "ENTRADA", "SAIDA"],
        validQSA.map(s => {
          const part = s.participacao ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%") : "—";
          return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part, s.dataEntrada || "—", s.dataSaida || "—"];
        }), qsaColW);
    } else {
      const qsaColW = [contentW * 0.30, contentW * 0.22, contentW * 0.28, contentW * 0.20];
      drawTable(ctx, ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
        validQSA.map(s => {
          const part = s.participacao ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%") : "—";
          return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part];
        }), qsaColW);
    }
  }

  if (alertasQSA.length > 0) { drawSpacer(ctx, 4); drawDetAlerts(ctx, alertasQSA); }

  drawSpacer(ctx, 8);
  drawSectionTitle(ctx, "03", "CONTRATO SOCIAL");

  if (data.contrato?.temAlteracoes) {
    drawAlertDeduped(ctx, "Contrato Social com alterações societárias recentes — verificar impacto na estrutura de controle", "MODERADA");
  }

  if (data.contrato?.objetoSocial) {
    const lineH = 5; const paddingTop = 10; const paddingBot = 4;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.contrato.objetoSocial, contentW - 8) as string[];
    const boxH = paddingTop + lines.length * lineH + paddingBot;
    checkPageBreak(ctx, boxH + 4);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, contentW, boxH, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
    doc.text("OBJETO SOCIAL", margin + 4, pos.y + 5);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + paddingTop + 3 + i * lineH));
    pos.y += boxH + 4;
  }

  if (data.contrato?.administracao) {
    const lineH = 5; const paddingV = 6; const textMaxW = contentW - 8;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.contrato.administracao, textMaxW) as string[];
    const boxH = lines.length * lineH + paddingV * 2 + 6;
    checkPageBreak(ctx, Math.min(boxH + 4, 60));
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, contentW, boxH, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
    doc.text("ADMINISTRACAO E PODERES", margin + 4, pos.y + 5);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + paddingV + 5 + i * lineH));
    pos.y += boxH + 4;
  }

  // Field rows
  const drawFieldRow = (fields: Array<{ label: string; value: string }>) => {
    const validFields = fields.filter(f => f.value);
    if (validFields.length === 0) return;
    const fieldW = contentW / validFields.length - 2;
    const textMaxW = fieldW - 8;
    const lineH = 4.5;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const allLines = validFields.map(f => doc.splitTextToSize(f.value, textMaxW) as string[]);
    const maxLineCount = Math.max(...allLines.map(l => l.length));
    const boxH = Math.max(12, 6 + maxLineCount * lineH + 3);
    checkPageBreak(ctx, boxH + 2);
    let x = margin;
    validFields.forEach((field, idx) => {
      doc.setFillColor(...colors.surface);
      doc.roundedRect(x, pos.y, fieldW, boxH, 1, 1, "F");
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
      doc.text(field.label.toUpperCase(), x + 4, pos.y + 4.5);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
      allLines[idx].forEach((line: string, i: number) => doc.text(line, x + 4, pos.y + 9 + i * lineH));
      x += fieldW + 4;
    });
    pos.y += boxH + 2;
  };

  drawFieldRow([
    { label: "Capital Social", value: data.contrato?.capitalSocial || "" },
    { label: "Data de Constituicao", value: data.contrato?.dataConstituicao || "" },
  ]);
  drawFieldRow([
    { label: "Prazo de Duracao", value: data.contrato?.prazoDuracao || "" },
    { label: "Foro", value: data.contrato?.foro || "" },
  ]);

  // Gestão e Grupo Econômico
  drawSpacer(ctx, 6);
  if (pos.y > 215) { newPage(ctx); drawHeaderCompact(ctx); }
  drawSectionTitle(ctx, "04", "GESTAO E GRUPO ECONOMICO");

  // Tabela de Sócios
  {
    type SocioEntry = { nome: string; cpfCnpj: string; qualificacao: string; participacao: string };
    const sociosList: SocioEntry[] = (data.qsa?.quadroSocietario || []).map(s => ({
      nome: s.nome || "",
      cpfCnpj: s.cpfCnpj || "",
      qualificacao: s.qualificacao || "",
      participacao: s.participacao || "",
    }));
    if (sociosList.length === 0 && data.contrato?.socios) {
      data.contrato.socios.forEach(s => sociosList.push({ nome: s.nome || "", cpfCnpj: s.cpf || "", qualificacao: s.qualificacao || "", participacao: s.participacao || "" }));
    }

    if (sociosList.length > 0) {
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
      doc.text("QUADRO SOCIETÁRIO", margin, pos.y + 4);
      pos.y += 8;

      const gColNome = contentW * 0.24; const gColCpf = contentW * 0.15; const gColPart = contentW * 0.09;
      const gColScr = contentW * 0.13; const gColVenc = contentW * 0.10; const gColPrej = contentW * 0.10;
      const gColProt = contentW * 0.10; const gColProc = contentW * 0.09;
      const gRowH = 6.5;

      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(4.8); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      let gx = margin;
      doc.text("NOME / RAZÃO SOCIAL", gx + 2, pos.y + 4); gx += gColNome;
      doc.text("CPF/CNPJ", gx + 2, pos.y + 4); gx += gColCpf;
      doc.text("PART.", gx + gColPart - 1, pos.y + 4, { align: "right" }); gx += gColPart;
      doc.text("SCR TOTAL", gx + gColScr - 1, pos.y + 4, { align: "right" }); gx += gColScr;
      doc.text("VENCIDO", gx + gColVenc - 1, pos.y + 4, { align: "right" }); gx += gColVenc;
      doc.text("PREJUÍZO", gx + gColPrej - 1, pos.y + 4, { align: "right" }); gx += gColPrej;
      doc.text("PROT.", gx + gColProt - 1, pos.y + 4, { align: "right" }); gx += gColProt;
      doc.text("PROC.", gx + gColProc - 1, pos.y + 4, { align: "right" });
      pos.y += 6;

      const toAbbrev = (v: string | undefined) => {
        if (!v || v === "0,00" || v === "") return "—";
        const n = parseMoneyToNumber(v);
        if (n === 0) return "—";
        if (n >= 1000000) return fmtBR(n / 1000000, 1) + "M";
        if (n >= 1000) return fmtBR(Math.round(n / 1000), 0) + "K";
        return v;
      };

      sociosList.forEach((s, idx) => {
        if (pos.y + gRowH > DS.space.pageBreakY) { newPage(ctx); drawHeaderCompact(ctx); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, gRowH, "F");

        const scrSocio = data.scrSocios?.find(sc =>
          sc.cpfSocio === s.cpfCnpj || sc.nomeSocio?.toLowerCase() === s.nome.toLowerCase()
        );
        const scrTotal    = scrSocio?.periodoAtual?.totalDividasAtivas;
        const scrVencido  = scrSocio?.periodoAtual?.vencidos;
        const scrPrejuizo = scrSocio?.periodoAtual?.prejuizos;
        const hasVenc = scrVencido && scrVencido !== "0,00";
        const hasPrej = scrPrejuizo && scrPrejuizo !== "0,00";

        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        let gxR = margin;
        const nomeT = s.nome.length > 30 ? s.nome.substring(0, 29) + "…" : s.nome;
        doc.setTextColor(...colors.text);
        doc.text(nomeT, gxR + 2, pos.y + 4.5); gxR += gColNome;
        doc.setTextColor(...colors.textSec);
        doc.text(s.cpfCnpj || "—", gxR + 2, pos.y + 4.5); gxR += gColCpf;
        doc.setTextColor(...colors.text);
        doc.text(s.participacao || "—", gxR + gColPart - 1, pos.y + 4.5, { align: "right" }); gxR += gColPart;
        doc.text(toAbbrev(scrTotal), gxR + gColScr - 1, pos.y + 4.5, { align: "right" }); gxR += gColScr;
        doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrVencido), gxR + gColVenc - 1, pos.y + 4.5, { align: "right" }); gxR += gColVenc;
        doc.setTextColor(...(hasPrej ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrPrejuizo), gxR + gColPrej - 1, pos.y + 4.5, { align: "right" }); gxR += gColPrej;
        doc.setTextColor(...colors.textMuted);
        doc.text("—", gxR + gColProt - 1, pos.y + 4.5, { align: "right" }); gxR += gColProt;
        doc.text("—", gxR + gColProc - 1, pos.y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);
        pos.y += gRowH;
      });
      pos.y += 6;
    }
  }

  // Tabela Empresas Vinculadas
  {
    const empresasGrupo = data.grupoEconomico?.empresas || [];
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
    doc.text("EMPRESAS VINCULADAS (GRUPO ECONÔMICO)", margin, pos.y + 4);
    pos.y += 8;

    if (empresasGrupo.length === 0) {
      checkPageBreak(ctx, 10);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, pos.y, contentW, 8, "F");
      doc.setFontSize(6.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...colors.textMuted);
      doc.text("Nenhuma empresa vinculada identificada", margin + 4, pos.y + 5.5);
      pos.y += 10;
    } else {
      const geNome = contentW * 0.30; const geCnpj = contentW * 0.18; const geSit = contentW * 0.12;
      const geVia  = contentW * 0.22; const gePart = contentW * 0.10;
      const geRowH = 7;
      checkPageBreak(ctx, 6 + empresasGrupo.length * geRowH + 8);

      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      let ex = margin;
      doc.text("RAZÃO SOCIAL", ex + 2, pos.y + 4); ex += geNome;
      doc.text("CNPJ", ex + 2, pos.y + 4); ex += geCnpj;
      doc.text("SITUAÇÃO", ex + 2, pos.y + 4); ex += geSit;
      doc.text("VIA SÓCIO", ex + 2, pos.y + 4); ex += geVia;
      doc.text("PARTICIPAÇÃO", ex + gePart - 1, pos.y + 4, { align: "right" }); ex += gePart;
      doc.text("RELAÇÃO", margin + contentW - 1, pos.y + 4, { align: "right" });
      pos.y += 6;

      empresasGrupo.forEach((emp, idx) => {
        if (pos.y + geRowH > DS.space.pageBreakY) { newPage(ctx); drawHeaderCompact(ctx); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, geRowH, "F");

        let ex2 = margin;
        doc.setFontSize(4.8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.text);
        const nomeLines = doc.splitTextToSize(emp.razaoSocial || "—", geNome - 4) as string[];
        doc.text(nomeLines[0] + (nomeLines.length > 1 ? "…" : ""), ex2 + 2, pos.y + 4.5); ex2 += geNome;

        doc.setTextColor(...colors.textSec);
        doc.text(emp.cnpj || "—", ex2 + 2, pos.y + 4.5); ex2 += geCnpj;

        const sit = (emp.situacao || "—").toUpperCase();
        const sitColor: [number, number, number] = sit === "ATIVA" ? [22,163,74] : sit === "BAIXADA" ? [220,38,38] : [217,119,6];
        doc.setTextColor(...sitColor); doc.setFont("helvetica", "bold");
        doc.text(sit, ex2 + 2, pos.y + 4.5); ex2 += geSit;

        doc.setFont("helvetica", "normal"); doc.setFontSize(4.3); doc.setTextColor(...colors.textSec);
        const viaLines = doc.splitTextToSize(emp.socioOrigem || "—", geVia - 4) as string[];
        doc.text(viaLines[0] + (viaLines.length > 1 ? "…" : ""), ex2 + 2, pos.y + 4.5); ex2 += geVia;

        doc.setFontSize(4.8); doc.setTextColor(...colors.text);
        doc.text(emp.participacao || "—", ex2 + gePart - 1, pos.y + 4.5, { align: "right" }); ex2 += gePart;
        doc.setTextColor(...colors.textMuted);
        doc.text(emp.relacao || "—", margin + contentW - 1, pos.y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);
        pos.y += geRowH;
      });
      pos.y += 4;
    }

    // Parentesco alerts
    const geParentescos = data.grupoEconomico?.parentescosDetectados || [];
    geParentescos.forEach(pt => {
      drawAlertDeduped(ctx, `Possível parentesco entre sócios: ${pt.socio1} e ${pt.socio2}`, "MODERADA", `Sobrenome em comum: ${pt.sobrenomeComum}`);
    });
  }

  void autoT;
  void dsMiniHeader;
}
