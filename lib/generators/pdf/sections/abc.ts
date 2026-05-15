/**
 * Seção 10 — CURVA ABC (Concentração de Clientes)
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";
import { isLinhaTotalCurvaABC } from "@/lib/sacados/extractTopSacados";

// ⚠️ TEMP: alertas críticos (sev="alta") escondidos enquanto política V2 calibra.
// Espelha HIDE_ALERTAS_CRITICOS em lib/pdf/template.ts. Trocar para `false` em ambos.
const HIDE_ALERTAS_CRITICOS = true;

const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
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

export function renderABC(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;
  const abc = data.curvaABC;

  if (!abc || !abc.clientes || abc.clientes.length === 0) return;

  const GAP = 3.5;

  // Index sacados analisados por CNPJ canonicalizado para enriquecer linhas
  // com bureau (score / protestos / processos / vínculo). Mesma lógica do HTML.
  const sacadosArr = data.sacadosAnalisados ?? [];
  const sacadosByCnpj = new Map<string, typeof sacadosArr[number]>();
  sacadosArr.forEach((s) => {
    const k = (s.cnpj ?? "").replace(/\D/g, "");
    if (k) sacadosByCnpj.set(k, s);
  });

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
    if (HIDE_ALERTAS_CRITICOS && sev === "alta") return;
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

  stitle("10 · Concentração de Clientes (Curva ABC)");

  // KPI cards
  const top3pct = parseFloat(abc.concentracaoTop3 || "0");
  const top5pct = parseFloat(abc.concentracaoTop5 || "0");
  const totalCli = abc.totalClientesNaBase || abc.clientes.length;

  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 2) / 3; const y0 = pos.y;
    icell(ML,        y0, cw, CH, "Top 3 Clientes", top3pct > 0 ? fmtBR(top3pct,0)+"%" : "—",
      top3pct > 50 ? P.a0 : P.x0, top3pct > 50 ? P.a1 : P.x1, top3pct > 50 ? P.a5 : P.n9);
    icell(ML+cw+GAP, y0, cw, CH, "Top 5 Clientes", top5pct > 0 ? fmtBR(top5pct,0)+"%" : "—",
      top5pct > 70 ? P.a0 : P.x0, top5pct > 70 ? P.a1 : P.x1, top5pct > 70 ? P.a5 : P.n9);
    icell(ML+(cw+GAP)*2, y0, cw, CH, "Total Clientes", String(totalCli));
    pos.y = y0 + CH + 5;
  }

  // Table (8 colunas: # · Sacado/CNPJ · Fat · %Rec(acum) · Score · Prot · Proc · Cl)
  // Filtra linhas de totalizador que extrações antigas podem ter incluído.
  const shown = abc.clientes.filter(c => !isLinhaTotalCurvaABC(c.nome)).slice(0, 10);
  const RH = 12; const HH = 9;
  const TH = HH + shown.length * RH + 8;
  checkPageBreak(ctx, TH + 6);
  const y0 = pos.y;

  // Posições x das colunas (right-edge para colunas right-aligned, center para Prot/Proc/Cl)
  const xFat   = ML + CW * 0.50;
  const xPct   = ML + CW * 0.62;
  const xScore = ML + CW * 0.76;
  const xProt  = ML + CW * 0.84;
  const xProc  = ML + CW * 0.92;
  const xCl    = ML + CW - 2;

  doc.setFillColor(...P.x0);
  doc.setDrawColor(...P.x2);
  doc.setLineWidth(0.25);
  doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");

  // Header
  doc.setFillColor(...P.n9);
  doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
  doc.rect(ML, y0+3, CW, HH-3, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
  doc.text("#",           ML + 7.5, y0 + 6.5, { align: "center" });
  doc.text("Sacado",      ML + 14,  y0 + 6.5);
  doc.text("Faturamento", xFat,     y0 + 6.5, { align: "right" });
  doc.text("% (acum)",    xPct,     y0 + 6.5, { align: "right" });
  doc.text("Score",       xScore,   y0 + 6.5, { align: "right" });
  doc.text("Prot.",       xProt,    y0 + 6.5, { align: "center" });
  doc.text("Proc.",       xProc,    y0 + 6.5, { align: "center" });
  doc.text("Cl.",         xCl,      y0 + 6.5, { align: "right" });

  // Compute cumulative percentages from scratch (spec: CALCULAR, not trust the data)
  let cumulPct = 0;

  shown.forEach((c, i) => {
    const ry = y0 + HH + i * RH;

    // Lookup do sacado enriquecido por CNPJ (PJ apenas)
    const cnpjCanon = (c.cnpjCpf ?? "").replace(/\D/g, "");
    let s = cnpjCanon.length === 14 ? sacadosByCnpj.get(cnpjCanon) : undefined;
    if (!s) {
      const m = (c.nome ?? "").match(/(\d{2}\.?\d{3}\.?\d{3}[/.-]?\d{4}[-.]?\d{2})/);
      if (m) s = sacadosByCnpj.get(m[1].replace(/\D/g, ""));
    }
    const isPF = cnpjCanon.length === 11;
    const temVinculo = !!s?.vinculos?.temVinculo;

    // Background — vermelho-claro se vínculo, alterna se não
    if (temVinculo) {
      doc.setFillColor(...P.r0);
    } else if (i % 2 !== 0) {
      doc.setFillColor(...P.wh);
    } else {
      doc.setFillColor(...P.x0);
    }
    doc.rect(ML, ry, CW, RH, "F");

    // Rank circle
    doc.setFillColor(...P.n8);
    doc.circle(ML + 7.5, ry + RH/2, 3.5, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text(String(i+1), ML + 7.5, ry + RH/2 + 1.5, { align: "center" });

    // Nome (linha 1) + CNPJ/UF (linha 2 menor)
    const nomeLimpo = s?.razaoSocial ?? c.nome ?? "—";
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x9);
    doc.text(tr(nomeLimpo, 36), ML + 14, ry + 5);
    if (cnpjCanon.length === 14 || s?.uf) {
      const cnpjFmt = cnpjCanon.length === 14
        ? cnpjCanon.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
        : "";
      const sub = [cnpjFmt, s?.uf].filter(Boolean).join(" · ");
      if (sub) {
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
        doc.text(sub, ML + 14, ry + 9.5);
      }
    } else if (isPF) {
      doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
      doc.text("PF", ML + 14, ry + 9.5);
    }

    // Faturamento
    const fat = parseMoneyToNumber(c.valorFaturado || "0");
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
    doc.text(mo(fat), xFat, ry + 7, { align: "right" });

    // % Rec + acumulado em segunda linha menor
    const pct = parseFloat(c.percentualReceita || "0");
    cumulPct += pct;
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x7);
    doc.text(fmtBR(pct, 1) + "%", xPct, ry + 5, { align: "right" });
    doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
    doc.text("acum " + fmtBR(cumulPct, 0) + "%", xPct, ry + 9.5, { align: "right" });

    // Score (valor + classe pequena ao lado)
    if (s?.score) {
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x9);
      doc.text(String(s.score), xScore, ry + 7, { align: "right" });
      if (s.scoreClasse) {
        const sw = doc.getTextWidth(String(s.score));
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
        doc.text(s.scoreClasse, xScore - sw - 1.5, ry + 7, { align: "right" });
      }
    } else {
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
      doc.text(isPF ? "PF" : "—", xScore, ry + 7, { align: "right" });
    }

    // Protestos · Processos — número vermelho se >0, ✓ verde se 0, "—" cinza se sem dado
    const protQtd = s?.protestosQtd;
    const procQtd = s?.processosPassivos;
    const cellNum = (xc: number, val: number | undefined) => {
      if (val === undefined) {
        doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
        doc.text("—", xc, ry + 7, { align: "center" });
      } else if (val === 0) {
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.g6);
        doc.text("✓", xc, ry + 7, { align: "center" });
      } else {
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.r6);
        doc.text(String(val), xc, ry + 7, { align: "center" });
      }
    };
    cellNum(xProt, protQtd);
    cellNum(xProc, procQtd);

    // Classe ABC (calculada a partir do acumulado)
    const cl = cumulPct <= 80 ? "A" : cumulPct <= 95 ? "B" : "C";
    const cBg: [number,number,number] = cl==="A"?P.r1:cl==="B"?P.a1:P.x1;
    const cFg: [number,number,number] = cl==="A"?P.r6:cl==="B"?P.a5:P.x5;
    doc.setFillColor(...cBg);
    doc.roundedRect(xCl - 9, ry + (RH-5)/2, 9, 5, 1, 1, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...cFg);
    doc.text(cl, xCl - 4.5, ry + RH/2 + 1.5, { align: "center" });

    doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
    doc.line(ML+2, ry+RH, ML+CW-2, ry+RH);
  });

  // Summary
  const sumY = y0 + TH - 6;
  const totalComVinculo = sacadosArr.filter(s => s.vinculos?.temVinculo).length;
  const enriquecidos = sacadosArr.length;
  const sumLine = [
    `Top 3: ${top3pct > 0 ? fmtBR(top3pct,0) : "—"}%`,
    `Top 5: ${top5pct > 0 ? fmtBR(top5pct,0) : "—"}%`,
    `Total clientes: ${totalCli}`,
    enriquecidos > 0 ? `Bureau: ${enriquecidos} sacado(s) consultado(s)` : "",
    totalComVinculo > 0 ? `${totalComVinculo} com vínculo` : "",
  ].filter(Boolean).join(" · ");
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.x5);
  doc.text(sumLine, ML + 4, sumY);

  pos.y = y0 + TH + 5;

  // Onda relatório (2026-05-14): legenda removida — ícones ✓/—/número são
  // auto-explicativos no contexto da tabela.

  // Alerts
  const top1 = shown[0];
  if (top1) {
    const top1pct = parseFloat(top1.percentualReceita || "0");
    if (top1pct > 30) alertRow("alta", `${tr(top1.nome || "Cliente 1", 35)} concentra ${fmtBR(top1pct,0)}% da receita — acima do limite recomendado de 20%`);
  }
  if (top3pct > 50) alertRow("mod", `Alta concentração — top 3 clientes = ${fmtBR(top3pct,0)}% da receita`);
  if (totalComVinculo > 0) alertRow("alta", `${totalComVinculo} sacado(s) com vínculo detectado com o cedente — verificar parte relacionada antes da operação`);
}
