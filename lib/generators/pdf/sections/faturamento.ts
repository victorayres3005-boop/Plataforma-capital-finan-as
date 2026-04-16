/**
 * Seções 06 + 19 + 20 — FATURAMENTO · DRE · BALANÇO
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";

// ── Paleta ────────────────────────────────────────────────────────────────────
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

function sortMes(ms: Array<{ mes: string; valor: string }>) {
  const key = (s: string) => {
    const p = s.split("/");
    if (p.length !== 2) return 0;
    const mm: Record<string, number> = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
    const m = isNaN(Number(p[0])) ? (mm[p[0].toLowerCase()] || 0) : Number(p[0]);
    const y = Number(p[1]) < 100 ? Number(p[1]) + 2000 : Number(p[1]);
    return y * 100 + m;
  };
  return [...ms].sort((a, b) => key(a.mes) - key(b.mes));
}

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

export function renderFaturamento(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;
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

  const alertRow = (sev: "alta"|"mod"|"info"|"ok", msg: string): number => {
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
    return H + 2.5;
  };

  // ── Pre-compute ──────────────────────────────────────────────────────────
  const validMeses = sortMes(
    Array.from(new Map(
      (data.faturamento?.meses || []).filter(m => m?.mes && m?.valor).map(m => [m.mes, m])
    ).values())
  );
  const last12 = validMeses.slice(-12);
  const fmm12m = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : last12.length > 0 ? last12.reduce((s,m) => s + parseMoneyToNumber(m.valor), 0) / last12.length : 0;
  const fatTotal12 = last12.reduce((s,m) => s + parseMoneyToNumber(m.valor), 0);
  const fmmMedio   = data.faturamento?.fmmMedio ? parseMoneyToNumber(data.faturamento.fmmMedio) : 0;
  const ultimoMes  = data.faturamento?.ultimoMesComDados ?? "";

  // Trend: usa valor calculado pelo backend (ano a ano) como primário;
  // fallback para comparação dos últimos 3M vs 3M anteriores (local)
  const backendTend = data.faturamento?.tendencia ?? "indefinido";
  const trendPct = (() => {
    if (last12.length < 6) return null;
    const vals = last12.map(m => parseMoneyToNumber(m.valor));
    const recent = vals.slice(-3).reduce((s,v) => s+v,0) / 3;
    const prior  = vals.slice(-6,-3).reduce((s,v) => s+v,0) / 3;
    if (prior === 0) return null;
    return (recent - prior) / prior * 100;
  })();
  // Direção unificada: backend prevalece sobre cálculo local
  const tendDir = backendTend !== "indefinido" ? backendTend
    : trendPct === null ? "indefinido"
    : trendPct >= 0 ? "crescimento" : "queda";

  const mesesZerados = (data.faturamento?.mesesZerados ?? []) as Array<{mes:string;motivo?:string}>;
  const fmmAnual = data.faturamento?.fmmAnual as Record<string,string> | undefined;

  // ════════════════════════════════════════════════════════════════════════════
  newPage(ctx);
  drawHeader(ctx);
  stitle("06 · Faturamento");

  // KPI cards — linha 1: FMM 12M · Total 12M · FMM Médio · Tendência
  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 3) / 4;
    const y0 = pos.y;
    icell(ML,              y0, cw, CH, "FMM 12M",   mo(fmm12m),   P.n0, P.n1, P.n9, "média últimos 12m");
    icell(ML+cw+GAP,       y0, cw, CH, "Total 12M", mo(fatTotal12), P.n0, P.n1, P.n9, "soma 12 meses");
    icell(ML+(cw+GAP)*2,   y0, cw, CH, "FMM Médio", fmmMedio > 0 ? mo(fmmMedio) : `${last12.length}m`, P.x0, P.x1, P.n9, fmmMedio > 0 ? "média anos completos" : "meses disponíveis");

    const tendBg: [number,number,number] = tendDir === "indefinido" ? P.x0 : tendDir === "crescimento" ? P.g0 : P.r0;
    const tendBd: [number,number,number] = tendDir === "indefinido" ? P.x1 : tendDir === "crescimento" ? P.g1 : P.r1;
    const tendFg: [number,number,number] = tendDir === "indefinido" ? P.x4 : tendDir === "crescimento" ? P.g6 : P.r6;
    const tendIcon = tendDir === "crescimento" ? "↑" : tendDir === "queda" ? "↓" : "→";
    const tendPctStr = trendPct !== null ? ` ${fmtBR(Math.abs(trendPct),0)}%` : "";
    icell(ML+(cw+GAP)*3,   y0, cw, CH, "Tendência", `${tendIcon}${tendPctStr}`, tendBg, tendBd, tendFg, ultimoMes ? `até ${ultimoMes}` : "ano a ano");
    pos.y = y0 + CH + 5;
  }

  // Bar chart
  checkPageBreak(ctx, 68); // CARDH(62)+gap(5)+title inside card = 68
  {
    const CARDH = 62; // was 50 — KPI row at y0+56 needs CARDH>56
    const CHARTH = 34;
    const y0 = pos.y;

    // Card background
    doc.setFillColor(...P.x0);
    doc.setDrawColor(...P.x1);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, CARDH, 2, 2, "FD");

    // Title
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.x5);
    doc.text("FATURAMENTO MENSAL — ÚLTIMOS 12 MESES", ML + 6, y0 + 6);

    if (last12.length === 0) {
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x4);
      doc.text("Sem dados de faturamento", ML + CW/2, y0 + CARDH/2, { align: "center" });
    } else {
      const vals = last12.map(m => parseMoneyToNumber(m.valor));
      const maxVal = Math.max(...vals, 1);
      const n = last12.length;
      const BAR_AREA_W = CW - 8;
      const bw = BAR_AREA_W / n;
      const chartY = y0 + 9;
      const upTrend = n >= 4 && vals.slice(-2).reduce((s,v)=>s+v,0) > vals.slice(-4,-2).reduce((s,v)=>s+v,0);

      last12.forEach((m, i) => {
        const v   = vals[i];
        const bh  = Math.max(v / maxVal * CHARTH, 0.5);
        const bx  = ML + 4 + i * bw;
        const by  = chartY + CHARTH - bh;
        const isRecent = i >= n - 2;
        const bc: [number,number,number] = isRecent && !upTrend ? P.n1 : P.n8;
        doc.setFillColor(...bc);
        doc.roundedRect(bx + bw * 0.1, by, bw * 0.8, bh, 0.8, 0.8, "F");
        if (v > 0) {
          // Se a barra for muito alta, coloca o label dentro (texto branco); senão, acima
          const insideBar = by - 1 < chartY + 4;
          const labelY: number = insideBar ? by + 4.5 : by - 1;
          doc.setFont("helvetica","bold"); doc.setFontSize(3.8);
          doc.setTextColor(...(insideBar ? P.wh : P.x5));
          doc.text(mo(v).replace("R$ ",""), bx + bw/2, labelY, { align: "center" });
        }
        doc.setFont("helvetica","normal"); doc.setFontSize(4.5); doc.setTextColor(...P.x4);
        const lbl = (m.mes || "").split("/")[0].slice(0,3).toLowerCase();
        doc.text(lbl, bx + bw/2, chartY + CHARTH + 5, { align: "center" });
      });

      // KPI row
      const ky = chartY + CHARTH + 9;
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.2);
      doc.line(ML + 4, ky - 2, ML + CW - 4, ky - 2);

      const tendLabelKpi = tendDir === "crescimento"
        ? `Tendência: ↑${trendPct !== null ? " +" + fmtBR(Math.abs(trendPct),0)+"%" : ""}`
        : tendDir === "queda"
        ? `Tendência: ↓${trendPct !== null ? " -" + fmtBR(Math.abs(trendPct),0)+"%" : ""}`
        : "Tendência: —";
      const kpis = [
        { l: "FMM", v: mo(fmm12m) },
        { l: "Total 12M", v: mo(fatTotal12) },
        { l: tendLabelKpi, v: "" },
      ];
      kpis.forEach((k, i) => {
        const kx = ML + 6 + i * (CW - 8) / 3;
        doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x5);
        if (k.v) {
          doc.text(k.l+":", kx, ky + 4);
          doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...P.n9);
          doc.text(k.v, kx + doc.getTextWidth(k.l+": ") + 1, ky + 4);
        } else {
          const tc: [number,number,number] = tendDir === "indefinido" ? P.x5 : tendDir === "crescimento" ? P.g6 : P.r6;
          doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...tc);
          doc.text(k.l, kx, ky + 4);
        }
      });
    }

    pos.y = y0 + CARDH + 5;
  }

  // Meses zerados alert
  if (mesesZerados.length > 0) {
    checkPageBreak(ctx, 12);
    const labels = mesesZerados.map(m => m.mes).join(", ");
    alertRow("mod", `${mesesZerados.length} mês(es) sem faturamento informado: ${labels}`);
  }

  // FMM Anual grid
  if (fmmAnual && Object.keys(fmmAnual).length > 0) {
    checkPageBreak(ctx, 30);
    stitle("FMM por Ano");
    const entries = Object.entries(fmmAnual).sort(([a], [b]) => Number(a) - Number(b));
    const cw = (CW - GAP * (entries.length - 1)) / entries.length;
    const CH = 18;
    const y0 = pos.y;
    entries.forEach(([ano, val], i) => {
      icell(ML + i * (cw + GAP), y0, cw, CH, `FMM ${ano}`, mo(val), P.n0, P.n1, P.n9, "média mensal do ano");
    });
    pos.y = y0 + CH + 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 19 — DRE
  // ════════════════════════════════════════════════════════════════════════════
  const dre = data.dre;
  if (dre && dre.anos && dre.anos.length > 0) {
    // 8 linhas fixas: TH = 9 + 8×8 + 2 = 75. Total: spacing(4)+stitle(7)+TH(75)+buffer(5) = 91
    checkPageBreak(ctx, 91);
    pos.y += 4;
    stitle("19 · Demonstração de Resultado (DRE)");

    const anos = dre.anos.slice(-2);
    const RH = 8; const HH = 9;

    type DRERow = { label: string; indent?: boolean; getVal: (a: typeof anos[0]) => string; colored?: boolean };
    const rows: DRERow[] = [
      { label: "Receita Bruta",    getVal: a => mo(a.receitaBruta) },
      { label: "Receita Líquida",  getVal: a => mo(a.receitaLiquida) },
      { label: "Lucro Bruto",      getVal: a => mo(a.lucroBruto),    colored: true },
      { label: "Margem Bruta",     getVal: a => a.margemBruta ? fmtBR(parseFloat(a.margemBruta),1)+"%" : "—", colored: true },
      { label: "EBITDA",           getVal: a => mo(a.ebitda),        colored: true },
      { label: "Margem EBITDA",    getVal: a => a.margemEbitda ? fmtBR(parseFloat(a.margemEbitda),1)+"%" : "—", colored: true },
      { label: "Lucro Líquido",    getVal: a => mo(a.lucroLiquido),  colored: true },
      { label: "Margem Líquida",   getVal: a => a.margemLiquida ? fmtBR(parseFloat(a.margemLiquida),1)+"%" : "—", colored: true },
    ];

    const TH = HH + rows.length * RH + 2;
    const y0 = pos.y;

    doc.setFillColor(...P.wh);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");

    // Header
    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
    doc.rect(ML, y0 + 3, CW, HH - 3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.wh);
    doc.text("Métrica", ML + 4, y0 + 6.5);
    anos.forEach((a, i) => {
      const cx = ML + CW * (0.6 + i * 0.2);
      doc.text(a.ano, cx, y0 + 6.5);
    });

    rows.forEach((r, i) => {
      const ry = y0 + HH + i * RH;
      if (i % 2 === 0) {
        doc.setFillColor(...P.x0);
        doc.rect(ML, ry, CW, RH, "F");
      }
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(r.label, ML + 4, ry + 6);
      anos.forEach((a, j) => {
        const cx = ML + CW * (0.6 + j * 0.2);
        const val = r.getVal(a);
        let fg: [number,number,number] = P.x7;
        if (r.colored && val !== "—") {
          const n = parseMoneyToNumber(val.replace("%",""));
          const pct = parseFloat(val.replace(/[^0-9.,-]/g,"").replace(",","."));
          const isNeg = val.startsWith("-") || n < 0 || pct < 0;
          fg = isNeg ? P.r6 : P.g6;
        }
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...fg);
        doc.text(val, cx, ry + 6);
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
      });
    });

    pos.y = y0 + TH + 5;

    // DRE alerts
    const ll = dre.anos[dre.anos.length-1];
    if (ll) {
      const mlPct = parseFloat(ll.margemLiquida || "0");
      const ebitdaN = parseMoneyToNumber(ll.ebitda || "0");
      if (mlPct < -20) alertRow("alta", `Margem líquida ${fmtBR(mlPct,1)}% — operação fortemente deficitária`);
      if (ebitdaN < 0) alertRow("alta", `EBITDA negativo ${mo(ebitdaN)} — não gera caixa operacional`);
      else if (mlPct < 0) alertRow("mod", `Margem líquida negativa ${fmtBR(mlPct,1)}%`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 20 — BALANÇO PATRIMONIAL
  // ════════════════════════════════════════════════════════════════════════════
  const balanco = data.balanco;
  if (balanco && balanco.anos && balanco.anos.length > 0) {
    // 6 linhas fixas: TH = 9 + 6×8 + 2 = 59. Total: spacing(4)+stitle(7)+TH(59)+buffer(5) = 75
    checkPageBreak(ctx, 75);
    pos.y += 4;
    stitle("20 · Balanço Patrimonial");

    const anos = balanco.anos.slice(-2);
    const RH = 8; const HH = 9;

    type BalRow = { label: string; indent?: boolean; getVal: (a: typeof anos[0]) => string; colored?: boolean; isTotalPL?: boolean };
    const rows: BalRow[] = [
      { label: "Ativo Total",            getVal: a => mo(a.ativoTotal), indent: false },
      { label: "Ativo Circulante",       getVal: a => mo(a.ativoCirculante),      indent: true },
      { label: "Ativo Não Circulante",   getVal: a => mo(a.ativoNaoCirculante),   indent: true },
      { label: "Passivo Circulante",     getVal: a => mo(a.passivoCirculante) },
      { label: "Passivo Não Circulante", getVal: a => mo(a.passivoNaoCirculante) },
      { label: "Patrimônio Líquido",     getVal: a => mo(a.patrimonioLiquido), colored: true, isTotalPL: true },
    ];

    const TH = HH + rows.length * RH + 2;
    const y0 = pos.y;

    doc.setFillColor(...P.wh);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");

    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
    doc.rect(ML, y0 + 3, CW, HH - 3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.wh);
    doc.text("Métrica", ML + 4, y0 + 6.5);
    anos.forEach((a, i) => {
      const cx = ML + CW * (0.6 + i * 0.2);
      doc.text(a.ano, cx, y0 + 6.5);
    });

    rows.forEach((r, i) => {
      const ry = y0 + HH + i * RH;
      if (i % 2 === 0) {
        doc.setFillColor(...P.x0);
        doc.rect(ML, ry, CW, RH, "F");
      }
      if (r.isTotalPL) {
        doc.setFillColor(...P.n0);
        doc.rect(ML, ry, CW, RH, "F");
      }
      doc.setFont("helvetica", r.isTotalPL ? "bold" : "normal");
      doc.setFontSize(7);
      const lx = ML + (r.indent ? 12 : 4);
      doc.setTextColor(...(r.isTotalPL ? P.n9 : r.indent ? P.x5 : P.x7));
      doc.text(r.label, lx, ry + 6);
      anos.forEach((a, j) => {
        const cx = ML + CW * (0.6 + j * 0.2);
        const val = r.getVal(a);
        let fg: [number,number,number] = r.isTotalPL ? P.n9 : P.x7;
        if (r.colored && val !== "—") {
          const n = parseMoneyToNumber(val);
          fg = n < 0 ? P.r6 : P.g6;
        }
        doc.setFont("helvetica", r.isTotalPL ? "bold" : "normal");
        doc.setFontSize(7); doc.setTextColor(...fg);
        doc.text(val, cx, ry + 6);
      });
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML + 2, ry + RH, ML + CW - 2, ry + RH);
    });

    pos.y = y0 + TH + 5;

    // Indicadores strip: stitle(7)+icells(18)+gap(5)+alerts~16 = 46
    checkPageBreak(ctx, 46);
    stitle("Indicadores");
    {
      const CH = 18; const cw = (CW - GAP * 3) / 4;
      const latest = anos[anos.length - 1];
      const y0i = pos.y;
      const lc = parseFloat(latest.liquidezCorrente || "0");
      const ep = parseFloat(latest.endividamentoTotal || "0");
      const plv = parseMoneyToNumber(latest.patrimonioLiquido || "0");
      const cgv = parseMoneyToNumber(latest.capitalDeGiroLiquido || "0");

      const lcBg: [number,number,number] = lc >= 1 ? P.g0 : P.r0;
      const lcBd: [number,number,number] = lc >= 1 ? P.g1 : P.r1;
      const lcFg: [number,number,number] = lc >= 1 ? P.g6 : P.r6;

      const epBg: [number,number,number] = ep > 100 ? P.r0 : P.g0;
      const epBd: [number,number,number] = ep > 100 ? P.r1 : P.g1;
      const epFg: [number,number,number] = ep > 100 ? P.r6 : P.g6;

      icell(ML,            y0i, cw, CH, "Liquidez Corrente", lc > 0 ? fmtBR(lc,2).replace(".",",")+"x" : "—", lcBg, lcBd, lcFg);
      icell(ML+cw+GAP,     y0i, cw, CH, "Endividamento",     ep > 0 ? fmtBR(ep,0)+"%" : "—",                  epBg, epBd, epFg);
      icell(ML+(cw+GAP)*2, y0i, cw, CH, "Capital de Giro",   mo(cgv),  cgv < 0 ? P.r0 : P.x0, cgv < 0 ? P.r1 : P.x1, cgv < 0 ? P.r6 : P.x7);
      icell(ML+(cw+GAP)*3, y0i, cw, CH, "Patrim. Líquido",   mo(plv),  plv < 0 ? P.r0 : P.g0, plv < 0 ? P.r1 : P.g1, plv < 0 ? P.r6 : P.g6);
      pos.y = y0i + CH + 5;

      // Alerts
      if (plv < 0) alertRow("alta", `PL negativo ${mo(plv)} — passivo a descoberto`);
      if (lc > 0 && lc < 0.5) alertRow("alta", `Liquidez ${fmtBR(lc,2)} — incapaz de cobrir obrigações de curto prazo`);
      else if (lc > 0 && lc < 1) alertRow("mod", `Liquidez corrente ${fmtBR(lc,2)} — abaixo do ideal (≥ 1)`);
    }
  }
}
