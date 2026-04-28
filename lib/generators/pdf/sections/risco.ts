/**
 * Seções 07+08 — PROTESTOS · PROCESSOS JUDICIAIS
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";

// ── Paleta ────────────────────────────────────────────────────────────────────
const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
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

export function renderRisco(ctx: PdfCtx): void {
  const { doc, pos, params, data, margin: ML, contentW: CW } = ctx;
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
    doc.setFontSize(value.length > 10 ? 7 : 10);
    doc.setTextColor(...valColor);
    doc.text(value || "—", x + 4, y + 14);
  };

  const alertRow = (sev: "alta"|"mod"|"info"|"ok", msg: string) => {
    const bg: [number,number,number] = sev==="alta"?P.r0:sev==="mod"?P.a0:sev==="ok"?P.g0:P.n0;
    const bd: [number,number,number] = sev==="alta"?P.r1:sev==="mod"?P.a1:sev==="ok"?P.g1:P.n1;
    const fg: [number,number,number] = sev==="alta"?P.r6:sev==="mod"?P.a5:sev==="ok"?P.g6:P.n7;
    const tag = sev==="alta"?"ALTA":sev==="mod"?"MOD":sev==="ok"?"OK":"INFO";
    const lines = doc.splitTextToSize(msg, CW - 26) as string[];
    const H = Math.max(8, lines.length * 4.5 + 5);
    checkPageBreak(ctx, H + 2);
    doc.setFillColor(...bg);
    doc.setDrawColor(...bd);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, pos.y, CW, H, 2, 2, "FD");
    const tw = doc.getTextWidth(tag);
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...fg);
    doc.setFillColor(...bd);
    doc.roundedRect(ML + 3, pos.y + (H-4.5)/2, tw+4, 4.5, 1, 1, "F");
    doc.text(tag, ML + 5, pos.y + H/2 + 1);
    doc.setFont("helvetica","normal"); doc.setFontSize(7);
    doc.text(lines, ML + tw + 10, pos.y + H/2 - (lines.length-1)*2.25 + 1);
    pos.y += H + 2.5;
  };

  const tableHeader = (y0: number, cols: {label:string;x:number;align:"left"|"right"}[], HH=9) => {
    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
    doc.rect(ML, y0 + 3, CW, HH - 3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    cols.forEach(c => {
      if (c.align === "right") {
        doc.text(c.label, ML + c.x, y0 + 6.5, { align: "right" });
      } else {
        doc.text(c.label, ML + c.x, y0 + 6.5);
      }
    });
  };

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 07 — PROTESTOS
  // ════════════════════════════════════════════════════════════════════════════
  newPage(ctx);
  drawHeader(ctx);
  stitle("07 · Protestos");

  const protestos = data.protestos;
  const vigQtd = parseInt(protestos?.vigentesQtd || "0") || params.protestosVigentes || 0;
  const regQtd = parseInt(protestos?.regularizadosQtd || "0") || 0;
  const vigValN = parseMoneyToNumber(protestos?.vigentesValor || "0");
  const regValN = parseMoneyToNumber(protestos?.regularizadosValor || "0");
  const fiscQtd = parseInt(protestos?.fiscaisQtd || "0") || 0;
  const fiscValN = parseMoneyToNumber(protestos?.fiscaisValor || "0");
  const pefin = data.pefin;
  const refin = data.refin;
  const pefinQtd = pefin?.qtd ?? 0;
  const refinQtd = refin?.qtd ?? 0;
  const pefinValN = pefin?.valor ?? 0;
  const refinValN = refin?.valor ?? 0;

  // KPI cards — linha 1: cartório
  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
    icell(ML,              y0, cw, CH, "Vigentes",         String(vigQtd),  vigQtd>0?P.r0:P.g0, vigQtd>0?P.r1:P.g1, vigQtd>0?P.r6:P.g6);
    icell(ML+cw+GAP,       y0, cw, CH, "Vigentes R$",      mo(vigValN),     vigQtd>0?P.r0:P.g0, vigQtd>0?P.r1:P.g1, vigQtd>0?P.r6:P.x4);
    icell(ML+(cw+GAP)*2,   y0, cw, CH, "Regularizados",    String(regQtd),  regQtd>0?P.g0:P.x0, regQtd>0?P.g1:P.x1, regQtd>0?P.g6:P.x4);
    icell(ML+(cw+GAP)*3,   y0, cw, CH, "Regularizados R$", mo(regValN),     P.x0, P.x1, regValN>0?P.g6:P.x4);
    pos.y = y0 + CH + 4;
  }

  // KPI cards — linha 2: fiscais + PEFIN + REFIN (só aparece quando há dados)
  if (fiscQtd > 0 || pefinQtd > 0 || refinQtd > 0) {
    checkPageBreak(ctx, 22);
    const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
    icell(ML,              y0, cw, CH, "Fiscais/Impostos", fiscQtd > 0 ? String(fiscQtd) : "—", fiscQtd>0?P.a0:P.x0, fiscQtd>0?P.a1:P.x1, fiscQtd>0?P.a5:P.x4);
    icell(ML+cw+GAP,       y0, cw, CH, "Fiscais R$",       fiscQtd > 0 ? mo(fiscValN) : "—",   fiscQtd>0?P.a0:P.x0, fiscQtd>0?P.a1:P.x1, fiscQtd>0?P.a5:P.x4);
    icell(ML+(cw+GAP)*2,   y0, cw, CH, "PEFIN (SPC)",      pefinQtd > 0 ? String(pefinQtd) : "—", pefinQtd>0?P.r0:P.x0, pefinQtd>0?P.r1:P.x1, pefinQtd>0?P.r6:P.x4);
    icell(ML+(cw+GAP)*3,   y0, cw, CH, "REFIN (Serasa)",   refinQtd > 0 ? String(refinQtd) : "—", refinQtd>0?P.r0:P.x0, refinQtd>0?P.r1:P.x1, refinQtd>0?P.r6:P.x4);
    pos.y = y0 + CH + 5;
  } else {
    pos.y += 1;
  }

  // Group by creditor table
  if (protestos?.detalhes && protestos.detalhes.length > 0) {
    // Build creditor map
    const credMap = new Map<string, {qtd:number; valor:number; ultimo:string}>();
    protestos.detalhes.forEach(p => {
      if (p.regularizado) return;
      const k = (p.credor || p.apresentante || "Desconhecido").trim();
      const e = credMap.get(k) || { qtd: 0, valor: 0, ultimo: "" };
      const vn = parseMoneyToNumber(p.valor || "0");
      const dt = p.data || "";
      credMap.set(k, {
        qtd: e.qtd + 1,
        valor: e.valor + vn,
        ultimo: dt > e.ultimo ? dt : e.ultimo,
      });
    });
    const credList = Array.from(credMap.entries())
      .sort((a, b) => b[1].valor - a[1].valor)
      .slice(0, 8);

    if (credList.length > 0) {
      const RH = 9; const HH = 9;
      const TH = HH + credList.length * RH + 2;
      checkPageBreak(ctx, 7 + TH + 4);
      stitle("Agrupamento por credor");
      const cols = [
        { label: "Credor",       x: 4,         align: "left" as const },
        { label: "Qtd",          x: CW*0.67,   align: "right" as const },
        { label: "Valor Total",  x: CW*0.83,   align: "right" as const },
        { label: "Último",       x: CW - 2,    align: "right" as const },
      ];
      const y0 = pos.y;

      doc.setFillColor(...P.wh);
      doc.setDrawColor(...P.x2);
      doc.setLineWidth(0.25);
      doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
      tableHeader(y0, cols, HH);

      credList.forEach(([name, info], i) => {
        const ry = y0 + HH + i * RH;
        if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        doc.text(tr(name, 36), ML + 4, ry + 6.5);
        doc.setFont("helvetica","normal"); doc.setFontSize(7);
        doc.text(String(info.qtd), ML + CW*0.67, ry + 6.5, { align: "right" });
        doc.setTextColor(...(info.valor > 0 ? P.r6 : P.x4));
        doc.setFont("helvetica","bold");
        doc.text(mo(info.valor), ML + CW*0.83, ry + 6.5, { align: "right" });
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
        doc.text(info.ultimo || "—", ML + CW - 2, ry + 6.5, { align: "right" });
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
      });

      pos.y = y0 + TH + 5;
    }

    // Top 5 by value
    const sorted = [...protestos.detalhes].filter(p => !p.regularizado).sort((a, b) => parseMoneyToNumber(b.valor||"0") - parseMoneyToNumber(a.valor||"0")).slice(0, 5);
    if (sorted.length > 0) {
      const RH = 9; const HH = 9;
      const TH = HH + sorted.length * RH + 2;
      checkPageBreak(ctx, 7 + TH + 4);
      stitle("Top 5 por valor");
      const cols = [
        { label: "Data",    x: 4,         align: "left" as const },
        { label: "Credor",  x: CW*0.18,   align: "left" as const },
        { label: "Valor",   x: CW*0.78,   align: "right" as const },
        { label: "Status",  x: CW - 2,    align: "right" as const },
      ];
      const y0 = pos.y;

      doc.setFillColor(...P.wh);
      doc.setDrawColor(...P.x2);
      doc.setLineWidth(0.25);
      doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
      tableHeader(y0, cols, HH);

      sorted.forEach((p, i) => {
        const ry = y0 + HH + i * RH;
        if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        doc.text(p.data || "—", ML + 4, ry + 6.5);
        doc.text(tr(p.credor || p.apresentante || "—", 32), ML + CW*0.18, ry + 6.5);
        doc.setTextColor(...P.r6); doc.setFont("helvetica","bold");
        doc.text(mo(p.valor), ML + CW*0.78, ry + 6.5, { align: "right" });
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
        doc.text("Vigente", ML + CW - 2, ry + 6.5, { align: "right" });
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
      });

      pos.y = y0 + TH + 5;
    }
  }

  // Protestos alerts
  if (vigQtd > 0) {
    const fmm12m = (() => {
      const last12 = (data.faturamento?.meses || []).slice(-12);
      const f = data.faturamento?.fmm12m ? parseMoneyToNumber(data.faturamento.fmm12m) : 0;
      if (f > 0) return f;
      const s = last12.reduce((acc, m) => acc + parseMoneyToNumber(m.valor||"0"), 0);
      return last12.length > 0 ? s / last12.length : 0;
    })();
    const pctFMM = fmm12m > 0 ? (vigValN / fmm12m * 100) : 0;
    alertRow("alta", `${vigQtd} protesto(s) vigente(s) — ${mo(vigValN)}${pctFMM > 0 ? ` (${fmtBR(pctFMM,0)}% do FMM)` : ""}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 08 — PROCESSOS JUDICIAIS
  // ════════════════════════════════════════════════════════════════════════════
  checkPageBreak(ctx, 14);
  pos.y += 4;
  stitle("08 · Processos Judiciais");

  const processos = data.processos;
  const passivo = parseInt(processos?.poloPassivoQtd || processos?.passivosTotal || "0") || 0;
  const ativo   = parseInt(processos?.poloAtivoQtd   || processos?.ativosTotal   || "0") || 0;
  const total   = passivo + ativo;
  const temFal  = processos?.temFalencia || processos?.temRJ;

  // KPI cards — linha 1: visão polo
  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
    icell(ML,              y0, cw, CH, "Total",         String(total),   total>0?P.r0:P.g0, total>0?P.r1:P.g1, total>0?P.r6:P.g6);
    icell(ML+cw+GAP,       y0, cw, CH, "Polo Passivo",  String(passivo), passivo>0?P.r0:P.g0, passivo>0?P.r1:P.g1, passivo>0?P.r6:P.g6);
    icell(ML+(cw+GAP)*2,   y0, cw, CH, "Polo Ativo",    String(ativo),   P.x0, P.x1, P.x7);
    icell(ML+(cw+GAP)*3,   y0, cw, CH, "Falência/RJ",   temFal ? "Sim" : "Não", temFal?P.r0:P.g0, temFal?P.r1:P.g1, temFal?P.r6:P.g6);
    pos.y = y0 + CH + 5;
  }

  // KPI cards — linha 2: distribuição por status (só aparece quando há dados)
  const arquivados   = parseInt(processos?.arquivadosQtd   || "0") || 0;
  const interrompidos = parseInt(processos?.interrompidosQtd || "0") || 0;
  const andamento    = parseInt(processos?.ativosTotal      || "0") || 0;
  if (arquivados > 0 || interrompidos > 0) {
    checkPageBreak(ctx, 22);
    const CH2 = 16; const cw2 = (CW - GAP * 3) / 4; const y0 = pos.y;
    icell(ML,              y0, cw2, CH2, "Em Andamento",  String(andamento),    P.x0, P.x1, P.x7);
    icell(ML+cw2+GAP,      y0, cw2, CH2, "Arquivados",    String(arquivados),   P.x0, P.x1, P.x5);
    icell(ML+(cw2+GAP)*2,  y0, cw2, CH2, "Interrompidos", String(interrompidos), P.a0, P.a1, P.a5);
    icell(ML+(cw2+GAP)*3,  y0, cw2, CH2, "Outros",        String(Math.max(0, total - andamento - arquivados - interrompidos)), P.x0, P.x1, P.x5);
    pos.y = y0 + CH2 + 5;
  }

  // Distribution by type (prop bars)
  const dist = processos?.distribuicao || [];
  if (dist.length > 0) {
    checkPageBreak(ctx, 18); // stitle(7)+primeira linha(9)+buffer(2)
    stitle("Distribuição por tipo");
    const maxDist = Math.max(...dist.map(d => parseInt(d.qtd || "0") || 0), 1);
    dist.forEach(d => {
      const qtd = parseInt(d.qtd || "0") || 0;
      const barW = Math.max(qtd / maxDist * (CW * 0.55), 1);
      checkPageBreak(ctx, 9);
      const y0 = pos.y;
      const isDanger = /fiscal|execu|sefaz|pgfn/i.test(d.tipo);
      const barC: [number,number,number] = isDanger ? P.r6 : P.n8;
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(tr(d.tipo || "Outros", 28), ML, y0 + 6);
      doc.setFillColor(...barC);
      doc.roundedRect(ML + CW * 0.42, y0 + 1.5, barW, 5, 1, 1, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x5);
      doc.text(`${qtd} (${d.pct || "0"}%)`, ML + CW * 0.42 + barW + 3, y0 + 6);
      pos.y = y0 + 9;
    });
    pos.y += 3;
  }

  // Top 10 recentes
  const top10 = processos?.top10Recentes || [];
  if (top10.length > 0) {
    const shown = top10.slice(0, 5);
    const RH = 9; const HH = 9;
    const TH = HH + shown.length * RH + 2;
    checkPageBreak(ctx, 7 + TH + 4);
    stitle("Top 5 mais recentes");
    const cols = [
      { label: "Tipo",     x: 4,         align: "left" as const },
      { label: "Data",     x: CW*0.42,   align: "left" as const },
      { label: "Assunto",  x: CW*0.59,   align: "left" as const },
      { label: "Fase",     x: CW - 2,    align: "right" as const },
    ];
    const y0 = pos.y;

    doc.setFillColor(...P.wh);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
    tableHeader(y0, cols, HH);

    shown.forEach((p, i) => {
      const ry = y0 + HH + i * RH;
      if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
      const isFisc = /fiscal|fazenda|sefaz|pgfn/i.test((p.tipo||"")+(p.assunto||""));
      const typeFg: [number,number,number] = isFisc ? P.r6 : P.x7;
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...typeFg);
      doc.text(tr(p.tipo || p.assunto || "—", 22), ML + 4, ry + 6.5);
      doc.setFont("helvetica","normal"); doc.setTextColor(...P.x7);
      doc.text(p.data || "—", ML + CW*0.42, ry + 6.5);
      doc.text(tr(p.assunto || "—", 18), ML + CW*0.59, ry + 6.5);
      doc.setTextColor(...P.x5);
      doc.text(tr(p.fase || "—", 10), ML + CW - 2, ry + 6.5, { align: "right" });
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
    });

    pos.y = y0 + TH + 5;
  }

  // Top 10 por valor
  const top10Valor = processos?.top10Valor || [];
  if (top10Valor.length > 0) {
    const hasNonZero = top10Valor.some(p => parseMoneyToNumber(p.valor || "0") > 0);
    if (hasNonZero) {
      const shown = top10Valor.slice(0, 10);
      const RH = 9; const HH = 9;
      const TH = HH + shown.length * RH + 2;
      checkPageBreak(ctx, 7 + TH + 4);
      stitle("Top 10 por valor");
      const cols = [
        { label: "Tipo",        x: 4,         align: "left" as const },
        { label: "Contraparte", x: CW * 0.34, align: "left" as const },
        { label: "Data",        x: CW * 0.63, align: "left" as const },
        { label: "Valor",       x: CW * 0.82, align: "right" as const },
        { label: "Fase",        x: CW - 2,    align: "right" as const },
      ];
      const y0 = pos.y;
      doc.setFillColor(...P.wh);
      doc.setDrawColor(...P.x2);
      doc.setLineWidth(0.25);
      doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
      tableHeader(y0, cols, HH);
      shown.forEach((p, i) => {
        const ry = y0 + HH + i * RH;
        if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
        const isFisc = /fiscal|fazenda|sefaz|pgfn/i.test((p.tipo||"")+(p.assunto||""));
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...(isFisc ? P.r6 : P.x7));
        doc.text(tr(p.tipo || "—", 17), ML + 4, ry + 6.5);
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x7);
        doc.text(tr(p.partes || "—", 16), ML + CW * 0.34, ry + 6.5);
        doc.text(p.data || "—", ML + CW * 0.63, ry + 6.5);
        doc.setTextColor(...P.r6); doc.setFont("helvetica","bold");
        doc.text(mo(p.valor), ML + CW * 0.82, ry + 6.5, { align: "right" });
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
        doc.text(tr(p.fase || "—", 10), ML + CW - 2, ry + 6.5, { align: "right" });
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
      });
      pos.y = y0 + TH + 5;
    }
  }

  // Distribuição temporal
  const distTemporal = processos?.distribuicaoTemporal || [];
  if (distTemporal.length > 0) {
    const RH = 8; const HH = 9;
    const TH = HH + distTemporal.length * RH + 2;
    checkPageBreak(ctx, 7 + TH + 4);
    stitle("Distribuição temporal");
    const cols = [
      { label: "Período",    x: 4,         align: "left" as const },
      { label: "Qtd",        x: CW * 0.60, align: "right" as const },
      { label: "Valor Est.", x: CW - 2,    align: "right" as const },
    ];
    const y0 = pos.y;
    doc.setFillColor(...P.wh);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
    tableHeader(y0, cols, HH);
    distTemporal.forEach((d, i) => {
      const ry = y0 + HH + i * RH;
      if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(tr(d.periodo || "—", 28), ML + 4, ry + 5.5);
      doc.setFont("helvetica","normal");
      doc.text(d.qtd || "—", ML + CW * 0.60, ry + 5.5, { align: "right" });
      doc.setTextColor(...P.x5);
      doc.text(mo(d.valor), ML + CW - 2, ry + 5.5, { align: "right" });
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
    });
    pos.y = y0 + TH + 5;
  }

  // Distribuição por faixa de valor
  const distFaixa = processos?.distribuicaoPorFaixa || [];
  if (distFaixa.length > 0) {
    checkPageBreak(ctx, 18); // stitle(7)+primeira linha(9)+buffer(2)
    stitle("Distribuição por faixa de valor");
    const maxPct = Math.max(...distFaixa.map(d => parseFloat(d.pct || "0") || 0), 1);
    distFaixa.forEach(d => {
      const pct = parseFloat(d.pct || "0") || 0;
      const barW = Math.max(pct / maxPct * (CW * 0.38), 1);
      checkPageBreak(ctx, 9);
      const y0 = pos.y;
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(tr(d.faixa || "—", 20), ML, y0 + 6);
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
      doc.text(mo(d.valor), ML + CW * 0.36, y0 + 6, { align: "right" });
      doc.setFillColor(...P.n8);
      doc.roundedRect(ML + CW * 0.39, y0 + 1.5, barW, 5, 1, 1, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x5);
      doc.text(`${d.qtd || "0"} (${d.pct || "0"}%)`, ML + CW * 0.39 + barW + 3, y0 + 6);
      pos.y = y0 + 9;
    });
    pos.y += 3;
  }

  // Processos alerts
  const execFiscQtd = dist.filter(d => /fiscal|fazenda|sefaz/i.test(d.tipo)).reduce((s,d) => s + (parseInt(d.qtd)||0), 0);
  if (execFiscQtd > 0) alertRow("alta", `${execFiscQtd} Execução(ões) Fiscal(is) ativa(s) — risco de bloqueio de bens`);
  if (temFal) alertRow("alta", "Pedido de falência ou recuperação judicial identificado");
  if (passivo > 15) alertRow("mod", `${passivo} processos no polo passivo — acima do limite recomendado (15)`);

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 09 — CCF (CHEQUES SEM FUNDO)
  // ════════════════════════════════════════════════════════════════════════════
  const ccf = data.ccf;
  if (ccf != null) {
    checkPageBreak(ctx, 14);
    pos.y += 4;
    stitle("09 · CCF — Cheques Sem Fundo");

    const ccfQtd = ccf.qtdRegistros ?? 0;

    // KPI card
    checkPageBreak(ctx, 22);
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
      icell(ML, y0, cw, CH, "Registros CCF", String(ccfQtd),
        ccfQtd > 0 ? P.r0 : P.g0,
        ccfQtd > 0 ? P.r1 : P.g1,
        ccfQtd > 0 ? P.r6 : P.g6,
      );
      if (ccf.tendenciaLabel) {
        const tendLabel = ccf.tendenciaLabel.toLowerCase();
        const tBg: [number,number,number] = tendLabel === "crescimento" ? P.r0 : tendLabel === "queda" ? P.g0 : P.x0;
        const tBd: [number,number,number] = tendLabel === "crescimento" ? P.r1 : tendLabel === "queda" ? P.g1 : P.x1;
        const tFg: [number,number,number] = tendLabel === "crescimento" ? P.r6 : tendLabel === "queda" ? P.g6 : P.x5;
        const tendStr = tendLabel.charAt(0).toUpperCase() + tendLabel.slice(1);
        const varStr = ccf.tendenciaVariacao != null ? ` (${ccf.tendenciaVariacao > 0 ? "+" : ""}${fmtBR(ccf.tendenciaVariacao, 0)}%)` : "";
        icell(ML + cw + GAP, y0, cw * 1.5, CH, "Tendência 6 meses", tendStr + varStr, tBg, tBd, tFg);
      }
      pos.y = y0 + CH + 5;
    }

    // Tabela de bancos
    const bancos = ccf.bancos || [];
    if (bancos.length > 0) {
      const RH = 9; const HH = 9;
      const TH = HH + bancos.length * RH + 2;
      checkPageBreak(ctx, 7 + TH + 4);
      stitle("Registros por banco");
      const cols = [
        { label: "Banco",    x: 4,         align: "left" as const },
        { label: "Agência",  x: CW * 0.44, align: "left" as const },
        { label: "Qtd",      x: CW * 0.60, align: "right" as const },
        { label: "Último",   x: CW * 0.78, align: "right" as const },
        { label: "Motivo",   x: CW - 2,    align: "right" as const },
      ];
      const y0 = pos.y;
      doc.setFillColor(...P.wh);
      doc.setDrawColor(...P.x2);
      doc.setLineWidth(0.25);
      doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
      tableHeader(y0, cols, HH);
      bancos.forEach((b, i) => {
        const ry = y0 + HH + i * RH;
        if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        doc.text(tr(b.banco || "—", 26), ML + 4, ry + 6.5);
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
        doc.text(b.agencia || "—", ML + CW * 0.44, ry + 6.5);
        doc.setTextColor(...(b.quantidade > 0 ? P.r6 : P.x4)); doc.setFont("helvetica","bold");
        doc.text(String(b.quantidade ?? "—"), ML + CW * 0.60, ry + 6.5, { align: "right" });
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
        doc.text(b.dataUltimo || "—", ML + CW * 0.78, ry + 6.5, { align: "right" });
        doc.text(tr(b.motivo || "—", 12), ML + CW - 2, ry + 6.5, { align: "right" });
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
      });
      pos.y = y0 + TH + 5;
    }

    // Alerta de tendência
    if (ccf.tendenciaLabel === "crescimento" && ccfQtd > 0) {
      alertRow("mod", `CCF em crescimento — ${ccfQtd} registro(s) com tendência de alta nos últimos 6 meses`);
    } else if (ccfQtd > 0) {
      alertRow("alta", `${ccfQtd} registro(s) de cheque sem fundo identificado(s)`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 09b — PROCESSOS & PROTESTOS DOS SÓCIOS
  // ════════════════════════════════════════════════════════════════════════════
  {
    const todosSocios = (data.qsa?.quadroSocietario ?? []).filter(s => s.nome);
    if (todosSocios.length > 0) {
      checkPageBreak(ctx, 14);
      pos.y += 4;
      stitle("09b · Sócios — Processos & Protestos");

      const RH = 12; const HH = 9;
      const TH = HH + todosSocios.length * RH + 2;
      checkPageBreak(ctx, TH + 4);
      const cols9b = [
        { label: "Sócio",       x: 4,          align: "left"  as const },
        { label: "Prot. Qtd",   x: CW * 0.38,  align: "right" as const },
        { label: "Prot. R$",    x: CW * 0.52,  align: "right" as const },
        { label: "Proc. Total", x: CW * 0.65,  align: "right" as const },
        { label: "Passivo",     x: CW * 0.78,  align: "right" as const },
        { label: "Valor Est.",  x: CW - 2,     align: "right" as const },
      ];
      const y0b = pos.y;
      doc.setFillColor(...P.wh); doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
      doc.roundedRect(ML, y0b, CW, TH, 2, 2, "FD");
      tableHeader(y0b, cols9b, HH);

      const fmtDataCurta = (d: string | undefined) => {
        if (!d) return "";
        const m = d.match(/^(\d{4})-(\d{2})/);
        return m ? `${m[2]}/${m[1]}` : d.slice(0, 7);
      };

      todosSocios.forEach((s: any, i) => {
        const ry = y0b + HH + i * RH;
        if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
        const nm = (s.nome || "").length > 24 ? (s.nome || "").slice(0, 22) + "…" : (s.nome || "");
        doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.x7);
        doc.text(nm, ML + 4, ry + 5);
        // Sub-texto: datas dos últimos processo e protesto
        const dpProc = fmtDataCurta(s.ultimoProcessoData);
        const dpProt = fmtDataCurta(s.ultimoProtestoData);
        const subDate = [dpProc ? `proc ${dpProc}` : "", dpProt ? `prot ${dpProt}` : ""].filter(Boolean).join(" · ");
        if (subDate) {
          doc.setFont("helvetica","normal"); doc.setFontSize(5); doc.setTextColor(...P.x4);
          doc.text(subDate, ML + 4, ry + 9.5);
        }

        const temCPF  = (s.cpfCnpj ?? "").replace(/\D/g, "").length === 11;
        const semDados = !temCPF || (s.processosTotal === undefined && s.protestosSocioQtd === undefined);
        const ndLabel = temCPF ? "N/D" : "PJ";

        const protQtd = s.protestosSocioQtd ?? 0;
        doc.setTextColor(...(semDados ? P.x4 : protQtd > 0 ? P.r6 : P.g6));
        doc.setFont("helvetica", semDados ? "normal" : "bold"); doc.setFontSize(semDados ? 5.5 : 6.5);
        doc.text(semDados ? ndLabel : String(protQtd), ML + CW * 0.38, ry + 7, { align: "right" });

        const valProt = s.protestosSocioValor ?? 0;
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
        doc.setTextColor(...(valProt > 0 ? P.r6 : P.x4));
        doc.text(semDados ? "—" : (valProt > 0 ? mo(valProt) : "—"), ML + CW * 0.52, ry + 7, { align: "right" });

        const procTotal = s.processosTotal ?? 0;
        doc.setTextColor(...(semDados ? P.x4 : procTotal > 0 ? P.r6 : P.g6));
        doc.setFont("helvetica", semDados ? "normal" : "bold"); doc.setFontSize(semDados ? 5.5 : 6.5);
        doc.text(semDados ? ndLabel : String(procTotal), ML + CW * 0.65, ry + 7, { align: "right" });

        const procPassivo = s.processosPassivo ?? 0;
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
        doc.setTextColor(...(procPassivo > 0 ? P.r6 : P.x4));
        doc.text(semDados ? "—" : String(procPassivo), ML + CW * 0.78, ry + 7, { align: "right" });

        doc.setTextColor(...P.x5);
        doc.text(semDados ? "—" : (s.processosValorTotal ?? "—"), ML + CW - 2, ry + 7, { align: "right" });

        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
      });
      pos.y = y0b + TH + 5;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 10 — GRUPO ECONÔMICO
  // ════════════════════════════════════════════════════════════════════════════
  const grupo = data.grupoEconomico;
  const grupoEmpresas = grupo?.empresas || [];
  if (grupoEmpresas.length > 0) {
    checkPageBreak(ctx, 14);
    pos.y += 4;
    stitle("10 · Grupo Econômico");

    // KPI: total de empresas vinculadas
    checkPageBreak(ctx, 22);
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4; const y0 = pos.y;
      icell(ML, y0, cw, CH, "Empresas Vinculadas", String(grupoEmpresas.length));
      const ativas = grupoEmpresas.filter(e => (e.situacao || "").toUpperCase() === "ATIVA").length;
      const inativas = grupoEmpresas.length - ativas;
      icell(ML + cw + GAP,     y0, cw, CH, "Ativas",   String(ativas),   ativas > 0 ? P.g0 : P.x0, ativas > 0 ? P.g1 : P.x1, ativas > 0 ? P.g6 : P.x4);
      icell(ML + (cw+GAP)*2,   y0, cw, CH, "Inativas", String(inativas), inativas > 0 ? P.a0 : P.x0, inativas > 0 ? P.a1 : P.x1, inativas > 0 ? P.a5 : P.x4);
      pos.y = y0 + CH + 5;
    }

    // Tabela de empresas — agrupada por sócio de origem
    const RH = 9; const HH = 9; const GH = 7;

    const porSocioGE: Record<string, typeof grupoEmpresas> = {};
    grupoEmpresas.forEach(e => {
      const key = e.socioOrigem || "Sem identificação";
      if (!porSocioGE[key]) porSocioGE[key] = [];
      porSocioGE[key].push(e);
    });
    const socioGroupsGE = Object.entries(porSocioGE);

    const TH = HH + socioGroupsGE.length * GH + grupoEmpresas.length * RH + 2;
    checkPageBreak(ctx, 7 + TH + 4);
    stitle("Empresas do grupo");
    const grCols = [
      { label: "Razão Social",  x: 4,         align: "left" as const },
      { label: "Situação",      x: CW * 0.44, align: "left" as const },
      { label: "SCR",           x: CW * 0.60, align: "right" as const },
      { label: "Prot.",         x: CW * 0.74, align: "right" as const },
      { label: "Proc.",         x: CW - 2,    align: "right" as const },
    ];
    const y0 = pos.y;
    doc.setFillColor(...P.wh);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");
    tableHeader(y0, grCols, HH);

    let geOffset = HH;
    let geParity = 0;
    socioGroupsGE.forEach(([socio, emps]) => {
      const gry = y0 + geOffset;
      doc.setFillColor(...P.x1); doc.rect(ML, gry, CW, GH, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.x5);
      doc.text(
        `Via socio: ${socio}  (${emps.length} empresa${emps.length > 1 ? "s" : ""})`,
        ML + 4, gry + GH - 1.5
      );
      geOffset += GH;

      emps.forEach(e => {
        const ry = y0 + geOffset;
        if (geParity % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
        const isAtiva = (e.situacao || "").toUpperCase() === "ATIVA";
        const sitFg: [number,number,number] = isAtiva ? P.g6 : P.a5;
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        const nameLabel = tr(e.razaoSocial || "—", 20);
        const nameW = doc.getTextWidth(nameLabel);
        doc.text(nameLabel, ML + 4, ry + 6.5);
        if (e.participacao) {
          doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
          doc.text(e.participacao, ML + 4 + nameW + 2, ry + 6.5);
        }
        doc.setTextColor(...sitFg); doc.setFont("helvetica","bold"); doc.setFontSize(7);
        doc.text(tr(e.situacao || "—", 10), ML + CW * 0.44, ry + 6.5);
        doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
        doc.text(mo(e.scrTotal) !== "—" ? mo(e.scrTotal) : "—", ML + CW * 0.60, ry + 6.5, { align: "right" });
        const protN = parseInt(e.protestos || "0") || 0;
        doc.setTextColor(...(protN > 0 ? P.r6 : P.x4)); doc.setFont("helvetica","bold");
        doc.text(String(protN) || "—", ML + CW * 0.74, ry + 6.5, { align: "right" });
        const procN = parseInt(e.processos || "0") || 0;
        doc.setTextColor(...(procN > 0 ? P.a5 : P.x4));
        doc.text(String(procN) || "—", ML + CW - 2, ry + 6.5, { align: "right" });
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
        geOffset += RH;
        geParity++;
      });
    });
    pos.y = y0 + TH + 5;

    // Alerta de parentesco
    if (grupo.alertaParentesco && grupo.parentescosDetectados && grupo.parentescosDetectados.length > 0) {
      const nomes = grupo.parentescosDetectados.map(p => `${p.socio1} / ${p.socio2} (sobrenome: ${p.sobrenomeComum})`).join("; ");
      alertRow("mod", `Vínculo familiar detectado entre sócios — ${nomes}`);
    }

    // Alerta de risco consolidado do grupo
    const totalProtGrupo = grupoEmpresas.reduce((s, e) => s + (parseInt(e.protestos || "0") || 0), 0);
    const totalProcGrupo = grupoEmpresas.reduce((s, e) => s + (parseInt(e.processos || "0") || 0), 0);
    if (totalProtGrupo > 0 || totalProcGrupo > 0) {
      alertRow("mod", `Grupo econômico consolidado: ${totalProtGrupo} protesto(s) e ${totalProcGrupo} processo(s) nas empresas vinculadas`);
    }
  }
}
