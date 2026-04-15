/**
 * Seção 21 — RELATÓRIO DE VISITA + DADOS DA EMPRESA
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";

const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
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

const mo = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseMoneyToNumber(String(v));
  if (!isFinite(n) || n === 0) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}R$ ${fmtBR(a / 1_000_000, 2)}M`;
  if (a >= 1_000)     return `${s}R$ ${fmtBR(a / 1_000, 0)}k`;
  return `${s}R$ ${fmtBR(Math.round(a), 0)}`;
};

const tr = (s: string, n: number) => {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export function renderVisita(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;
  const rv = data.relatorioVisita;

  if (!rv || (
    !rv.dataVisita && !rv.responsavelVisita && !rv.descricaoEstrutura &&
    !rv.observacoesLivres &&
    (!rv.pontosPositivos || rv.pontosPositivos.length === 0) &&
    (!rv.pontosAtencao || rv.pontosAtencao.length === 0)
  )) {
    return;
  }

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
    doc.setFontSize(value.length > 14 ? 6.5 : 9);
    doc.setTextColor(...valColor);
    doc.text(value || "—", x + 4, y + 14);
  };

  stitle("23 · Relatório de Visita");

  // Header: 3 KPI cards
  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 2) / 3; const y0 = pos.y;
    const rec = rv.recomendacaoVisitante || "";
    const recAprov = /aprovado/i.test(rec);
    const recReprov = /reprovado/i.test(rec);
    const recBg: [number,number,number] = recAprov ? P.g0 : recReprov ? P.r0 : P.a0;
    const recBd: [number,number,number] = recAprov ? P.g1 : recReprov ? P.r1 : P.a1;
    const recFg: [number,number,number] = recAprov ? P.g6 : recReprov ? P.r6 : P.a5;
    const recLabel = rec.charAt(0).toUpperCase() + rec.slice(1) || "—";

    icell(ML,          y0, cw, CH, "Responsável",   tr(rv.responsavelVisita || "—", 20));
    icell(ML+cw+GAP,   y0, cw, CH, "Local",         tr(rv.localVisita || "—", 20));
    icell(ML+(cw+GAP)*2, y0, cw, CH, "Recomendação", recLabel, recBg, recBd, recFg);
    pos.y = y0 + CH + 5;
  }

  // 3 columns: Pontos positivos | Pontos de atenção | Contexto
  const positivos = rv.pontosPositivos || [];
  const atencao   = rv.pontosAtencao   || [];
  const contexto  = rv.observacoesLivres || rv.descricaoEstrutura || "";

  if (positivos.length > 0 || atencao.length > 0 || contexto) {
    const cols3w = (CW - GAP * 2) / 3;
    const rowH3 = 6.5;
    const maxRows = Math.max(positivos.length, atencao.length, contexto ? 4 : 0, 1);
    const HH = 9;
    const CARDH = HH + maxRows * rowH3 + 6;

    checkPageBreak(ctx, CARDH + 8);
    const y0 = pos.y;

    // Pontos positivos (verde)
    doc.setFillColor(...P.g0);
    doc.setDrawColor(...P.g1);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, cols3w, CARDH, 2, 2, "FD");
    doc.setFillColor(...P.g6);
    doc.roundedRect(ML, y0, cols3w, HH, 2, 2, "F");
    doc.rect(ML, y0+3, cols3w, HH-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("Pontos Positivos", ML + 4, y0 + 6.5);
    positivos.slice(0, 7).forEach((item, i) => {
      const iy = y0 + HH + i * rowH3;
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
      doc.setTextColor(...P.g6); doc.text("•", ML + 3, iy + 5);
      doc.setTextColor(...P.x7); doc.text(tr(item, 34), ML + 7, iy + 5);
    });

    // Pontos de atenção (âmbar)
    const ax = ML + cols3w + GAP;
    doc.setFillColor(...P.a0);
    doc.setDrawColor(...P.a1);
    doc.roundedRect(ax, y0, cols3w, CARDH, 2, 2, "FD");
    doc.setFillColor(...P.a5);
    doc.roundedRect(ax, y0, cols3w, HH, 2, 2, "F");
    doc.rect(ax, y0+3, cols3w, HH-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("Pontos de Atenção", ax + 4, y0 + 6.5);
    atencao.slice(0, 7).forEach((item, i) => {
      const iy = y0 + HH + i * rowH3;
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
      doc.setTextColor(...P.a5); doc.text("•", ax + 3, iy + 5);
      doc.setTextColor(...P.x7); doc.text(tr(item, 34), ax + 7, iy + 5);
    });

    // Contexto (cinza)
    const cx = ML + (cols3w + GAP) * 2;
    doc.setFillColor(...P.x0);
    doc.setDrawColor(...P.x1);
    doc.roundedRect(cx, y0, cols3w, CARDH, 2, 2, "FD");
    doc.setFillColor(...P.x5);
    doc.roundedRect(cx, y0, cols3w, HH, 2, 2, "F");
    doc.rect(cx, y0+3, cols3w, HH-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("Contexto", cx + 4, y0 + 6.5);
    if (contexto) {
      const ctxLines = doc.splitTextToSize(contexto, cols3w - 8) as string[];
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.x7);
      ctxLines.slice(0, 7).forEach((line, i) => {
        doc.text(line, cx + 4, y0 + HH + i * rowH3 + 5);
      });
    }

    pos.y = y0 + CARDH + 5;
  }

  // Dados da empresa
  stitle("Dados da Empresa");
  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
    const numFunc = rv.funcionariosObservados ? String(rv.funcionariosObservados) : "—";
    icell(ML,              y0, cw, CH, "Funcionários",     numFunc);
    icell(ML+cw+GAP,       y0, cw, CH, "Folha Pagamento",  mo(rv.folhaPagamento));
    icell(ML+(cw+GAP)*2,   y0, cw, CH, "Endiv. Banco",     mo(rv.endividamentoBanco));
    icell(ML+(cw+GAP)*3,   y0, cw, CH, "Endiv. FIDC",      mo(rv.endividamentoFactoring));
    pos.y = y0 + CH + GAP;
  }
  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
    icell(ML,              y0, cw, CH, "Vendas Duplicata", rv.vendasDuplicata ? rv.vendasDuplicata+"%" : "—");
    icell(ML+cw+GAP,       y0, cw, CH, "Vendas Outras",    rv.vendasOutras    ? rv.vendasOutras+"%" : "—");
    icell(ML+(cw+GAP)*2,   y0, cw, CH, "Prazo Faturam.",   rv.prazoMedioFaturamento ? rv.prazoMedioFaturamento+" dias" : "—");
    icell(ML+(cw+GAP)*3,   y0, cw, CH, "Prazo Entrega",    rv.prazoMedioEntrega ? rv.prazoMedioEntrega+" dias" : "—");
    pos.y = y0 + CH + 5;
  }
}
