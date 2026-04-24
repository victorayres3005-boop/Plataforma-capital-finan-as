/**
 * Seções 04+05 — PARÂMETROS OPERACIONAIS + CONFORMIDADE COM POLÍTICAS DO FUNDO
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";

// ── Paleta (mesma do sintese.ts) ─────────────────────────────────────────────
const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  a5:  [212, 149,  10] as [number,number,number],
  a1:  [253, 243, 215] as [number,number,number],
  a0:  [254, 249, 236] as [number,number,number],
  r6:  [197,  48,  48] as [number,number,number],
  r1:  [254, 226, 226] as [number,number,number],
  r0:  [254, 242, 242] as [number,number,number],
  g6:  [ 22, 101,  58] as [number,number,number],
  g1:  [209, 250, 229] as [number,number,number],
  g0:  [236, 253, 245] as [number,number,number],
  x9:  [ 17,  24,  39] as [number,number,number],
  x7:  [ 55,  65,  81] as [number,number,number],
  x5:  [107, 114, 128] as [number,number,number],
  x4:  [156, 163, 175] as [number,number,number],
  x2:  [229, 231, 235] as [number,number,number],
  x1:  [243, 244, 246] as [number,number,number],
  x0:  [249, 250, 251] as [number,number,number],
  wh:  [255, 255, 255] as [number,number,number],
};

export function renderConformidade(ctx: PdfCtx): void {
  if (!ctx.params.settings?.exibir_conformidade) return;
  const { doc, pos, params, data, margin: ML, contentW: CW } = ctx;
  const rv = data.relatorioVisita;
  const fv = params.fundValidation;

  const GAP = 3.5;

  const stitle = (label: string) => {
    const y = pos.y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...P.x5);
    const up = label.toUpperCase();
    doc.text(up, ML, y + 3);
    const tw = doc.getTextWidth(up);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.3);
    doc.line(ML + tw + 2.5, y + 2.5, ML + CW, y + 2.5);
    pos.y += 7;
  };

  const icell = (
    x: number, y: number, w: number, h: number,
    label: string, value: string,
    bg: [number,number,number] = P.x0,
    bd: [number,number,number] = P.x1,
    valColor: [number,number,number] = P.n9,
    sub?: string,
  ) => {
    doc.setFillColor(...bg);
    doc.setDrawColor(...bd);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(...P.x4);
    doc.text(label.toUpperCase(), x + 4, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(value.length > 12 ? 7 : 9);
    doc.setTextColor(...valColor);
    doc.text(value || "—", x + 4, y + 13);
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(...P.x5);
      doc.text(sub, x + 4, y + h - 2.5);
    }
  };

  const drawAlert = (
    y: number, sev: "alta" | "mod" | "info" | "ok",
    msg: string,
  ): number => {
    const bg: [number,number,number] = sev==="alta"?P.r0:sev==="mod"?P.a0:sev==="ok"?P.g0:P.n0;
    const bd: [number,number,number] = sev==="alta"?P.r1:sev==="mod"?P.a1:sev==="ok"?P.g1:P.n1;
    const fg: [number,number,number] = sev==="alta"?P.r6:sev==="mod"?P.a5:sev==="ok"?P.g6:P.n7;
    const tag = sev==="alta"?"ALTA":sev==="mod"?"MOD":sev==="ok"?"OK":"INFO";
    const lines = doc.splitTextToSize(msg, CW - 26) as string[];
    const H = Math.max(8, lines.length * 4.5 + 5);
    doc.setFillColor(...bg);
    doc.setDrawColor(...bd);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y, CW, H, 2, 2, "FD");
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...fg);
    doc.setFillColor(...bd);
    doc.roundedRect(ML + 3, y + (H-4.5)/2, doc.getTextWidth(tag)+4, 4.5, 1, 1, "F");
    doc.text(tag, ML + 5, y + H/2 + 1);
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...fg);
    doc.text(lines, ML + doc.getTextWidth(tag) + 10, y + H/2 - (lines.length-1)*2.25 + 1);
    return H + 2.5;
  };

  // ══════════════════════════════════════════════════════════════════════════════
  newPage(ctx);
  drawHeader(ctx);

  // ── SEÇÃO 04 — PARÂMETROS OPERACIONAIS ───────────────────────────────────
  checkPageBreak(ctx, 10);
  stitle("04 · Parâmetros Operacionais do Cedente");

  if (rv) {
    // Taxas e limites (row 1)
    checkPageBreak(ctx, 20);
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4;
      const mo = (v?: string) => {
        if (!v) return "—";
        const n = parseMoneyToNumber(v);
        if (!n) return "—";
        if (n >= 1_000_000) return `R$ ${fmtBR(n/1_000_000,2)}M`;
        if (n >= 1_000)     return `R$ ${fmtBR(n/1_000,0)}k`;
        return `R$ ${fmtBR(n,0)}`;
      };
      const y0 = pos.y;
      icell(ML,              y0, cw, CH, "Taxa Convencional", rv.taxaConvencional||"—", P.n0, P.n1, P.n9);
      icell(ML+cw+GAP,       y0, cw, CH, "Taxa Comissária",   rv.taxaComissaria||"—",   P.n0, P.n1, P.n9);
      icell(ML+(cw+GAP)*2,   y0, cw, CH, "Limite Total",       mo(rv.limiteTotal),        P.n0, P.n1, P.n9);
      icell(ML+(cw+GAP)*3,   y0, cw, CH, "Limite por Sacado",  mo(rv.limitePorSacado),    P.n0, P.n1, P.n9);
      pos.y = y0 + CH + GAP;
    }

    // Limites e tranche (row 2)
    checkPageBreak(ctx, 20);
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4;
      const y0 = pos.y;
      const moLim = (v?: string) => {
        if (!v) return "—";
        const n = parseMoneyToNumber(v);
        if (!n) return "—";
        if (n >= 1_000_000) return `R$ ${fmtBR(n/1_000_000,2)}M`;
        if (n >= 1_000)     return `R$ ${fmtBR(n/1_000,0)}k`;
        return `R$ ${fmtBR(n,0)}`;
      };
      const lcConvStr      = moLim(rv.limiteConvencional);
      const comissariaStr  = !rv.limiteComissaria || moLim(rv.limiteComissaria) === "—"
        ? "Não se aplica"
        : moLim(rv.limiteComissaria);
      const trancheLGStr   = moLim(rv.tranche);
      const trancheChecStr = rv.trancheChecagem || "—";
      icell(ML,              y0, cw, CH, "Limite Convencional", lcConvStr,      P.n0, P.n1, lcConvStr      === "—"            ? P.x4 : P.n9);
      icell(ML+cw+GAP,       y0, cw, CH, "Limite Comissária",   comissariaStr,  P.n0, P.n1, comissariaStr  === "Não se aplica" ? P.x4 : P.n9);
      icell(ML+(cw+GAP)*2,   y0, cw, CH, "Tranche LG",          trancheLGStr,   P.n0, P.n1, trancheLGStr   === "—"            ? P.x4 : P.n9);
      icell(ML+(cw+GAP)*3,   y0, cw, CH, "Tranche Checagem",    trancheChecStr, P.n0, P.n1, trancheChecStr === "—"            ? P.x4 : P.n9);
      pos.y = y0 + CH + GAP;
    }

    // Taxas e limites (row 3)
    checkPageBreak(ctx, 20);
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4;
      const y0 = pos.y;
      const mo = (v?: string) => {
        if (!v) return "—";
        const n = parseMoneyToNumber(v);
        if (!n) return "—";
        if (n >= 1_000_000) return `R$ ${fmtBR(n/1_000_000,2)}M`;
        if (n >= 1_000)     return `R$ ${fmtBR(n/1_000,0)}k`;
        return `R$ ${fmtBR(n,0)}`;
      };
      icell(ML,              y0, cw, CH, "Ticket Médio",    mo(rv.ticketMedio),       P.n0, P.n1, P.n9);
      icell(ML+cw+GAP,       y0, cw, CH, "Cobr. Boleto",   rv.valorCobrancaBoleto||"—", P.n0, P.n1, P.n9);
      const mod = (rv.modalidade||"").replace(/_/g," ").toUpperCase();
      icell(ML+(cw+GAP)*2,   y0, cw, CH, "Modalidade",     mod||"—",                 P.n0, P.n1, P.n9);
      icell(ML+(cw+GAP)*3,   y0, cw, CH, "Prazo Máximo",   rv.prazoMaximoOp ? rv.prazoMaximoOp+" dias" : "—", P.n0, P.n1, P.n9);
      pos.y = y0 + CH + 5;
    }

    // Condições
    checkPageBreak(ctx, 25);
    stitle("Condições");
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4;
      const y0 = pos.y;
      icell(ML,              y0, cw, CH, "Prazo Recompra",  rv.prazoRecompraCedente||"—");
      icell(ML+cw+GAP,       y0, cw, CH, "Envio Cartório",  rv.prazoEnvioCartorio||"—");
      icell(ML+(cw+GAP)*2,   y0, cw, CH, "Cobrança TAC",    rv.cobrancaTAC||"—");
      icell(ML+(cw+GAP)*3,   y0, cw, CH, "Tranche",         rv.tranche||"—");
      pos.y = y0 + CH + 5;
    }

    // ── Row 4 — Parâmetros Calculados (Score V2) ─────────────────────────────
    const lc = params.creditLimit;
    if (lc) {
      checkPageBreak(ctx, 30);

      // Separador "Score V2"
      {
        const sy = pos.y;
        const label = "Score V2";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(...P.x4);
        doc.text(label.toUpperCase(), ML, sy + 3);
        const tw = doc.getTextWidth(label.toUpperCase());
        doc.setDrawColor(...P.x2);
        doc.setLineWidth(0.2);
        doc.line(ML + tw + 2.5, sy + 2.5, ML + CW, sy + 2.5);
        pos.y += 6;
      }

      // Células coloridas por rating
      checkPageBreak(ctx, 20);
      {
        const CH = 18; const cw = (CW - GAP * 3) / 4;
        const rating  = lc.ratingV2 ?? "";
        const naoOpera = rating === "F" || (lc.taxaSugerida ?? 0) === 0;
        const bom      = rating === "A" || rating === "B";
        const bg: [number,number,number] = naoOpera ? P.r0 : bom ? P.g0 : P.n0;
        const bd: [number,number,number] = naoOpera ? P.r1 : bom ? P.g1 : P.n1;
        const vc: [number,number,number] = naoOpera ? P.r6 : bom ? P.g6 : P.n9;

        const taxaStr   = naoOpera
          ? "Não opera"
          : `${(lc.taxaSugerida ?? 0).toFixed(2).replace(".", ",")}% a.m.`;
        const limiteStr = lc.limiteAjustado > 0
          ? `R$ ${lc.limiteAjustado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "—";
        const prazoStr  = lc.prazo > 0 ? `${lc.prazo} dias` : "—";
        const revisaoStr = lc.revisaoDias > 0
          ? `${lc.revisaoDias} dias (Rating ${rating || "—"})`
          : "—";

        const y0 = pos.y;
        icell(ML,            y0, cw, CH, "Taxa Sugerida",   taxaStr,    bg, bd, vc);
        icell(ML+cw+GAP,     y0, cw, CH, "Limite Sugerido", limiteStr,  bg, bd, vc);
        icell(ML+(cw+GAP)*2, y0, cw, CH, "Prazo Máximo",    prazoStr,   bg, bd, vc);
        icell(ML+(cw+GAP)*3, y0, cw, CH, "Revisão",         revisaoStr, bg, bd, vc);
        pos.y = y0 + CH + 5;
      }
    }
  } else {
    checkPageBreak(ctx, 14);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...P.x4);
    doc.text("Parâmetros operacionais não informados (relatório de visita não disponível).", ML, pos.y + 5);
    pos.y += 12;
  }

  // ── SEÇÃO 05 — CONFORMIDADE COM POLÍTICAS DO FUNDO ───────────────────────
  checkPageBreak(ctx, 14);
  pos.y += 4;
  stitle("05 · Conformidade com Políticas do Fundo");

  if (fv && fv.criteria.length > 0) {
    const ROW_H = 14;
    const criteria = fv.criteria;

    criteria.forEach((c, i) => {
      checkPageBreak(ctx, ROW_H + 4);
      const y0 = pos.y;
      const pass = c.status === "ok";
      const warn = c.status === "warning";
      const fail = c.status === "error";

      // Row bg
      if (i % 2 === 0) {
        doc.setFillColor(...P.x0);
        doc.rect(ML, y0, CW, ROW_H, "F");
      }
      doc.setDrawColor(...P.x2);
      doc.setLineWidth(0.15);
      doc.line(ML, y0 + ROW_H, ML + CW, y0 + ROW_H);

      // Icon
      const iconBg: [number,number,number] = pass ? P.g1 : fail ? P.r1 : P.a1;
      const iconFg: [number,number,number] = pass ? P.g6 : fail ? P.r6 : P.a5;
      doc.setFillColor(...iconBg);
      doc.circle(ML + 6, y0 + ROW_H / 2, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...iconFg);
      doc.text(pass ? "✓" : fail ? "✗" : "!", ML + 6, y0 + ROW_H / 2 + 1.5, { align: "center" });

      // Label
      doc.setFont("helvetica", pass ? "normal" : "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...P.x9);
      const labelText = c.label;
      const lw = doc.getTextWidth(labelText);
      doc.text(labelText, ML + 13, y0 + ROW_H / 2 + 1.5);

      // Eliminatória tag
      if (c.eliminatoria && fail) {
        const tx = ML + 13 + lw + 2;
        doc.setFillColor(...P.r1);
        doc.roundedRect(tx, y0 + ROW_H/2 - 2.5, 28, 5, 1, 1, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...P.r6);
        doc.text("ELIMINATÓRIO", tx + 14, y0 + ROW_H/2 + 1, { align: "center" });
      }

      // Limit column (right-aligned at 65% of content width)
      const limX = ML + CW * 0.62;
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
      doc.text("Limite", limX, y0 + 4.5);
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(c.threshold, limX, y0 + ROW_H - 3);

      // Actual column
      const actX = ML + CW * 0.82;
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
      doc.text("Apurado", actX, y0 + 4.5);
      const actFg: [number,number,number] = pass ? P.g6 : fail ? P.r6 : warn ? P.a5 : P.x7;
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...actFg);
      doc.text(c.actual, actX, y0 + ROW_H - 3);

      // Detail note
      if (c.detail && fail) {
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.r6);
        doc.text(c.detail, actX, y0 + ROW_H - 0.5);
      }

      pos.y = y0 + ROW_H;
    });

    pos.y += 5;

    // Verdict box
    checkPageBreak(ctx, 22);
    const total = criteria.length;
    const failCount = fv.failCount;
    const passCount = fv.passCount;
    const hasElim = fv.hasEliminatoria;
    const eligible = failCount === 0;
    const boxBg: [number,number,number] = eligible ? P.g0 : P.r0;
    const boxBd: [number,number,number] = eligible ? P.g1 : P.r1;
    const boxFg: [number,number,number] = eligible ? P.g6 : P.r6;

    doc.setFillColor(...boxBg);
    doc.setDrawColor(...boxBd);
    doc.setLineWidth(0.35);
    doc.roundedRect(ML, pos.y, CW, 18, 3, 3, "FD");

    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...P.x9);
    const verdict = eligible ? "Empresa elegível — todos os critérios atendidos" : hasElim ? "Empresa não elegível — critério eliminatório" : `Empresa não elegível — ${failCount} critério(s) reprovado(s)`;
    doc.text(verdict, ML + 6, pos.y + 7);

    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x5);
    doc.text(`${passCount} de ${total} critérios aprovados${failCount > 0 ? ` · ${failCount} reprovado(s)` : ""}`, ML + 6, pos.y + 13);

    // Badge
    const bw = 48;
    const bx = ML + CW - bw - 4;
    const eligLabel = eligible ? "ELEGÍVEL" : "NÃO ELEGÍVEL";
    doc.setFillColor(...boxFg);
    doc.roundedRect(bx, pos.y + 4.5, bw, 9, 2, 2, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...P.wh);
    doc.text(eligLabel, bx + bw/2, pos.y + 10.5, { align: "center" });

    pos.y += 23;
  } else {
    // No fund validation — show placeholder
    checkPageBreak(ctx, 18);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...P.x4);
    doc.text("Validação de política do fundo não disponível.", ML, pos.y + 5);
    pos.y += 12;
  }

  void drawAlert;
}
