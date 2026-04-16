/**
 * Seção 01 — SÍNTESE PRELIMINAR
 * Fiel ao HTML de referência sintese-v3-esboco.html
 * 11 blocos: Empresa+Rating · Mapa+Sócios · Risk KPIs · Protestos+Processos
 *            Faturamento · SCR · ABC · Pleito · Fortes/Fracos · Percepção
 */
import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak, drawSpacer, fmtBR, parseMoneyToNumber, drawJustifiedText } from "../helpers";

// ── Utilitários ───────────────────────────────────────────────────────────────
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

function tr(s: string, n: number) {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}


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
  x3:  [209, 213, 219] as [number,number,number],
  x2:  [229, 231, 235] as [number,number,number],
  x1:  [243, 244, 246] as [number,number,number],
  x0:  [249, 250, 251] as [number,number,number],
  wh:  [255, 255, 255] as [number,number,number],
  gl:  [115, 184,  21] as [number,number,number],
};

export function renderSintese(ctx: PdfCtx): void {
  const { doc, pos, params, data, margin: ML, contentW: CW } = ctx;
  const { decision, finalRating, companyAge, pontosFortes, pontosFracos, resumoExecutivo, protestosVigentes } = params;

  const GAP = 3.5;

  // ── Formatador de dinheiro compacto ───────────────────────────────────────
  const mo = (v: string | number | null | undefined): string => {
    if (v == null || v === "") return "—";
    const n = typeof v === "number" ? v : parseMoneyToNumber(String(v));
    if (!isFinite(n) || n === 0) return "—";
    const a = Math.abs(n);
    const s = n < 0 ? "-" : "";
    if (a >= 1_000_000) return `${s}R$ ${fmtBR(a / 1_000_000, 2)}M`;
    if (a >= 1_000)     return `${s}R$ ${fmtBR(a / 1_000, 1)}k`;
    return `${s}R$ ${fmtBR(Math.round(a), 0)}`;
  };

  // ── Helpers de desenho ────────────────────────────────────────────────────
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

  const card = (x: number, y: number, w: number, h: number,
    bg: [number,number,number] = P.wh,
    bd: [number,number,number] = P.x2,
  ) => {
    doc.setFillColor(...bg);
    doc.setDrawColor(...bd);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
  };

  const badge = (text: string, x: number, y: number,
    bg: [number,number,number], fg: [number,number,number],
    fs = 6,
  ): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fs);
    const tw = doc.getTextWidth(text);
    const pw = tw + 5;
    doc.setFillColor(...bg);
    doc.roundedRect(x, y - 3.2, pw, 4.5, 1, 1, "F");
    doc.setTextColor(...fg);
    doc.text(text, x + 2.5, y + 0.5);
    return pw + 2;
  };

  const divider = () => {
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.2);
    doc.line(ML, pos.y, ML + CW, pos.y);
    pos.y += 4;
  };

  // ── Dados pré-calculados ──────────────────────────────────────────────────
  const validMeses = sortMes(
    Array.from(
      new Map(
        (data.faturamento?.meses || []).filter(m => m?.mes && m?.valor).map(m => [m.mes, m])
      ).values()
    )
  );
  const last12     = validMeses.slice(-12);
  const fmm12m     = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : last12.length > 0 ? last12.reduce((s,m) => s + parseMoneyToNumber(m.valor), 0) / last12.length : 0;
  const fatTotal12 = last12.reduce((s,m) => s + parseMoneyToNumber(m.valor), 0);

  const socios    = data.qsa?.quadroSocietario || [];
  const normCpfS  = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");
  const irPLMap:  Record<string, string> = {};
  (data.irSocios ?? []).forEach(ir => { const k = normCpfS(ir.cpf); if (k) irPLMap[k] = ir.patrimonioLiquido; });
  const moFmt = (n: number): string => {
    if (!isFinite(n) || n === 0) return "—";
    const a = Math.abs(n); const sg = n < 0 ? "-" : "";
    if (a >= 1_000_000) return `${sg}R$ ${(a/1_000_000).toFixed(2).replace(".",",")}M`;
    if (a >= 1_000)     return `${sg}R$ ${Math.round(a/1000)}k`;
    return `${sg}R$ ${Math.round(a)}`;
  };
  const scrRaw    = data.scr as unknown as Record<string,string|undefined>;
  const scrAntRaw = (data.scrAnterior || null) as unknown as Record<string,string|undefined>|null;
  const hasAnt    = scrAntRaw !== null;

  const scrCurto  = parseMoneyToNumber(scrRaw?.carteiraCurtoPrazo  || scrRaw?.carteiraAVencer || "0");
  const scrLongo  = parseMoneyToNumber(scrRaw?.carteiraLongoPrazo  || "0");
  const scrVenc   = parseMoneyToNumber(scrRaw?.vencidos            || "0");
  const scrPrej   = parseMoneyToNumber(scrRaw?.prejuizos           || "0");
  const scrLim    = parseMoneyToNumber(scrRaw?.limiteCredito       || "0");
  const scrTotal  = parseMoneyToNumber(scrRaw?.totalDividasAtivas  || "0");
  const scrInstit = parseInt(scrRaw?.qtdeInstituicoes || "0") || 0;
  const scrOps    = scrRaw?.qtdeOperacoes || "";

  const scrAntCurto = scrAntRaw ? parseMoneyToNumber(scrAntRaw.carteiraCurtoPrazo || scrAntRaw.carteiraAVencer || "0") : null;
  const scrAntLongo = scrAntRaw ? parseMoneyToNumber(scrAntRaw.carteiraLongoPrazo || "0") : null;
  const scrAntVenc  = scrAntRaw ? parseMoneyToNumber(scrAntRaw.vencidos || "0") : null;
  const scrAntPrej  = scrAntRaw ? parseMoneyToNumber(scrAntRaw.prejuizos || "0") : null;
  const scrAntLim   = scrAntRaw ? parseMoneyToNumber(scrAntRaw.limiteCredito || "0") : null;
  const scrAntTotal = scrAntRaw ? parseMoneyToNumber(scrAntRaw.totalDividasAtivas || "0") : null;

  const protAtivos = (data.protestos?.detalhes || []).filter(p => !p.regularizado);
  const protQtd    = protestosVigentes || protAtivos.length;
  const protVlr    = protAtivos.reduce((s,p) => s + parseMoneyToNumber(p.valor || "0"), 0);
  const protRec    = [...protAtivos].sort((a,b) => (b.data||"").localeCompare(a.data||""))[0] ?? null;

  const classifyP = (esp: string, cr: string, ap: string) => {
    const d = (esp+" "+cr+" "+ap).toLowerCase();
    if (/susta/i.test(d))   return "sustacao";
    if (/promiss|np/i.test(d)) return "np";
    if (/fidc|fundo/i.test(d)) return "fidc";
    if (/banco|bradesco|itau|santander|caixa|bnb|bndes/i.test(d)) return "banco";
    if (/execu/i.test(d))   return "execucao";
    return "outros";
  };
  const PTAG: Record<string,{bg:[number,number,number];fg:[number,number,number];label:string}> = {
    execucao: {bg:[232,213,245],fg:[107,33,168],label:"EXEC"},
    np:       {bg:P.n1,fg:P.n8,label:"N.P."},
    sustacao: {bg:P.a1,fg:P.a5,label:"SUST"},
    banco:    {bg:[219,234,254],fg:[29,78,216],label:"BANCO"},
    fidc:     {bg:P.g1,fg:P.g6,label:"FIDC"},
    outros:   {bg:P.x1,fg:P.x5,label:"OUTRO"},
  };
  const protByType = new Map<string,{qtd:number;valor:number}>();
  protAtivos.forEach(p => {
    const t = classifyP(p.especie||"", p.credor||"", p.apresentante||"");
    const e = protByType.get(t)||{qtd:0,valor:0};
    protByType.set(t, {qtd:e.qtd+1, valor:e.valor+parseMoneyToNumber(p.valor||"0")});
  });
  const protTypes = Array.from(protByType.entries()).sort((a,b)=>b[1].valor-a[1].valor).slice(0,5);

  const procPassivo = parseInt(data.processos?.poloPassivoQtd || data.processos?.passivosTotal || "0") || 0;
  const procAtivo   = parseInt(data.processos?.poloAtivoQtd   || data.processos?.ativosTotal   || "0") || 0;
  const procTotal   = procPassivo + procAtivo;
  const top10Rec    = data.processos?.top10Recentes || [];
  const bancarios   = data.processos?.bancarios     || [];
  const procRec     = top10Rec[0] ?? null;

  const classifyProc = (tipo: string, extra: string) => {
    const d = (tipo+" "+extra).toLowerCase();
    if (/fiscal|fazenda|sefaz|receita|pgfn/i.test(d)) return "fiscal";
    if (/banco|bradesco|itau|caixa|fidc|cobran/i.test(d)) return "banco";
    if (/trabalhist|reclamac/i.test(d)) return "trab";
    return "outros";
  };
  const CTAG: Record<string,{bg:[number,number,number];fg:[number,number,number];label:string}> = {
    fiscal: {bg:[232,213,245],fg:[107,33,168],label:"EX.FISC"},
    banco:  {bg:[219,234,254],fg:[29,78,216], label:"BANCO"},
    trab:   {bg:P.a1,fg:P.a5,               label:"TRAB"},
    outros: {bg:P.x1,fg:P.x5,              label:"OUTROS"},
  };
  const procByType = new Map<string,{qtd:number}>();
  top10Rec.forEach(p => {
    const t = classifyProc(p.tipo||p.assunto||"", p.tribunal||"");
    const e = procByType.get(t)||{qtd:0};
    procByType.set(t, {qtd:e.qtd+1});
  });
  if (bancarios.length > 0) {
    const e = procByType.get("banco")||{qtd:0};
    procByType.set("banco", {qtd:e.qtd+bancarios.length});
  }
  const procTypes = Array.from(procByType.entries()).sort((a,b)=>b[1].qtd-a[1].qtd).slice(0,5);

  const rvP       = data.relatorioVisita;
  const pleitoVal = rvP?.limiteTotal ? parseMoneyToNumber(rvP.limiteTotal) : 0;
  const abcList   = (data.curvaABC?.clientes || []).slice(0,5);

  const balAno    = data.balanco?.anos?.[0];
  const plVal     = parseMoneyToNumber(balAno?.patrimonioLiquido || "0");
  const lcVal     = parseFloat(balAno?.liquidezCorrente || "0") || 0;
  const endivPct  = parseFloat(balAno?.endividamentoTotal || "0") || 0;

  const decRaw    = (decision||"—").replace(/_/g," ").toUpperCase();
  const decAprov  = /APROV/i.test(decRaw) && !/CONDIC/i.test(decRaw);
  const decReprov = /REPROV/i.test(decRaw);
  const dec       = decAprov ? "Tend. Aprovação" : decReprov ? "Tend. Reprovação" : /CONDIC/i.test(decRaw) ? "Tend. Condicional" : "Pendente";
  const decColor: [number,number,number] = decAprov ? P.g6 : decReprov ? P.r6 : P.a5;
  const decBg:    [number,number,number] = decAprov ? P.g1 : decReprov ? P.r1 : P.a1;
  const score     = finalRating || 0;
  const scoreColor:[number,number,number] = score >= 6.5 ? P.g6 : score >= 5 ? P.a5 : P.r6;

  // ════════════════════════════════════════════════════════════════════════════
  newPage(ctx);
  drawHeader(ctx);

  // ── TÍTULO DA SEÇÃO ──────────────────────────────────────────────────────
  checkPageBreak(ctx, 8);
  stitle("Síntese Preliminar — Comitê de Crédito");

  // ════════════════════════════════════════════════════════════════════════════
  // B1 — Empresa + Rating
  // ════════════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 42);
    const y0    = pos.y;
    const RATEW = 44;
    const compW = CW - RATEW - GAP;

    // Razão social
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...P.n9);
    doc.text(tr(data.cnpj?.razaoSocial || "—", 50), ML, y0 + 7);

    // Nome fantasia
    const fan = tr(data.cnpj?.nomeFantasia || "", 55);
    if (fan) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...P.x5);
      doc.text(fan, ML, y0 + 12.5);
    }

    // CNPJ + situação
    const cnpjStr = data.cnpj?.cnpj || "—";
    const cnpjY   = y0 + (fan ? 20 : 14);
    doc.setFont("courier", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...P.x7);
    doc.text(cnpjStr, ML, cnpjY);
    const ctw = doc.getTextWidth(cnpjStr);
    const situ = (data.cnpj?.situacaoCadastral || "").toUpperCase().trim();
    if (situ) {
      const ativa = situ.includes("ATIVA");
      const sBg: [number,number,number] = ativa ? P.g1 : P.a1;
      const sFg: [number,number,number] = ativa ? P.g6 : P.a5;
      const lbl = situ.length > 12 ? situ.slice(0,12) : situ;
      doc.setFont("helvetica","bold"); doc.setFontSize(6);
      const ltw = doc.getTextWidth(lbl);
      doc.setFillColor(...sBg);
      doc.roundedRect(ML+ctw+2.5, cnpjY-3.5, ltw+5, 4.5, 1, 1, "F");
      doc.setTextColor(...sFg);
      doc.text(lbl, ML+ctw+5, cnpjY+0.3);
    }

    // Chips
    const chipsY = cnpjY + 7;
    let cx = ML;
    if (companyAge) cx += badge(companyAge, cx, chipsY, P.n0, P.n8);
    const reg = (data.cnpj?.regimeTributario || "").replace(/_/g," ").trim();
    if (reg)        cx += badge(reg, cx, chipsY, P.x1, P.x7);
    const cnae = data.cnpj?.cnaePrincipal || "";
    if (cnae)       cx += badge(`CNAE ${cnae}`, cx, chipsY, P.x1, P.x7);
    void cx;

    // Rating circle
    const rCx = ML + compW + RATEW/2;
    const rCy  = y0 + 13;
    const rR   = 10;
    doc.setDrawColor(...P.x2); doc.setLineWidth(2.5); doc.circle(rCx, rCy, rR, "S");
    doc.setDrawColor(...scoreColor); doc.setLineWidth(2); doc.circle(rCx, rCy, rR, "S");
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...scoreColor);
    doc.text(score.toFixed(1), rCx, rCy+2.5, {align:"center"});
    doc.setFont("helvetica","normal"); doc.setFontSize(5); doc.setTextColor(...P.x5);
    doc.text("Rating Capital", rCx, rCy+7.5, {align:"center"});

    // Decision badge
    const dlbl = dec;
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5);
    const dw = doc.getTextWidth(dlbl)+9;
    doc.setFillColor(...decBg);
    doc.roundedRect(rCx-dw/2, rCy+10, dw, 5.5, 1.5, 1.5, "F");
    doc.setTextColor(...decColor);
    doc.text(dlbl, rCx, rCy+14, {align:"center"});

    pos.y = chipsY + 6;
    divider();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B2 — Mapa + Sócios
  // ════════════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 73);
    stitle("Localização & Quadro Societário");
    const y0   = pos.y;
    const mapW = Math.round(CW * 0.42);
    const socW = CW - mapW - GAP;
    const H    = 65;

    // Mapa
    card(ML, y0, mapW, H);
    const imgData = params.streetViewBase64 || params.mapStaticBase64;
    if (imgData) {
      try { doc.addImage(imgData,"JPEG",ML+0.5,y0+0.5,mapW-1,H-1,undefined,"MEDIUM"); } catch { /* fallback */ }
    }
    if (!imgData) {
      doc.setFillColor(...P.x1);
      doc.roundedRect(ML, y0, mapW, H, 2, 2, "F");
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x4);
      doc.text("Mapa indisponível", ML+mapW/2, y0+H/2, {align:"center"});
    }

    // Sócios
    const sx = ML + mapW + GAP;
    card(sx, y0, socW, H);
    doc.setFillColor(...P.n9);
    doc.roundedRect(sx, y0, socW, 8, 2, 2, "F");
    doc.rect(sx, y0+4, socW, 4, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("SÓCIOS / QSA", sx+4, y0+5.8);

    const sl = socios.slice(0,6);
    if (sl.length === 0) {
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x4);
      doc.text("Sem dados", sx+socW/2, y0+H/2, {align:"center"});
    } else {
      const rh = (H-8) / Math.min(sl.length,6);
      sl.forEach((s,i) => {
        const ry = y0+8+i*rh;
        if (i%2===0) { doc.setFillColor(...P.x0); doc.rect(sx, ry, socW, rh, "F"); }
        // Nome
        doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.x9);
        doc.text(tr(s.nome||"—",28), sx+3, ry+4);
        // Qualificação
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
        doc.text(tr(s.qualificacao||"—",16), sx+3, ry+rh-2.5);
        // Participação (%) — direita topo
        const pct = (s.participacao||"—").replace("%","").trim();
        if (pct !== "—") {
          doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.n8);
          doc.text(pct+"%", sx+socW-3, ry+4, {align:"right"});
        }
        // Patrimônio Líquido (IR) — direita, linha do meio
        const cpfKey = normCpfS(s.cpfCnpj);
        const plRaw  = cpfKey ? irPLMap[cpfKey] : undefined;
        if (plRaw !== undefined) {
          const plNum  = parseMoneyToNumber(plRaw);
          const plStr  = moFmt(plNum);
          const plColor: [number,number,number] = plNum > 0 ? P.g6 : plNum < 0 ? P.r6 : P.x4;
          doc.setFont("courier","normal"); doc.setFontSize(5.5); doc.setTextColor(...plColor);
          doc.text("PL " + plStr, sx+socW-3, ry+rh/2+1.5, {align:"right"});
        }
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(sx+2, ry+rh, sx+socW-2, ry+rh);
      });
    }

    pos.y = y0 + H + 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B2b — Grupo Econômico dos Sócios
  // ════════════════════════════════════════════════════════════════════════════
  {
    const ge = data.grupoEconomico;
    const empresas = ge?.empresas ?? [];
    if (empresas.length > 0) {
      // Agrupa por socioOrigem
      const porSocio = new Map<string, typeof empresas>();
      empresas.forEach(e => {
        const k = e.socioOrigem || "Sem identificação";
        if (!porSocio.has(k)) porSocio.set(k, []);
        porSocio.get(k)!.push(e);
      });

      const rowH   = 6;
      const hdrH   = 7;
      const titleH = 7;
      const tblHeaderH = 5;
      const totalRows  = empresas.length;
      const groupCount = porSocio.size;
      const estimated  = titleH + (groupCount * hdrH) + tblHeaderH + (totalRows * rowH) + 8;
      checkPageBreak(ctx, Math.min(estimated, 60));
      stitle("Grupo Econômico dos Sócios");

      const normCnpj = (v: string) => (v ?? "").replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

      porSocio.forEach((emps, socio) => {
        // Sub-header do sócio
        checkPageBreak(ctx, hdrH + tblHeaderH + rowH * emps.length + 4);
        doc.setFillColor(...P.n0);
        doc.setDrawColor(...P.n1);
        doc.setLineWidth(0.2);
        doc.roundedRect(ML, pos.y, CW, hdrH, 2, 2, "FD");
        doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.n7);
        doc.text(`Via sócio: ${socio}`, ML + 4, pos.y + hdrH/2 + 1);
        doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.n8);
        doc.text(`${emps.length} empresa${emps.length > 1 ? "s" : ""}`, ML + CW - 4, pos.y + hdrH/2 + 1, { align: "right" });
        pos.y += hdrH + 1;

        // Cabeçalho da tabela
        const colW = [CW * 0.32, CW * 0.22, CW * 0.16, CW * 0.14, CW * 0.08, CW * 0.08];
        const colX = [ML, ML + colW[0], ML + colW[0]+colW[1], ML + colW[0]+colW[1]+colW[2],
                      ML + colW[0]+colW[1]+colW[2]+colW[3], ML + colW[0]+colW[1]+colW[2]+colW[3]+colW[4]];
        const cols = ["Razão Social","CNPJ","Relação","Situação","Prot.","Proc."];
        doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
        cols.forEach((c, i) => doc.text(c.toUpperCase(), colX[i] + 2, pos.y + 3.5));
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML, pos.y + tblHeaderH, ML + CW, pos.y + tblHeaderH);
        pos.y += tblHeaderH + 1;

        // Linhas
        emps.forEach((e, ri) => {
          checkPageBreak(ctx, rowH + 2);
          if (ri % 2 === 0) {
            doc.setFillColor(...P.x0);
            doc.rect(ML, pos.y, CW, rowH, "F");
          }

          // Razão Social
          const rsStr = (e.razaoSocial ?? "—").length > 28
            ? (e.razaoSocial ?? "—").slice(0, 27) + "…"
            : (e.razaoSocial ?? "—");
          doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...P.x9);
          doc.text(rsStr, colX[0] + 2, pos.y + rowH/2 + 1);

          // CNPJ
          doc.setFont("courier","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
          doc.text(normCnpj(e.cnpj ?? ""), colX[1] + 2, pos.y + rowH/2 + 1);

          // Relação (badge)
          const rel = (e.relacao ?? "via Sócio").slice(0, 14);
          doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...P.n7);
          const relW = doc.getTextWidth(rel);
          doc.setFillColor(...P.n0);
          doc.roundedRect(colX[2] + 2, pos.y + 1, relW + 4, 4, 1, 1, "F");
          doc.text(rel, colX[2] + 4, pos.y + rowH/2 + 1);

          // Situação (badge)
          const sit = (e.situacao ?? "ATIVA").slice(0, 10);
          const sitIsAtiva = sit.includes("ATIVA");
          const sitBg: [number,number,number] = sitIsAtiva ? P.g1 : P.r1;
          const sitFg: [number,number,number] = sitIsAtiva ? P.g6 : P.r6;
          const sitW = doc.getTextWidth(sit);
          doc.setFillColor(...sitBg);
          doc.roundedRect(colX[3] + 2, pos.y + 1, sitW + 4, 4, 1, 1, "F");
          doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...sitFg);
          doc.text(sit, colX[3] + 4, pos.y + rowH/2 + 1);

          // Protestos
          const protStr = (e.protestos && e.protestos !== "—") ? e.protestos : "—";
          const protColor: [number,number,number] = protStr !== "—" && protStr !== "0" ? P.r6 : P.g6;
          doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...protColor);
          doc.text(protStr, colX[4] + colW[4]/2, pos.y + rowH/2 + 1, { align: "center" });

          // Processos
          const procStr = (e.processos && e.processos !== "—") ? e.processos : "—";
          const procColor: [number,number,number] = procStr !== "—" && procStr !== "0" ? P.r6 : P.g6;
          doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...procColor);
          doc.text(procStr, colX[5] + colW[5]/2, pos.y + rowH/2 + 1, { align: "center" });

          doc.setDrawColor(...P.x1); doc.setLineWidth(0.1);
          doc.line(ML, pos.y + rowH, ML + CW, pos.y + rowH);
          pos.y += rowH;
        });

        pos.y += 4;
      });

      // Alerta de parentesco
      if (ge?.alertaParentesco && (ge.parentescosDetectados ?? []).length > 0) {
        checkPageBreak(ctx, 10);
        const msg = "Possível parentesco: " + ge.parentescosDetectados!
          .map(p => `${p.socio1} e ${p.socio2} (${p.sobrenomeComum})`).join("; ");
        const lines = doc.splitTextToSize(msg, CW - 24) as string[];
        const aH = Math.max(8, lines.length * 4 + 5);
        doc.setFillColor(...P.a0); doc.setDrawColor(...P.a1); doc.setLineWidth(0.25);
        doc.roundedRect(ML, pos.y, CW, aH, 2, 2, "FD");
        const tw = doc.getTextWidth("ATENÇÃO");
        doc.setFillColor(...P.a1);
        doc.roundedRect(ML + 3, pos.y + (aH-4.5)/2, tw+4, 4.5, 1, 1, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...P.a5);
        doc.text("ATENÇÃO", ML + 5, pos.y + aH/2 + 1);
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.a5);
        doc.text(lines, ML + tw + 10, pos.y + aH/2 - (lines.length-1)*2 + 1);
        pos.y += aH + 4;
      } else {
        pos.y += 2;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B3 — Indicadores de Risco (PL · Liquidez · Endividamento)
  // ════════════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 32);
    stitle("Indicadores Financeiros");
    const y0    = pos.y;
    const CH    = 22;
    const cw3   = (CW - GAP*2) / 3;

    // PL
    const plC: [number,number,number] = plVal < 0 ? P.r6 : P.g6;
    const plBg:[number,number,number] = plVal < 0 ? P.r0 : P.g0;
    const plBd:[number,number,number] = plVal < 0 ? P.r1 : P.g1;
    card(ML, y0, cw3, CH, plBg, plBd);
    doc.setFont("helvetica","bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
    doc.text("PATRIMÔNIO LÍQUIDO", ML+4, y0+5.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...plC);
    doc.text(mo(plVal), ML+4, y0+16);

    // Liquidez
    const lcC: [number,number,number] = lcVal >= 1 ? P.g6 : lcVal > 0 ? P.a5 : P.x4;
    const lcBg:[number,number,number] = lcVal >= 1 ? P.g0 : lcVal > 0 ? P.a0 : P.x0;
    const lcBd:[number,number,number] = lcVal >= 1 ? P.g1 : lcVal > 0 ? P.a1 : P.x2;
    const lx = ML + cw3 + GAP;
    card(lx, y0, cw3, CH, lcBg, lcBd);
    doc.setFont("helvetica","bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
    doc.text("LIQUIDEZ CORRENTE", lx+4, y0+5.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...lcC);
    doc.text(lcVal > 0 ? lcVal.toFixed(2).replace(".",",") : "—", lx+4, y0+16);

    // Endividamento
    const eC: [number,number,number] = endivPct > 100 ? P.r6 : endivPct > 60 ? P.a5 : P.g6;
    const eBg:[number,number,number] = endivPct > 100 ? P.r0 : endivPct > 60 ? P.a0 : P.g0;
    const eBd:[number,number,number] = endivPct > 100 ? P.r1 : endivPct > 60 ? P.a1 : P.g1;
    const ex = ML + (cw3+GAP)*2;
    card(ex, y0, cw3, CH, eBg, eBd);
    doc.setFont("helvetica","bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
    doc.text("ENDIVIDAMENTO", ex+4, y0+5.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...eC);
    doc.text(endivPct > 0 ? fmtBR(endivPct,0)+"%" : "—", ex+4, y0+16);

    pos.y = y0 + CH + 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B4+5 — Protestos + Processos
  // ════════════════════════════════════════════════════════════════════════════
  {
    const HDR = 15; const TAGROW = 7;
    const pRows = Math.max(1, Math.ceil(protTypes.length/3));
    const cRows = Math.max(1, Math.ceil(procTypes.length/3));
    const BOX_H = HDR + Math.max(pRows,cRows)*TAGROW + 10;

    checkPageBreak(ctx, BOX_H+12);
    stitle("Protestos & Processos Judiciais");
    const y0   = pos.y;
    const hw   = (CW-GAP)/2;

    const drawRBox = (
      bx: number, bw: number,
      title: string, sub: string,
      count: number, cc: [number,number,number],
      types: Array<[string,{qtd:number;valor?:number}]>,
      tagCfg: Record<string,{bg:[number,number,number];fg:[number,number,number];label:string}>,
      recent: string|null,
    ) => {
      card(bx, y0, bw, BOX_H);
      // Header
      doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(...P.n9);
      doc.text(title, bx+4, y0+6);
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...P.x5);
      doc.text(sub, bx+4, y0+11);
      // Count
      doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(...cc);
      doc.text(String(count), bx+bw-4, y0+HDR-1, {align:"right"});
      // Sep
      doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
      doc.line(bx+2, y0+HDR, bx+bw-2, y0+HDR);
      // Tags
      if (types.length > 0) {
        let tx = bx+4; let ty = y0+HDR+TAGROW;
        types.forEach(([type,info]) => {
          const cfg = tagCfg[type] || tagCfg["outros"] || {bg:P.x1,fg:P.x5,label:type.toUpperCase()};
          const lbl = `${cfg.label} ×${info.qtd}`;
          doc.setFont("helvetica","bold"); doc.setFontSize(6);
          const tw = doc.getTextWidth(lbl)+6;
          if (tx+tw > bx+bw-4) { tx=bx+4; ty+=TAGROW; }
          doc.setFillColor(...cfg.bg);
          doc.roundedRect(tx, ty-4, tw, 5, 1, 1, "F");
          doc.setTextColor(...cfg.fg);
          doc.text(lbl, tx+3, ty+0.3);
          tx += tw+2;
        });
      } else {
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.x4);
        doc.text(count===0?"Nenhum":"Sem detalhes", bx+4, y0+HDR+5);
      }
      // Recent
      if (recent) {
        const ry = y0+BOX_H-7;
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.2);
        doc.line(bx+2, ry-1, bx+bw-2, ry-1);
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
        doc.text(recent, bx+4, ry+4, {maxWidth:bw-8});
      }
    };

    const pSub = protQtd > 0 ? `${mo(protVlr)} · ${fmtBR(fmm12m>0?protVlr/fmm12m*100:0,0)}% do FMM` : "Sem protestos vigentes";
    const pColor: [number,number,number] = protQtd > 0 ? P.r6 : P.g6;
    const pRec = protRec ? tr(`Último: ${protRec.data||""} · ${mo(protRec.valor||"")} · ${protRec.credor||protRec.apresentante||""}`,55) : null;
    drawRBox(ML, hw, "Protestos", pSub, protQtd, pColor,
      protTypes as Array<[string,{qtd:number;valor?:number}]>, PTAG, pRec);

    const cSub = procTotal > 0 ? `${procPassivo} polo passivo · ${procTotal} total` : "Sem processos";
    const cColor: [number,number,number] = procPassivo > 0 ? P.r6 : P.g6;
    const cRec = procRec ? tr(`Recente: ${procRec.tipo||procRec.assunto||""}`,55) : null;
    drawRBox(ML+hw+GAP, hw, "Processos", cSub, procPassivo, cColor,
      procTypes as Array<[string,{qtd:number;valor?:number}]>, CTAG, cRec);

    pos.y = y0 + BOX_H + 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B6 — Faturamento (gráfico barras 12 meses)
  // ════════════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 56);
    stitle("Faturamento — Últimos 12 Meses");
    const y0    = pos.y;
    const CARDH = 50;
    const CHARTH = 28;
    const chartY = y0 + 4;

    card(ML, y0, CW, CARDH);

    if (last12.length === 0) {
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x4);
      doc.text("Sem dados de faturamento", ML+CW/2, y0+CARDH/2, {align:"center"});
    } else {
      const vals   = last12.map(m => parseMoneyToNumber(m.valor));
      const maxVal = Math.max(...vals, 1);
      const n      = last12.length;
      const baw    = CW - 8;
      const bw     = baw / n;
      const upTrend= n>=4 && vals.slice(-2).reduce((s,v)=>s+v,0) > vals.slice(-4,-2).reduce((s,v)=>s+v,0);

      last12.forEach((m,i) => {
        const v   = vals[i];
        const bh  = Math.max(v/maxVal*CHARTH, 0.5);
        const bx  = ML + 4 + i*bw;
        const by  = chartY + CHARTH - bh;
        const isr = i >= n-2;
        const bc: [number,number,number] = isr && !upTrend ? P.n1 : P.n7;
        doc.setFillColor(...bc);
        doc.roundedRect(bx+bw*0.12, by, bw*0.76, bh, 0.8, 0.8, "F");
        if (v > 0) {
          doc.setFont("helvetica","bold"); doc.setFontSize(4); doc.setTextColor(...P.x7);
          doc.text(mo(v).replace("R$ ",""), bx+bw/2, by-1, {align:"center"});
        }
        doc.setFont("helvetica","normal"); doc.setFontSize(4.5); doc.setTextColor(...P.x5);
        doc.text((m.mes||"").slice(0,3).toLowerCase(), bx+bw/2, chartY+CHARTH+5, {align:"center"});
      });

      // KPI row
      const ky = chartY + CHARTH + 10;
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.2);
      doc.line(ML+4, ky-2, ML+CW-4, ky-2);
      const kpis = [
        {l:"FMM (média 12m)", v:mo(fmm12m)},
        {l:"Total 12 meses",  v:mo(fatTotal12)},
        {l:"Meses c/ dado",   v:String(last12.length)},
      ];
      kpis.forEach((k,i) => {
        const kx = ML + 4 + i*(CW-8)/3;
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
        doc.text(k.l, kx, ky+3.5);
        doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...P.n8);
        doc.text(k.v, kx, ky+9.5);
      });
    }

    pos.y = y0 + CARDH + 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B7 — SCR Expandido
  // ════════════════════════════════════════════════════════════════════════════
  {
    checkPageBreak(ctx, 52);
    stitle("SCR — Sistema de Crédito");
    const y0   = pos.y;
    const RH   = 7; const HH = 8;
    const NOTE = scrInstit > 0 || scrOps ? 7 : 0;
    type SR = {label:string;cur:number;ant:number|null;bold?:boolean};
    const rows: SR[] = [
      {label:"Curto Prazo",       cur:scrCurto, ant:scrAntCurto},
      {label:"Longo Prazo",       cur:scrLongo, ant:scrAntLongo},
      {label:"Vencidos",          cur:scrVenc,  ant:scrAntVenc},
      {label:"Prejuízos",         cur:scrPrej,  ant:scrAntPrej},
      {label:"Limite de Crédito", cur:scrLim,   ant:scrAntLim},
      {label:"Total Dívidas",     cur:scrTotal, ant:scrAntTotal, bold:true},
    ];
    const TH = HH + rows.length*RH + NOTE + 4;
    card(ML, y0, CW, TH);

    // Header
    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
    doc.rect(ML, y0+2, CW, HH-2, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("Métrica", ML+4, y0+5.8);
    doc.text("Atual", ML+CW*0.55, y0+5.8);
    if (hasAnt) {
      doc.text("Anterior", ML+CW*0.72, y0+5.8);
      doc.text("Var.", ML+CW*0.9, y0+5.8);
    }

    rows.forEach((r,i) => {
      const ry = y0+HH+i*RH;
      if (i%2===0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
      doc.setFont("helvetica", r.bold?"bold":"normal"); doc.setFontSize(7);
      doc.setTextColor(...(r.bold?P.n9:P.x7));
      doc.text(r.label, ML+4, ry+5);
      doc.text(r.cur>0?mo(r.cur):"—", ML+CW*0.55, ry+5);
      if (hasAnt) {
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x5);
        doc.text(r.ant!==null&&r.ant>0?mo(r.ant):"—", ML+CW*0.72, ry+5);
        if (r.ant!==null&&r.ant>0&&r.cur>0) {
          const vp = (r.cur-r.ant)/r.ant*100;
          const vc: [number,number,number] = vp>0?P.r6:P.g6;
          doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...vc);
          doc.text((vp>0?"+":"")+fmtBR(vp,0)+"%", ML+CW*0.9, ry+5);
        }
      }
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML+2, ry+RH, ML+CW-2, ry+RH);
    });

    if (NOTE > 0) {
      const parts: string[] = [];
      if (scrInstit>0) parts.push(`${scrInstit} IF(s)`);
      if (scrOps)      parts.push(`${scrOps} op.`);
      doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
      doc.text(parts.join(" · "), ML+4, y0+TH-3);
    }
    pos.y = y0 + TH + 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B8 — Curva ABC
  // ════════════════════════════════════════════════════════════════════════════
  if (abcList.length > 0) {
    checkPageBreak(ctx, 45);
    stitle("Concentração de Clientes — Curva ABC");
    const y0  = pos.y;
    const RH3 = 10; const HH3 = 8; const SH = 7;
    const TH  = HH3 + abcList.length*RH3 + SH + 2;
    card(ML, y0, CW, TH);

    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, y0, CW, HH3, 2, 2, "F");
    doc.rect(ML, y0+2, CW, HH3-2, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("#",           ML+7,         y0+5.8, {align:"center"});
    doc.text("Cliente",     ML+16,         y0+5.8);
    doc.text("Faturamento", ML+CW*0.59,   y0+5.8);
    doc.text("% Rec.",      ML+CW*0.76,   y0+5.8);
    doc.text("Acum.",       ML+CW*0.87,   y0+5.8);
    doc.text("Cl.",         ML+CW*0.954,  y0+5.8);

    const abcMax = Math.max(1, ...abcList.map(c => parseMoneyToNumber(c.valorFaturado||"0")));
    abcList.forEach((c,i) => {
      const ry = y0+HH3+i*RH3;
      if (i%2===0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH3, "F"); }
      // Rank
      doc.setFillColor(...P.n8); doc.circle(ML+7, ry+RH3/2, 3.2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...P.wh);
      doc.text(String(i+1), ML+7, ry+RH3/2+1.2, {align:"center"});
      // Nome + bar
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.x9);
      doc.text(tr(c.nome||"—",32), ML+14, ry+5.5);
      const fat = parseMoneyToNumber(c.valorFaturado||"0");
      const bl  = Math.max(fat/abcMax*(CW*0.35),1);
      doc.setFillColor(...P.n7);
      doc.roundedRect(ML+14, ry+7, bl, 1.5, 0.5, 0.5, "F");
      // Values
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.x7);
      doc.text(mo(fat), ML+CW*0.59, ry+6);
      const pct = parseFloat(c.percentualReceita||"0");
      doc.setFont("helvetica","bold"); doc.setTextColor(...P.x7);
      doc.text(fmtBR(pct,1)+"%", ML+CW*0.76, ry+6);
      const acum = parseFloat(c.percentualAcumulado||"0");
      doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
      doc.text(fmtBR(acum,1)+"%", ML+CW*0.87, ry+6);
      // Classe
      const cl   = (c.classe||"A").toUpperCase();
      const cBg: [number,number,number] = cl==="A"?P.r1:cl==="B"?P.a1:P.x1;
      const cFg: [number,number,number] = cl==="A"?P.r6:cl==="B"?P.a5:P.x5;
      const clx  = ML+CW*0.956;
      doc.setFillColor(...cBg); doc.roundedRect(clx-3.5, ry+2.5, 9, 5, 1, 1, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...cFg);
      doc.text(cl, clx+1, ry+6.5, {align:"center"});
      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML+2, ry+RH3, ML+CW-2, ry+RH3);
    });

    const top3 = abcList.slice(0,3).reduce((s,c)=>s+parseFloat(c.percentualReceita||"0"),0);
    doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
    doc.text(`Top 3: ${fmtBR(top3,0)}% · Total: ${abcList.length} cliente(s)`, ML+4, y0+TH-3);
    pos.y = y0+TH+5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B9 — Pleito
  // ════════════════════════════════════════════════════════════════════════════
  if (rvP) {
    checkPageBreak(ctx, 32);
    stitle("Pleito");
    const y0   = pos.y;
    const CARDH= 22;
    const cw4  = (CW - GAP*3)/4;
    const taxa  = rvP.taxaConvencional || rvP.taxaComissaria || "—";
    const cards = [
      {l:"VALOR PLEITEADO", v:pleitoVal>0?mo(pleitoVal):"—"},
      {l:"MODALIDADE",      v:tr(rvP.modalidade||"—",18)},
      {l:"PRAZO MÁXIMO",    v:String(rvP.prazoMaximoOp||"—")},
      {l:"TAXA",            v:String(taxa)},
    ];
    cards.forEach((c,i) => {
      const cx = ML + i*(cw4+GAP);
      card(cx, y0, cw4, CARDH);
      doc.setFont("helvetica","bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x5);
      doc.text(c.l, cx+4, y0+5.5);
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...P.n8);
      doc.text(c.v, cx+4, y0+16);
    });
    pos.y = y0+CARDH+5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B10 — Pontos Fortes & Fracos
  // ════════════════════════════════════════════════════════════════════════════
  {
    const pf = pontosFortes.slice(0,5);
    const pw = pontosFracos.slice(0,5);
    if (pf.length > 0 || pw.length > 0) {
      const rows = Math.max(pf.length, pw.length, 1);
      const RH4  = 7; const HH4 = 8;
      const CARDH= HH4 + rows*RH4 + 4;
      checkPageBreak(ctx, CARDH+12);
      stitle("Pontos Fortes & Fracos");
      const y0 = pos.y;
      const hw = (CW-GAP)/2;

      // Fortes
      card(ML, y0, hw, CARDH, P.g0, P.g1);
      doc.setFillColor(...P.g6);
      doc.roundedRect(ML, y0, hw, HH4, 2, 2, "F"); doc.rect(ML, y0+2, hw, HH4-2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
      doc.text("PONTOS FORTES", ML+4, y0+5.8);
      pf.forEach((item,i) => {
        const iy = y0+HH4+i*RH4;
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
        doc.setTextColor(...P.g6); doc.text("✓", ML+3, iy+5);
        doc.setTextColor(...P.x7); doc.text(tr(item,45), ML+8, iy+5);
        doc.setDrawColor(...P.g1); doc.setLineWidth(0.15);
        doc.line(ML+2, iy+RH4, ML+hw-2, iy+RH4);
      });

      // Fracos
      const fx = ML+hw+GAP;
      card(fx, y0, hw, CARDH, P.r0, P.r1);
      doc.setFillColor(...P.r6);
      doc.roundedRect(fx, y0, hw, HH4, 2, 2, "F"); doc.rect(fx, y0+2, hw, HH4-2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
      doc.text("PONTOS FRACOS", fx+4, y0+5.8);
      pw.forEach((item,i) => {
        const iy = y0+HH4+i*RH4;
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
        doc.setTextColor(...P.r6); doc.text("✕", fx+3, iy+5);
        doc.setTextColor(...P.x7); doc.text(tr(item,45), fx+8, iy+5);
        doc.setDrawColor(...P.r1); doc.setLineWidth(0.15);
        doc.line(fx+2, iy+RH4, fx+hw-2, iy+RH4);
      });

      pos.y = y0+CARDH+5;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B11 — Percepção do Analista (bloco editorial diferenciado)
  // ════════════════════════════════════════════════════════════════════════════
  {
    const texto = (resumoExecutivo || "").trim();
    const HEADER_H = 9;
    const FOOTER_H = 8;

    if (texto) {
      const bodyLines = doc.splitTextToSize(texto, CW - 16) as string[];
      const maxLines  = 8;
      const visLines  = bodyLines.slice(0, maxLines);
      if (bodyLines.length > maxLines) visLines[maxLines-1] = visLines[maxLines-1].replace(/…?$/, "…");
      const BODY_H  = Math.max(22, visLines.length * 4.8 + 10);
      const TOTAL_H = HEADER_H + BODY_H + FOOTER_H;

      checkPageBreak(ctx, TOTAL_H + 12);
      stitle("Percepção do Analista");
      const y0 = pos.y;

      // ── Header navy900 ──────────────────────────────────────────────────────
      doc.setFillColor(...P.n9);
      doc.roundedRect(ML, y0, CW, HEADER_H + 2, 2, 2, "F");
      doc.rect(ML, y0 + 3, CW, HEADER_H - 1, "F"); // achatar canto inferior
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
      doc.text("PERCEPÇÃO DO ANALISTA", ML + 5, y0 + 6);

      // Badge decisão no header (direita)
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5);
      const dlbl = dec;
      const dw   = doc.getTextWidth(dlbl) + 8;
      doc.setFillColor(...decColor);
      doc.roundedRect(ML + CW - dw - 3, y0 + 1.5, dw, 6, 1.5, 1.5, "F");
      doc.setTextColor(...P.wh);
      doc.text(dlbl, ML + CW - dw/2 - 3, y0 + 6, { align: "center" });

      // ── Corpo navy50, texto itálico ─────────────────────────────────────────
      doc.setFillColor(...P.n0);
      doc.rect(ML, y0 + HEADER_H, CW, BODY_H, "F");
      doc.setFont("helvetica","italic"); doc.setFontSize(8); doc.setTextColor(...P.x7);
      drawJustifiedText(doc, visLines, ML + 8, y0 + HEADER_H + 8, CW - 16, 4.8);

      // ── Rodapé referência à seção 03 ────────────────────────────────────────
      doc.setFillColor(...P.x0);
      doc.rect(ML, y0 + HEADER_H + BODY_H, CW, FOOTER_H, "F");
      doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
      doc.roundedRect(ML, y0, CW, TOTAL_H, 2, 2, "D"); // borda
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.x5);
      doc.text("Ver parecer completo na seção 03  →", ML + 5, y0 + HEADER_H + BODY_H + 5);

      pos.y = y0 + TOTAL_H + 5;
    } else {
      checkPageBreak(ctx, 24);
      stitle("Percepção do Analista");
      const y0 = pos.y;
      card(ML, y0, CW, 18);
      doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...P.x4);
      doc.text("Percepção do analista pendente", ML + CW/2, y0 + 10, { align: "center" });
      pos.y = y0 + 23;
    }
  }

  drawSpacer(ctx, 4);
}
