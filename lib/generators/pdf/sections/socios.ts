/**
 * Seção 20 — IR DOS SÓCIOS
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

const GRUPO_LABELS: Record<string, string> = {
  "01": "BENS IMÓVEIS",
  "02": "VEÍCULOS E EMBARCAÇÕES",
  "03": "PARTICIPAÇÕES SOCIETÁRIAS",
  "04": "APLICAÇÕES / INVESTIMENTOS",
  "05": "CRÉDITOS E RECEBÍVEIS",
  "06": "DEPÓSITOS BANCÁRIOS",
  "07": "FUNDOS DE INVESTIMENTO",
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

export function renderSocios(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;
  const irList = data.irSocios;

  if (!irList || irList.length === 0 || !irList.some(s => s.nomeSocio || s.anoBase)) {
    return;
  }

  const GAP = 3.5;

  // Mapa CPF → participacao societária (do QSA / contrato social)
  const normCpf = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");
  const qsaMap: Record<string, string> = {};
  (data.qsa?.quadroSocietario ?? []).forEach(s => {
    const k = normCpf(s.cpfCnpj);
    if (k && s.participacao) qsaMap[k] = s.participacao;
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
    doc.setFontSize(value.length > 14 ? 6.5 : 9);
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

  stitle("22 · IR dos Sócios");

  for (let idx = 0; idx < irList.length; idx++) {
    const ir = irList[idx];
    if (!ir.nomeSocio && !ir.anoBase) continue;

    checkPageBreak(ctx, 55);

    // Divider between socios
    if (idx > 0) {
      doc.setDrawColor(...P.x2);
      doc.setLineWidth(0.2);
      doc.line(ML, pos.y, ML + CW, pos.y);
      pos.y += 6;
    }

    // Avatar + name
    const initials = (ir.nomeSocio || "?").split(" ").slice(0,2).map(w => w[0]||"").join("").toUpperCase();
    const avR = 8;
    const avCx = ML + avR;
    const avCy = pos.y + avR + 2;
    doc.setFillColor(...P.n0);
    doc.circle(avCx, avCy, avR, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...P.n8);
    doc.text(initials, avCx, avCy + 1.5, { align: "center" });

    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...P.x9);
    doc.text(ir.nomeSocio || "Sócio", ML + avR*2 + 4, pos.y + 8);
    const cpfClean = (ir.cpf || "—").replace(/^\s*cpf\s*:\s*/i, "").trim();
    doc.setFont("courier","normal"); doc.setFontSize(7.5); doc.setTextColor(...P.x5);
    doc.text(`CPF: ${cpfClean} · Ano-base: ${ir.anoBase || "—"}`, ML + avR*2 + 4, pos.y + 14);

    pos.y += avR * 2 + 8;

    // KPI cards
    checkPageBreak(ctx, 22);
    {
      const CH = 18;
      const partSoc = qsaMap[normCpf(ir.cpf)] ?? null;
      const haspart = partSoc !== null;
      // 5 cards se há participação, 4 caso contrário
      const ncards = haspart ? 5 : 4;
      const cw = (CW - GAP * (ncards - 1)) / ncards;
      const y0 = pos.y;
      const plv = parseMoneyToNumber(ir.patrimonioLiquido || "0");
      icell(ML,              y0, cw, CH, "Renda Total",       mo(ir.rendimentoTotal));
      icell(ML+cw+GAP,       y0, cw, CH, "Rend. Tributáveis", mo(ir.rendimentosTributaveis));
      icell(ML+(cw+GAP)*2,   y0, cw, CH, "Bens e Direitos",   mo(ir.totalBensDireitos));
      icell(ML+(cw+GAP)*3,   y0, cw, CH, "Patrimônio Líq.",   mo(plv),
        plv > 0 ? P.g0 : plv < 0 ? P.r0 : P.x0,
        plv > 0 ? P.g1 : plv < 0 ? P.r1 : P.x1,
        plv > 0 ? P.g6 : plv < 0 ? P.r6 : P.x4,
      );
      if (haspart) {
        const pctStr = (partSoc!).replace("%","").trim() + "%";
        icell(ML+(cw+GAP)*4, y0, cw, CH, "Part. Societária", pctStr, P.n0, P.n1, P.n7);
      }
      pos.y = y0 + CH + 5;
    }

    // Alerts
    const anoAtual = new Date().getFullYear();
    if (ir.debitosEmAberto) alertRow("alta", `${ir.nomeSocio || "Sócio"} — Débitos em aberto perante a Receita Federal`);
    const impostoPagar = parseMoneyToNumber(ir.valorQuota || "0");
    if (impostoPagar > 0) alertRow("mod", `${ir.nomeSocio || "Sócio"} — Imposto a pagar: ${mo(impostoPagar)}`);
    const anoBase = parseInt(ir.anoBase || "0");
    if (anoBase > 0 && anoBase < anoAtual - 1) alertRow("mod", `IR do sócio ${ir.nomeSocio || ""} desatualizado — ano-base ${anoBase}`);
    const allZero = !parseMoneyToNumber(ir.rendimentoTotal || "0") && !parseMoneyToNumber(ir.totalBensDireitos || "0");
    if (allZero) alertRow("mod", "IR com valores zerados — possível extração incompleta");
    // Reconciliação: se a soma das subcategorias diverge >5% do total declarado,
    // a extração do Gemini provavelmente perdeu itens (veículos, imóveis ou aplicações).
    const somaCat = parseMoneyToNumber(ir.bensImoveis || "0")
      + parseMoneyToNumber(ir.bensVeiculos || "0")
      + parseMoneyToNumber(ir.aplicacoesFinanceiras || "0")
      + parseMoneyToNumber(ir.outrosBens || "0")
      + parseMoneyToNumber(ir.participacoesSocietarias || "0");
    const totalDec = parseMoneyToNumber(ir.totalBensDireitos || "0");
    if (somaCat > 0 && totalDec > 0) {
      const diff = Math.abs(totalDec - somaCat);
      const maxV = Math.max(totalDec, somaCat);
      if (diff > maxV * 0.05) {
        alertRow("mod",
          `IR do sócio ${ir.nomeSocio || ""} — subcategorias divergem do total (soma ${mo(somaCat)} × total ${mo(totalDec)}). Revisar documento fonte.`,
        );
      }
    }
    const plv = parseMoneyToNumber(ir.patrimonioLiquido || "0");
    if (plv > 0) alertRow("ok", `Sem débitos com a Receita Federal`);

    // ─── IR detail tables ──────────────────────────────────────────────
    const bensArr    = ir.bensEDireitos    ?? [];
    const divsArr    = ir.dividasOnusReais ?? [];
    const pagsArr    = ir.pagamentosEfetuados ?? [];
    const totalBensN2 = parseMoneyToNumber(ir.totalBensDireitos || "0");
    const totalDivN2  = parseMoneyToNumber(ir.dividasOnus || "0");

    const ROW_H = 5.5;

    const tblTitle = (
      label: string,
      totalVal: number | null,
      bg: [number,number,number],
      bd: [number,number,number],
      fg: [number,number,number],
    ) => {
      checkPageBreak(ctx, 8);
      doc.setFillColor(...bg);
      doc.setDrawColor(...bd);
      doc.setLineWidth(0.25);
      doc.roundedRect(ML, pos.y, CW, 7, 1, 1, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...fg);
      doc.text(label, ML + 4, pos.y + 4.6);
      if (totalVal !== null) doc.text(mo(totalVal), ML + CW - 3, pos.y + 4.6, { align: "right" });
      pos.y += 7.5;
    };

    const subHeader = (label: string) => {
      checkPageBreak(ctx, ROW_H);
      doc.setFillColor(...P.n0);
      doc.rect(ML, pos.y, CW, ROW_H, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...P.n7);
      doc.text(label, ML + 4, pos.y + 3.8);
      pos.y += ROW_H;
    };

    const tblRow = (desc: string, valStr: string, rowIdx: number) => {
      checkPageBreak(ctx, ROW_H);
      if (rowIdx % 2 === 0) {
        doc.setFillColor(...P.x0);
        doc.rect(ML, pos.y, CW, ROW_H, "F");
      }
      const truncDesc = desc.length > 62 ? desc.slice(0, 60) + "…" : desc;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...P.x7);
      doc.text(truncDesc || "—", ML + 4, pos.y + 3.8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...P.x9);
      doc.text(valStr, ML + CW - 3, pos.y + 3.8, { align: "right" });
      pos.y += ROW_H;
    };

    // ── Tabela 1: Bens e Direitos ──
    if (bensArr.length > 0) {
      const bensTitleBg: [number,number,number] = totalDivN2 > totalBensN2 ? P.r0 : totalBensN2 > 0 ? P.g0 : P.n0;
      const bensTitleBd: [number,number,number] = totalDivN2 > totalBensN2 ? P.r1 : totalBensN2 > 0 ? P.g1 : P.n1;
      const bensTitleFg: [number,number,number] = totalDivN2 > totalBensN2 ? P.r6 : totalBensN2 > 0 ? P.g6 : P.n7;
      tblTitle("BENS E DIREITOS", totalBensN2, bensTitleBg, bensTitleBd, bensTitleFg);

      // Agrupar por grupo
      const grupoMap = new Map<string, typeof bensArr>();
      for (const b of bensArr) {
        const gKey = String(b.grupo || "").trim().padStart(2, "0");
        if (!grupoMap.has(gKey)) grupoMap.set(gKey, []);
        grupoMap.get(gKey)!.push(b);
      }
      for (const entry of Array.from(grupoMap.entries())) {
        const gKey = entry[0];
        const items = entry[1];
        subHeader(GRUPO_LABELS[gKey] ?? `GRUPO ${gKey}`);
        items.forEach((b, i) => tblRow(b.discriminacao, mo(b.valor_atual), i));
      }
      pos.y += 3;
    }

    // ── Tabela 2: Dívidas e Ônus Reais ──
    if (divsArr.length > 0) {
      const divTotal = divsArr.reduce((s, d) => s + (d.situacao_atual ?? 0), 0);
      tblTitle("DÍVIDAS E ÔNUS REAIS", divTotal, P.r0, P.r1, P.r6);
      divsArr.forEach((d, i) => tblRow(d.discriminacao, mo(d.situacao_atual), i));
      pos.y += 3;
    }

    // ── Tabela 3: Pagamentos Relevantes ──
    const pagsRelevantes = pagsArr
      .filter(p => (p.valor_pago ?? 0) > 10000)
      .sort((a, b) => (b.valor_pago ?? 0) - (a.valor_pago ?? 0))
      .slice(0, 5);

    if (pagsRelevantes.length > 0) {
      tblTitle("PAGAMENTOS RELEVANTES (> R$ 10k)", null, P.n0, P.n1, P.n7);
      pagsRelevantes.forEach((p, i) => {
        const label = p.nome_beneficiario || p.descricao || "—";
        tblRow(label, mo(p.valor_pago), i);
      });
      pos.y += 3;
    }
  }

  pos.y += 3;
}
