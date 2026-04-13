/**
 * Seção 00 — SÍNTESE PRELIMINAR + PARÂMETROS DO FUNDO + LIMITE DE CRÉDITO + CARTÃO CNPJ + QSA + GESTÃO
 * Contém toda a lógica do bloco sintético inicial do relatório.
 */
import type { PdfCtx, RGB } from "../context";
import {
  newPage, drawHeader, drawHeaderCompact, checkPageBreak, drawSectionTitle, drawSpacer,
  drawAlertDeduped, drawDetAlerts, drawTable, autoT, dsMiniHeader,
  dsMetricCard, fmtMoney, fmtBR, parseMoneyToNumber,
  gerarAlertasQSA,
} from "../helpers";

// ───────────────────────────────────────────────────────────────────────────
// Local formatters (compact money + percent) for the synthesis body
function fmtMoneyRound(val: string | number | undefined | null): string {
  if (val == null || val === "") return "—";
  const n = typeof val === "number" ? val : parseMoneyToNumber(String(val));
  if (!isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R$ ${fmtBR(n / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `R$ ${fmtBR(Math.round(n / 1_000), 0)}k`;
  return `R$ ${fmtBR(Math.round(n), 0)}`;
}

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
  const { doc, DS, pos, params, data, margin, contentW } = ctx;
  const {
    decision, finalRating, companyAge, resumoExecutivo,
    protestosVigentes, vencidosSCR, alavancagem,
  } = params;

  const colors = DS.colors;

  newPage(ctx);
  drawHeader(ctx);

  // Pré-computa faturamento (reutilizado pelo downstream renderParametrosFundo)
  const validMeses = sortMesesAsc((data.faturamento?.meses || []).filter(m => m?.mes && m?.valor));
  const last12 = validMeses.slice(-12);
  const fmm12m = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : (last12.length > 0 ? last12.reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / last12.length : 0);
  const fatTotal12 = last12.reduce((s, m) => s + parseMoneyToNumber(m.valor), 0);

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO A — Header compacto (título + rating pill + cliente)
  // ══════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 14);
    const y0 = pos.y;
    const h = 10;
    const ratingW = 30;

    // Code pill "00"
    doc.setFillColor(...colors.headerBg);
    doc.roundedRect(margin, y0, 14, 7, DS.radius.md, DS.radius.md, "F");
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("00", margin + 7, y0 + 5, { align: "center" });

    // Título
    doc.setFontSize(DS.font.h1);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.headerBg);
    doc.text("SÍNTESE PRELIMINAR", margin + 18, y0 + 6);

    // Rating pill (direita)
    const scoreColor: RGB = finalRating >= 7.5 ? colors.success : finalRating >= 6 ? colors.warning : colors.danger;
    const rx = margin + contentW - ratingW;
    doc.setFillColor(...scoreColor);
    doc.roundedRect(rx, y0, ratingW, h, DS.radius.lg, DS.radius.lg, "F");
    doc.setFontSize(DS.font.h1);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const ratingTxt = `${finalRating}/10`;
    doc.text(ratingTxt, rx + ratingW / 2, y0 + 7, { align: "center" });

    // Divider + razão social
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y0 + h + 0.5, margin + contentW, y0 + h + 0.5);
    doc.setLineWidth(0.1);

    const razao = (data.cnpj?.razaoSocial || "—").substring(0, 90);
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(`Cliente: ${razao}`, margin, y0 + h + 4);

    pos.y = y0 + 14;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO B — Info strip (6 colunas)
  // ══════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 10);
    const y0 = pos.y;
    const h = 8;

    const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const cnpjFmt = data.cnpj?.cnpj || "—";
    const local = extractLocal(data.cnpj?.endereco);
    const idade = companyAge || "—";
    const capSocRaw = data.cnpj?.capitalSocialCNPJ || data.qsa?.capitalSocial || "";
    const capSoc = capSocRaw ? fmtMoneyRound(capSocRaw) : "—";
    const situ = (data.cnpj?.situacaoCadastral || "—").toUpperCase();
    const situAtiva = situ.includes("ATIVA");
    const situColor: RGB = situAtiva ? colors.success : situ === "—" ? colors.textMuted : colors.warning;

    const cols: Array<{ label: string; value: string; color?: RGB }> = [
      { label: "DATA", value: today },
      { label: "CNPJ", value: cnpjFmt },
      { label: "LOCAL", value: local },
      { label: "IDADE", value: idade },
      { label: "CAP. SOCIAL", value: capSoc },
      { label: "SITUAÇÃO", value: situ.length > 12 ? situ.substring(0, 12) : situ, color: situColor },
    ];

    const colW = contentW / cols.length;
    // Background surface
    doc.setFillColor(...colors.surface2);
    doc.roundedRect(margin, y0, contentW, h, DS.radius.md, DS.radius.md, "F");

    cols.forEach((c, i) => {
      const cx = margin + i * colW;
      // Divider
      if (i > 0) {
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.2);
        doc.line(cx, y0 + 1.5, cx, y0 + h - 1.5);
        doc.setLineWidth(0.1);
      }
      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(c.label, cx + 2, y0 + 3);

      doc.setFontSize(DS.font.bodySmall);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(c.color ?? colors.textPrimary));
      const maxChars = Math.floor((colW - 4) / 1.6);
      const v = c.value.length > maxChars ? c.value.substring(0, maxChars - 1) + "…" : c.value;
      doc.text(v, cx + 2, y0 + h - 1.5);
    });

    pos.y = y0 + h + 3;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO C — Alertas strip (mini-cards)
  // ══════════════════════════════════════════════════════════════════════
  {
    const protQtd = protestosVigentes || 0;
    const protVal = parseMoneyToNumber(data.protestos?.vigentesValor || "0");
    const ccfQtd = data.ccf?.qtdRegistros ?? null;
    const procPass = parseInt(data.processos?.passivosTotal || "0") || 0;
    const scrVenc = vencidosSCR || 0;
    const scrTotal = parseMoneyToNumber(data.scr?.totalDividasAtivas || "0");
    const scrVencPct = scrTotal > 0 ? (scrVenc / scrTotal) * 100 : 0;
    const alav = alavancagem ?? 0;

    type MetricCell = { label: string; value: string; sub: string; accent: RGB };
    const cells: MetricCell[] = [
      {
        label: "PROTESTOS",
        value: protQtd > 0 ? fmtMoneyRound(protVal) : "—",
        sub: protQtd > 0 ? `${protQtd} ocorr.` : "sem ocorrências",
        accent: protQtd > 0 ? colors.danger : colors.success,
      },
      {
        label: "CCF",
        value: ccfQtd == null ? "—" : String(ccfQtd),
        sub: ccfQtd == null ? "não consultado" : ccfQtd > 0 ? "ocorrências" : "sem cheques",
        accent: ccfQtd == null ? colors.textMuted : ccfQtd > 0 ? colors.danger : colors.success,
      },
      {
        label: "PROCESSOS",
        value: String(procPass),
        sub: "polo passivo",
        accent: procPass > 10 ? colors.danger : procPass > 0 ? colors.warning : colors.success,
      },
      {
        label: "SCR VENCIDOS",
        value: scrVenc > 0 ? fmtMoneyRound(scrVenc) : "—",
        sub: scrTotal > 0 ? `${fmtPct(scrVencPct, 1)} do total` : "em dia",
        accent: scrVenc > 0 ? colors.danger : colors.success,
      },
      {
        label: "ALAVANCAGEM",
        value: alav > 0 ? `${fmtBR(alav, 2)}x` : "—",
        sub: alav > 5 ? "risco alto" : alav > 3 ? "atenção" : alav > 0 ? "saudável" : "s/ dados",
        accent: alav > 5 ? colors.danger : alav > 3 ? colors.warning : alav > 0 ? colors.success : colors.textMuted,
      },
    ];

    checkPageBreak(ctx, 18);
    dsMiniHeader(ctx, "Alertas");

    const y0 = pos.y + 1;
    const cellH = 12;
    const gap = 2;
    const cellW = (contentW - gap * (cells.length - 1)) / cells.length;

    cells.forEach((c, i) => {
      const cx = margin + i * (cellW + gap);
      doc.setFillColor(...colors.cardBg);
      doc.roundedRect(cx, y0, cellW, cellH, DS.radius.sm, DS.radius.sm, "F");
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, y0, cellW, cellH, DS.radius.sm, DS.radius.sm, "D");
      doc.setLineWidth(0.1);
      doc.setFillColor(...c.accent);
      doc.rect(cx, y0, 2, cellH, "F");

      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(c.label, cx + 4, y0 + 3.5);

      doc.setFontSize(DS.font.bodySmall);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...c.accent);
      const maxC = Math.floor((cellW - 6) / 1.8);
      const val = c.value.length > maxC ? c.value.substring(0, maxC - 1) + "…" : c.value;
      doc.text(val, cx + 4, y0 + 7.8);

      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(c.sub, cx + 4, y0 + 11);
    });

    pos.y = y0 + cellH + 3;
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO D — Gestão & Grupo Econômico (tabela unificada)
  // ══════════════════════════════════════════════════════════════════════
  {
    const socios = (data.qsa?.quadroSocietario || []).filter(s => s?.nome || s?.cpfCnpj);
    const empresas = data.grupoEconomico?.empresas || [];

    if (socios.length > 0 || empresas.length > 0) {
      checkPageBreak(ctx, 20 + (socios.length + empresas.length) * 6);
      dsMiniHeader(ctx, "Gestão & Grupo Econômico");

      const rows: string[][] = [];

      socios.forEach(s => {
        const scrSocio = data.scrSocios?.find(sc =>
          (sc.cpfSocio && sc.cpfSocio === s.cpfCnpj) ||
          (sc.nomeSocio && s.nome && sc.nomeSocio.toLowerCase() === s.nome.toLowerCase())
        );
        const scrTot = scrSocio?.periodoAtual?.totalDividasAtivas;
        const prej = scrSocio?.periodoAtual?.prejuizos;
        rows.push([
          truncateText(s.nome || "—", 42),
          s.cpfCnpj || "—",
          "—",
          scrTot ? fmtMoneyRound(scrTot) : "—",
          prej ? fmtMoneyRound(prej) : "—",
          "—",
        ]);
      });

      empresas.forEach(e => {
        rows.push([
          truncateText(e.razaoSocial || "—", 42),
          e.cnpj || "—",
          "—",
          e.scrTotal ? fmtMoneyRound(e.scrTotal) : "—",
          "—",
          e.processos || "—",
        ]);
      });

      autoT(
        ctx,
        ["NOME / RAZÃO SOCIAL", "CPF/CNPJ", "IDADE", "SCR", "PREJUÍZO", "PROC."],
        rows,
        [40, 20, 8, 15, 10, 7],
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO E — Faturamento + SCR Comparativo (lado a lado)
  // ══════════════════════════════════════════════════════════════════════
  {
    const scr = data.scr;
    const scrAnt = data.scrAnterior;
    const hasFat = last12.length > 0;
    const hasScr = !!(scr && scr.periodoReferencia);

    if (hasFat || hasScr) {
      const blockH = 42;
      checkPageBreak(ctx, blockH + 4);
      const y0 = pos.y;
      const gap = 4;
      const halfW = hasFat && hasScr ? (contentW - gap) / 2 : contentW;

      // ── Left: Faturamento chart ──
      if (hasFat) {
        const chartX = margin;
        doc.setFontSize(DS.font.caption);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.headerBg);
        doc.text("FATURAMENTO / 12M", chartX, y0 + 3);

        const chartH = 22;
        const chartY = y0 + 6;
        const baseY = chartY + chartH;
        const barGap = 1;
        const barW = (halfW - barGap * (last12.length - 1)) / last12.length;
        const values = last12.map(m => parseMoneyToNumber(m.valor));
        const maxVal = Math.max(...values, 1);

        last12.forEach((m, i) => {
          const v = values[i];
          const barH = Math.max((v / maxVal) * chartH, 0.3);
          const bx = chartX + i * (barW + barGap);
          const by = baseY - barH;
          const isHighlight = i >= last12.length - 3;
          const c: RGB = v === 0 ? colors.textMuted : isHighlight ? colors.accent : colors.primary;
          doc.setFillColor(...c);
          doc.rect(bx, by, barW, barH, "F");

          doc.setFontSize(DS.font.micro);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.textMuted);
          const lbl = m.mes.length > 3 ? m.mes.substring(0, 3) : m.mes;
          doc.text(lbl, bx + barW / 2, baseY + 3, { align: "center" });
        });

        // Footer: FMM / Total / Var
        let varPct = 0;
        if (last12.length >= 6) {
          const rec = values.slice(-3).reduce((a, b) => a + b, 0);
          const ant = values.slice(-6, -3).reduce((a, b) => a + b, 0);
          if (ant > 0) varPct = ((rec - ant) / ant) * 100;
        }
        const trend = varPct > 2 ? "↑" : varPct < -2 ? "↓" : "→";
        doc.setFontSize(DS.font.micro);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textSecondary);
        doc.text(
          `FMM ${fmtMoneyRound(fmm12m)} · Total ${fmtMoneyRound(fatTotal12)} · ${trend} ${fmtPct(varPct, 0)}`,
          chartX, baseY + 8,
        );
      }

      // ── Right: SCR Comparativo ──
      if (hasScr) {
        const scrX = hasFat ? margin + halfW + gap : margin;
        const savedY = pos.y;
        pos.y = y0;

        const periodoAtual = scr!.periodoReferencia || "—";
        const periodoAnt = scrAnt?.periodoReferencia || "";
        const hasAnterior = !!scrAnt && !!periodoAnt;

        doc.setFontSize(DS.font.caption);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.headerBg);
        const titleTxt = hasAnterior
          ? `SCR ${periodoAnt} × ${periodoAtual}`
          : `SCR ${periodoAtual}`;
        doc.text(titleTxt, scrX, y0 + 3);

        // Manual mini-table (autoT would stretch full width)
        const rowY = y0 + 6;
        const colLabel = scrX;
        const colVal1 = scrX + halfW * 0.38;
        const colVal2 = scrX + halfW * 0.62;
        const colVar  = scrX + halfW * 0.84;
        const lineH = 4.2;

        // Header
        doc.setFillColor(...colors.headerBg);
        doc.rect(scrX, rowY, halfW, 4.5, "F");
        doc.setFontSize(DS.font.micro);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("MÉTRICA", colLabel + 1, rowY + 3.1);
        doc.text("ATUAL", colVal1 + 1, rowY + 3.1);
        if (hasAnterior) {
          doc.text("ANT.", colVal2 + 1, rowY + 3.1);
          doc.text("VAR.", colVar + 1, rowY + 3.1);
        }

        type SCRRow = { label: string; cur: number; prev: number; bold?: boolean };
        const sr = (k: keyof typeof scr) => parseMoneyToNumber(String((scr as unknown as Record<string, string>)[k as string] || "0"));
        const srAnt = (k: string) => parseMoneyToNumber(String((scrAnt as unknown as Record<string, string> | null)?.[k] || "0"));
        const rowsD: SCRRow[] = [
          { label: "Em Dia",    cur: sr("carteiraAVencer"),      prev: srAnt("carteiraAVencer") },
          { label: "CP",        cur: sr("carteiraCurtoPrazo"),   prev: srAnt("carteiraCurtoPrazo") },
          { label: "LP",        cur: sr("carteiraLongoPrazo"),   prev: srAnt("carteiraLongoPrazo") },
          { label: "TOTAL",     cur: sr("totalDividasAtivas"),   prev: srAnt("totalDividasAtivas"), bold: true },
          { label: "Vencidos",  cur: sr("vencidos"),             prev: srAnt("vencidos") },
          { label: "Limite",    cur: sr("limiteCredito"),        prev: srAnt("limiteCredito") },
        ];

        rowsD.forEach((r, i) => {
          const ry = rowY + 5 + i * lineH;
          if (i % 2 === 1) {
            doc.setFillColor(...colors.surface2);
            doc.rect(scrX, ry - 3, halfW, lineH, "F");
          }
          doc.setFontSize(DS.font.micro);
          doc.setFont("helvetica", r.bold ? "bold" : "normal");
          doc.setTextColor(...colors.textPrimary);
          doc.text(r.label, colLabel + 1, ry);
          doc.text(r.cur > 0 ? fmtMoneyRound(r.cur) : "—", colVal1 + 1, ry);
          if (hasAnterior) {
            doc.text(r.prev > 0 ? fmtMoneyRound(r.prev) : "—", colVal2 + 1, ry);
            if (r.prev > 0 && r.cur > 0) {
              const pct = ((r.cur - r.prev) / r.prev) * 100;
              const varColor: RGB = pct > 2 ? colors.danger : pct < -2 ? colors.success : colors.textMuted;
              doc.setTextColor(...varColor);
              doc.text(`${pct > 0 ? "+" : ""}${fmtBR(pct, 0)}%`, colVar + 1, ry);
            } else {
              doc.setTextColor(...colors.textMuted);
              doc.text("—", colVar + 1, ry);
            }
          }
        });

        // IFs footer
        const ifsCur = scr!.qtdeInstituicoes || "—";
        doc.setFontSize(DS.font.micro);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(`IFs: ${ifsCur}${alavancagem ? ` · Alav ${fmtBR(alavancagem, 2)}x` : ""}`, scrX, y0 + blockH - 2);

        pos.y = savedY;
      }

      pos.y = y0 + blockH + 4;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCO F — Parecer inline
  // ══════════════════════════════════════════════════════════════════════
  {
    // Texto parecer (flexível)
    let parecerTxt = resumoExecutivo || "";
    const parecerRaw = ctx.aiAnalysis?.parecer;
    if (!parecerTxt && parecerRaw) {
      if (typeof parecerRaw === "object" && parecerRaw !== null) {
        const p = parecerRaw as { textoCompleto?: string; resumoExecutivo?: string };
        parecerTxt = p.textoCompleto || p.resumoExecutivo || "";
      } else if (typeof parecerRaw === "string") {
        parecerTxt = parecerRaw;
      }
    }
    if (!parecerTxt) parecerTxt = ctx.aiAnalysis?.sinteseExecutiva || "";

    checkPageBreak(ctx, 14);
    dsMiniHeader(ctx, "Parecer Preliminar");

    // Decisão badge
    {
      const dec = (decision || "—").replace(/_/g, " ");
      const decColor: RGB = /APROV/i.test(dec) && !/CONDIC/i.test(dec) ? colors.success
        : /REPROV/i.test(dec) ? colors.danger
        : colors.warning;
      checkPageBreak(ctx, 8);
      const y0 = pos.y;
      doc.setFillColor(...decColor);
      doc.roundedRect(margin, y0, contentW, 6, DS.radius.sm, DS.radius.sm, "F");
      doc.setFontSize(DS.font.bodySmall);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`DECISÃO PRELIMINAR: ${dec}`, margin + 4, y0 + 4.2);
      pos.y = y0 + 8;
    }

    // Resumo (até 8 linhas)
    if (parecerTxt) {
      doc.setFontSize(DS.font.bodySmall);
      doc.setFont("helvetica", "normal");
      const maxLines = 8;
      const allLines = doc.splitTextToSize(parecerTxt.trim(), contentW - 2) as string[];
      const shown = allLines.slice(0, maxLines);
      if (allLines.length > maxLines) shown[shown.length - 1] = shown[shown.length - 1].replace(/\s*\S*$/, "") + "…";
      const h = shown.length * 3.8 + 3;
      checkPageBreak(ctx, h);
      doc.setTextColor(...colors.textPrimary);
      shown.forEach((l, i) => doc.text(l, margin, pos.y + 3 + i * 3.8));
      pos.y += h;
    }

    // Pontos Fortes
    {
      const pf = (params.pontosFortes || []).slice(0, 5);
      if (pf.length > 0) {
        checkPageBreak(ctx, 6 + pf.length * 3.8);
        doc.setFontSize(DS.font.caption);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.success);
        doc.text("PONTOS FORTES", margin, pos.y + 3);
        pos.y += 4.5;
        doc.setFontSize(DS.font.bodySmall);
        doc.setFont("helvetica", "normal");
        pf.forEach(item => {
          const lines = doc.splitTextToSize(truncateText(item, 160), contentW - 5) as string[];
          doc.setTextColor(...colors.success);
          doc.text("•", margin + 1, pos.y + 2.8);
          doc.setTextColor(...colors.textPrimary);
          doc.text(lines[0], margin + 4, pos.y + 2.8);
          pos.y += 3.8;
        });
        pos.y += 1;
      }
    }

    // Pontos Fracos
    {
      const pfr = (params.pontosFracos || []).slice(0, 5);
      if (pfr.length > 0) {
        checkPageBreak(ctx, 6 + pfr.length * 3.8);
        doc.setFontSize(DS.font.caption);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.danger);
        doc.text("PONTOS FRACOS", margin, pos.y + 3);
        pos.y += 4.5;
        doc.setFontSize(DS.font.bodySmall);
        doc.setFont("helvetica", "normal");
        pfr.forEach(item => {
          const lines = doc.splitTextToSize(truncateText(item, 160), contentW - 5) as string[];
          doc.setTextColor(...colors.danger);
          doc.text("•", margin + 1, pos.y + 2.8);
          doc.setTextColor(...colors.textPrimary);
          doc.text(lines[0], margin + 4, pos.y + 2.8);
          pos.y += 3.8;
        });
        pos.y += 1;
      }
    }

    // Perguntas à Visita
    {
      const perguntas = (params.perguntasVisita || []).slice(0, 5);
      if (perguntas.length > 0) {
        checkPageBreak(ctx, 6 + perguntas.length * 3.8);
        doc.setFontSize(DS.font.caption);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.headerBg);
        doc.text("PERGUNTAS À VISITA", margin, pos.y + 3);
        pos.y += 4.5;
        doc.setFontSize(DS.font.bodySmall);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textPrimary);
        perguntas.forEach((q, i) => {
          const txt = `${i + 1}. ${truncateText(q.pergunta || "", 160)}`;
          const lines = doc.splitTextToSize(txt, contentW - 2) as string[];
          doc.text(lines[0], margin, pos.y + 2.8);
          pos.y += 3.8;
        });
        pos.y += 2;
      }
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
