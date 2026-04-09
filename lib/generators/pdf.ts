import type { ExtractedData, AIAnalysis } from "@/types";

type AlertSeverity = "ALTA" | "MODERADA" | "INFO";
interface Alert { message: string; severity: AlertSeverity; impacto?: string; }

export interface PDFReportParams {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  alerts: Alert[];
  alertsHigh: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  resumoExecutivo: string;
  companyAge: string;
  protestosVigentes: number;
  vencidosSCR: number;
  vencidas: number;
  prejuizosVal: number;
  dividaAtiva: number;
  atraso: number;
  riskScore: "alto" | "medio" | "baixo";
  decisionColor: string;
  decisionBg: string;
  decisionBorder: string;
  alavancagem?: number;
  observacoes?: string;
  streetViewBase64?: string;
}

// ─── Design System ───────────────────────────────────────────────────────────
const DS = {
  colors: {
    headerBg: [26, 46, 74] as [number,number,number],
    accent: [232, 160, 32] as [number,number,number],
    pageBg: [241, 243, 245] as [number,number,number],
    cardBg: [255, 255, 255] as [number,number,number],
    zebraRow: [248, 249, 250] as [number,number,number],
    border: [229, 231, 235] as [number,number,number],
    borderStrong: [209, 213, 219] as [number,number,number],
    danger: [220, 38, 38] as [number,number,number],
    dangerBg: [254, 226, 226] as [number,number,number],
    dangerText: [153, 27, 27] as [number,number,number],
    warn: [217, 119, 6] as [number,number,number],
    warnBg: [254, 243, 199] as [number,number,number],
    warnText: [133, 77, 14] as [number,number,number],
    info: [37, 99, 235] as [number,number,number],
    infoBg: [219, 234, 254] as [number,number,number],
    infoText: [29, 78, 216] as [number,number,number],
    success: [22, 163, 74] as [number,number,number],
    successBg: [220, 252, 231] as [number,number,number],
    successText: [22, 101, 52] as [number,number,number],
    textPrimary: [17, 24, 39] as [number,number,number],
    textMuted: [107, 114, 128] as [number,number,number],
    textLight: [156, 163, 175] as [number,number,number],
  },
};

// ─── Standalone helpers (não dependem de doc) ────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatBRL(value: string | number): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatK(value: string | number): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('pt-BR') + 'k';
  return Math.round(n).toLocaleString('pt-BR');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

// ─────────────────────────────────────────────────────────────────────────────

function parseMoneyToNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtBR(n: number, decimals = 0): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Normaliza qualquer string monetária para o formato brasileiro com separadores corretos
// Ex: "1234567,89" → "1.234.567,89" | "1234567.89" → "1.234.567,89"
function fmtMoney(val: string | undefined | null): string {
  if (!val || val === "N/D" || val === "—") return val || "—";
  const n = parseMoneyToNumber(val);
  if (n === 0 && !val.match(/^[0,\.]+$/)) return val; // preserva strings não-numéricas
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVar(pct: number): string {
  const arrow = pct > 0 ? "↑ +" : pct < 0 ? "↓ " : "→ ";
  return arrow + fmtBR(Math.abs(pct), 1) + "%";
}

function normalizeTendencia(val: string | undefined | null): string {
  if (!val) return "—";
  const lower = val.toLowerCase();
  if (lower.includes("crescimento") || lower.includes("alta") || lower.includes("positiv"))
    return "↑ Crescimento";
  if (lower.includes("queda") || lower.includes("baixa") || lower.includes("negativ") || lower.includes("declín"))
    return "↓ Queda";
  if (lower.includes("estavel") || lower.includes("estável") || lower.includes("neutro") || lower.includes("estáv"))
    return "→ Estável";
  return "—";
}

// ─── Alertas determinísticos por seção ───────────────────────────────────────
type NivelAlerta = 'alta' | 'media' | 'info';
type AlertaDet = { nivel: NivelAlerta; mensagem: string };

function gerarAlertasFaturamento(
  fat: { meses?: { mes: string; valor: string }[]; fmm12m?: string; fmmMedio?: string } | undefined,
  validMeses: { mes: string; valor: string }[]
): AlertaDet[] {
  const out: AlertaDet[] = [];
  const ultimos6 = validMeses.slice(-6);
  ultimos6.filter(m => parseMoneyToNumber(m.valor) === 0).forEach(m => {
    out.push({ nivel: 'alta', mensagem: `Faturamento zerado em ${m.mes} — verificar interrupção de operação` });
  });
  if (validMeses.length >= 6) {
    const rec = validMeses.slice(-3).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0);
    const ant = validMeses.slice(-6, -3).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0);
    if (ant > 0) {
      const pct = ((rec - ant) / ant) * 100;
      if (pct < -20) out.push({ nivel: 'media', mensagem: `Queda de ${fmtBR(Math.abs(pct), 0)}% no faturamento recente — monitorar tendência` });
      if (pct > 50) out.push({ nivel: 'info', mensagem: `Crescimento acelerado de ${fmtBR(pct, 0)}% — validar sustentabilidade` });
    }
  }
  const fmm = parseMoneyToNumber(fat?.fmm12m || fat?.fmmMedio || '0');
  if (fmm >= 300000 && fmm < 500000) {
    out.push({ nivel: 'info', mensagem: `FMM próximo ao limite mínimo (R$${fmtBR(fmm / 1000, 0)}k) — margem reduzida` });
  }
  return out;
}

function gerarAlertasSCR(
  scr: { vencidos?: string; prejuizos?: string; limiteCredito?: string; totalDividasAtivas?: string } | undefined,
  scrAnterior: { limiteCredito?: string; totalDividasAtivas?: string } | null | undefined,
  fmmVal: number
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!scr) return out;
  const vencidos = parseMoneyToNumber(scr.vencidos || '0');
  if (vencidos > 0) out.push({ nivel: 'alta', mensagem: `SCR com R$ ${fmtMoney(scr.vencidos)} em operações vencidas` });
  const prej = parseMoneyToNumber(scr.prejuizos || '0');
  if (prej > 0) out.push({ nivel: 'alta', mensagem: `Operações em prejuízo identificadas no SCR — R$ ${fmtMoney(scr.prejuizos)}` });
  if (scrAnterior?.limiteCredito) {
    const limAt = parseMoneyToNumber(scr.limiteCredito || '0');
    const limAnt = parseMoneyToNumber(scrAnterior.limiteCredito);
    if (limAnt > 0 && limAt < limAnt) {
      const pct = ((limAnt - limAt) / limAnt) * 100;
      if (pct > 50) out.push({ nivel: 'media', mensagem: `Limite de crédito reduzido em ${fmtBR(pct, 0)}% nos últimos 12 meses` });
    }
  }
  if (fmmVal > 0) {
    const alav = parseMoneyToNumber(scr.totalDividasAtivas || '0') / fmmVal;
    if (alav > 1.5) out.push({ nivel: 'media', mensagem: `Alavancagem de ${fmtBR(alav, 1)}x — acima do patamar conservador` });
  }
  if (scrAnterior?.totalDividasAtivas) {
    const divAt = parseMoneyToNumber(scr.totalDividasAtivas || '0');
    const divAnt = parseMoneyToNumber(scrAnterior.totalDividasAtivas);
    if (divAnt > 0 && divAt < divAnt) {
      const pct = ((divAnt - divAt) / divAnt) * 100;
      if (pct > 50) out.push({ nivel: 'info', mensagem: `Redução expressiva de dívida (${fmtBR(pct, 0)}%) — pode indicar renegociação` });
    }
  }
  return out;
}

function gerarAlertasDRE(
  dre: { anos?: { margemLiquida?: string; margemBruta?: string; ebitda?: string }[] } | undefined
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!dre?.anos?.length) return out;
  const u = dre.anos[dre.anos.length - 1];
  const ml = parseFloat(String(u.margemLiquida || '0').replace(',', '.')) || 0;
  const mb = parseFloat(String(u.margemBruta || '0').replace(',', '.')) || 0;
  if (ml < 0) {
    out.push({ nivel: 'alta', mensagem: `Empresa com prejuízo líquido — margem de ${fmtBR(ml, 1)}%` });
  } else if (ml > 0 && ml < 3) {
    out.push({ nivel: 'info', mensagem: `Margem líquida reduzida (${fmtBR(ml, 1)}%) — baixa tolerância a choques` });
  }
  if (!u.ebitda || parseMoneyToNumber(u.ebitda) === 0) {
    out.push({ nivel: 'media', mensagem: `EBITDA não calculado — dados de depreciação/amortização ausentes` });
  }
  if (mb > 0 && mb < 10) {
    out.push({ nivel: 'media', mensagem: `Margem bruta baixa (${fmtBR(mb, 1)}%) — estrutura de custos pressionada` });
  }
  return out;
}

function gerarAlertasBalanco(
  balanco: { anos?: { patrimonioLiquido?: string; liquidezCorrente?: string; capitalDeGiroLiquido?: string; endividamentoTotal?: string }[] } | undefined
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!balanco?.anos?.length) return out;
  const u = balanco.anos[balanco.anos.length - 1];
  const pl = parseMoneyToNumber(u.patrimonioLiquido || '0');
  const lc = parseFloat(String(u.liquidezCorrente || '0').replace(',', '.')) || 0;
  const cg = parseMoneyToNumber(u.capitalDeGiroLiquido || '0');
  const end = parseFloat(String(u.endividamentoTotal || '0').replace(',', '.')) || 0;
  if (pl < 0) out.push({ nivel: 'alta', mensagem: `Patrimônio Líquido negativo (R$ ${fmtMoney(u.patrimonioLiquido)}) — passivo a descoberto` });
  if (lc > 0 && lc < 0.5) {
    out.push({ nivel: 'alta', mensagem: `Liquidez Corrente de ${fmtBR(lc, 2)} — risco elevado de inadimplência de curto prazo` });
  } else if (lc >= 0.5 && lc < 1.0) {
    out.push({ nivel: 'info', mensagem: `Liquidez Corrente de ${fmtBR(lc, 2)} — abaixo do ideal (> 1,0)` });
  }
  if (cg < 0) out.push({ nivel: 'media', mensagem: `Capital de Giro negativo (R$ ${fmtMoney(u.capitalDeGiroLiquido)}) — dependência de financiamento externo` });
  if (end > 150) out.push({ nivel: 'media', mensagem: `Endividamento de ${fmtBR(end, 0)}% — estrutura de capital alavancada` });
  return out;
}

function gerarAlertasQSA(
  qsa: { quadroSocietario?: { nome?: string }[] } | undefined,
  contrato: { temAlteracoes?: boolean } | undefined
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (contrato?.temAlteracoes) out.push({ nivel: 'media', mensagem: `Alteração societária recente — verificar motivação e impacto` });
  const socios = (qsa?.quadroSocietario || []).filter(s => s.nome);
  if (socios.length === 1) out.push({ nivel: 'info', mensagem: `Empresa com sócio único — risco de concentração de gestão` });
  return out;
}

function gerarAlertasIRSocios(
  irSocios: { nomeSocio?: string; anoBase?: string; debitosEmAberto?: boolean }[] | undefined,
  anoAtual: number
): AlertaDet[] {
  const out: AlertaDet[] = [];
  if (!irSocios?.length) return out;
  irSocios.forEach(ir => {
    if (!ir.nomeSocio && !ir.anoBase) return;
    const nome = ir.nomeSocio || 'Sócio';
    if (ir.debitosEmAberto) out.push({ nivel: 'alta', mensagem: `Sócio ${nome} com débitos em aberto na Receita Federal` });
    if (ir.anoBase) {
      const ano = parseInt(ir.anoBase);
      if (!isNaN(ano) && (anoAtual - ano) > 2) out.push({ nivel: 'media', mensagem: `IR do sócio ${nome} desatualizado — ano-base ${ir.anoBase}` });
    }
  });
  return out;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function buildPDFReport(p: PDFReportParams): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data, aiAnalysis, decision, finalRating, alerts, alertsHigh, pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo, companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal, dividaAtiva, atraso, riskScore, decisionColor, decisionBg, decisionBorder } = p;

  // Parse de mês suportando MM/YYYY e MMM/YY (ex: "Jan/25")
  const parseDateKey = (s: string): number => {
    if (!s) return 0;
    const parts = s.split("/");
    if (parts.length !== 2) return 0;
    const [p1, p2] = parts;
    const monthMap: Record<string, number> = {
      jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
      jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12
    };
    const month = isNaN(Number(p1)) ? (monthMap[p1.toLowerCase()] || 0) : Number(p1);
    const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
    return year * 100 + month;
  };

  const validMeses = [...(data.faturamento?.meses || [])]
    .filter(m => m?.mes && m?.valor)
    .sort((a, b) => parseDateKey(a.mes) - parseDateKey(b.mes));

  // Usa fmm12m já calculado pelo fillFaturamentoDefaults — não recalcula
  const fmmNum = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : validMeses.slice(-12).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / 12;

  // Todos os meses extraídos
  const mesesFMM = validMeses;

  const scrNum = parseMoneyToNumber(data.scr?.totalDividasAtivas || "0");
  const alavancagem = p.alavancagem ?? (fmmNum > 0 ? scrNum / fmmNum : 0);
  const faturamentoRealmenteZerado = fmmNum === 0 || (data.faturamento.meses || []).length === 0 || (data.faturamento.meses || []).every(m => parseMoneyToNumber(m.valor) === 0);

  // ── Alertas determinísticos (pré-computados antes do jsPDF) ──
  const _anoAtual = new Date().getFullYear();
  const alertasFat = gerarAlertasFaturamento(data.faturamento, validMeses);
  const alertasSCR = gerarAlertasSCR(data.scr, data.scrAnterior, fmmNum);
  const alertasDRE = gerarAlertasDRE(data.dre);
  const alertasBalanco = gerarAlertasBalanco(data.balanco);
  const alertasQSA = gerarAlertasQSA(data.qsa, data.contrato);
  const alertasIR = gerarAlertasIRSocios(data.irSocios, _anoAtual);
  const alertasAltaDet = [...alertasFat, ...alertasSCR, ...alertasDRE, ...alertasBalanco, ...alertasQSA, ...alertasIR].filter(a => a.nivel === 'alta');

  // TODO: substituir por dados reais após integração Credit Hub
  // Detecta se protestos/processos foram realmente consultados ou apenas defaults vazios
  const protestosNaoConsultados = !data.protestos?.vigentesQtd && !data.protestos?.vigentesValor
    && (data.protestos?.detalhes || []).length === 0;
  const processosNaoConsultados = !data.processos?.passivosTotal && !data.processos?.valorTotalEstimado
    && !(data.processos?.temRJ)
    && (data.processos?.distribuicao || []).length === 0;

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = 0;

  const colors = {
    bg: [32, 59, 136] as [number, number, number],
    primary: [32, 59, 136] as [number, number, number],
    accent: [115, 184, 21] as [number, number, number],
    "accent-light": [168, 217, 107] as [number, number, number],
    surface: [255, 255, 255] as [number, number, number],
    surface2: [237, 242, 251] as [number, number, number],
    surface3: [220, 232, 248] as [number, number, number],
    text: [17, 24, 39] as [number, number, number],
    textSec: [55, 65, 81] as [number, number, number],
    textMuted: [107, 114, 128] as [number, number, number],
    border: [209, 220, 240] as [number, number, number],
    warning: [217, 119, 6] as [number, number, number],
    danger: [220, 38, 38] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    navy: [32, 59, 136] as [number, number, number],
    navyLight: [26, 48, 112] as [number, number, number],
    green: [22, 163, 74] as [number, number, number],
    amber: [217, 119, 6] as [number, number, number],
    red: [220, 38, 38] as [number, number, number],
  };

  const pageCount = { n: 0 };
  const footerDateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const newPage = () => {
    if (pageCount.n > 0) doc.addPage();
    pageCount.n++;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFillColor(...colors.navy);
    doc.rect(0, 0, 210, 1.5, "F");
    y = 1.5;
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > 275) { newPage(); drawHeader(); }
  };

  const drawHeader = () => {
    doc.setFillColor(...colors.navy);
    doc.rect(0, 1.5, 210, 32, "F");
    doc.setFillColor(...colors.accent);
    doc.rect(0, 33.5, 210, 2, "F");

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.2);
    doc.circle(margin + 7, 12, 7);
    doc.setFillColor(255, 255, 255);
    doc.circle(margin + 7, 20.5, 1.5, "F");

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("capital", margin + 17, 16);
    doc.setTextColor(...colors["accent-light"]);
    doc.text("financas", margin + 17 + doc.getTextWidth("capital") + 1, 16);

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 240);
    doc.text("CONSOLIDADOR DE DOCUMENTOS", margin + 17, 21);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Relatório de Due Diligence", W - margin, 13, { align: "right" });

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 240);
    const now = new Date();
    const dtStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    doc.text(`Gerado em ${dtStr}`, W - margin, 20, { align: "right" });

    if (data.cnpj.razaoSocial) {
      doc.setFontSize(7);
      doc.setTextColor(180, 200, 240);
      doc.text(data.cnpj.razaoSocial.substring(0, 45), W - margin, 26, { align: "right" });
    }

    y = 42;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const drawSectionTitle = (num: string, title: string, color: [number, number, number]) => {
    checkPageBreak(16);
    doc.setFillColor(...colors.surface2);
    doc.roundedRect(margin, y, contentW, 10, 1.5, 1.5, "F");
    doc.setFillColor(...color);
    doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(num, margin + 7, y + 6.5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(title, margin + 14, y + 6.5);
    y += 14;
  };

  const drawField = (label: string, value: string, fullWidth = false) => {
    if (!value) return;
    checkPageBreak(14);
    const fieldW = fullWidth ? contentW : contentW / 2 - 2;
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, y, fieldW, 12, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(label.toUpperCase(), margin + 4, y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    const displayVal = value.length > (fullWidth ? 80 : 35) ? value.substring(0, fullWidth ? 80 : 35) + "..." : value;
    doc.text(displayVal, margin + 4, y + 9.5);
    y += 14;
  };

  const drawFieldRow = (fields: Array<{ label: string; value: string }>) => {
    const validFields = fields.filter((f) => f.value);
    if (validFields.length === 0) return;
    checkPageBreak(14);
    const fieldW = contentW / validFields.length - 2;
    let x = margin;
    validFields.forEach((field) => {
      doc.setFillColor(...colors.surface);
      doc.roundedRect(x, y, fieldW, 12, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(field.label.toUpperCase(), x + 4, y + 4.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      const maxChars = Math.floor(fieldW / 2.8);
      const displayVal = field.value.length > maxChars ? field.value.substring(0, maxChars) + "..." : field.value;
      doc.text(displayVal, x + 4, y + 9.5);
      x += fieldW + 4;
    });
    y += 14;
  };

  const drawMultilineField = (label: string, value: string, maxLines = 6) => {
    if (!value) return;
    const lineH = 5;
    const paddingV = 6;
    const maxWidth = contentW - 8;
    const lines = doc.splitTextToSize(value, maxWidth);
    const displayLines = lines.slice(0, maxLines);
    const boxH = displayLines.length * lineH + paddingV * 2 + 6;
    checkPageBreak(boxH + 4);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, y, contentW, boxH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(label.toUpperCase(), margin + 4, y + 5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    displayLines.forEach((line: string, i: number) => {
      doc.text(line, margin + 4, y + paddingV + 5 + i * lineH);
    });
    if (lines.length > maxLines) {
      doc.setFontSize(7);
      doc.setTextColor(...colors.textMuted);
      doc.text(`+ ${lines.length - maxLines} linha(s) omitida(s)...`, margin + 4, y + boxH - 2);
    }
    y += boxH + 4;
  };

  const drawSpacer = (h = 6) => { y += h; };

  // ─── autoT: helper universal baseado em jspdf-autotable ───────────────────
  // Substitui drawTable e todos os drawProcTableHeader+drawProcRow manuais.
  // Suporta células com { content, styles } para cor/bold por célula.
  type AutoCell = string | { content: string; styles?: Record<string, unknown> };
  const autoT = (
    headers: string[],
    rows: AutoCell[][],
    colWidths: number[],
    opts?: {
      headFill?: [number, number, number];
      headTextColor?: [number, number, number];
      fontSize?: number;
      headFontSize?: number;
      gap?: number;         // espaço extra após tabela (padrão 4)
      minCellHeight?: number;
    }
  ) => {
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const scale = contentW / (totalW || contentW);
    const scaledWidths = colWidths.map(w => w * scale);

    const headFill = opts?.headFill ?? colors.navy;
    const headText = opts?.headTextColor ?? ([255, 255, 255] as [number, number, number]);
    const fs = opts?.fontSize ?? 7;
    const hfs = opts?.headFontSize ?? 5.5;
    const gap = opts?.gap ?? 4;

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: "plain",
      styles: {
        fontSize: fs,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        overflow: "linebreak",
        lineColor: [230, 230, 230],
        lineWidth: 0.1,
        textColor: colors.text,
        font: "helvetica",
        minCellHeight: opts?.minCellHeight ?? 6,
      },
      headStyles: {
        fillColor: headFill,
        textColor: headText,
        fontStyle: "bold",
        fontSize: hfs,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      },
      alternateRowStyles: {
        fillColor: colors.surface2,
      },
      bodyStyles: {
        fillColor: colors.surface,
      },
      columnStyles: scaledWidths.reduce((acc, w, i) => {
        acc[i] = { cellWidth: w };
        return acc;
      }, {} as Record<number, { cellWidth: number }>),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + gap;
  };

  // Helper: draw simple table (mantido para compatibilidade — delega ao autoT)
  const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
    autoT(headers, rows, colWidths, {
      headFill: colors.surface2,
      headTextColor: colors.textMuted,
      headFontSize: 6.5,
      fontSize: 7.5,
    });
  };

  // Helper: draw alert box in PDF — card branco, borda sutil, acento esquerdo colorido
  const drawAlertBox = (text: string, severity: AlertSeverity, subtitle?: string) => {
    const lineH = subtitle ? 5 : 0;
    const cardH = 11 + lineH;
    checkPageBreak(cardH + 2);
    const accentC: [number,number,number] = severity === "ALTA" ? [220,38,38] : severity === "MODERADA" ? [217,119,6] : [37,99,235];
    const badgeC: [number,number,number] = severity === "ALTA" ? [220,38,38] : severity === "MODERADA" ? [217,119,6] : [37,99,235];
    const badgeBg: [number,number,number] = severity === "ALTA" ? [254,226,226] : severity === "MODERADA" ? [254,243,199] : [219,234,254];
    const badgeLabel = severity === "ALTA" ? "ALTA" : severity === "MODERADA" ? "MODERADO" : "INFO";
    // Card fundo branco
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, contentW, cardH, 1.5, 1.5, "F");
    // Borda sutil
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, cardH, 1.5, 1.5, "D");
    doc.setLineWidth(0.1);
    // Acento esquerdo
    doc.setFillColor(...accentC);
    doc.rect(margin, y + 1, 2, cardH - 2, "F");
    // Badge de severidade
    const badgeX = margin + 5;
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    const bw = doc.getTextWidth(badgeLabel) + 4;
    doc.setFillColor(...badgeBg);
    doc.roundedRect(badgeX, y + 2.5, bw, 4.5, 1, 1, "F");
    doc.setTextColor(...badgeC);
    doc.text(badgeLabel, badgeX + 2, y + 5.8);
    // Mensagem principal
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(text.substring(0, 80), badgeX + bw + 3, y + 5.8);
    // Subtítulo opcional
    if (subtitle) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(subtitle.substring(0, 90), badgeX, y + 9.5);
    }
    y += cardH + 2;
  };

  // Helper: draw deterministic section alert — mesmo design
  const drawDetAlerts = (alertas: AlertaDet[]) => {
    if (!alertas.length) return;
    alertas.forEach(al => {
      const sev: AlertSeverity = al.nivel === 'alta' ? 'ALTA' : al.nivel === 'media' ? 'MODERADA' : 'INFO';
      drawAlertBox(al.mensagem, sev);
    });
  };

  // ── DS Helpers ──────────────────────────────────────────────────────────

  // Section header: navy bar with number + title, returns new y
  const dsSectionHeader = (num: string, title: string) => {
    checkPageBreak(14);
    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(margin, y, contentW, 10, "F");
    doc.setFillColor(...DS.colors.accent);
    doc.rect(margin, y + 10, contentW, 1.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.accent);
    doc.text(num, margin + 4, y + 6.5);
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(title, margin + 14, y + 6.5);
    y += 13;
  };

  // Left-border card: draws card box, returns nothing (caller manages y)
  const dsCard = (cx: number, cy: number, cw: number, ch: number, borderColor: [number,number,number]) => {
    doc.setFillColor(...DS.colors.cardBg);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, "F");
    doc.setDrawColor(...DS.colors.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, "D");
    doc.setLineWidth(0.1);
    doc.setFillColor(...borderColor);
    doc.rect(cx, cy, 2.5, ch, "F");
  };

  // Metric grid: array of {label, value, sub?, color?}, N columns, returns height used
  const dsMetricGrid = (startY: number, items: { label: string; value: string; sub?: string; color?: [number,number,number] }[], cols: number): number => {
    const gap = 3;
    const itemW = (contentW - gap * (cols - 1)) / cols;
    const itemH = 16;
    let maxRow = 0;
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      maxRow = Math.max(maxRow, row);
      const ix = margin + col * (itemW + gap);
      const iy = startY + row * (itemH + gap);
      dsCard(ix, iy, itemW, itemH, DS.colors.borderStrong);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text(item.label.toUpperCase(), ix + 4.5, iy + 5);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(item.color ?? DS.colors.textPrimary));
      const maxW = Math.floor((itemW - 6) / 2.2);
      const disp = item.value.length > maxW ? item.value.substring(0, maxW) + "…" : item.value;
      doc.text(disp, ix + 4.5, iy + 12);
      if (item.sub) {
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DS.colors.textLight);
        doc.text(item.sub, ix + 4.5, iy + 15.5);
      }
    });
    return (maxRow + 1) * (itemH + gap) - gap;
  };

  // Alert row: severity pill + title + optional subtitle, returns height used
  const dsAlertRow = (startY: number, severity: "ALTA" | "MODERADA" | "INFO", title: string, subtitle?: string): number => {
    const h = subtitle ? 14 : 10;
    checkPageBreak(h + 2);
    const borderC = severity === "ALTA" ? DS.colors.danger : severity === "MODERADA" ? DS.colors.warn : DS.colors.info;
    const badgeBg = severity === "ALTA" ? DS.colors.dangerBg : severity === "MODERADA" ? DS.colors.warnBg : DS.colors.infoBg;
    const badgeText = severity === "ALTA" ? DS.colors.dangerText : severity === "MODERADA" ? DS.colors.warnText : DS.colors.infoText;
    const badgeLabel = severity === "ALTA" ? "ALTA" : severity === "MODERADA" ? "MODERADO" : "INFO";
    doc.setFillColor(...DS.colors.cardBg);
    doc.roundedRect(margin, startY, contentW, h, 1.5, 1.5, "F");
    doc.setDrawColor(...DS.colors.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, startY, contentW, h, 1.5, 1.5, "D");
    doc.setLineWidth(0.1);
    doc.setFillColor(...borderC);
    doc.rect(margin, startY, 2.5, h, "F");
    // Badge pill
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    const bw = doc.getTextWidth(badgeLabel) + 6;
    doc.setFillColor(...badgeBg);
    doc.roundedRect(margin + 5, startY + (h - 5) / 2, bw, 5, 1, 1, "F");
    doc.setTextColor(...badgeText);
    doc.text(badgeLabel, margin + 5 + 3, startY + (h - 5) / 2 + 3.5);
    // Title
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.textPrimary);
    const titleX = margin + 5 + bw + 4;
    const titleMaxW = contentW - (titleX - margin) - 4;
    const titleLines = doc.splitTextToSize(title, titleMaxW);
    doc.text(titleLines[0], titleX, startY + (subtitle ? 5 : h / 2 + 2.5));
    if (subtitle) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textMuted);
      const subLines = doc.splitTextToSize(subtitle, contentW - (titleX - margin) - 4);
      doc.text(subLines[0], titleX, startY + 10);
    }
    return h + 2;
  };

  // Table header row
  const dsTableHeader = (startY: number, cols: string[], widths: number[], x0: number): number => {
    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(x0, startY, widths.reduce((a, b) => a + b, 0), 6.5, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    let cx = x0 + 2;
    cols.forEach((col, i) => { doc.text(col.toUpperCase(), cx, startY + 4.5); cx += widths[i]; });
    return 6.5;
  };

  // Table data row (zebra)
  const dsTableRow = (startY: number, cells: string[], widths: number[], isZebra: boolean, x0: number, cellColors?: ([number,number,number] | null)[]): number => {
    const h = 6;
    doc.setFillColor(...(isZebra ? DS.colors.zebraRow : DS.colors.cardBg));
    doc.rect(x0, startY, widths.reduce((a, b) => a + b, 0), h, "F");
    doc.setFontSize(6.5);
    let cx = x0 + 2;
    cells.forEach((cell, i) => {
      const c = cellColors?.[i];
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...(c ?? DS.colors.textPrimary));
      const maxC = Math.floor((widths[i] - 4) / 1.8);
      const disp = cell.length > maxC ? cell.substring(0, maxC) + "…" : cell;
      doc.text(disp, cx, startY + 4.2);
      cx += widths[i];
    });
    return h;
  };

  // Suppress unused variable warnings — helpers used conditionally
  void dsSectionHeader;
  void dsCard;
  void dsMetricGrid;
  void dsAlertRow;
  void dsTableHeader;
  void dsTableRow;

  // ── Helpers adicionais DS ──────────────────────────────────────────────────

  // metricCard: card com label/valor/sub e borda esquerda colorida
  const dsMetricCard = (
    cx: number, cy: number, cw: number, ch: number,
    label: string, value: string, sub?: string,
    borderColor?: [number,number,number], valueColor?: [number,number,number]
  ) => {
    const bc = borderColor ?? DS.colors.info;
    const vc = valueColor ?? DS.colors.textPrimary;
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'F');
    doc.setDrawColor(...DS.colors.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'D');
    doc.setLineWidth(0.1);
    doc.setFillColor(...bc);
    doc.rect(cx, cy, 3, ch, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DS.colors.textMuted);
    doc.text(label.toUpperCase(), cx + 5, cy + 5.5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...vc);
    const maxC = Math.floor((cw - 8) / 2.3);
    const disp = value.length > maxC ? value.substring(0, maxC) + '…' : value;
    doc.text(disp, cx + 5, cy + 12);
    if (sub) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DS.colors.textLight);
      doc.text(sub, cx + 5, cy + 17);
    }
  };

  // miniHeader: faixa #1a2e4a com título branco — retorna nova posição y
  const dsMiniHeader = (startY: number, title: string): number => {
    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(margin, startY, contentW, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 3, startY + 4.8);
    return startY + 7;
  };

  // dsMiniHeaderColored: faixa colorida com título branco para blocos lado a lado
  const dsMiniHeaderAt = (cx: number, startY: number, cw: number, title: string, bgColor: [number,number,number]): number => {
    doc.setFillColor(...bgColor);
    doc.rect(cx, startY, cw, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), cx + 3, startY + 4.8);
    return startY + 7;
  };

  void dsMetricCard;
  void dsMiniHeader;
  void dsMiniHeaderAt;

  // Helper: banner âmbar de "consulta não realizada" (protestos / processos)
  const drawBannerNaoConsultado = (secao: string) => {
    const padV = 10; // padding vertical interno
    const padH = 14; // padding horizontal interno
    const textW = contentW - padH * 2 - 3; // descontando borda âmbar + padding h
    // Calcular altura dinamicamente pelo conteúdo
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const descText = `${secao}: integração com bureau de crédito não configurada. Esta seção não foi verificada nesta análise.`;
    const descLines = doc.splitTextToSize(descText, textW);
    const bannerH = padV + 8 + descLines.length * 4 + padV; // padTop + título + linhas desc + padBottom
    checkPageBreak(bannerH + 4);
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(margin, y, contentW, bannerH, 1.5, 1.5, 'F');
    doc.setFillColor(...colors.warning);
    doc.roundedRect(margin, y, 3, bannerH, 0.5, 0.5, 'F');
    // Título — fonte normal, sentence case
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.warning);
    doc.text('Consulta não realizada', margin + padH, y + padV);
    // Texto descritivo — fonte normal, sem uppercase
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 80, 0);
    descLines.forEach((l: string, i: number) => {
      doc.text(l, margin + padH, y + padV + 7 + i * 4);
    });
    y += bannerH + 4;
  };


  // ===== PAGE 1 — CAPA =====
  newPage();
  doc.setFillColor(...colors.navy);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...colors.accent);
  doc.rect(0, 0, 210, 3, "F");

  // Decorative
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.circle(160, 50, 40);
  doc.circle(50, 250, 30);

  // Logo
  doc.setLineWidth(2);
  doc.circle(W / 2, 65, 18);
  doc.setFillColor(255, 255, 255);
  doc.circle(W / 2, 84, 3, "F");

  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const capW2 = doc.getTextWidth("capital");
  doc.text("capital", W / 2 - (capW2 + doc.getTextWidth("financas") + 2) / 2, 105);
  doc.setTextColor(...colors["accent-light"]);
  doc.text("financas", W / 2 - (capW2 + doc.getTextWidth("financas") + 2) / 2 + capW2 + 2, 105);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 240);
  doc.text("CONSOLIDADOR DE DOCUMENTOS", W / 2, 116, { align: "center" });

  doc.setFillColor(...colors.accent);
  doc.rect(W / 2 - 30, 123, 60, 1.5, "F");

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Relatorio de", W / 2, 145, { align: "center" });
  doc.text("Due Diligence", W / 2, 156, { align: "center" });

  if (data.cnpj.razaoSocial) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors["accent-light"]);
    doc.text(data.cnpj.razaoSocial.substring(0, 50), W / 2, 175, { align: "center" });
  }
  if (data.cnpj.cnpj) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 240);
    doc.text("CNPJ: " + data.cnpj.cnpj, W / 2, 184, { align: "center" });
  }

  const coverDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.setFontSize(9);
  doc.setTextColor(140, 170, 220);
  doc.text("Gerado em " + coverDate, W / 2, 198, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(100, 140, 200);
  doc.text("Documento confidencial — uso restrito", W / 2, 280, { align: "center" });
  doc.setFillColor(...colors.accent);
  doc.rect(0, 294, 210, 3, "F");

  // ===== PAGE 1b — SINTESE PRELIMINAR =====
  newPage();
  drawHeader();
  dsSectionHeader("00", "SINTESE PRELIMINAR");

  // ── Design tokens ──
  const azulInst:   [number,number,number] = [27, 47, 78];
  const cinzaLabel: [number,number,number] = [107, 114, 128];
  const pretoValor: [number,number,number] = [17, 24, 39];
  const vermelho:   [number,number,number] = [220, 38, 38];
  const amarelo:    [number,number,number] = [217, 119, 6];
  const verde:      [number,number,number] = [22, 163, 74];
  const fundoPage:  [number,number,number] = [248, 249, 250];
  const bordaCard:  [number,number,number] = [229, 231, 235];

  // Cor dinâmica de score
  const scoreColor: [number,number,number] = finalRating >= 7.5 ? verde : finalRating >= 6 ? amarelo : vermelho;

  // ── Helper: drawSinteseCard ──
  type SinteseField = { label: string; value: string; valueColor?: [number,number,number]; badge?: boolean; badgeText?: string; badgeBg?: [number,number,number]; badgeTextColor?: [number,number,number] };
  const drawSinteseCard = (
    cx: number, cy: number, cw: number, ch: number,
    title: string, accentColor: [number,number,number],
    fields: SinteseField[]
  ) => {
    // Card fundo branco, borda 0.3pt
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, "F");
    doc.setDrawColor(...bordaCard);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, "D");
    doc.setLineWidth(0.1);
    // Acento esquerdo 2pt
    doc.setFillColor(...accentColor);
    doc.rect(cx, cy, 2, ch, "F");
    // Header interno
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...accentColor);
    doc.text(title, cx + 5.5, cy + 6);
    // Linha separadora
    doc.setDrawColor(...bordaCard);
    doc.setLineWidth(0.2);
    doc.line(cx + 2, cy + 10, cx + cw, cy + 10);
    doc.setLineWidth(0.1);
    // Grid 2×N de campos
    const gridX = cx + 4;
    const colW2 = (cw - 6) / 2;
    const fieldH = (ch - 12) / Math.max(1, Math.ceil(fields.length / 2));
    fields.forEach((f, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx = gridX + col * colW2;
      const fy = cy + 12 + row * fieldH;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...cinzaLabel);
      doc.text(f.label.toUpperCase(), fx, fy + 4.5);
      if (f.badge && f.badgeText) {
        // Badge inline
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        const bw = doc.getTextWidth(f.badgeText) + 6;
        doc.setFillColor(...(f.badgeBg ?? [229, 231, 235]));
        doc.roundedRect(fx, fy + 5.5, bw, 5.5, 1, 1, "F");
        doc.setTextColor(...(f.badgeTextColor ?? pretoValor));
        doc.text(f.badgeText, fx + 3, fy + 9.5);
      } else {
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...(f.valueColor ?? pretoValor));
        const maxC = Math.floor(colW2 / 2.0);
        const disp = f.value.length > maxC ? f.value.substring(0, maxC) + "…" : f.value;
        doc.text(disp, fx, fy + 12);
      }
    });
  };

  // ── Helper: getSeveridadeBadge ──
  const getSeveridadeBadge = (qtd: number): { text: string; bg: [number,number,number]; textColor: [number,number,number] } => {
    if (qtd === 0) return { text: "SEM RESTRICAO", bg: [220, 252, 231], textColor: [21, 128, 61] };
    if (qtd <= 3)  return { text: "MODERADO",      bg: [254, 243, 199], textColor: [180, 83, 9]  };
    return             { text: "ALTA",             bg: [254, 226, 226], textColor: [220, 38, 38] };
  };

  // ═══════════════════════════════════════════════════
  // BLOCO 1 — Score + Status (largura total, ~28mm)
  // ═══════════════════════════════════════════════════
  {
    checkPageBreak(40);
    const bloco1H = 38;
    const bloco1Y = y;

    // Fundo navy do bloco inteiro
    doc.setFillColor(...azulInst);
    doc.rect(margin, bloco1Y, contentW, bloco1H, "F");

    // Linha âmbar inferior
    doc.setFillColor(...amarelo);
    doc.rect(margin, bloco1Y + bloco1H - 1.5, contentW, 1.5, "F");

    // ── LADO ESQUERDO: Score ──
    const scoreX = margin + 6;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 185, 220);
    doc.text("SCORE DE RISCO", scoreX, bloco1Y + 8);

    doc.setFontSize(34);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...scoreColor);
    const scoreStr = String(finalRating);
    doc.text(scoreStr, scoreX, bloco1Y + 27);
    const scoreNumW = doc.getTextWidth(scoreStr);

    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 185, 220);
    doc.text("/10", scoreX + scoreNumW + 1.5, bloco1Y + 27);

    // Barra de progresso (fundo escuro + fill colorido)
    const barX = scoreX;
    const barY = bloco1Y + 30;
    const barW = 60;
    const barH = 2.5;
    doc.setFillColor(50, 70, 100);
    doc.roundedRect(barX, barY, barW, barH, 1, 1, "F");
    const fillW = Math.min(barW, (finalRating / 10) * barW);
    if (fillW > 0) {
      doc.setFillColor(...scoreColor);
      doc.roundedRect(barX, barY, fillW, barH, 1, 1, "F");
    }

    // Linha divisória central vertical
    doc.setDrawColor(80, 100, 130);
    doc.setLineWidth(0.3);
    doc.line(margin + 78, bloco1Y + 6, margin + 78, bloco1Y + bloco1H - 6);
    doc.setLineWidth(0.1);

    // ── LADO DIREITO: Decisão ──
    const decC: [number,number,number] = decision === "APROVADO" ? verde : decision === "REPROVADO" ? vermelho : amarelo;
    const rightX = margin + 84;
    const rightW = contentW - 84 - 4;

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 185, 220);
    doc.text("DECISAO", rightX, bloco1Y + 8);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...decC);
    const decLabel = decision.replace(/_/g, " ");
    const decLabelLines = doc.splitTextToSize(decLabel, rightW) as string[];
    doc.text(decLabelLines[0], rightX, bloco1Y + 22);

    const decSubtitle = decision === "APROVADO" ? "Operacao recomendada pelo sistema" :
      decision === "REPROVADO" ? "Operacao nao recomendada" :
      decision === "APROVACAO_CONDICIONAL" ? "Aprovacao mediante condicoes" :
      "Pendente de informacoes adicionais";
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 185, 220);
    doc.text(decSubtitle, rightX, bloco1Y + 30);

    y = bloco1Y + bloco1H + 5;
  }

  // ═══════════════════════════════════════════════════
  // BLOCO 2 — 6 KPI Cards (2 linhas × 3 colunas)
  // ═══════════════════════════════════════════════════
  {
    checkPageBreak(50);
    const kpiGap = 4;
    const kpiW = (contentW - kpiGap * 2) / 3;
    const kpiH = 20;

    // Dados dos KPI
    const vigQtdKpi = parseInt(data.protestos?.vigentesQtd || "0");
    const passivosKpi = parseInt(data.processos?.passivosTotal || "0");
    const temRJKpi = !!data.processos?.temRJ;
    const alavKpi = alavancagem;

    const kpiCards = [
      {
        label: "PROTESTOS",
        value: protestosNaoConsultados ? "N/C" : vigQtdKpi > 0 ? `${vigQtdKpi} reg.` : "—",
        critico: vigQtdKpi > 0,
      },
      {
        label: "PROCESSOS",
        value: processosNaoConsultados ? "N/C" : passivosKpi > 0 ? String(passivosKpi) : "—",
        critico: passivosKpi > 5,
      },
      {
        label: "SCR VENCIDO",
        value: vencidosSCR > 0 ? (data.scr?.vencidos || "Sim") : "—",
        critico: vencidosSCR > 0,
      },
      {
        label: "SCR PREJUIZO",
        value: prejuizosVal > 0 ? (data.scr?.prejuizos || "Sim") : "—",
        critico: prejuizosVal > 0,
      },
      {
        label: "REC. JUDICIAL",
        value: temRJKpi ? "Sim" : "—",
        critico: temRJKpi,
      },
      {
        label: "ALAVANCAGEM",
        value: alavKpi > 0 ? fmtBR(alavKpi, 2) + "x" : "—",
        critico: alavKpi > 4,
      },
    ];

    kpiCards.forEach((card, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const kx = margin + col * (kpiW + kpiGap);
      const ky = y + row * (kpiH + kpiGap);
      const accentC: [number,number,number] = card.critico ? vermelho : [209, 213, 219];
      const valorC: [number,number,number] = card.critico ? vermelho : pretoValor;

      // Card
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(kx, ky, kpiW, kpiH, 2, 2, "F");
      doc.setDrawColor(...bordaCard);
      doc.setLineWidth(0.3);
      doc.roundedRect(kx, ky, kpiW, kpiH, 2, 2, "D");
      doc.setLineWidth(0.1);
      // Acento esquerdo
      doc.setFillColor(...accentC);
      doc.rect(kx, ky, 2, kpiH, "F");
      // Label
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...cinzaLabel);
      doc.text(card.label, kx + 4, ky + 6);
      // Valor
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...valorC);
      const maxKpiC = Math.floor((kpiW - 6) / 2.5);
      const kpiDisp = card.value.length > maxKpiC ? card.value.substring(0, maxKpiC) + "…" : card.value;
      doc.text(kpiDisp, kx + 4, ky + 15);
    });

    y += kpiH * 2 + kpiGap + 6;
  }

  // ═══════════════════════════════════════════════════
  // BLOCO 3 — DRE Resumo (largura total, ~24mm)
  // ═══════════════════════════════════════════════════
  if (data.dre && data.dre.anos && data.dre.anos.length > 0) {
    const anoMaisRecente = data.dre.anos[data.dre.anos.length - 1];
    checkPageBreak(30);
    // Header fundo azul
    doc.setFillColor(...azulInst);
    doc.roundedRect(margin, y, contentW, 7, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("DEMONSTRACAO DE RESULTADO (RESUMO)", margin + 4, y + 4.8);
    y += 7;

    const dreColW = contentW / 4;
    const dreH = 17;
    const tendRaw = normalizeTendencia(data.dre.tendenciaLucro);
    const tendColor: [number,number,number] = tendRaw.startsWith("↑") ? verde : tendRaw.startsWith("↓") ? vermelho : cinzaLabel;
    const dreMetricas = [
      { label: "RECEITA BRUTA",       valor: `R$ ${fmtMoney(anoMaisRecente.receitaBruta) || "N/D"}`, color: pretoValor },
      { label: "MARGEM LIQUIDA",      valor: `${anoMaisRecente.margemLiquida || "0"}%`,              color: pretoValor },
      { label: "TENDENCIA",           valor: tendRaw,                                                color: tendColor  },
      { label: "CRESCIMENTO RECEITA", valor: `${data.dre.crescimentoReceita || "0"}%`,               color: pretoValor },
    ];
    dreMetricas.forEach((m, i) => {
      const xD = margin + i * dreColW;
      doc.setFillColor(...fundoPage);
      doc.rect(xD, y, dreColW, dreH, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...cinzaLabel);
      doc.text(m.label, xD + 4, y + 5.5);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...m.color);
      doc.text(m.valor, xD + 4, y + 13.5);
    });
    y += dreH + 5;
  }

  // ═══════════════════════════════════════════════════
  // BLOCOS 4 & 5 — Cards operacionais 2×2 + 1×2
  // ═══════════════════════════════════════════════════
  const OP_GAP = 4;
  const opColW = (contentW - OP_GAP) / 2;
  const opCardH = 46;
  const opColL = margin;
  const opColR = margin + opColW + OP_GAP;

  // Pré-calcular dados dos cards operacionais

  // Card A — Perfil
  const anoAberturaOp = data.cnpj?.dataAbertura ? new Date(data.cnpj.dataAbertura).getFullYear() : null;
  const idadeEmpresaOp = anoAberturaOp && !isNaN(anoAberturaOp) ? `${new Date().getFullYear() - anoAberturaOp} anos` : "—";
  const fmm12mValOp = data.faturamento?.fmm12m
    ? `R$ ${fmtMoney(data.faturamento.fmm12m)}`
    : data.faturamento?.mediaAno ? `R$ ${fmtMoney(data.faturamento.mediaAno)}` : "—";
  const grupoQtdOp = data.grupoEconomico?.empresas?.length ?? 0;
  const grupoTextoOp = grupoQtdOp > 0 ? `Sim — ${grupoQtdOp} emp.` : "Nao identificado";
  const pleitoValOp = data.relatorioVisita?.pleito ? `R$ ${fmtMoney(data.relatorioVisita.pleito)}` : "Nao informado";

  // Card B — Curva ABC
  const alertaConc = !!data.curvaABC?.alertaConcentracao;
  const abcAccentColor: [number,number,number] = alertaConc ? vermelho : verde;
  const clientesABC = data.curvaABC?.clientes || [];
  const concTop3Op = data.curvaABC?.concentracaoTop3 ? `${data.curvaABC.concentracaoTop3}%` : "—";
  const modalidadeOp = data.relatorioVisita?.modalidade
    ? ({ comissaria: "Comissaria", convencional: "Convencional", hibrida: "Hibrida", outra: "Outra" }[data.relatorioVisita.modalidade] ?? "—")
    : "—";
  const top1Sacado = clientesABC[0]
    ? `${clientesABC[0].nome.substring(0, 18)} (${clientesABC[0].percentualReceita || "—"}%)`
    : "—";
  const top2Sacado = clientesABC[1]
    ? `${clientesABC[1].nome.substring(0, 18)} (${clientesABC[1].percentualReceita || "—"}%)`
    : "—";

  // Card C — Protestos
  const vigQtdOp = parseInt(data.protestos?.vigentesQtd || "0");
  const vigValOp = data.protestos?.vigentesValor || "0";
  const protestosOrdenados = [...(data.protestos?.detalhes ?? [])]
    .filter(d => d.data)
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  const maisRecenteOp = protestosOrdenados[0]?.data ?? "—";
  const hojeOp = new Date();
  const h30bOp = new Date(hojeOp.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ult30Op = protestosOrdenados.filter(d => {
    if (!d.data) return false;
    const pts = d.data.split("/");
    if (pts.length !== 3) return false;
    return new Date(parseInt(pts[2]), parseInt(pts[1]) - 1, parseInt(pts[0])) >= h30bOp;
  }).length;
  const protAccentOp: [number,number,number] = vigQtdOp > 0 ? vermelho : verde;
  const protSevBadge = getSeveridadeBadge(vigQtdOp);

  // Card D — CCF
  const totalOcorrOp = data.ccf?.qtdRegistros || 0;
  const bancosRegOp = (data.ccf?.bancos || []).filter(b => b.quantidade > 0).sort((a, b) => b.quantidade - a.quantidade);
  const maiorBancoOp = bancosRegOp[0];
  // CCF (Cheque Sem Fundo) é extremamente decisivo: qualquer registro é CRÍTICO (ALTA), não moderado
  const ccfAccentOp: [number,number,number] = totalOcorrOp > 0 ? vermelho : verde;
  const ccfSeveridade = totalOcorrOp > 0 ? "ALTA" : "NENHUMA";

  // Card E — Processos
  const passivosOp = data.processos?.passivosTotal || "0";
  const ativosOp = data.processos?.ativosTotal || "0";
  const valorEstOp = data.processos?.valorTotalEstimado || "—";
  const distOp = data.processos?.distribuicao || [];
  const bancariosOp = distOp.filter(d => /banco|financ/i.test(d.tipo || "")).reduce((s, d) => s + parseInt(d.qtd || "0"), 0);
  const trabalhistasOp = distOp.filter(d => /trabalh/i.test(d.tipo || "")).reduce((s, d) => s + parseInt(d.qtd || "0"), 0);
  const outrosOp = parseInt(passivosOp) - bancariosOp - trabalhistasOp;
  const procAccentOp: [number,number,number] = parseInt(passivosOp) > 0 ? amarelo : verde;

  // Card F — Visita
  const visitaRecOp = data.relatorioVisita?.recomendacaoVisitante;
  const visitaAccentOp: [number,number,number] = data.relatorioVisita ? verde : [156, 163, 175];
  const visitaRecTextoOp = visitaRecOp === "aprovado" ? "Aprovado" : visitaRecOp === "condicional" ? "Condicional" : visitaRecOp === "reprovado" ? "Reprovado" : "—";
  const pontosAtencaoOp = (data.relatorioVisita?.pontosAtencao || []);
  const primeiroPA = pontosAtencaoOp[0]?.substring(0, 35) || "—";
  const nivelConfOp = data.relatorioVisita?.nivelConfiancaVisita
    ? data.relatorioVisita.nivelConfiancaVisita.charAt(0).toUpperCase() + data.relatorioVisita.nivelConfiancaVisita.slice(1)
    : "—";

  // ── Par 1: Card A (Perfil) + Card B (Curva ABC) ──
  {
    checkPageBreak(opCardH + 10);
    const yPar1Op = y;

    // Card A — Perfil
    drawSinteseCard(opColL, yPar1Op, opColW, opCardH, "PERFIL DA EMPRESA", azulInst, [
      { label: "IDADE",           value: idadeEmpresaOp },
      { label: "FMM 12M",         value: fmm12mValOp    },
      { label: "GRUPO ECONOMICO", value: grupoTextoOp   },
      { label: "PLEITO",          value: pleitoValOp    },
    ]);

    // Card B — Curva ABC
    const abcFields: SinteseField[] = [
      { label: "MODALIDADE",   value: modalidadeOp },
      { label: "CONC. TOP 3", value: concTop3Op   },
      { label: "TOP 1 SACADO", value: top1Sacado  },
      { label: "TOP 2 SACADO", value: top2Sacado  },
    ];
    if (alertaConc) {
      abcFields.push({
        label: "",
        value: "",
        badge: true,
        badgeText: "ALTA CONCENTRACAO",
        badgeBg: [254, 226, 226],
        badgeTextColor: vermelho,
      });
    }
    if (data.curvaABC) {
      drawSinteseCard(opColR, yPar1Op, opColW, opCardH, "CURVA ABC / SACADOS", abcAccentColor, abcFields);
    }

    y = yPar1Op + opCardH + OP_GAP;
  }

  // ── Par 2: Card C (Protestos) + Card D (CCF) ──
  {
    checkPageBreak(opCardH + 10);
    const yPar2Op = y;

    // Card C — Protestos
    drawSinteseCard(opColL, yPar2Op, opColW, opCardH, "PROTESTOS", protAccentOp, [
      { label: "VIGENTES (QTD)",   value: String(vigQtdOp),                                     valueColor: vigQtdOp > 0 ? vermelho : pretoValor },
      { label: "VIGENTES (VALOR)", value: vigQtdOp > 0 ? `R$ ${fmtMoney(vigValOp)}` : "—",    valueColor: vigQtdOp > 0 ? vermelho : pretoValor },
      { label: "MAIS RECENTE",     value: maisRecenteOp },
      { label: "ULTIMOS 30 DIAS",  value: String(ult30Op), badge: true, badgeText: protSevBadge.text, badgeBg: protSevBadge.bg, badgeTextColor: protSevBadge.textColor },
    ]);

    // Card D — CCF
    if (data.ccf) {
      drawSinteseCard(opColR, yPar2Op, opColW, opCardH, "CCF — CHEQUES SEM FUNDO", ccfAccentOp, [
        { label: "TOTAL OCORRENCIAS",  value: String(totalOcorrOp),                                                                        valueColor: totalOcorrOp > 0 ? vermelho : pretoValor },
        { label: "BANCOS C/ REGISTRO", value: String(bancosRegOp.length)                                                                                                                       },
        { label: "MAIOR CONC.",        value: maiorBancoOp ? `${maiorBancoOp.banco} (${maiorBancoOp.quantidade})` : "—"                                                                       },
        { label: "SEVERIDADE",         value: ccfSeveridade,                                                                               valueColor: totalOcorrOp > 0 ? vermelho : verde },
      ]);
    }

    y = yPar2Op + opCardH + OP_GAP;
  }

  // ── Par 3: Card E (Processos) + Card F (Visita) ──
  {
    checkPageBreak(opCardH + 10);
    const yPar3Op = y;

    // Card E — Processos
    drawSinteseCard(opColL, yPar3Op, opColW, opCardH, "PROCESSOS JUDICIAIS", procAccentOp, [
      { label: "PASSIVOS / ATIVOS",       value: `${passivosOp} / ${ativosOp}` },
      { label: "VALOR ESTIMADO",          value: valorEstOp !== "—" ? `R$ ${fmtMoney(valorEstOp)}` : "—", valueColor: parseInt(passivosOp) > 0 ? amarelo : pretoValor },
      { label: "BANCARIOS / TRABALHISTAS",value: `${bancariosOp} / ${trabalhistasOp}`,                    valueColor: bancariosOp > 0 ? vermelho : pretoValor },
      { label: "OUTROS",                  value: String(Math.max(0, outrosOp)) },
    ]);

    // Card F — Visita
    if (data.relatorioVisita) {
      drawSinteseCard(opColR, yPar3Op, opColW, opCardH, "VISITA COMERCIAL", visitaAccentOp, [
        { label: "STATUS",            value: "Realizada",       valueColor: verde  },
        { label: "RECOMENDACAO",      value: visitaRecTextoOp  },
        { label: "PONTO DE ATENCAO", value: primeiroPA        },
        { label: "NIVEL CONFIANCA",  value: nivelConfOp       },
      ]);
    }

    y = yPar3Op + opCardH + OP_GAP;
  }

  // ═══════════════════════════════════════════════════
  // BLOCO 6 — Street View (largura total)
  // ═══════════════════════════════════════════════════
  {
    checkPageBreak(30);
    y += 2;
    doc.setFillColor(...azulInst);
    doc.roundedRect(margin, y, contentW, 7, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("ESTABELECIMENTO — STREET VIEW", margin + 4, y + 4.8);
    y += 9;
    if (p.streetViewBase64) {
      checkPageBreak(52);
      doc.addImage(p.streetViewBase64, "JPEG", margin, y, contentW, 48);
      y += 52;
    } else {
      checkPageBreak(64);
      doc.setFillColor(...DS.colors.zebraRow);
      doc.roundedRect(margin, y, contentW, 60, 2, 2, "F");
      doc.setDrawColor(...DS.colors.border);
      doc.setLineWidth(0.25);
      doc.roundedRect(margin, y, contentW, 60, 2, 2, "D");
      doc.setLineWidth(0.1);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text("Foto não disponível", margin + contentW / 2, y + 32, { align: "center" });
      y += 64;
    }
  }

  // Alerts list (vindos do Gemini)
  if (alerts.length > 0) {
    alerts.forEach(alert => { drawAlertBox(alert.message, alert.severity); });
    drawSpacer(4);
  }
  // Alertas de alta das seções (determinísticos) — complementam a Síntese
  if (alertasAltaDet.length > 0) {
    drawDetAlerts(alertasAltaDet);
    drawSpacer(4);
  }

  if (aiAnalysis?.sinteseExecutiva) {
    y += 8;

    // Título da síntese
    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("SÍNTESE EXECUTIVA", margin + 3, y + 4.8);
    y += 10;

    // Texto da síntese
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);

    const linhasSintese = doc.splitTextToSize(aiAnalysis.sinteseExecutiva, contentW - 6);

    for (const linha of linhasSintese) {
      checkPageBreak(10);
      doc.text(linha, margin + 3, y);
      y += 4.5;
    }

    y += 6;
  }

  // ===== SEÇÃO 01 — CARTAO CNPJ (flui se couber na página) =====
  drawSpacer(10);
  checkPageBreak(90);

  dsSectionHeader("01", "CARTAO CNPJ");

  const cnpjColW = (contentW - 4) / 2;

  const drawCnpjRow = (
    left: { label: string; value: string },
    right: { label: string; value: string }
  ) => {
    const leftVal = left.value || "—";
    const rightVal = right.value || "—";
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const leftLines = doc.splitTextToSize(leftVal, cnpjColW - 8);
    const rightLines = doc.splitTextToSize(rightVal, cnpjColW - 8);
    const rowH = Math.max(14, Math.max(leftLines.length, rightLines.length) * 5 + 6);
    checkPageBreak(rowH);
    // Left cell
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, y, cnpjColW, rowH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(left.label.toUpperCase(), margin + 4, y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(leftLines, margin + 4, y + 9.5);
    // Right cell
    const rx = margin + cnpjColW + 4;
    doc.setFillColor(...colors.surface);
    doc.roundedRect(rx, y, cnpjColW, rowH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(right.label.toUpperCase(), rx + 4, y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(rightLines, rx + 4, y + 9.5);
    y += rowH + 2;
  };

  drawCnpjRow(
    { label: "Nome Fantasia", value: data.cnpj.nomeFantasia },
    { label: "Situacao Cadastral", value: data.cnpj.situacaoCadastral }
  );
  drawCnpjRow(
    { label: "Data de Abertura", value: data.cnpj.dataAbertura },
    { label: "Data da Situacao", value: data.cnpj.dataSituacaoCadastral }
  );
  drawCnpjRow(
    { label: "Natureza Juridica", value: data.cnpj.naturezaJuridica },
    { label: "Porte", value: data.cnpj.porte }
  );

  // Tipo de empresa + Funcionários
  {
    const tipoEmp = data.cnpj.tipoEmpresa || "";
    const func = data.cnpj.funcionarios || "";
    const regime = data.cnpj.regimeTributario || "";
    if (tipoEmp || func || regime) {
      drawCnpjRow(
        { label: "Tipo Empresa", value: tipoEmp || "—" },
        { label: "Funcionarios", value: func || "—" }
      );
      if (regime) drawCnpjRow({ label: "Regime Tributario", value: regime }, { label: "", value: "" });
    }
  }

  // Endereço principal — largura total
  {
    checkPageBreak(14);
    const endVal = data.cnpj.endereco || "—";
    const endLines = doc.splitTextToSize(endVal, contentW - 8);
    const endBoxH = Math.max(16, endLines.length * 5 + 12);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, y, contentW, endBoxH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("ENDERECO PRINCIPAL", margin + 4, y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(endLines, margin + 4, y + 10);
    y += endBoxH + 2;
  }

  // Endereços adicionais (Credit Hub)
  {
    const endExtras: string[] = data.cnpj.enderecos || [];
    if (endExtras.length > 1) {
      const extras = endExtras.slice(1); // pula o principal
      extras.forEach((end, idx) => {
        checkPageBreak(10);
        const endLines = doc.splitTextToSize(end, contentW - 8);
        const endBoxH = Math.max(9, endLines.length * 5 + 4);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, contentW, endBoxH, 1, 1, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(`ENDERECO ${idx + 2}`, margin + 4, y + 3.5);
        doc.setFontSize(7);
        doc.setTextColor(...colors.textSec);
        doc.text(endLines, margin + 4, y + 6);
        y += endBoxH + 2;
      });
    }
  }

  drawCnpjRow(
    { label: "Telefone", value: data.cnpj.telefone },
    { label: "E-mail", value: data.cnpj.email }
  );

  // CNAEs Secundários
  {
    const cnaesRaw = data.cnpj.cnaeSecundarios || "";
    const cnaesStr = Array.isArray(cnaesRaw) ? (cnaesRaw as string[]).join("; ") : String(cnaesRaw);
    if (cnaesStr.trim() !== "") {
      const cnaesLines = doc.splitTextToSize(cnaesStr, contentW - 8);
      const cnaesBoxH = cnaesLines.length * 4 + 14;
      checkPageBreak(cnaesBoxH + 2);
      doc.setFillColor(...colors.surface);
      doc.roundedRect(margin, y, contentW, cnaesBoxH, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text("CNAES SECUNDARIOS", margin + 4, y + 5);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      cnaesLines.forEach((line: string, i: number) => {
        doc.text(line, margin + 4, y + 11 + i * 4);
      });
      y += cnaesBoxH + 2;
    }
  }

  // ===== SEÇÃO 02 — QSA + CONTRATO (flui se couber) =====
  drawSpacer(10);
  checkPageBreak(60);

  dsSectionHeader("02", "QUADRO SOCIETARIO (QSA)");

  if (data.qsa.capitalSocial) {
    drawField("Capital Social", data.qsa.capitalSocial, true);
  }

  const validQSA = data.qsa.quadroSocietario.filter(s => s.nome);
  if (validQSA.length > 0) {
    const temDatas = validQSA.some(s => s.dataEntrada || s.dataSaida);
    if (temDatas) {
      // Tabela estendida com dataEntrada / dataSaida
      const qsaColW = [contentW * 0.26, contentW * 0.18, contentW * 0.22, contentW * 0.14, contentW * 0.10, contentW * 0.10];
      drawTable(
        ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART.", "ENTRADA", "SAIDA"],
        validQSA.map(s => {
          const part = s.participacao
            ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%")
            : "—";
          return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part, s.dataEntrada || "—", s.dataSaida || "—"];
        }),
        qsaColW,
      );
    } else {
      const qsaColW = [contentW * 0.30, contentW * 0.22, contentW * 0.28, contentW * 0.20];
      drawTable(
        ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
        validQSA.map(s => {
          const part = s.participacao
            ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%")
            : "—";
          return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part];
        }),
        qsaColW,
      );
    }
  }

  // Alertas determinísticos — QSA
  if (alertasQSA.length > 0) { drawSpacer(4); drawDetAlerts(alertasQSA); }

  drawSpacer(8);

  dsSectionHeader("03", "CONTRATO SOCIAL");

  if (data.contrato.temAlteracoes) {
    checkPageBreak(12);
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
    doc.setFillColor(...colors.warning);
    doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.warning);
    doc.text("ATENCAO: Documento com alteracoes societarias recentes", margin + 8, y + 6.5);
    y += 14;
  }

  if (data.contrato.objetoSocial) drawMultilineField("Objeto Social", data.contrato.objetoSocial, 5);
  if (data.contrato.administracao) drawMultilineField("Administracao e Poderes", data.contrato.administracao, 4);

  drawFieldRow([
    { label: "Capital Social", value: data.contrato.capitalSocial },
    { label: "Data de Constituicao", value: data.contrato.dataConstituicao },
  ]);
  drawFieldRow([
    { label: "Prazo de Duracao", value: data.contrato.prazoDuracao },
    { label: "Foro", value: data.contrato.foro },
  ]);

  // ===== GESTÃO E GRUPO ECONÔMICO =====
  newPage();
  drawHeader();

  // Section header bar — Gestao e Grupo Economico
  dsSectionHeader("03", "GESTAO E GRUPO ECONOMICO");

  // ── Tabela de Sócios ──
  {
    type SocioEntry = { nome: string; cpfCnpj: string; qualificacao: string; participacao: string };
    const sociosList: SocioEntry[] = (data.qsa?.quadroSocietario || []).map((s) => ({
      nome: s.nome || "",
      cpfCnpj: s.cpfCnpj || "",
      qualificacao: s.qualificacao || "",
      participacao: s.participacao || "",
    }));
    if (sociosList.length === 0 && data.contrato?.socios) {
      data.contrato.socios.forEach((s) => sociosList.push({
        nome: s.nome || "",
        cpfCnpj: s.cpf || "",
        qualificacao: s.qualificacao || "",
        participacao: s.participacao || "",
      }));
    }

    if (sociosList.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      doc.text("QUADRO SOCIETÁRIO", margin, y + 4);
      y += 8;

      const gColNome = contentW * 0.24;
      const gColCpf  = contentW * 0.15;
      const gColPart = contentW * 0.09;
      const gColScr  = contentW * 0.13;
      const gColVenc = contentW * 0.10;
      const gColPrej = contentW * 0.10;
      const gColProt = contentW * 0.10;
      const gColProc = contentW * 0.09;
      const gRowH = 6.5;

      // Header
      doc.setFillColor(...colors.navy);
      doc.rect(margin, y, contentW, 6, "F");
      doc.setFontSize(4.8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      let gx = margin;
      doc.text("NOME / RAZÃO SOCIAL", gx + 2, y + 4); gx += gColNome;
      doc.text("CPF/CNPJ", gx + 2, y + 4); gx += gColCpf;
      doc.text("PART.", gx + gColPart - 1, y + 4, { align: "right" }); gx += gColPart;
      doc.text("SCR TOTAL", gx + gColScr - 1, y + 4, { align: "right" }); gx += gColScr;
      doc.text("VENCIDO", gx + gColVenc - 1, y + 4, { align: "right" }); gx += gColVenc;
      doc.text("PREJUÍZO", gx + gColPrej - 1, y + 4, { align: "right" }); gx += gColPrej;
      doc.text("PROT.", gx + gColProt - 1, y + 4, { align: "right" }); gx += gColProt;
      doc.text("PROC.", gx + gColProc - 1, y + 4, { align: "right" });
      y += 6;

      const toAbbrev = (v: string | undefined) => {
        if (!v || v === "0,00" || v === "") return "—";
        const n = parseMoneyToNumber(v);
        if (n === 0) return "—";
        if (n >= 1000000) return fmtBR(n / 1000000, 1) + "M";
        if (n >= 1000) return fmtBR(Math.round(n / 1000), 0) + "K";
        return v;
      };

      sociosList.forEach((s, idx) => {
        if (y + gRowH > 275) { newPage(); drawHeader(); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, y, contentW, gRowH, "F");

        const scrSocio = data.scrSocios?.find(sc =>
          sc.cpfSocio === s.cpfCnpj || sc.nomeSocio?.toLowerCase() === s.nome.toLowerCase()
        );
        const scrTotal   = scrSocio?.periodoAtual?.totalDividasAtivas;
        const scrVencido = scrSocio?.periodoAtual?.vencidos;
        const scrPrejuizo = scrSocio?.periodoAtual?.prejuizos;
        const hasVenc = scrVencido && scrVencido !== "0,00";
        const hasPrej = scrPrejuizo && scrPrejuizo !== "0,00";

        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");

        let gxR = margin;
        const nomeT = s.nome.length > 30 ? s.nome.substring(0, 29) + "…" : s.nome;
        doc.setTextColor(...colors.text);
        doc.text(nomeT, gxR + 2, y + 4.5);
        gxR += gColNome;

        doc.setTextColor(...colors.textSec);
        doc.text(s.cpfCnpj || "—", gxR + 2, y + 4.5);
        gxR += gColCpf;

        doc.setTextColor(...colors.text);
        doc.text(s.participacao || "—", gxR + gColPart - 1, y + 4.5, { align: "right" });
        gxR += gColPart;

        doc.text(toAbbrev(scrTotal), gxR + gColScr - 1, y + 4.5, { align: "right" });
        gxR += gColScr;

        doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrVencido), gxR + gColVenc - 1, y + 4.5, { align: "right" });
        gxR += gColVenc;

        doc.setTextColor(...(hasPrej ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrPrejuizo), gxR + gColPrej - 1, y + 4.5, { align: "right" });
        gxR += gColPrej;

        doc.setTextColor(...colors.textMuted);
        doc.text("—", gxR + gColProt - 1, y + 4.5, { align: "right" });
        gxR += gColProt;
        doc.text("—", gxR + gColProc - 1, y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);

        y += gRowH;
      });
      y += 6;
    }
  }

  // ── Tabela Empresas Vinculadas ──
  {
    const empresasGrupo = data.grupoEconomico?.empresas || [];

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text("EMPRESAS VINCULADAS (GRUPO ECONÔMICO)", margin, y + 4);
    y += 8;

    if (empresasGrupo.length === 0) {
      checkPageBreak(10);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, 8, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text("Nenhuma empresa vinculada identificada", margin + 4, y + 5.5);
      y += 10;
    } else {
      const geNome = contentW * 0.28;
      const geCnpj = contentW * 0.17;
      const geScr  = contentW * 0.13;
      const geAl   = contentW * 0.10;
      const geVenc = contentW * 0.10;
      const gePrej = contentW * 0.09;
      const geProt = contentW * 0.07;
      void (contentW * 0.06); // geProc — largura implícita (resto até margem direita)
      const geRowH = 7;

      const geNeeded = 6 + empresasGrupo.length * geRowH + 8;
      checkPageBreak(geNeeded);

      doc.setFillColor(...colors.navy);
      doc.rect(margin, y, contentW, 6, "F");
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      let ex = margin;
      doc.text("RAZÃO SOCIAL / RELAÇÃO", ex + 2, y + 4); ex += geNome;
      doc.text("CNPJ", ex + 2, y + 4); ex += geCnpj;
      doc.text("SCR", ex + geScr - 1, y + 4, { align: "right" }); ex += geScr;
      doc.text("ALAV.", ex + geAl - 1, y + 4, { align: "right" }); ex += geAl;
      doc.text("VENCIDO", ex + geVenc - 1, y + 4, { align: "right" }); ex += geVenc;
      doc.text("PREJUÍZO", ex + gePrej - 1, y + 4, { align: "right" }); ex += gePrej;
      doc.text("PROT.", ex + geProt - 1, y + 4, { align: "right" }); ex += geProt;
      doc.text("PROC.", margin + contentW - 1, y + 4, { align: "right" });
      y += 6;

      empresasGrupo.forEach((emp, idx) => {
        if (y + geRowH > 275) { newPage(); drawHeader(); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, y, contentW, geRowH, "F");

        const nomeEmp = (emp.razaoSocial || "").length > 34 ? (emp.razaoSocial || "").substring(0, 33) + "…" : (emp.razaoSocial || "");
        let ex2 = margin;
        doc.setFontSize(4.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.text);
        doc.text(nomeEmp, ex2 + 2, y + 3.5);
        if (emp.relacao) {
          doc.setFontSize(4);
          doc.setTextColor(...colors.textMuted);
          doc.text(emp.relacao, ex2 + 2, y + 6);
          doc.setFontSize(4.8);
        }
        ex2 += geNome;

        doc.setTextColor(...colors.textSec);
        doc.text(emp.cnpj || "—", ex2 + 2, y + 4.5); ex2 += geCnpj;

        doc.setTextColor(...colors.text);
        doc.text(emp.scrTotal || "—", ex2 + geScr - 1, y + 4.5, { align: "right" }); ex2 += geScr;

        doc.setTextColor(...colors.textMuted);
        doc.text("—", ex2 + geAl - 1, y + 4.5, { align: "right" }); ex2 += geAl;
        doc.text("—", ex2 + geVenc - 1, y + 4.5, { align: "right" }); ex2 += geVenc;
        doc.text("—", ex2 + gePrej - 1, y + 4.5, { align: "right" }); ex2 += gePrej;

        const hasProt = emp.protestos && emp.protestos !== "0" && emp.protestos !== "—" && emp.protestos !== "";
        const hasProc = emp.processos && emp.processos !== "0" && emp.processos !== "—" && emp.processos !== "";
        doc.setTextColor(...(hasProt ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(emp.protestos || "—", ex2 + geProt - 1, y + 4.5, { align: "right" }); ex2 += geProt;
        doc.setTextColor(...(hasProc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(emp.processos || "—", margin + contentW - 1, y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);
        y += geRowH;
      });

      y += 4;
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text("* Rating parcial: FMM indisponível — componentes dependentes de faturamento foram neutralizados.", margin, y);
      y += 6;
    }
  }

  // ===== PAGE 3 — FATURAMENTO / SCR =====
  newPage();
  drawHeader();

  // Section header bar — Faturamento / SCR
  dsSectionHeader("04", "FATURAMENTO / SCR");

  // ── Stacked layout ──
  const leftW = contentW;
  const leftX = margin;
  const sectionY = y;
  // Gráfico usa os mesmos 12 meses do FMM
  const chartMeses = mesesFMM;

  // ── LEFT COLUMN: Bar chart ──
  let yLeft = sectionY;

  if (faturamentoRealmenteZerado) {
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(leftX, yLeft, leftW, 8, 1, 1, "F");
    doc.setFillColor(...colors.danger);
    doc.roundedRect(leftX, yLeft, 2.5, 8, 0.5, 0.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.danger);
    doc.text("[ALTA] Faturamento zerado no periodo", leftX + 6, yLeft + 5.5);
    yLeft += 10;
  }
  if (!data.faturamento.dadosAtualizados) {
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(leftX, yLeft, leftW, 8, 1, 1, "F");
    doc.setFillColor(...colors.warning);
    doc.roundedRect(leftX, yLeft, 2.5, 8, 0.5, 0.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.warning);
    doc.text(`[MOD] Desatualizado — ultimo: ${data.faturamento.ultimoMesComDados || "N/A"}`, leftX + 6, yLeft + 5.5);
    yLeft += 10;
  }

  if (chartMeses.length > 0) {
    const chartVals = chartMeses.map(m => parseMoneyToNumber(m.valor));
    const chartMax = Math.max(...chartVals, 1);
    const fmmChart = parseMoneyToNumber(data.faturamento.fmm12m || "0");
    const barAreaH = 40;
    const barTopPadding = 10; // espaço reservado acima da barra mais alta para o label
    const labelAreaH = mesesFMM.length > 6 ? 12 : 6;
    const n = chartMeses.length;
    const bW = Math.max(2, (leftW / n) - 1.5);
    const chartTopY = yLeft + barTopPadding;
    const mesLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const parseMesLabel = (mesStr: string): string => {
      const parts = (mesStr || "").split("/");
      const part0 = parts[0] || "";
      const part1 = parts[1] || "";
      const numerico = parseInt(part0);
      if (!isNaN(numerico)) {
        const yr = part1.length === 4 ? part1.slice(2) : part1;
        return (mesLabels[numerico - 1] || part0) + (yr ? "/" + yr : "");
      }
      const capitalizado = part0.charAt(0).toUpperCase() + part0.slice(1).toLowerCase();
      const yr = part1.length === 4 ? part1.slice(2) : part1;
      return capitalizado + (yr ? "/" + yr : "");
    };

    // FMM reference line
    if (fmmChart > 0) {
      const fmmLineY = chartTopY + barAreaH - (fmmChart / chartMax) * barAreaH;
      doc.setDrawColor(150, 150, 150);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(leftX, fmmLineY, leftX + leftW, fmmLineY);
      doc.setLineDashPattern([], 0);
      doc.setFontSize(5);
      doc.setTextColor(130, 130, 130);
      doc.text("FMM", leftX + leftW + 1, fmmLineY + 1);
    }

    // Bars
    chartMeses.forEach((m, i) => {
      const v = chartVals[i];
      const bH = Math.max(1, (v / chartMax) * barAreaH);
      const bX = leftX + i * (bW + 1.5);
      const bY = chartTopY + barAreaH - bH;
      const isMax = v === chartMax && v > 0;
      const isZero = v === 0;
      const barColor: [number, number, number] = isZero ? [217, 119, 6] : isMax ? [20, 40, 100] : colors.navy;
      doc.setFillColor(...barColor);
      doc.roundedRect(bX, bY, bW, bH, 0.5, 0.5, "F");
      // Month label: "Jan/25"
      doc.setFontSize(4.5);
      doc.setTextColor(100, 100, 100);
      const mLabel = parseMesLabel(m.mes);
      const labelX = bX + bW / 2;
      const isEven = i % 2 === 0;
      const labelY = chartTopY + barAreaH + (isEven ? 4 : 8);

      doc.setFontSize(5.5);
      doc.setTextColor(80, 80, 80);
      doc.text(mLabel, labelX, labelY, { align: "center" });
      const vLabel = v >= 1000
        ? fmtBR(v / 1000, 0) + "k"
        : v > 0
          ? fmtBR(v / 1000, 1) + "k"
          : "0";

      doc.setFontSize(4);
      doc.setTextColor(70, 70, 70);

      if (bH > 6) {
        // valor acima da barra
        doc.text(vLabel, bX + bW / 2, bY - 1, { align: "center" });
      } else if (v > 0) {
        // barra pequena — valor logo acima com fundo branco
        doc.setTextColor(30, 30, 30);
        doc.text(vLabel, bX + bW / 2, chartTopY + barAreaH - bH - 1.5, { align: "center" });
      }
    });

    yLeft = chartTopY + barAreaH + labelAreaH + 1;

    // Summary line below chart
    const fmmK = fmmNum > 0 ? (fmmNum / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
    const fmmMedioNum = data.faturamento?.fmmMedio
      ? parseMoneyToNumber(data.faturamento.fmmMedio)
      : (() => {
        const porAno: Record<string, number[]> = {};
        for (const m of validMeses) {
          const ano = (m.mes || "").split("/")[1];
          if (!ano) continue;
          if (!porAno[ano]) porAno[ano] = [];
          porAno[ano].push(parseMoneyToNumber(m.valor));
        }
        const anosValidos = Object.values(porAno).filter(v => v.length >= 10);
        if (anosValidos.length === 0) return fmmNum;
        return anosValidos.reduce((s, v) => s + v.reduce((a, b) => a + b, 0) / v.length, 0) / anosValidos.length;
      })();
    const fmmMedioK = fmmMedioNum > 0 ? (fmmMedioNum / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
    const totalFat = chartVals.reduce((a, b) => a + b, 0);
    const totalK = (totalFat / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.textMuted);
    doc.text(`FMM 12M (mil R$): ${fmmK}   |   FMM Médio (mil R$): ${fmmMedioK}   |   Total (mil R$): ${totalK}`, leftX, yLeft);
    yLeft += 6;

    // Tabela faturamento mensal detalhado
    yLeft += 4;
    const tblMesW = 30;
    const tblValW = 60;
    const tblRowH = 5;
    // ultimos12 removido — tabela usa zebra azul uniforme

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.navy);
    doc.text("FATURAMENTO MENSAL DETALHADO", leftX, yLeft);
    yLeft += 5;

    // Cabeçalho
    doc.setFillColor(...colors.navy);
    doc.rect(leftX, yLeft, tblMesW + tblValW, tblRowH, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("MÊS", leftX + 2, yLeft + 3.5);
    doc.text("FATURAMENTO (R$)", leftX + tblMesW + tblValW - 2, yLeft + 3.5, { align: "right" });
    yLeft += tblRowH;

    // Linhas — azul claro alternado em toda a tabela
    validMeses.forEach((mes, idx) => {
      if (yLeft + tblRowH > 275) {
        doc.addPage();
        yLeft = 20;
      }
      // Zebra azul claro: par = azul médio, ímpar = azul muito claro
      doc.setFillColor(...(idx % 2 === 0 ? [225, 237, 254] as [number,number,number] : [241, 247, 255] as [number,number,number]));
      doc.rect(leftX, yLeft, tblMesW + tblValW, tblRowH, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.text);
      doc.text(parseMesLabel(mes.mes), leftX + 2, yLeft + 3.5);
      doc.text(mes.valor || "—", leftX + tblMesW + tblValW - 2, yLeft + 3.5, { align: "right" });
      doc.setDrawColor(210, 225, 250);
      doc.line(leftX, yLeft + tblRowH, leftX + tblMesW + tblValW, yLeft + tblRowH);
      yLeft += tblRowH;
    });
    yLeft += 4;

    // FMM por ano
    const fmmAnual = data.faturamento?.fmmAnual || {};
    const fmmAnualTexto = Object.entries(fmmAnual)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([ano, valor]) => {
        const qtdMeses = (data.faturamento?.meses || [])
          .filter(m => m.mes?.endsWith(ano)).length;
        return `FMM ${ano}: R$ ${fmtMoney(valor)} (${qtdMeses} meses)`;
      })
      .join("   |   ");
    if (fmmAnualTexto) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130, 130, 130);
      doc.text(fmmAnualTexto, leftX, yLeft);
      yLeft += 5;
    }

    // Aviso de meses zerados
    const mesesZeradosPDF = data.faturamento.mesesZerados;
    if (mesesZeradosPDF && mesesZeradosPDF.length > 0) {
      const listaMeses = mesesZeradosPDF.map(mz => mz.mes).join(", ");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.warning);
      doc.text(`\u26A0 ${mesesZeradosPDF.length} mes(es) com faturamento zero: ${listaMeses}`, leftX, yLeft);
      yLeft += 5;
    }
  } else {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("Sem dados de faturamento disponiveis", leftX + leftW / 2, yLeft + 20, { align: "center" });
    yLeft += 30;
  }

  // Alertas determinísticos — Faturamento
  if (alertasFat.length > 0) {
    yLeft += 4;
    y = yLeft;
    drawDetAlerts(alertasFat);
    yLeft = y;
  }

  // ── SCR (stacked below chart) ──
  let currentSCRPage = doc.getCurrentPageInfo().pageNumber;
  let yRight = yLeft + 6;

  const fmmVal = parseMoneyToNumber(data.faturamento.mediaAno || "0");
  const hasAnterior = !!(data.scrAnterior && data.scrAnterior.periodoReferencia);
  const periodoAnt = hasAnterior ? (data.scrAnterior!.periodoReferencia || "Anterior") : "";
  const periodoAt = data.scr.periodoReferencia || "Atual";

  const scrSemHistorico =
    data.scr?.semHistorico === true ||
    (
      parseMoneyToNumber(data.scr?.totalDividasAtivas || "0") === 0 &&
      parseMoneyToNumber(data.scr?.limiteCredito || "0") === 0 &&
      parseMoneyToNumber(data.scr?.carteiraAVencer || "0") === 0 &&
      (!data.scr?.modalidades || data.scr.modalidades.length === 0)
    );
  if (scrSemHistorico) {
    // ── Header azul ──
    doc.setFillColor(...colors.primary);
    doc.roundedRect(margin, yRight, contentW, 7, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("\u2713 PERFIL SCR \u2014 SEM OPERAÇÕES BANCÁRIAS", margin + 3, yRight + 4.8);
    yRight += 9;

    // ── 4 linhas de confirmação ──
    const pctConsulta = data.scr.pctDocumentosProcessados || "99%+";
    const confirmacoes = [
      `\u2713 Consulta realizada: ${pctConsulta} das instituições consultadas`,
      "\u2713 Sem dívida bancária ativa em nenhuma IF",
      "\u2713 Sem coobrigações (não figura como avalista)",
      "\u2713 Sem operações em discordância ou sub judice",
    ];
    doc.setFontSize(6.5);
    confirmacoes.forEach(linha => {
      doc.setFillColor(240, 246, 255);
      doc.rect(margin, yRight, contentW, 6, "F");
      doc.setFont("helvetica", "normal");
      doc.setTextColor(22, 163, 74);
      doc.text(linha, margin + 3, yRight + 4.2);
      yRight += 6;
    });

    // ── Separador ──
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, yRight + 1, margin + contentW, yRight + 1);
    yRight += 4;

    // ── Interpretação em itálico ──
    const interpretacaoLines = doc.splitTextToSize(
      "Empresa opera sem alavancagem bancária \u2014 indica autofinanciamento ou uso exclusivo de capital próprio. Ausência confirmada pelo Bacen, não presumida.",
      contentW - 4
    );
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...colors.textMuted);
    interpretacaoLines.forEach((l: string) => { doc.text(l, margin + 2, yRight); yRight += 4; });

    // ── Confirmação em dois períodos ──
    const antSemHist = data.scrAnterior && data.scrAnterior.semHistorico;
    if (antSemHist) {
      yRight += 2;
      const doisPeriodos = doc.splitTextToSize(
        `Confirmado em dois periodos consecutivos: ${data.scrAnterior!.periodoReferencia} e ${data.scr.periodoReferencia}`,
        contentW - 4
      );
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doisPeriodos.forEach((l: string) => { doc.text(l, margin + 2, yRight); yRight += 4; });
    }

  }

  // ── Tabela SCR Unificada — EVOLUÇÃO SCR ──
  {
    const toKu = (v: string | undefined) => {
      const n = parseMoneyToNumber(v || "0");
      return n > 0 ? (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
    };

    const alavAtU = fmmVal > 0
      ? fmtBR(parseMoneyToNumber(data.scr.totalDividasAtivas || "0") / fmmVal, 2) + "x"
      : "—";
    const alavAntU = hasAnterior && fmmVal > 0
      ? fmtBR(parseMoneyToNumber(data.scrAnterior!.totalDividasAtivas || "0") / fmmVal, 2) + "x"
      : "—";

    const cWu = hasAnterior
      ? [contentW * 0.33, contentW * 0.22, contentW * 0.22, contentW * 0.23]
      : [contentW * 0.55, contentW * 0.45];

    const scrRowHu = 6;

    const drawSCRHeader = () => {
      doc.setFillColor(...colors.navy);
      doc.rect(margin, yRight, contentW, 6, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("MÉTRICA (mil R$)", margin + 2, yRight + 4);
      if (hasAnterior) {
        doc.text(periodoAnt, margin + cWu[0] + cWu[1] - 1, yRight + 4, { align: "right" });
        doc.text(periodoAt, margin + cWu[0] + cWu[1] + cWu[2] - 1, yRight + 4, { align: "right" });
        doc.text("VAR.", margin + contentW - 1, yRight + 4, { align: "right" });
      } else {
        doc.text(periodoAt, margin + contentW - 1, yRight + 4, { align: "right" });
      }
      yRight += 7;
    };

    type ScrRowU = { label: string; antVal: string; atVal: string; antRaw: number; atRaw: number; positiveIsGood: boolean; bold?: boolean; skipVar?: boolean };
    const scrRowsU: ScrRowU[] = [
      { label: "Em Dia", antVal: toKu(data.scrAnterior?.emDia), atVal: toKu(data.scr.emDia), antRaw: parseMoneyToNumber(data.scrAnterior?.emDia || "0"), atRaw: parseMoneyToNumber(data.scr.emDia || "0"), positiveIsGood: true },
      { label: "Curto Prazo (CP)", antVal: toKu(data.scrAnterior?.carteiraCurtoPrazo), atVal: toKu(data.scr.carteiraCurtoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraCurtoPrazo || "0"), atRaw: parseMoneyToNumber(data.scr.carteiraCurtoPrazo || "0"), positiveIsGood: false },
      { label: "Longo Prazo (LP)", antVal: toKu(data.scrAnterior?.carteiraLongoPrazo), atVal: toKu(data.scr.carteiraLongoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraLongoPrazo || "0"), atRaw: parseMoneyToNumber(data.scr.carteiraLongoPrazo || "0"), positiveIsGood: false },
      { label: "Carteira a Vencer", antVal: toKu(data.scrAnterior?.carteiraAVencer), atVal: toKu(data.scr.carteiraAVencer), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraAVencer || "0"), atRaw: parseMoneyToNumber(data.scr.carteiraAVencer || "0"), positiveIsGood: false },
      { label: "Total Dívidas", antVal: toKu(data.scrAnterior?.totalDividasAtivas), atVal: toKu(data.scr.totalDividasAtivas), antRaw: parseMoneyToNumber(data.scrAnterior?.totalDividasAtivas || "0"), atRaw: parseMoneyToNumber(data.scr.totalDividasAtivas || "0"), positiveIsGood: false, bold: true },
      { label: "Vencidos", antVal: toKu(data.scrAnterior?.vencidos), atVal: toKu(data.scr.vencidos), antRaw: parseMoneyToNumber(data.scrAnterior?.vencidos || "0"), atRaw: parseMoneyToNumber(data.scr.vencidos || "0"), positiveIsGood: false },
      { label: "Prejuízos", antVal: toKu(data.scrAnterior?.prejuizos), atVal: toKu(data.scr.prejuizos), antRaw: parseMoneyToNumber(data.scrAnterior?.prejuizos || "0"), atRaw: parseMoneyToNumber(data.scr.prejuizos || "0"), positiveIsGood: false },
      { label: "Limite de Crédito", antVal: toKu(data.scrAnterior?.limiteCredito), atVal: toKu(data.scr.limiteCredito), antRaw: parseMoneyToNumber(data.scrAnterior?.limiteCredito || "0"), atRaw: parseMoneyToNumber(data.scr.limiteCredito || "0"), positiveIsGood: true },
      { label: "Nº Instituições", antVal: data.scrAnterior?.qtdeInstituicoes || data.scrAnterior?.numeroIfs || "—", atVal: data.scr.qtdeInstituicoes || data.scr.numeroIfs || "—", antRaw: parseFloat(data.scrAnterior?.qtdeInstituicoes || data.scrAnterior?.numeroIfs || "0") || 0, atRaw: parseFloat(data.scr.qtdeInstituicoes || data.scr.numeroIfs || "0") || 0, positiveIsGood: true },
      { label: "Nº Operações", antVal: data.scrAnterior?.qtdeOperacoes || "—", atVal: data.scr.qtdeOperacoes || "—", antRaw: parseFloat(data.scrAnterior?.qtdeOperacoes || "0") || 0, atRaw: parseFloat(data.scr.qtdeOperacoes || "0") || 0, positiveIsGood: true },
      { label: "Alavancagem / FMM", antVal: alavAntU, atVal: alavAtU, antRaw: 0, atRaw: 0, positiveIsGood: false, skipVar: true, bold: true },
    ];

    const scrTableTitle = hasAnterior
      ? `EVOLUÇÃO SCR — ${periodoAnt} → ${periodoAt}`
      : `POSIÇÃO SCR — ${periodoAt}`;

    const scrNeeded = 7 + 7 + scrRowHu * scrRowsU.length + 4;
    if (yRight + scrNeeded > 220) {
      doc.addPage();
      drawHeader();
      currentSCRPage = doc.getCurrentPageInfo().pageNumber;
      yRight = 35;
    }

    yRight += 4;
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.textMuted);
    doc.text(scrTableTitle, margin, yRight + 4);
    yRight += 5;
    doc.setFontSize(5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...colors.textMuted);
    doc.text("Métricas de endividamento bancário da empresa — saldos em mil R$, extraídos do Banco Central (SCR/Bacen).", margin, yRight + 4);
    yRight += 6;

    drawSCRHeader();

    scrRowsU.forEach((row, idx) => {
      if (yRight + scrRowHu > 275) {
        doc.addPage();
        drawHeader();
        currentSCRPage = doc.getCurrentPageInfo().pageNumber;
        yRight = 25;
        drawSCRHeader();
      }

      doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
      doc.rect(margin, yRight, contentW, scrRowHu, "F");

      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...(row.bold ? colors.text : colors.textSec));
      doc.text(row.label, margin + 2, yRight + 4);

      if (hasAnterior) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textSec);
        doc.text(row.antVal, margin + cWu[0] + cWu[1] - 1, yRight + 4, { align: "right" });
        doc.setFont("helvetica", row.bold ? "bold" : "normal");
        doc.setTextColor(...colors.text);
        doc.text(row.atVal, margin + cWu[0] + cWu[1] + cWu[2] - 1, yRight + 4, { align: "right" });

        let varStr = "—";
        let varColor: [number, number, number] = [150, 150, 150];
        if (!row.skipVar) {
          const diff = row.atRaw - row.antRaw;
          if (diff === 0 && row.atRaw > 0) {
            varStr = "= 0%";
          } else if (diff !== 0 && row.antRaw > 0) {
            const pct = (diff / row.antRaw) * 100;
            varStr = fmtVar(pct);
            const isGood = (diff > 0 && row.positiveIsGood) || (diff < 0 && !row.positiveIsGood);
            varColor = isGood ? [22, 163, 74] : [220, 38, 38];
          } else if (diff !== 0) {
            varStr = diff > 0 ? "↑" : "↓";
            const isGood = (diff > 0 && row.positiveIsGood) || (diff < 0 && !row.positiveIsGood);
            varColor = isGood ? [22, 163, 74] : [220, 38, 38];
          }
        }
        doc.setFont("helvetica", row.bold ? "bold" : "normal");
        doc.setTextColor(...varColor);
        doc.text(varStr, margin + contentW - 1, yRight + 4, { align: "right" });
      } else {
        doc.setFont("helvetica", row.bold ? "bold" : "normal");
        doc.setTextColor(...colors.text);
        doc.text(row.atVal, margin + contentW - 1, yRight + 4, { align: "right" });
      }

      doc.setDrawColor(230, 230, 230);
      doc.line(margin, yRight + scrRowHu, margin + contentW, yRight + scrRowHu);
      yRight += scrRowHu;
    });
    yRight += 4;
  }

  // Advance y past SCR
  if (doc.getCurrentPageInfo().pageNumber < currentSCRPage) {
    doc.setPage(currentSCRPage);
  }
  y = yRight + 6;

  // ── SCR Vencimentos — empresa + sócios lado a lado ──
  {
    const faixaKeys = ["ate30d", "d31_60", "d61_90", "d91_180", "d181_360", "acima360d"] as const;
    const faixaKeyLabels: Record<string, string> = {
      ate30d: "Até 30 dias",
      d31_60: "31–60 dias",
      d61_90: "61–90 dias",
      d91_180: "91–180 dias",
      d181_360: "181–360 dias",
      acima360d: "Acima de 360d",
    };

    type VencEntity = {
      label: string;
      aVencer: Record<string, string> | undefined;
      vencidos: Record<string, string> | undefined;
      totalAVencer: string;
      totalVencido: string;
    };

    const makeVencEnt = (label: string, scr: typeof data.scr | undefined | null): VencEntity | null => {
      if (!scr) return null;
      return {
        label,
        aVencer: scr.faixasAVencer as unknown as Record<string, string> | undefined,
        vencidos: scr.faixasVencidos as unknown as Record<string, string> | undefined,
        totalAVencer: scr.carteiraAVencer || scr.faixasAVencer?.total || "0,00",
        totalVencido: scr.vencidos || scr.faixasVencidos?.total || "0,00",
      };
    };

    const vencEntities: VencEntity[] = [];
    const empLabel = (data.cnpj?.razaoSocial || "Empresa").split(" ")[0] + " (PJ)";
    const empEnt = makeVencEnt(empLabel, data.scr);
    if (empEnt) vencEntities.push(empEnt);

    if (data.scrSocios) {
      data.scrSocios.forEach(s => {
        const nome = (s.nomeSocio || s.cpfSocio || "Sócio").split(" ")[0] + " (PF)";
        const ent = makeVencEnt(nome, s.periodoAtual);
        if (ent) vencEntities.push(ent);
      });
    }

    const hasVencData = vencEntities.some(e =>
      parseMoneyToNumber(e.totalAVencer) > 0 || parseMoneyToNumber(e.totalVencido) > 0
    );

    if (hasVencData) {
      // 35% para label, restante dividido igualmente entre entidades
      const vColLabel = contentW * 0.35;
      const vColData = (contentW - vColLabel) / vencEntities.length;
      const vRowH = 5.5;
      const totalRows = 1 + 6 + 1 + 1 + 6 + 1; // header + faixas + total + sep + faixas + total
      const vNeeded = 10 + 6 + totalRows * vRowH + 4;

      drawSpacer(6);
      checkPageBreak(vNeeded);

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      doc.text("SCR VENCIMENTOS", margin, y + 4);
      y += 8;

      // Cabeçalho: FAIXA | col por entidade
      doc.setFillColor(...colors.navy);
      doc.rect(margin, y, contentW, 6, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("FAIXA", margin + 2, y + 4);
      vencEntities.forEach((ent, i) => {
        doc.text(ent.label, margin + vColLabel + i * vColData + vColData / 2, y + 4, { align: "center" });
      });
      y += 6;

      const fmtV = (v: string) => {
        const n = parseMoneyToNumber(v || "0");
        if (n === 0) return "—";
        return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
      };

      let vIdx = 0;
      const drawVRow = (
        label: string,
        vals: string[],
        opts: { bold?: boolean; sectionBg?: "blue" | "red"; summaryBg?: "blue" | "red" } = {}
      ) => {
        if (y + vRowH > 275) { newPage(); drawHeader(); }

        if (opts.sectionBg) {
          const isBlue = opts.sectionBg === "blue";
          doc.setFillColor(...(isBlue ? [22, 78, 140] as [number,number,number] : [185, 28, 28] as [number,number,number]));
          doc.rect(margin, y, contentW, vRowH, "F");
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(label, margin + 2, y + 3.8);
          y += vRowH;
          vIdx = 0;
          return;
        }

        if (opts.summaryBg) {
          const isBlue = opts.summaryBg === "blue";
          doc.setFillColor(...(isBlue ? [215, 237, 255] as [number,number,number] : [255, 220, 220] as [number,number,number]));
          doc.rect(margin, y, contentW, vRowH, "F");
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...(isBlue ? colors.primary : [185, 28, 28] as [number,number,number]));
          doc.text(label, margin + 2, y + 3.8);
          vals.forEach((v, i) => {
            const display = fmtV(v);
            doc.setTextColor(...(isBlue ? colors.primary : [185, 28, 28] as [number,number,number]));
            doc.text(display, margin + vColLabel + i * vColData + vColData - 1, y + 3.8, { align: "right" });
          });
          doc.setTextColor(...colors.text);
          y += vRowH;
          return;
        }

        const isVencida = opts.bold === false && vals.some(v => parseMoneyToNumber(v) > 0);
        const bg: [number, number, number] = vIdx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, y, contentW, vRowH, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textSec);
        doc.text(label, margin + 2, y + 3.8);
        vals.forEach((v, i) => {
          const display = fmtV(v);
          const hasVal = display !== "—";
          doc.setTextColor(...(isVencida && hasVal ? [185, 28, 28] as [number,number,number] : hasVal ? colors.text : colors.textMuted));
          doc.text(display, margin + vColLabel + i * vColData + vColData - 1, y + 3.8, { align: "right" });
        });
        doc.setTextColor(...colors.text);
        y += vRowH;
        vIdx++;
      };

      // A VENCER
      drawVRow("A VENCER", [], { sectionBg: "blue" });
      faixaKeys.forEach(key => drawVRow(faixaKeyLabels[key], vencEntities.map(e => e.aVencer?.[key] || "0,00")));
      drawVRow("Total a Vencer", vencEntities.map(e => e.totalAVencer), { summaryBg: "blue" });

      // VENCIDOS
      drawVRow("VENCIDOS", [], { sectionBg: "red" });
      faixaKeys.forEach(key => drawVRow(faixaKeyLabels[key], vencEntities.map(e => e.vencidos?.[key] || "0,00"), { bold: false }));
      drawVRow("Total Vencido", vencEntities.map(e => e.totalVencido), { summaryBg: "red" });

      y += 4;

      if (!data.scrSocios || data.scrSocios.length === 0) {
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...colors.textMuted);
        doc.text("* SCR dos sócios não enviado — apenas dados da empresa disponíveis.", margin, y);
        y += 6;
      }
    }
  }


  // Modalidades PJ — comparativo entre períodos
  if (data.scr.modalidades && data.scr.modalidades.length > 0) {
    const modPJ = data.scr.modalidades;
    const modPJAnt = data.scrAnterior?.modalidades || [];
    const temAntPJ = modPJAnt.length > 0 && hasAnterior;
    const modPJRowH = 6;
    const modPJNeeded = 4 + 8 + 6 + 5 + modPJ.length * modPJRowH + 4;
    if (y + modPJNeeded > 275) { newPage(); drawHeader(); } else { y += 4; }

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    const razaoFull = data.cnpj?.razaoSocial || "Empresa";
    const cnpjFmt = (data.cnpj?.cnpj || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    doc.text(`MODALIDADES SCR — ${razaoFull} — ${cnpjFmt}`, margin, y + 4, { maxWidth: contentW });
    y += 8;

    const modColNomePJ = contentW * 0.32;
    const modColGrpPJ = (contentW - modColNomePJ) / (temAntPJ ? 2 : 1);
    const modSubColsPJ = [modColGrpPJ / 4, modColGrpPJ / 4, modColGrpPJ / 4, modColGrpPJ / 4];

    // Grupo de períodos
    doc.setFillColor(...colors.navy);
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    if (temAntPJ) {
      doc.text(periodoAnt, margin + modColNomePJ + modColGrpPJ / 2, y + 4, { align: "center" });
      doc.text(periodoAt, margin + modColNomePJ + modColGrpPJ + modColGrpPJ / 2, y + 4, { align: "center" });
    } else {
      doc.text(periodoAt, margin + modColNomePJ + modColGrpPJ / 2, y + 4, { align: "center" });
    }
    y += 6;

    // Sub-cabeçalho
    doc.setFillColor(50, 70, 110);
    doc.rect(margin, y, contentW, 5, "F");
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("MODALIDADE", margin + 2, y + 3.5);

    const drawPJSubHeader = (startX: number) => {
      doc.text("TOTAL", startX + modSubColsPJ[0] - 1, y + 3.5, { align: "right" });
      doc.text("A VENCER", startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, y + 3.5, { align: "right" });
      doc.text("VENCIDO", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, y + 3.5, { align: "right" });
      doc.text("PART.", startX + modColGrpPJ - 1, y + 3.5, { align: "right" });
    };
    if (temAntPJ) drawPJSubHeader(margin + modColNomePJ);
    drawPJSubHeader(margin + modColNomePJ + (temAntPJ ? modColGrpPJ : 0));
    y += 5;

    const normaisPJ = [...modPJ].filter(m => !m.ehContingente).sort((a, b) =>
      parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
    );
    const contingentesPJ = [...modPJ].filter(m => m.ehContingente).sort((a, b) =>
      parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
    );
    const orderedModPJ = [...normaisPJ, ...contingentesPJ];

    const toKPJ = (v: string) => {
      const n = parseMoneyToNumber(v || "0");
      return n === 0 ? "—" : n >= 1000000 ? fmtBR(n / 1000000, 1) + "M" : n >= 1000 ? fmtBR(Math.round(n / 1000), 0) : v;
    };

    const drawPJCells = (startX: number, mod: (typeof modPJ)[0] | undefined) => {
      if (!mod) {
        doc.setTextColor(...colors.textMuted);
        doc.text("—", startX + modSubColsPJ[0] - 1, y + 4, { align: "right" });
        doc.text("—", startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, y + 4, { align: "right" });
        doc.text("—", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, y + 4, { align: "right" });
        doc.text("—", startX + modColGrpPJ - 1, y + 4, { align: "right" });
      } else {
        const hasVencPJ = mod.vencido && mod.vencido !== "0,00" && mod.vencido !== "—";
        doc.setTextColor(...colors.text);
        doc.text(toKPJ(mod.total), startX + modSubColsPJ[0] - 1, y + 4, { align: "right" });
        doc.text(toKPJ(mod.aVencer), startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, y + 4, { align: "right" });
        doc.setTextColor(...(hasVencPJ ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(hasVencPJ ? toKPJ(mod.vencido) : "—", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, y + 4, { align: "right" });
        doc.setTextColor(...colors.textSec);
        doc.text(mod.participacao || "—", startX + modColGrpPJ - 1, y + 4, { align: "right" });
      }
    };

    let bgIdxPJ = 0;
    let separadorRendered = false;

    orderedModPJ.forEach((m) => {
      // Linha separadora antes das contingentes
      if (m.ehContingente && !separadorRendered) {
        separadorRendered = true;
        if (y + modPJRowH + 1 > 275) { newPage(); drawHeader(); }
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y, contentW, modPJRowH, "F");
        doc.setFontSize(4.8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...colors.textMuted);
        doc.text("Responsabilidades contingentes / Títulos fora da carteira", margin + 2, y + 4);
        y += modPJRowH;
        bgIdxPJ = 0;
      }

      if (y + modPJRowH > 275) { newPage(); drawHeader(); }
      const bg: [number, number, number] = bgIdxPJ % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(...bg);
      doc.rect(margin, y, contentW, modPJRowH, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.text);
      const nomeT = m.nome.length > 38 ? m.nome.substring(0, 37) + "…" : m.nome;
      doc.text(nomeT, margin + 2, y + 4);

      if (temAntPJ) {
        drawPJCells(margin + modColNomePJ, modPJAnt.find(a => a.nome === m.nome));
        drawPJCells(margin + modColNomePJ + modColGrpPJ, m);
      } else {
        drawPJCells(margin + modColNomePJ, m);
      }
      doc.setTextColor(...colors.text);
      y += modPJRowH;
      bgIdxPJ++;
    });
    y += 4;
  }

  if (data.scr.instituicoes && data.scr.instituicoes.length > 0) {
    drawSpacer(4);
    checkPageBreak(8 + 8 + data.scr.instituicoes.length * 10 + 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text("INSTITUICOES CREDORAS", margin, y + 4);
    y += 8;
    const instColW = [contentW * 0.60, contentW * 0.40];
    drawTable(
      ["INSTITUIÇÃO", "VALOR (R$)"],
      data.scr.instituicoes.map(i => [i.nome, i.valor]),
      instColW,
    );
  }

  if (data.scr.historicoInadimplencia) drawMultilineField("Historico de Inadimplencia", data.scr.historicoInadimplencia, 5);

  if (data.scrSocios && data.scrSocios.length > 0) {
    for (const socio of data.scrSocios) {
      // Verifica espaço na página
      checkPageBreak(80);

      y += 6;

      // Header do sócio
      doc.setFillColor(...colors.primary);
      doc.roundedRect(margin, y, contentW, 7, 1, 1, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(
        `SCR SÓCIO — ${socio.nomeSocio || socio.cpfSocio}`,
        margin + 3,
        y + 4.8
      );
      y += 9;

      // Tabela comparativa igual à da empresa
      const temAnteriorSocio = !!(socio.periodoAnterior?.periodoReferencia);
      const periodoAtSocio = socio.periodoAtual?.periodoReferencia || "Atual";
      const periodoAntSocio = socio.periodoAnterior?.periodoReferencia || "Anterior";

      // Cabeçalho da tabela
      doc.setFillColor(...colors.primary);
      doc.roundedRect(margin, y, contentW, 6, 1, 1, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);

      const colMetrica = contentW * 0.40;
      const colAt = contentW * 0.22;
      const colAnt = contentW * 0.22;
      const colVar = contentW * 0.16;
      void colVar;

      doc.text("MÉTRICA", margin + 2, y + 4);
      doc.text(periodoAtSocio, margin + colMetrica + 2, y + 4);
      if (temAnteriorSocio) {
        doc.text(periodoAntSocio, margin + colMetrica + colAt + 2, y + 4);
        doc.text("VAR.", margin + colMetrica + colAt + colAnt + 2, y + 4);
      }
      y += 6;

      const fmtSCRSocio = (v: string | undefined) =>
        (v && v !== "0,00" && v !== "") ? `R$ ${fmtMoney(v)}` : "R$ 0,00";

      const linhasSocio = [
        { label: "Carteira a Vencer", at: fmtSCRSocio(socio.periodoAtual?.carteiraAVencer), ant: fmtSCRSocio(socio.periodoAnterior?.carteiraAVencer), positiveIsGood: false },
        { label: "Vencidos", at: fmtSCRSocio(socio.periodoAtual?.vencidos), ant: fmtSCRSocio(socio.periodoAnterior?.vencidos), positiveIsGood: false },
        { label: "Prejuízos", at: fmtSCRSocio(socio.periodoAtual?.prejuizos), ant: fmtSCRSocio(socio.periodoAnterior?.prejuizos), positiveIsGood: false },
        { label: "Total Dívidas", at: fmtSCRSocio(socio.periodoAtual?.totalDividasAtivas), ant: fmtSCRSocio(socio.periodoAnterior?.totalDividasAtivas), positiveIsGood: false, bold: true },
        { label: "Qtde IFs", at: socio.periodoAtual?.qtdeInstituicoes || "0", ant: socio.periodoAnterior?.qtdeInstituicoes || "0", positiveIsGood: true },
        { label: "% Docs Processados", at: `${socio.periodoAtual?.pctDocumentosProcessados || "—"}%`, ant: `${socio.periodoAnterior?.pctDocumentosProcessados || "—"}%`, positiveIsGood: true },
      ];

      linhasSocio.forEach((linha, idx) => {
        const bgColor = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...(bgColor as [number, number, number]));
        doc.rect(margin, y, contentW, 5.5, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", (linha as { bold?: boolean }).bold ? "bold" : "normal");
        doc.setTextColor(...colors.text);
        doc.text(linha.label, margin + 2, y + 3.8);
        doc.text(linha.at, margin + colMetrica + 2, y + 3.8);

        if (temAnteriorSocio) {
          doc.text(linha.ant, margin + colMetrica + colAt + 2, y + 3.8);

          const numAt = parseFloat((linha.at || "0").replace(/[^0-9,]/g, "").replace(",", "."));
          const numAnt = parseFloat((linha.ant || "0").replace(/[^0-9,]/g, "").replace(",", "."));

          if (!isNaN(numAt) && !isNaN(numAnt) && numAnt !== 0) {
            const varPct = ((numAt - numAnt) / numAnt) * 100;
            const varStr = fmtVar(varPct);
            const melhorou = linha.positiveIsGood ? varPct > 0 : varPct < 0;
            const igual = Math.abs(varPct) < 0.1;
            doc.setTextColor(
              igual ? colors.textMuted[0] : melhorou ? 22 : 220,
              igual ? colors.textMuted[1] : melhorou ? 163 : 38,
              igual ? colors.textMuted[2] : melhorou ? 74 : 38
            );
            doc.text(varStr, margin + colMetrica + colAt + colAnt + 2, y + 3.8);
            doc.setTextColor(...colors.text);
          } else {
            doc.setTextColor(...colors.textMuted);
            doc.text("—", margin + colMetrica + colAt + colAnt + 2, y + 3.8);
            doc.setTextColor(...colors.text);
          }
        }
        y += 5.5;
      });

      // Modalidades do sócio — comparativo
      if (socio.periodoAtual?.modalidades && socio.periodoAtual.modalidades.length > 0) {
        const modS = socio.periodoAtual.modalidades;
        const modSAnt = socio.periodoAnterior?.modalidades || [];
        const modSRowH = 6;
        const modSNeeded = 8 + 6 + 6 + modS.length * modSRowH + 4;
        checkPageBreak(modSNeeded);
        y += 4;

        const labelMod = `MODALIDADES — ${(socio.nomeSocio || socio.cpfSocio || "Sócio").split(" ").slice(0, 2).join(" ")}`;
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(labelMod, margin, y + 4);
        y += 7;

        // Grupo de período anterior e atual
        const temAntMod = modSAnt.length > 0 && !!socio.periodoAnterior?.periodoReferencia;
        const modColNome = contentW * 0.32;
        const modColGrp = (contentW - modColNome) / (temAntMod ? 2 : 1);
        const modSubCols = [modColGrp / 4, modColGrp / 4, modColGrp / 4, modColGrp / 4];

        // Cabeçalho — grupo de períodos
        doc.setFillColor(...colors.navy);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        if (temAntMod) {
          const midAnt = margin + modColNome + modColGrp / 2;
          const midAt = margin + modColNome + modColGrp + modColGrp / 2;
          doc.text(periodoAtSocio, midAt, y + 4, { align: "center" });
          doc.text(periodoAntSocio, midAnt, y + 4, { align: "center" });
        } else {
          doc.text(periodoAtSocio, margin + modColNome + modColGrp / 2, y + 4, { align: "center" });
        }
        y += 6;

        // Sub-cabeçalho — colunas
        doc.setFillColor(50, 70, 110);
        doc.rect(margin, y, contentW, 5, "F");
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("MODALIDADE", margin + 2, y + 3.5);

        const drawModSubHeader = (startX: number) => {
          doc.text("TOTAL", startX + modSubCols[0] - 1, y + 3.5, { align: "right" });
          doc.text("A VENCER", startX + modSubCols[0] + modSubCols[1] - 1, y + 3.5, { align: "right" });
          doc.text("VENCIDO", startX + modSubCols[0] + modSubCols[1] + modSubCols[2] - 1, y + 3.5, { align: "right" });
          doc.text("PART.", startX + modColGrp - 1, y + 3.5, { align: "right" });
        };
        if (temAntMod) drawModSubHeader(margin + modColNome);
        drawModSubHeader(margin + modColNome + (temAntMod ? modColGrp : 0));
        y += 5;

        // Linhas — normais + contingentes com separador
        const normaisS = [...modS].filter(m => !m.ehContingente).sort((a, b) =>
          parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
        );
        const contingentesS = [...modS].filter(m => m.ehContingente).sort((a, b) =>
          parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
        );
        const orderedModS = [...normaisS, ...contingentesS];

        const toKS = (v: string) => {
          const n = parseMoneyToNumber(v || "0");
          return n === 0 ? "—" : n >= 1000000 ? fmtBR(n / 1000000, 1) + "M" : n >= 1000 ? fmtBR(Math.round(n / 1000), 0) : v;
        };

        const drawModCells = (startX: number, mod: (typeof modS)[0] | undefined) => {
          if (!mod) {
            doc.setTextColor(...colors.textMuted);
            ["—", "—", "—", "—"].forEach((v, ci) => {
              const cx = startX + modSubCols.slice(0, ci + 1).reduce((a, b) => a + b, 0) - 1;
              doc.text(v, cx, y + 4, { align: "right" });
            });
          } else {
            const hasVenc = mod.vencido && mod.vencido !== "0,00" && mod.vencido !== "—";
            doc.setTextColor(...colors.text);
            doc.text(toKS(mod.total), startX + modSubCols[0] - 1, y + 4, { align: "right" });
            doc.text(toKS(mod.aVencer), startX + modSubCols[0] + modSubCols[1] - 1, y + 4, { align: "right" });
            doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
            doc.text(hasVenc ? toKS(mod.vencido) : "—", startX + modSubCols[0] + modSubCols[1] + modSubCols[2] - 1, y + 4, { align: "right" });
            doc.setTextColor(...colors.textSec);
            doc.text(mod.participacao || "—", startX + modColGrp - 1, y + 4, { align: "right" });
          }
        };

        let bgIdxS = 0;
        let sepRenderedS = false;

        orderedModS.forEach((m) => {
          if (m.ehContingente && !sepRenderedS) {
            sepRenderedS = true;
            if (y + modSRowH > 275) { newPage(); drawHeader(); }
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, y, contentW, modSRowH, "F");
            doc.setFontSize(4.8);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...colors.textMuted);
            doc.text("Responsabilidades contingentes / Títulos fora da carteira", margin + 2, y + 4);
            y += modSRowH;
            bgIdxS = 0;
          }
          if (y + modSRowH > 275) { newPage(); drawHeader(); }
          const bg: [number, number, number] = bgIdxS % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          doc.setFillColor(...bg);
          doc.rect(margin, y, contentW, modSRowH, "F");
          doc.setFontSize(5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          const nomeT = m.nome.length > 38 ? m.nome.substring(0, 37) + "…" : m.nome;
          doc.text(nomeT, margin + 2, y + 4);

          if (temAntMod) {
            drawModCells(margin + modColNome, modSAnt.find(a => a.nome === m.nome));
            drawModCells(margin + modColNome + modColGrp, m);
          } else {
            drawModCells(margin + modColNome, m);
          }
          doc.setTextColor(...colors.text);
          y += modSRowH;
          bgIdxS++;
        });
        y += 4;
      }

      y += 4;
    }
  }

  // Alertas determinísticos — SCR
  if (alertasSCR.length > 0) { drawSpacer(4); drawDetAlerts(alertasSCR); }

  // ── Seção DRE (flui se couber) ──
  if (data.dre && (
    (data.dre.anos && data.dre.anos.length > 0) ||
    data.dre.crescimentoReceita ||
    data.dre.observacoes
  )) {
    drawSpacer(10);
    checkPageBreak(80);

    // Header da seção
    dsSectionHeader("07", "DEMONSTRACAO DE RESULTADO (DRE)");

    // Tabela comparativa por ano — deduplicar anos
    const dreAnosMap = new Map<string, (typeof data.dre.anos)[0]>();
    data.dre.anos.forEach(a => dreAnosMap.set(a.ano, a));
    const dreAnos = Array.from(dreAnosMap.values()).sort((a, b) => parseInt(a.ano) - parseInt(b.ano));
    const dreFontSz = dreAnos.length >= 4 ? 6.5 : 7;
    const dreColLabel = dreAnos.length >= 4 ? 58 : 62;
    const dreColAno = (contentW - dreColLabel) / dreAnos.length;

    // Cabeçalho da tabela
    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFontSize(dreFontSz);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("METRICA", margin + 2, y + 4.8);
    dreAnos.forEach((ano, i) => {
      doc.text(ano.ano, margin + dreColLabel + i * dreColAno + 2, y + 4.8);
    });
    y += 7;

    // Linhas da tabela
    const linhasDRE: { label: string; campo: string; bold: boolean; isPct?: boolean }[] = [
      { label: "Receita Bruta", campo: "receitaBruta", bold: false },
      { label: "Receita Liquida", campo: "receitaLiquida", bold: false },
      { label: "Lucro Bruto", campo: "lucroBruto", bold: false },
      { label: "Margem Bruta (%)", campo: "margemBruta", bold: false, isPct: true },
      { label: "EBITDA", campo: "ebitda", bold: true },
      { label: "Margem EBITDA (%)", campo: "margemEbitda", bold: false, isPct: true },
      { label: "Lucro Liquido", campo: "lucroLiquido", bold: true },
      { label: "Margem Liquida (%)", campo: "margemLiquida", bold: false, isPct: true },
    ];

    linhasDRE.forEach((linha, idx) => {
      const bg: [number, number, number] = idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg;
      doc.setFillColor(...bg);
      doc.rect(margin, y, contentW, 6, "F");
      // Borda bottom sutil
      doc.setDrawColor(...DS.colors.border);
      doc.setLineWidth(0.15);
      doc.line(margin, y + 6, margin + contentW, y + 6);
      doc.setLineWidth(0.1);
      doc.setFontSize(dreFontSz);
      doc.setFont("helvetica", linha.bold ? "bold" : "normal");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(linha.label, margin + 2, y + 4.2);
      dreAnos.forEach((ano, i) => {
        const val = (ano as unknown as Record<string, string>)[linha.campo] || "0,00";
        const numVal = parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
        const display = linha.isPct ? `${val}%` : `R$ ${fmtMoney(val)}`;
        // Cor semântica: negativo = danger, zero/ausente = textLight, positivo = padrão
        let valColor: [number,number,number] = DS.colors.textPrimary;
        if (linha.isPct) {
          if (numVal < 0) valColor = DS.colors.danger;
          else if (numVal === 0) valColor = DS.colors.textLight;
        } else {
          if (numVal < 0) valColor = DS.colors.danger;
          else if (numVal === 0) valColor = DS.colors.textLight;
        }
        doc.setTextColor(...valColor);
        doc.text(display, margin + dreColLabel + i * dreColAno + 2, y + 4.2);
        doc.setTextColor(...DS.colors.textPrimary);
      });
      y += 6;
    });

    // Tendência
    y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.primary);
    const tendenciaDRE = normalizeTendencia(data.dre.tendenciaLucro);
    doc.text(`Tendencia: ${tendenciaDRE} | Crescimento de Receita: ${data.dre.crescimentoReceita}%`, margin + 2, y);
    y += 6;

    if (data.dre.observacoes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(...colors.textMuted);
      const obsLines = doc.splitTextToSize(data.dre.observacoes, contentW - 4);
      obsLines.forEach((l: string) => { doc.text(l, margin + 2, y); y += 4; });
    }
    // Alertas determinísticos — DRE
    if (alertasDRE.length > 0) { y += 4; drawDetAlerts(alertasDRE); }
  }

  // ── Seção Balanço (flui se couber) ──
  if (data.balanco && (
    (data.balanco.anos && data.balanco.anos.length > 0) ||
    data.balanco.observacoes ||
    data.balanco.tendenciaPatrimonio
  )) {
    drawSpacer(10);
    checkPageBreak(90);

    dsSectionHeader("08", "BALANCO PATRIMONIAL");

    // Deduplicar anos do balanço (evita 2023 duplicado)
    const balAnosMap = new Map<string, (typeof data.balanco.anos)[0]>();
    data.balanco.anos.forEach(a => balAnosMap.set(a.ano, a));
    const balAnos = Array.from(balAnosMap.values()).sort((a, b) => parseInt(a.ano) - parseInt(b.ano));
    const balFontSz = balAnos.length >= 4 ? 6.5 : 7;
    const colLabelB = balAnos.length >= 4 ? 58 : 65;
    const colAnoB = (contentW - colLabelB) / balAnos.length;

    // Cabeçalho
    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFontSize(balFontSz);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("METRICA", margin + 2, y + 4.8);
    balAnos.forEach((ano, i) => {
      doc.text(ano.ano, margin + colLabelB + i * colAnoB + 2, y + 4.8);
    });
    y += 7;

    const linhasBalanco: { label: string; campo: string; bold: boolean; isIndice?: boolean; isPct?: boolean }[] = [
      { label: "Ativo Total", campo: "ativoTotal", bold: true },
      { label: "Ativo Circulante", campo: "ativoCirculante", bold: false },
      { label: "Ativo Nao Circulante", campo: "ativoNaoCirculante", bold: false },
      { label: "Passivo Total", campo: "passivoTotal", bold: true },
      { label: "Passivo Circulante", campo: "passivoCirculante", bold: false },
      { label: "Passivo Nao Circulante", campo: "passivoNaoCirculante", bold: false },
      { label: "Patrimonio Liquido", campo: "patrimonioLiquido", bold: true },
      { label: "Liquidez Corrente", campo: "liquidezCorrente", bold: false, isIndice: true },
      { label: "Endividamento (%)", campo: "endividamentoTotal", bold: false, isPct: true },
      { label: "Capital de Giro Liq.", campo: "capitalDeGiroLiquido", bold: false },
    ];

    linhasBalanco.forEach((linha, idx) => {
      const bg: [number, number, number] = idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg;
      doc.setFillColor(...bg);
      doc.rect(margin, y, contentW, 6, "F");
      doc.setDrawColor(...DS.colors.border);
      doc.setLineWidth(0.15);
      doc.line(margin, y + 6, margin + contentW, y + 6);
      doc.setLineWidth(0.1);
      doc.setFontSize(balFontSz);
      doc.setFont("helvetica", linha.bold ? "bold" : "normal");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(linha.label, margin + 2, y + 4.2);
      balAnos.forEach((ano, i) => {
        const val = (ano as unknown as Record<string, string>)[linha.campo] || "0,00";
        const valClean = String(val).replace(/%/g, "").trim();
        const display = linha.isIndice ? (val && val !== "0,00" ? `${val}x` : "—") : linha.isPct ? `${valClean}%` : `R$ ${fmtMoney(val)}`;
        const numVal = parseFloat(valClean.replace(/\./g, '').replace(',', '.')) || 0;
        // Cor semântica: PL negativo, liquidez < 1 = perigo
        let valColor: [number,number,number] = DS.colors.textPrimary;
        if (numVal < 0) valColor = DS.colors.danger;
        else if (numVal === 0 && display === "—") valColor = DS.colors.textLight;
        else if (linha.isIndice && numVal < 1 && numVal > 0) valColor = DS.colors.warn;
        else if (linha.campo === 'liquidezCorrente' && numVal < 1 && numVal > 0) valColor = DS.colors.warn;
        doc.setTextColor(...valColor);
        doc.text(display, margin + colLabelB + i * colAnoB + 2, y + 4.2);
        doc.setTextColor(...DS.colors.textPrimary);
      });
      y += 6;
    });
    // Alertas determinísticos — Balanço
    if (alertasBalanco.length > 0) { y += 4; drawDetAlerts(alertasBalanco); }
  }

  // ── Seção Curva ABC (flui se couber) ──
  if (data.curvaABC && (
    (data.curvaABC.clientes && data.curvaABC.clientes.length > 0) ||
    data.curvaABC.maiorCliente ||
    data.curvaABC.periodoReferencia
  )) {
    drawSpacer(10);
    checkPageBreak(65);

    dsSectionHeader("09", "CURVA ABC — CONCENTRACAO DE CLIENTES");

    // Alerta de concentração
    if (data.curvaABC.alertaConcentracao) {
      const alertaTexto = `! Cliente "${data.curvaABC.maiorCliente}" concentra ${data.curvaABC.maiorClientePct}% da receita — acima do limite de 30%`;
      const alertaLines = doc.splitTextToSize(alertaTexto, contentW - 10);
      const alertaH = Math.max(8, alertaLines.length * 5 + 4);
      checkPageBreak(alertaH + 2);
      doc.setFillColor(254, 242, 242);
      doc.rect(margin, y, contentW, alertaH, "F");
      doc.setFillColor(220, 38, 38);
      doc.rect(margin, y, 2.5, alertaH, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 38, 38);
      alertaLines.forEach((l: string, i: number) => doc.text(l, margin + 5, y + 5 + i * 5));
      y += alertaH + 2;
    }

    // Resumo de concentração
    const top10Txt = data.curvaABC.concentracaoTop10 && data.curvaABC.concentracaoTop10 !== "0,00"
      ? `   |   Top 10: ${data.curvaABC.concentracaoTop10}%` : "";
    const classeATxt = data.curvaABC.totalClientesClasseA
      ? `   |   Classe A: ${data.curvaABC.totalClientesClasseA} clientes (R$ ${fmtMoney(data.curvaABC.receitaClasseA)})` : "";
    const resumoTexto = `Periodo: ${data.curvaABC.periodoReferencia || "—"}   |   Top 3: ${data.curvaABC.concentracaoTop3}%   |   Top 5: ${data.curvaABC.concentracaoTop5}%${top10Txt}   |   Total clientes: ${data.curvaABC.totalClientesNaBase || "—"}${classeATxt}`;
    const resumoLines = doc.splitTextToSize(resumoTexto, contentW - 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    doc.text(resumoLines, margin + 2, y);
    y += resumoLines.length * 5 + 4;

    // Tabela de clientes via autoT
    if (data.curvaABC.clientes.length > 0) {
      const abcRows = data.curvaABC.clientes.slice(0, 20).map(c => {
        const pct = parseFloat(String(c.percentualReceita || "0").replace(",", "."));
        const pctCell: AutoCell = pct > 30
          ? { content: `${c.percentualReceita}%`, styles: { textColor: [220, 38, 38] as [number,number,number], fontStyle: "bold" } }
          : { content: `${c.percentualReceita}%` };
        const classeCell: AutoCell = c.classe === "A"
          ? { content: "A", styles: { textColor: [21, 128, 61] as [number,number,number], fontStyle: "bold" } }
          : c.classe === "B"
          ? { content: "B", styles: { textColor: [161, 98, 7] as [number,number,number], fontStyle: "bold" } }
          : { content: c.classe || "—" };
        return [
          String(c.posicao),
          c.nome || "—",
          c.valorFaturado ? fmtMoney(c.valorFaturado) : "—",
          pctCell,
          c.percentualAcumulado ? `${c.percentualAcumulado}%` : "—",
          classeCell,
        ] as AutoCell[];
      });
      autoT(
        ["#", "CLIENTE", "FATURAMENTO (R$)", "% RECEITA", "% ACUM.", "CL."],
        abcRows,
        [10, 65, 40, 20, 20, 10],
        { fontSize: 7, headFontSize: 6 }
      );
    }
  }

  // ===== SEÇÃO 05 — PROTESTOS (flui se couber) =====
  drawSpacer(10);
  checkPageBreak(50);
  dsSectionHeader("05", "PROTESTOS");

  // ── BLOCO 1 — KPI Cards 4 colunas ──
  {
    checkPageBreak(22);
    const kpiGapP = 3;
    const kpiWP = (contentW - kpiGapP * 3) / 4;
    const kpiHP = 20;
    const vigQtdP = parseInt(data.protestos?.vigentesQtd || '0');
    const regQtdP = parseInt(data.protestos?.regularizadosQtd || '0');
    const kpiDataP = [
      { label: 'Vigentes Qtd',    value: protestosNaoConsultados ? 'N/C' : String(vigQtdP),                                                         border: vigQtdP > 0 ? DS.colors.danger  : DS.colors.success, valColor: vigQtdP > 0 ? DS.colors.danger  : DS.colors.textPrimary },
      { label: 'Vigentes R$',     value: protestosNaoConsultados ? 'N/C' : (vigQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.vigentesValor)}` : '—'),   border: vigQtdP > 0 ? DS.colors.danger  : DS.colors.success, valColor: vigQtdP > 0 ? DS.colors.danger  : DS.colors.textLight  },
      { label: 'Regularizados Qtd', value: protestosNaoConsultados ? 'N/C' : String(regQtdP),                                                       border: regQtdP > 0 ? DS.colors.success : DS.colors.border,  valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textPrimary },
      { label: 'Regularizados R$',  value: protestosNaoConsultados ? 'N/C' : (regQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.regularizadosValor)}` : '—'), border: regQtdP > 0 ? DS.colors.success : DS.colors.border, valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textLight },
    ];
    kpiDataP.forEach((k, i) => {
      dsMetricCard(margin + i * (kpiWP + kpiGapP), y, kpiWP, kpiHP, k.label, k.value, undefined, k.border, k.valColor);
    });
    y += kpiHP + 4;
  }

  if (protestosNaoConsultados) {
    drawSpacer(4);
    drawBannerNaoConsultado("Protestos");
  } else if (protestosVigentes > 0) {
    const valorProt = parseMoneyToNumber(data.protestos?.vigentesValor || "0");
    const msgProt = valorProt > 0
      ? `${protestosVigentes} protesto(s) vigente(s) — R$ ${fmtMoney(data.protestos?.vigentesValor)}`
      : `${protestosVigentes} protesto(s) vigente(s) — valor não disponível no bureau (confirmar junto ao cartório)`;
    drawAlertBox(msgProt, "ALTA");
  }

  const protestoDetalhes = data.protestos?.detalhes || [];

  if (!protestosNaoConsultados && protestoDetalhes.length === 0) {
    drawSpacer(4);
    checkPageBreak(12);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Nenhum protesto identificado", margin + 8, y + 6.5);
    y += 14;
  } else if (!protestosNaoConsultados) {
    // Helper: parse date string DD/MM/AAAA → Date
    const parseDate = (d: string): Date | null => {
      if (!d) return null;
      const parts = d.split("/");
      if (parts.length !== 3) return null;
      const [dd, mm, aaaa] = parts.map(Number);
      if (!dd || !mm || !aaaa) return null;
      return new Date(aaaa, mm - 1, dd);
    };
    // Helper: parse money string → number
    const parseProt = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
    // Helper: format number as R$ X.XXX
    const fmtProt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const now = new Date();
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const ms90 = 90 * 24 * 60 * 60 * 1000;
    const ms365 = 365 * 24 * 60 * 60 * 1000;

    // ── BLOCOS 2 & 3 — Distribuição Temporal + Por Faixa (lado a lado) ──
    type TempBucket = { label: string; qtd: number; valor: number };
    const tempBuckets: TempBucket[] = [
      { label: "Ultimo mes (30 dias)", qtd: 0, valor: 0 },
      { label: "Ultimos 3 meses", qtd: 0, valor: 0 },
      { label: "Ultimos 12 meses", qtd: 0, valor: 0 },
      { label: "Mais de 12 meses", qtd: 0, valor: 0 },
    ];
    protestoDetalhes.forEach(p => {
      const dt = parseDate(p.data || "");
      const val = parseProt(p.valor || "0");
      if (!dt) return;
      const age = now.getTime() - dt.getTime();
      if (age <= ms30) { tempBuckets[0].qtd++; tempBuckets[0].valor += val; }
      if (age <= ms90) { tempBuckets[1].qtd++; tempBuckets[1].valor += val; }
      if (age <= ms365) { tempBuckets[2].qtd++; tempBuckets[2].valor += val; }
      else { tempBuckets[3].qtd++; tempBuckets[3].valor += val; }
    });

    type ValBucket = { label: string; min: number; max: number; qtd: number; valor: number };
    const valBuckets: ValBucket[] = [
      { label: "Abaixo de R$ 1.000", min: 0, max: 1000, qtd: 0, valor: 0 },
      { label: "R$ 1.000 a R$ 10.000", min: 1000, max: 10000, qtd: 0, valor: 0 },
      { label: "R$ 10.000 a R$ 50.000", min: 10000, max: 50000, qtd: 0, valor: 0 },
      { label: "R$ 50.000 a R$ 100.000", min: 50000, max: 100000, qtd: 0, valor: 0 },
      { label: "Acima de R$ 100.000", min: 100000, max: Infinity, qtd: 0, valor: 0 },
    ];
    protestoDetalhes.forEach(p => {
      const val = parseProt(p.valor || "0");
      const bucket = valBuckets.find(b => val >= b.min && val < b.max);
      if (bucket) { bucket.qtd++; bucket.valor += val; }
    });

    // ── Dois blocos lado a lado ──
    {
      const colGapD = 4;
      const colWD = (contentW - colGapD) / 2;
      const rowHD = 6;
      // estimar altura máxima entre os dois blocos
      const maxRowsD = Math.max(tempBuckets.length, valBuckets.length);
      const neededD = 7 + maxRowsD * rowHD + 8;
      drawSpacer(4);
      checkPageBreak(neededD);

      const yDistStart = y;
      // Headers
      dsMiniHeaderAt(margin, yDistStart, colWD, 'DISTRIBUICAO TEMPORAL', DS.colors.headerBg);
      dsMiniHeaderAt(margin + colWD + colGapD, yDistStart, colWD, 'DISTRIBUICAO POR FAIXA', DS.colors.headerBg);

      // Sub-cabeçalho das colunas — esquerda
      let yL = yDistStart + 7;
      let yR = yDistStart + 7;
      const drawSubHeader2 = (cx: number, startY: number, cw: number, c1: string, c2: string, c3: string) => {
        doc.setFillColor(50, 70, 110);
        doc.rect(cx, startY, cw, 5.5, 'F');
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(c1, cx + 2, startY + 4);
        doc.text(c2, cx + cw * 0.72, startY + 4, { align: 'right' });
        doc.text(c3, cx + cw - 1, startY + 4, { align: 'right' });
        return startY + 5.5;
      };
      yL = drawSubHeader2(margin, yL, colWD, 'PERIODO', 'QTD', 'VALOR');
      yR = drawSubHeader2(margin + colWD + colGapD, yR, colWD, 'FAIXA', 'QTD', 'VALOR');

      // Linhas — temporal
      tempBuckets.forEach((b, idx) => {
        doc.setFillColor(...(idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg));
        doc.rect(margin, yL, colWD, rowHD, 'F');
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DS.colors.textPrimary);
        const labTrunc = b.label.length > 22 ? b.label.substring(0, 21) + '…' : b.label;
        doc.text(labTrunc, margin + 2, yL + 4);
        doc.text(String(b.qtd), margin + colWD * 0.72, yL + 4, { align: 'right' });
        doc.setTextColor(...(b.qtd > 0 ? DS.colors.danger : DS.colors.textLight));
        doc.text(b.qtd > 0 ? fmtProt(b.valor) : '—', margin + colWD - 1, yL + 4, { align: 'right' });
        doc.setDrawColor(...DS.colors.border);
        doc.line(margin, yL + rowHD, margin + colWD, yL + rowHD);
        yL += rowHD;
      });

      // Linhas — faixas
      valBuckets.forEach((b, idx) => {
        const cx2 = margin + colWD + colGapD;
        doc.setFillColor(...(idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg));
        doc.rect(cx2, yR, colWD, rowHD, 'F');
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DS.colors.textPrimary);
        const labTrunc2 = b.label.length > 20 ? b.label.substring(0, 19) + '…' : b.label;
        doc.text(labTrunc2, cx2 + 2, yR + 4);
        doc.text(String(b.qtd), cx2 + colWD * 0.72, yR + 4, { align: 'right' });
        doc.setTextColor(...(b.qtd > 0 ? DS.colors.textPrimary : DS.colors.textLight));
        doc.text(b.qtd > 0 ? fmtProt(b.valor) : '—', cx2 + colWD - 1, yR + 4, { align: 'right' });
        doc.setDrawColor(...DS.colors.border);
        doc.line(cx2, yR + rowHD, cx2 + colWD, yR + rowHD);
        yR += rowHD;
      });

      y = Math.max(yL, yR) + 4;
    }

    // Helper: draw protestos detail table via autoT (word-wrap automático, sem truncamento)
    const drawProtTable = (rows: typeof protestoDetalhes) => {
      autoT(
        ["DT.PROT.", "VENCTO.", "ESPÉCIE", "CARTÓRIO / UF", "APRESENTANTE/CEDENTE", "VALOR (R$)", "REG."],
        rows.map(p => [
          p.data || "—",
          { content: p.dataVencimento || "—", styles: { textColor: colors.textMuted } },
          p.especie || "—",
          p.credor || "—",
          { content: p.apresentante || "—", styles: { textColor: colors.textSec } },
          { content: p.valor || "—", styles: { textColor: p.regularizado ? colors.textMuted : colors.danger, fontStyle: "bold" } },
          { content: p.regularizado ? "Sim" : "Não", styles: { textColor: p.regularizado ? [22, 163, 74] : colors.danger } },
        ]),
        [0.10, 0.10, 0.11, 0.22, 0.22, 0.14, 0.11].map(r => contentW * r),
        { headFontSize: 5.5, fontSize: 6 },
      );
    };

    // Detecta se o bureau retornou detalhes reais ou apenas localidades
    const semDetalhesReais = protestoDetalhes.every(p => !p.data && !p.apresentante && parseProt(p.valor || "0") === 0);

    if (semDetalhesReais) {
      // ── BLOCO 4 (simplificado) — Locais dos Protestos ──
      drawSpacer(4);
      checkPageBreak(16);
      y = dsMiniHeader(y, 'LOCAIS DOS PROTESTOS');
      drawProtTable(protestoDetalhes.slice(0, 10));

      // Nota de limitação do bureau
      checkPageBreak(10);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text("* Detalhes (valor, data, apresentante) nao disponiveis no plano atual do Credit Hub — confirmar diretamente nos cartorios.", margin, y);
      y += 7;
    } else {
      // ── BLOCO 4 — Top 10 Mais Recentes ──
      drawSpacer(4);
      checkPageBreak(16);
      y = dsMiniHeader(y, 'TOP 10 MAIS RECENTES');
      const top10Recentes = [...protestoDetalhes]
        .sort((a, b) => {
          const da = parseDate(a.data || "");
          const db = parseDate(b.data || "");
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return db.getTime() - da.getTime();
        })
        .slice(0, 10);
      drawProtTable(top10Recentes);

      // ── BLOCO 5 — Top 10 por Valor ──
      drawSpacer(4);
      checkPageBreak(16);
      y = dsMiniHeader(y, 'TOP 10 POR VALOR');
      const top10Valor = [...protestoDetalhes]
        .sort((a, b) => parseProt(b.valor || "0") - parseProt(a.valor || "0"))
        .slice(0, 10);
      drawProtTable(top10Valor);
    }
  }

  // ===== SEÇÃO 06 — PROCESSOS (flui se couber) =====
  drawSpacer(10);
  checkPageBreak(50);
  dsSectionHeader("06", "PROCESSOS JUDICIAIS");

  // ── BLOCO 1 — KPI Cards (3 cols linha 1 + 3 cols linha 2) ──
  {
    checkPageBreak(48);
    const kpiGapQ = 3;
    const kpiWQ = (contentW - kpiGapQ * 2) / 3;
    const kpiHQ = 20;
    const passivosN = parseInt(data.processos?.passivosTotal || '0');
    const ativosN   = parseInt(data.processos?.ativosTotal || '0');
    const temRJN    = !!data.processos?.temRJ;
    const dividasQN = parseInt(data.processos?.dividasQtd || '0');

    const kpiRowsQ = [
      [
        { label: 'Total Processos',   value: processosNaoConsultados ? 'N/C' : String(passivosN), border: passivosN > 0 ? DS.colors.warn : DS.colors.border, valColor: passivosN > 0 ? DS.colors.warn : DS.colors.textPrimary },
        { label: 'Em Andamento',      value: processosNaoConsultados ? 'N/C' : String(ativosN),   border: ativosN > 0 ? DS.colors.warn : DS.colors.border,   valColor: ativosN > 0 ? DS.colors.warn : DS.colors.textPrimary },
        { label: 'Valor Estimado',    value: processosNaoConsultados ? 'N/C' : (data.processos?.valorTotalEstimado || '—'), border: DS.colors.border, valColor: DS.colors.textPrimary },
      ],
      [
        { label: 'Rec. Judicial',     value: processosNaoConsultados ? 'N/C' : (temRJN ? 'SIM' : 'Nao'), border: temRJN ? DS.colors.danger : DS.colors.success, valColor: temRJN ? DS.colors.danger : DS.colors.success },
        { label: 'Dividas Qtd',       value: processosNaoConsultados ? 'N/C' : String(dividasQN),  border: dividasQN > 0 ? DS.colors.danger : DS.colors.border, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: 'Dividas R$',        value: processosNaoConsultados ? 'N/C' : (dividasQN > 0 ? `R$ ${fmtMoney(data.processos?.dividasValor)}` : '—'), border: dividasQN > 0 ? DS.colors.danger : DS.colors.border, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textLight },
      ],
    ];
    kpiRowsQ.forEach((row, ri) => {
      row.forEach((k, ci) => {
        dsMetricCard(margin + ci * (kpiWQ + kpiGapQ), y + ri * (kpiHQ + kpiGapQ), kpiWQ, kpiHQ, k.label, k.value, undefined, k.border, k.valColor);
      });
    });
    y += kpiHQ * 2 + kpiGapQ * 2 + 4;
  }

  if (processosNaoConsultados) {
    drawSpacer(4);
    drawBannerNaoConsultado("Processos judiciais");
  } else if (data.processos?.temRJ) {
    drawAlertBox("RECUPERACAO JUDICIAL identificada", "ALTA");
  }

  const proc = data.processos;
  const distribuicao = proc?.distribuicao || [];
  const bancarios = proc?.bancarios || [];
  const fiscais = proc?.fiscais || [];
  const fornecedores = proc?.fornecedores || [];
  const outrosProc = proc?.outros || [];

  const semDados = !proc
    || (parseInt(proc.passivosTotal || "0") === 0
      && parseInt(proc.ativosTotal || "0") === 0
      && distribuicao.length === 0
      && bancarios.length === 0
      && fiscais.length === 0
      && fornecedores.length === 0
      && outrosProc.length === 0
      && (proc.top10Valor?.length ?? 0) === 0
      && (proc.top10Recentes?.length ?? 0) === 0);

  if (!processosNaoConsultados && semDados) {
    drawSpacer(4);
    checkPageBreak(12);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Nenhum processo judicial identificado", margin + 8, y + 6.5);
    y += 14;
  } else if (!processosNaoConsultados) {
    // Helper: label de seção de processos
    const drawProcLabel = (title: string) => {
      drawSpacer(4);
      checkPageBreak(14);
      y = dsMiniHeader(y, title);
    };

    // Status color helper
    const statusColor = (s: string): [number, number, number] =>
      /arquivado/i.test(s) ? [22, 163, 74] : colors.warning;

    type ProcCell = { text: string; color?: [number, number, number]; bold?: boolean; align?: "left" | "right" };

    // Helper unificado: drawProcAutoTable substitui drawProcTableHeader + drawProcRow
    const drawProcAutoTable = (headers: string[], cellRows: ProcCell[][], colWidths: number[]) => {
      autoT(
        headers,
        cellRows.map(row => row.map(cell => ({
          content: cell.text,
          styles: {
            ...(cell.color ? { textColor: cell.color } : {}),
            ...(cell.bold ? { fontStyle: "bold" } : {}),
            ...(cell.align === "right" ? { halign: "right" } : {}),
          } as Record<string, unknown>,
        }))),
        colWidths,
        { fontSize: 6.5, headFontSize: 5.5 },
      );
    };

    // ── BLOCO 2 — Distribuição por Tipo ──
    if (distribuicao.length > 0) {
      drawProcLabel("DISTRIBUICAO POR TIPO");
      const distCW = [contentW * 0.55, contentW * 0.20, contentW * 0.25];
      const totalQtd = distribuicao.reduce((s, d) => s + (parseInt(d.qtd || "0") || 0), 0);
      drawProcAutoTable(
        ["TIPO", "QTD", "%"],
        [
          ...distribuicao.map(d => {
            const qtdN = parseInt(d.qtd || "0") || 0;
            const isHigh = qtdN > 10;
            return [
              { text: d.tipo || "—", color: isHigh ? colors.danger : colors.text, bold: isHigh },
              { text: String(qtdN), color: isHigh ? colors.danger : colors.text, bold: isHigh },
              { text: d.pct ? `${d.pct}%` : "—" },
            ] as ProcCell[];
          }),
          [
            { text: "TOTAL", bold: true },
            { text: String(totalQtd), bold: true },
            { text: "100%", bold: true },
          ] as ProcCell[],
        ],
        distCW,
      );
    }

    // ── BLOCO 3 — Processos Bancários ──
    if (bancarios.length > 0) {
      drawProcLabel(`PROCESSOS BANCARIOS (${bancarios.length})`);
      drawProcAutoTable(
        ["BANCO", "ASSUNTO", "VALOR", "STATUS", "DATA"],
        bancarios.map(b => [
          { text: b.banco || "—" },
          { text: b.assunto || "—" },
          { text: b.valor || "—" },
          { text: b.status || "—", color: statusColor(b.status || "") },
          { text: b.data || "—" },
        ]),
        [0.22, 0.28, 0.18, 0.18, 0.14].map(r => contentW * r),
      );
    }

    // ── BLOCO 4 — Processos Fiscais ──
    if (fiscais.length > 0) {
      const fiscalQtdDist = distribuicao.find(d => /fiscal/i.test(d.tipo || ""))?.qtd || String(fiscais.length);
      const fiscaisShow = fiscais.slice(0, 3);
      drawProcLabel(`TOP ${fiscaisShow.length} FISCAIS (de ${fiscalQtdDist} total)`);
      drawProcAutoTable(
        ["CONTRAPARTE", "VALOR", "STATUS", "DATA"],
        fiscaisShow.map(f => [
          { text: f.contraparte || "—" },
          { text: f.valor || "—" },
          { text: f.status || "—", color: statusColor(f.status || "") },
          { text: f.data || "—" },
        ]),
        [0.38, 0.22, 0.20, 0.20].map(r => contentW * r),
      );
    }

    // ── BLOCO 5 — Processos Fornecedores ──
    if (fornecedores.length > 0) {
      drawProcLabel(`PROCESSOS FORNECEDORES (${fornecedores.length})`);
      drawProcAutoTable(
        ["CONTRAPARTE", "ASSUNTO", "VALOR", "STATUS", "DATA"],
        fornecedores.map(f => [
          { text: f.contraparte || "—" },
          { text: f.assunto || "—" },
          { text: f.valor || "—" },
          { text: f.status || "—", color: statusColor(f.status || "") },
          { text: f.data || "—" },
        ]),
        [0.28, 0.24, 0.16, 0.18, 0.14].map(r => contentW * r),
      );
    }

    // ── BLOCO 6 — Top 5 Outros ──
    if (outrosProc.length > 0) {
      drawProcLabel("TOP 5 OUTROS");
      drawProcAutoTable(
        ["CONTRAPARTE", "ASSUNTO", "VALOR", "STATUS", "DATA"],
        outrosProc.slice(0, 5).map(o => [
          { text: o.contraparte || "—" },
          { text: o.assunto || "—" },
          { text: o.valor || "—" },
          { text: o.status || "—", color: statusColor(o.status || "") },
          { text: o.data || "—" },
        ]),
        [0.28, 0.24, 0.16, 0.18, 0.14].map(r => contentW * r),
      );
    }

    // ── BLOCO 7 — Distribuição Temporal ──
    if ((proc?.distribuicaoTemporal?.length ?? 0) > 0) {
      drawProcLabel("DISTRIBUIÇÃO TEMPORAL");
      drawProcAutoTable(
        ["PERÍODO", "QTD", "VALOR ESTIMADO"],
        proc!.distribuicaoTemporal!.map(dt => [
          { text: dt.periodo },
          { text: dt.qtd, align: "right" as const },
          { text: `R$ ${fmtMoney(dt.valor)}`, align: "right" as const },
        ]),
        [0.40, 0.25, 0.35].map(r => contentW * r),
      );
    }

    // Verifica se detalhes de processos são reais ou apenas placeholders sem valor/data/partes
    const procSemDetalhesReais = (proc?.top10Valor ?? []).every(p => p.valorNum === 0 && !p.data && !p.partes && !p.assunto);

    // ── BLOCO 8 — Distribuição por Faixa de Valor (só mostra se há valores reais) ──
    const faixaTemValor = (proc?.distribuicaoPorFaixa ?? []).some(f => parseFloat((f.valor || "0").replace(/\./g, "").replace(",", ".")) > 0);
    if ((proc?.distribuicaoPorFaixa?.length ?? 0) > 0 && faixaTemValor) {
      drawProcLabel("DISTRIBUIÇÃO POR FAIXA DE VALOR");
      const totalFaixaQtd = proc!.distribuicaoPorFaixa!.reduce((s, f) => s + parseInt(f.qtd || "0"), 0);
      drawProcAutoTable(
        ["FAIXA", "QTD", "VALOR TOTAL", "%"],
        proc!.distribuicaoPorFaixa!.map(f => {
          const pctN = totalFaixaQtd > 0 ? fmtBR((parseInt(f.qtd) / totalFaixaQtd) * 100, 0) : "0";
          const isHigh = parseInt(f.qtd) > 0 && (f.faixa === "> R$1M" || f.faixa === "R$200k-1M");
          return [
            { text: f.faixa, color: isHigh ? colors.danger : colors.text, bold: isHigh },
            { text: f.qtd, align: "right" as const, color: isHigh ? colors.danger : colors.text },
            { text: `R$ ${fmtMoney(f.valor)}`, align: "right" as const },
            { text: `${pctN}%`, align: "right" as const, color: colors.textMuted },
          ] as ProcCell[];
        }),
        [0.35, 0.18, 0.32, 0.15].map(r => contentW * r),
      );
    }

    // ── BLOCO 9 — Top 10 mais Recentes ──
    if ((proc?.top10Recentes?.length ?? 0) > 0 && !procSemDetalhesReais) {
      drawProcLabel(`TOP ${proc!.top10Recentes!.length} MAIS RECENTES`);
      drawProcAutoTable(
        ["TIPO", "DISTRIB.", "ULT.MOVTO.", "ASSUNTO / PARTES", "VALOR", "STATUS", "FASE / UF"],
        proc!.top10Recentes!.map(p => {
          const descTxt = [p.assunto, p.partes].filter(Boolean).join(" · ");
          const faseTxt = [p.fase, p.uf].filter(Boolean).join(" · ") || "—";
          return [
            { text: p.tipo || "—" },
            { text: p.data || "—" },
            { text: p.dataUltimoAndamento || "—" },
            { text: descTxt || "—" },
            { text: `R$ ${fmtMoney(p.valor)}`, align: "right" as const },
            { text: p.status || "—", color: statusColor(p.status) },
            { text: faseTxt },
          ] as ProcCell[];
        }),
        [0.10, 0.10, 0.10, 0.28, 0.13, 0.14, 0.15].map(r => contentW * r),
      );
    }

    // ── BLOCO 10 — Top 10 por Valor ──
    if ((proc?.top10Valor?.length ?? 0) > 0 && !procSemDetalhesReais) {
      drawProcLabel(`TOP ${proc!.top10Valor!.length} POR VALOR`);
      drawProcAutoTable(
        ["TIPO", "POLO ATIVO", "POLO PASSIVO", "ASSUNTO / Nº", "VALOR", "STATUS", "UF/COMARCA"],
        proc!.top10Valor!.map(p => {
          const assuntoTxt = p.numero ? `${p.assunto || "—"} · ${p.numero}` : (p.assunto || "—");
          const localTxt = [p.uf, p.comarca].filter(Boolean).join(" · ") || p.tribunal || "—";
          const vencido = /venc|inadimp|atraso/i.test(p.status);
          return [
            { text: p.tipo || "—" },
            { text: p.partes || "—" },
            { text: p.polo_passivo || "—" },
            { text: assuntoTxt },
            { text: `R$ ${fmtMoney(p.valor)}`, align: "right" as const, color: vencido ? colors.danger : colors.text, bold: vencido },
            { text: p.status || "—", color: statusColor(p.status) },
            { text: localTxt },
          ] as ProcCell[];
        }),
        [0.11, 0.16, 0.16, 0.20, 0.13, 0.12, 0.12].map(r => contentW * r),
      );
    }

    // ── Aviso quando há processos mas sem detalhes disponíveis (inclui caso de dados parciais) ──
    if (parseInt(proc?.passivosTotal || "0") > 0 && procSemDetalhesReais) {
      drawSpacer(4);
      checkPageBreak(14);
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(margin, y, contentW, 12, 1, 1, "F");
      doc.setFillColor(...colors.warning);
      doc.roundedRect(margin, y, 3, 12, 0.5, 0.5, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.warning);
      doc.text(`${proc?.passivosTotal} processo(s) identificado(s) — valores e partes nao disponiveis no plano atual`, margin + 8, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text("O Credit Hub retornou apenas a contagem e UF dos processos. Solicitar relatorio detalhado ou consultar diretamente.", margin + 8, y + 9.5);
      y += 16;
    } else if (parseInt(proc?.passivosTotal || "0") > 0
        && (proc?.top10Valor?.length ?? 0) === 0
        && (proc?.top10Recentes?.length ?? 0) === 0
        && distribuicao.length === 0) {
      drawSpacer(4);
      checkPageBreak(14);
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(margin, y, contentW, 12, 1, 1, "F");
      doc.setFillColor(...colors.warning);
      doc.roundedRect(margin, y, 3, 12, 0.5, 0.5, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.warning);
      doc.text(`${proc?.passivosTotal} processo(s) identificado(s) — detalhamento nao disponivel`, margin + 8, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text("Consultar diretamente nos tribunais competentes.", margin + 8, y + 9.5);
      y += 16;
    }
  }

  // ===== SEÇÃO CCF — CHEQUES SEM FUNDO =====
  {
    const ccf = data.ccf;
    const ccfConsultado = !!ccf;
    drawSpacer(10);
    checkPageBreak(40);
    dsSectionHeader("07", "CCF — CHEQUES SEM FUNDO");

    if (!ccfConsultado) {
      drawSpacer(4);
      drawBannerNaoConsultado("CCF (Cheques sem Fundo)");
    } else {
      const temCCF = ccf.qtdRegistros > 0 || ccf.bancos.length > 0;
      drawFieldRow([
        { label: "Ocorrências (Total)", value: String(ccf.qtdRegistros) },
        { label: "Bancos com Registro", value: String(ccf.bancos.length) },
        { label: "Situação", value: temCCF ? "POSSUI REGISTROS" : "Sem ocorrências" },
        { label: "", value: "" },
      ]);
      if (temCCF) {
        drawAlertBox(`[ALTA] CCF: ${ccf.qtdRegistros} ocorrência(s) de Cheque sem Fundo — indicativo grave de inadimplência bancária`, "ALTA");
        if (ccf.tendenciaLabel === "crescimento" && (ccf.tendenciaVariacao ?? 0) > 10) {
          drawAlertBox(`[ALTA] Tendência CCF: crescimento de ${ccf.tendenciaVariacao}% nas ocorrências — deterioração bancária em curso`, "ALTA");
        }
      }

      if (temCCF && ccf.bancos.length > 0) {
        drawSpacer(4);
        checkPageBreak(14);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.textMuted);
        doc.text("OCORRÊNCIAS POR BANCO", margin, y + 4);
        y += 7;

        const temMotivo = ccf.bancos.some(b => b.motivo);
        autoT(
          temMotivo ? ["BANCO / INSTITUIÇÃO", "QTD", "ÚLTIMA OCORR.", "MOTIVO"] : ["BANCO / INSTITUIÇÃO", "QTD", "ÚLTIMA OCORRÊNCIA"],
          ccf.bancos.map(b => temMotivo
            ? [
                { content: b.banco, styles: { textColor: colors.danger } },
                String(b.quantidade),
                { content: b.dataUltimo || "—", styles: { textColor: colors.textMuted } },
                b.motivo || "—",
              ]
            : [
                { content: b.banco, styles: { textColor: colors.danger } },
                String(b.quantidade),
                { content: b.dataUltimo || "—", styles: { textColor: colors.textMuted } },
              ]
          ),
          temMotivo
            ? [0.32, 0.10, 0.18, 0.40].map(r => contentW * r)
            : [0.50, 0.20, 0.30].map(r => contentW * r),
          { fontSize: 6.5 },
        );
      } else if (!temCCF) {
        drawSpacer(4);
        checkPageBreak(12);
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFillColor(22, 163, 74);
        doc.roundedRect(margin, y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text("Nenhuma ocorrência de Cheque sem Fundo identificada", margin + 8, y + 6.5);
        y += 14;
      }
    }
  }

  // ===== SEÇÃO HISTÓRICO DE CONSULTAS =====
  {
    const hist = data.historicoConsultas;
    if (hist && hist.length > 0) {
      drawSpacer(10);
      checkPageBreak(40);
      dsSectionHeader("08", "HISTORICO DE CONSULTAS AO MERCADO");

      drawSpacer(4);
      checkPageBreak(8 + Math.min(hist.length, 15) * 6 + 4);

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(`${hist.length} consulta(s) registrada(s) — mostrando as mais recentes`, margin, y + 4);
      y += 7;

      autoT(
        ["INSTITUIÇÃO / USUÁRIO", "DATA DA CONSULTA"],
        hist.slice(0, 15).map(h => [
          h.usuario,
          { content: h.ultimaConsulta ? new Date(h.ultimaConsulta).toLocaleDateString("pt-BR") : "—", styles: { textColor: colors.textMuted } },
        ]),
        [contentW * 0.70, contentW * 0.30],
        { fontSize: 6.5 },
      );
    }
  }

  // ── Seção IR dos Sócios (flui se couber) ──
  if (data.irSocios && data.irSocios.length > 0 && data.irSocios.some(s => s.nomeSocio || s.anoBase)) {
    drawSpacer(10);
    checkPageBreak(50);

    // Header da seção
    dsSectionHeader("12", "IR DOS SOCIOS");

    for (let idx = 0; idx < data.irSocios.length; idx++) {
      const ir = data.irSocios[idx];
      if (!ir.nomeSocio && !ir.anoBase) continue;

      // Garantir espaço antes de cada sócio
      checkPageBreak(60);

      // Separador entre sócios
      if (idx > 0) {
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + contentW, y);
        y += 6;
      }

      // Header do sócio
      doc.setFillColor(240, 246, 255);
      doc.rect(margin, y, contentW, 8, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text(
        `Sócio ${idx + 1} — ${ir.nomeSocio || "Nome não informado"}`,
        margin + 3,
        y + 5.2
      );
      // CPF e ano base no lado direito
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      const cpfAno = [ir.cpf && `CPF: ${ir.cpf}`, ir.anoBase && `Ano-base: ${ir.anoBase}`]
        .filter(Boolean).join("   |   ");
      if (cpfAno) {
        doc.text(cpfAno, margin + contentW - 3, y + 5.2, { align: "right" });
      }
      y += 10;

      // Tipo do documento
      const tipoLabel = ir.tipoDocumento === "declaracao" ? "Declaração Completa" : "Recibo de Entrega";
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text(`Documento: ${tipoLabel}`, margin + 3, y);
      y += 6;

      // Alertas de malhas e débitos — com word-wrap limitado ao contentWidth
      if (ir.situacaoMalhas || ir.debitosEmAberto) {
        const alertaItens = [
          ir.situacaoMalhas && "Pendência de malhas fiscais",
          ir.debitosEmAberto && `Débitos em aberto: ${ir.descricaoDebitos || "Sim"}`
        ].filter(Boolean) as string[];
        const alertaTexto = `! ${alertaItens.join("  |  ")}`;
        // Limitar largura ao contentW para evitar overflow horizontal
        const alertaMaxW = contentW - 10; // margem interna
        const alertaLines = doc.splitTextToSize(alertaTexto, alertaMaxW);
        const alertaH = Math.max(8, alertaLines.length * 5 + 6);
        checkPageBreak(alertaH + 2);
        doc.setFillColor(254, 242, 242);
        doc.rect(margin, y, contentW, alertaH, "F");
        doc.setFillColor(220, 38, 38);
        doc.rect(margin, y, 2.5, alertaH, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        alertaLines.forEach((l: string, i: number) => {
          doc.text(l, margin + 5, y + 5 + i * 5);
        });
        y += alertaH + 2;
      }

      // Tabela de dados patrimoniais
      const linhasIR = [
        { label: "Renda Total", valor: `R$ ${fmtMoney(ir.rendimentoTotal || "0,00")}` },
        { label: "Rendimentos Tributáveis", valor: `R$ ${fmtMoney(ir.rendimentosTributaveis || "0,00")}`, bold: true },
        { label: "Rendimentos Isentos", valor: `R$ ${fmtMoney(ir.rendimentosIsentos || "0,00")}` },
        { label: "Imposto Definido", valor: `R$ ${fmtMoney((ir as unknown as Record<string,string>).impostoDefinido || "0,00")}`, bold: true },
        { label: "Valor da Quota", valor: `R$ ${fmtMoney((ir as unknown as Record<string,string>).valorQuota || "0,00")}` },
        { label: "Total Bens e Direitos", valor: `R$ ${fmtMoney(ir.totalBensDireitos || "0,00")}`, bold: true },
        { label: "Dívidas e Ônus", valor: `R$ ${fmtMoney(ir.dividasOnus || "0,00")}` },
        { label: "Patrimônio Líquido", valor: `R$ ${fmtMoney(ir.patrimonioLiquido || "0,00")}`, bold: true },
      ];

      linhasIR.forEach((linha, i) => {
        const bg: [number, number, number] = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", (linha as { label: string; valor: string; bold?: boolean }).bold ? "bold" : "normal");
        doc.setTextColor(...colors.text);
        doc.text(linha.label, margin + 3, y + 4.2);
        doc.text(linha.valor, margin + contentW - 3, y + 4.2, { align: "right" });
        y += 6;
      });

      y += 4;

      // Participação em outras sociedades
      if (ir.temSociedades && ir.sociedades && ir.sociedades.length > 0) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.primary);
        doc.text("Participação em outras sociedades:", margin + 3, y);
        y += 5;
        ir.sociedades.forEach((soc: { razaoSocial?: string; cnpj?: string; participacao?: string }) => {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.setFontSize(6.5);
          doc.text(
            `• ${soc.razaoSocial || "N/D"}${soc.cnpj ? ` — CNPJ: ${soc.cnpj}` : ""}${soc.participacao ? ` (${soc.participacao})` : ""}`,
            margin + 5,
            y
          );
          y += 4.5;
        });
        y += 3;
      }

      // Indicador de coerência
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      if (ir.coerenciaComEmpresa) {
        doc.setTextColor(22, 163, 74);
        doc.text("✓ Renda compatível com o porte da empresa", margin + 3, y);
      } else {
        doc.setTextColor(220, 38, 38);
        doc.text("⚠ Renda incompatível com o porte da empresa", margin + 3, y);
      }
      y += 6;

      // Observações
      if (ir.observacoes) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.5);
        doc.setTextColor(...colors.textMuted);
        const obsLines = doc.splitTextToSize(ir.observacoes, contentW - 6);
        obsLines.forEach((l: string) => {
          doc.text(l, margin + 3, y);
          y += 4;
        });
        y += 2;
      }
    }

    // Alertas determinísticos — IR Sócios
    if (alertasIR.length > 0) { drawSpacer(4); drawDetAlerts(alertasIR); }

    y += 6;
  }

  // ── Seção Relatório de Visita (flui se couber) ──
  if (data.relatorioVisita && (
    data.relatorioVisita.dataVisita ||
    data.relatorioVisita.responsavelVisita ||
    data.relatorioVisita.descricaoEstrutura ||
    data.relatorioVisita.observacoesLivres ||
    data.relatorioVisita.pontosPositivos?.length > 0 ||
    data.relatorioVisita.pontosAtencao?.length > 0
  )) {
    drawSpacer(10);
    checkPageBreak(55);

    dsSectionHeader("13", "RELATORIO DE VISITA");

    // Cabeçalho da visita
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    doc.text(`Data: ${data.relatorioVisita.dataVisita || "—"}   |   Responsavel: ${data.relatorioVisita.responsavelVisita || "—"}   |   Duracao: ${data.relatorioVisita.duracaoVisita || "—"}`, margin + 2, y);
    y += 6;
    doc.text(`Local: ${data.relatorioVisita.localVisita || "—"}`, margin + 2, y);
    y += 8;

    // Checklist
    const checklist = [
      { label: "Estrutura fisica confirmada no endereco", ok: data.relatorioVisita.estruturaFisicaConfirmada },
      { label: "Operacao compativel com faturamento declarado", ok: data.relatorioVisita.operacaoCompativelFaturamento },
      { label: "Estoque visivel no local", ok: data.relatorioVisita.estoqueVisivel },
      { label: "Maquinas e equipamentos observados", ok: data.relatorioVisita.maquinasEquipamentos },
      { label: "Socios presentes durante a visita", ok: data.relatorioVisita.presencaSocios },
    ];

    checklist.forEach((item, i) => {
      const bg: [number, number, number] = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(...bg);
      doc.rect(margin, y, contentW, 6, "F");
      doc.setFontSize(7);
      const itemColor: [number, number, number] = item.ok ? [22, 163, 74] : [220, 38, 38];
      doc.setTextColor(...itemColor);
      doc.text(item.ok ? "+" : "x", margin + 3, y + 4.2);
      doc.setTextColor(...colors.text);
      doc.text(item.label, margin + 10, y + 4.2);
      y += 6;
    });

    y += 4;

    // Pontos positivos
    if (data.relatorioVisita.pontosPositivos?.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text("Pontos Positivos:", margin + 2, y);
      y += 5;
      data.relatorioVisita.pontosPositivos.forEach((p: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(22, 163, 74);
        doc.text(`+ ${p}`, margin + 4, y);
        y += 4.5;
      });
      y += 2;
    }

    // Pontos de atenção
    if (data.relatorioVisita.pontosAtencao?.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text("Pontos de Atencao:", margin + 2, y);
      y += 5;
      data.relatorioVisita.pontosAtencao.forEach((p: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(220, 38, 38);
        doc.text(`! ${p}`, margin + 4, y);
        y += 4.5;
      });
      y += 2;
    }

    // Recomendação
    y += 4;
    const recCor: [number, number, number] = data.relatorioVisita.recomendacaoVisitante === "aprovado" ? [22, 163, 74] :
      data.relatorioVisita.recomendacaoVisitante === "condicional" ? [234, 179, 8] : [220, 38, 38];
    doc.setFillColor(...recCor);
    doc.roundedRect(margin, y, contentW, 9, 1, 1, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const recTexto = data.relatorioVisita.recomendacaoVisitante === "aprovado" ? "Recomendação do visitante: Aprovado" :
      data.relatorioVisita.recomendacaoVisitante === "condicional" ? "Recomendação do visitante: Condicional" :
        "Recomendação do visitante: Reprovado";
    doc.text(recTexto, margin + 4, y + 6);
    y += 11;

    // Observações livres — espaçamento de 12pt entre bloco recomendação e texto
    if (data.relatorioVisita.observacoesLivres) {
      y += 12;
      checkPageBreak(16);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.textMuted);
      doc.text("Observações:", margin + 2, y);
      y += 6;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...colors.text);
      const obsLines = doc.splitTextToSize(data.relatorioVisita.observacoesLivres, contentW - 6);
      obsLines.forEach((l: string) => { checkPageBreak(5); doc.text(l, margin + 2, y); y += 4.5; });
      y += 4;
    }

    // ── Bloco: Parâmetros Operacionais ──
    const rv = data.relatorioVisita as unknown as Record<string, string | undefined>;
    const temParamsOp = [
      rv.taxaConvencional, rv.taxaComissaria, rv.limiteTotal, rv.limiteConvencional,
      rv.limiteComissaria, rv.limitePorSacado, rv.ticketMedio, rv.valorCobrancaBoleto,
      rv.prazoRecompraCedente, rv.prazoEnvioCartorio, rv.prazoMaximoOp, rv.cobrancaTAC,
      rv.tranche, rv.prazoTranche,
    ].some(v => v && v.trim() !== "");

    const temDadosEmpresa = [
      rv.folhaPagamento, rv.endividamentoBanco, rv.endividamentoFactoring,
      rv.vendasCheque, rv.vendasDuplicata, rv.vendasOutras,
      rv.prazoMedioFaturamento, rv.prazoMedioEntrega, rv.referenciasFornecedores,
    ].some(v => v && v.trim() !== "");

    const drawOpTable = (rows: [string, string][]) => {
      const colLW = 90;
      const colRW = contentW - colLW;
      rows.forEach(([label, value], i) => {
        checkPageBreak(6);
        const bg: [number,number,number] = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(label, margin + 3, y + 4);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(value || "—", margin + colLW, y + 4, { maxWidth: colRW - 4 });
        y += 6;
      });
      y += 3;
    };

    if (temParamsOp) {
      checkPageBreak(20);
      y += 6;
      y = dsMiniHeader(y, 'PARAMETROS OPERACIONAIS');
      drawOpTable([
        ["Taxa Convencional", rv.taxaConvencional || ""],
        ["Taxa Comissaria", rv.taxaComissaria || ""],
        ["Limite Total", rv.limiteTotal ? `R$ ${rv.limiteTotal}` : ""],
        ["Limite Convencional", rv.limiteConvencional ? `R$ ${rv.limiteConvencional}` : ""],
        ["Limite Comissaria", rv.limiteComissaria ? `R$ ${rv.limiteComissaria}` : ""],
        ["Limite por Sacado", rv.limitePorSacado ? `R$ ${rv.limitePorSacado}` : ""],
        ["Ticket Medio", rv.ticketMedio ? `R$ ${rv.ticketMedio}` : ""],
        ["Valor Cobranca de Boleto", rv.valorCobrancaBoleto ? `R$ ${rv.valorCobrancaBoleto}` : ""],
        ["Cond. Cobranca — Prazo de Recompra (Cedente)", rv.prazoRecompraCedente ? `${rv.prazoRecompraCedente} dias` : ""],
        ["Cond. Cobranca — Envio para Cartorio em", rv.prazoEnvioCartorio ? `${rv.prazoEnvioCartorio} dias` : ""],
        ["Prazo Maximo", rv.prazoMaximoOp ? `${rv.prazoMaximoOp} dias` : ""],
        ["Cobranca de TAC", rv.cobrancaTAC || ""],
        ["Tranche", rv.tranche ? `R$ ${rv.tranche}` : ""],
        ["Prazo em Tranche", rv.prazoTranche ? `${rv.prazoTranche} dias` : ""],
      ]);
    }

    if (temDadosEmpresa) {
      checkPageBreak(20);
      y += 2;
      y = dsMiniHeader(y, 'DADOS DA EMPRESA');
      drawOpTable([
        ["Numero de Funcionarios", String(data.relatorioVisita.funcionariosObservados || "")],
        ["Folha de Pagamento", rv.folhaPagamento ? `R$ ${rv.folhaPagamento}` : ""],
        ["Endividamento Banco", rv.endividamentoBanco || ""],
        ["Endividamento Factoring/FIDC", rv.endividamentoFactoring ? `R$ ${rv.endividamentoFactoring}` : ""],
        ["Vendas (Cheque)", rv.vendasCheque || ""],
        ["Vendas (Duplicata)", rv.vendasDuplicata || ""],
        ["Vendas (Outras)", rv.vendasOutras || ""],
        ["Prazo Medio de Faturamento", rv.prazoMedioFaturamento ? `${rv.prazoMedioFaturamento} dias` : ""],
        ["Prazo Medio de Entrega das Mercadorias", rv.prazoMedioEntrega ? `${rv.prazoMedioEntrega} dias` : ""],
        ["Referencias Comerciais / Fornecedores", rv.referenciasFornecedores || ""],
      ]);
    }
  }

  // ===== PAGE 8 — PARECER (sempre nova página) =====
  newPage();
  drawHeader();

  // Normaliza parecer (pode chegar como string ou objeto do Supabase)
  const normParecer = (raw: unknown): { resumoExecutivo?: string; pontosFortes?: string[]; pontosNegativosOuFracos?: string[] } => {
    if (typeof raw === 'string') return { resumoExecutivo: raw };
    if (raw && typeof raw === 'object') return raw as { resumoExecutivo?: string; pontosFortes?: string[] };
    return {};
  };
  const parecerNorm = normParecer(aiAnalysis?.parecer);
  const resumoFinal = resumoExecutivo || parecerNorm.resumoExecutivo || "";
  const pontosFortesFinal = pontosFortes.length > 0 ? pontosFortes : (parecerNorm.pontosFortes || []);
  const pontosFracosFinal = pontosFracos.length > 0 ? pontosFracos : (parecerNorm.pontosNegativosOuFracos || []);


  // Section header bar — Parecer Preliminar
  dsSectionHeader("08", "PARECER PRELIMINAR");

  // ── BLOCO 1 — Decisão + Rating + Resumo (Hero block) ──
  checkPageBreak(36);
  const decisionColors: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
    APROVADO: { bg: [240, 253, 244], text: [22, 163, 74] },
    APROVACAO_CONDICIONAL: { bg: [254, 249, 195], text: [161, 98, 7] },
    PENDENTE: { bg: [255, 247, 237], text: [194, 65, 12] },
    REPROVADO: { bg: [254, 242, 242], text: [220, 38, 38] },
  };
  const dc = decisionColors[decision] ?? decisionColors.PENDENTE;
  const heroH = 32;
  const heroY = y;

  // Hero card background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, heroY, contentW, heroH, 2, 2, "F");
  doc.setDrawColor(...DS.colors.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, heroY, contentW, heroH, 2, 2, "D");
  doc.setLineWidth(0.1);

  // Amber accent line at bottom of hero
  doc.setFillColor(...DS.colors.accent);
  doc.rect(margin, heroY + heroH - 1.5, contentW, 1.5, "F");

  // Left side — Score large
  const pareScoreC: [number,number,number] = finalRating >= 7.5 ? [22, 163, 74] : finalRating >= 6 ? [217, 119, 6] : [220, 38, 38];
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...pareScoreC);
  const pareScoreStr = String(finalRating);
  doc.text(pareScoreStr, margin + 5, heroY + 21);
  const pareScoreW = doc.getTextWidth(pareScoreStr);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textMuted);
  doc.text("/10", margin + 5 + pareScoreW + 1, heroY + 21);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textMuted);
  doc.text("SCORE DE RISCO", margin + 5, heroY + 27);
  // Progress bar under score
  const pBarX = margin + 5;
  const pBarY = heroY + 28.5;
  const pBarW = 55;
  const pBarH = 2;
  doc.setFillColor(...DS.colors.border);
  doc.roundedRect(pBarX, pBarY, pBarW, pBarH, 0.8, 0.8, "F");
  const pFillW = Math.min(pBarW, (finalRating / 10) * pBarW);
  if (pFillW > 0) {
    doc.setFillColor(...pareScoreC);
    doc.roundedRect(pBarX, pBarY, pFillW, pBarH, 0.8, 0.8, "F");
  }

  // Right side — Decision pill
  const bW2p = 95;
  const bH2p = 22;
  const bX2p = margin + contentW - bW2p - 4;
  const bY2p = heroY + (heroH - bH2p) / 2;
  doc.setFillColor(...dc.bg);
  doc.roundedRect(bX2p, bY2p, bW2p, bH2p, 3, 3, "F");
  doc.setDrawColor(...dc.text);
  doc.setLineWidth(0.5);
  doc.roundedRect(bX2p, bY2p, bW2p, bH2p, 3, 3, "D");
  doc.setLineWidth(0.1);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dc.text);
  doc.text(decision.replace(/_/g, " "), bX2p + bW2p / 2, bY2p + bH2p / 2 + 2, { align: "center" });
  // Subtitle under decision
  const decSubtitle = decision === "APROVADO" ? "Operação recomendada" :
    decision === "REPROVADO" ? "Operação não recomendada" : "Sujeito a condições";
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dc.text);
  doc.text(decSubtitle, bX2p + bW2p / 2, bY2p + bH2p / 2 + 6.5, { align: "center" });

  y = heroY + heroH + 6;

  if (resumoFinal) {
    checkPageBreak(14);
    // Label for resumo with accent line
    doc.setFillColor(...DS.colors.accent);
    doc.rect(margin, y, contentW, 0.8, "F");
    y += 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.accent);
    doc.text("RESUMO EXECUTIVO", margin, y + 5);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...colors.text);
    const rLines = doc.splitTextToSize(resumoFinal, contentW - 4) as string[];
    rLines.forEach((line: string) => { checkPageBreak(6.5); doc.text(line, margin + 2, y); y += 5.5; });
    y += 4;
  }

  // ── BLOCO 2 — Pontos Fortes e Pontos Fracos ──
  if (pontosFortesFinal.length > 0 || pontosFracosFinal.length > 0) {
    const renderBulletListDS = (
      title: string,
      items: string[],
      accentC: [number, number, number],
      bulletColor: [number, number, number],
    ) => {
      if (items.length === 0) return;
      checkPageBreak(14);
      // Thin accent line + label
      doc.setFillColor(...accentC);
      doc.rect(margin, y, contentW, 0.8, "F");
      y += 3;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...accentC);
      doc.text(title.toUpperCase(), margin, y + 5);
      y += 10;

      items.forEach((item: string) => {
        const lines = doc.splitTextToSize(item, contentW - 10) as string[];
        checkPageBreak(lines.length * 5 + 3);
        doc.setFillColor(255, 255, 255);
        const itemH = lines.length * 5 + 5;
        doc.rect(margin, y, contentW, itemH, "F");
        // Dash bullet
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...bulletColor);
        doc.text("—", margin + 2, y + 5);
        // Text
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...DS.colors.textPrimary);
        lines.forEach((line: string, li: number) => {
          doc.text(line, margin + 9, y + 5 + li * 5);
        });
        y += itemH + 2;
      });
      y += 4;
    };

    renderBulletListDS("Pontos Fortes", pontosFortesFinal, DS.colors.success, DS.colors.success);
    renderBulletListDS("Pontos Fracos / Riscos", pontosFracosFinal, DS.colors.danger, DS.colors.danger);
  }

  // ── BLOCO 3 — Tabela de Alertas ──
  const aiAlertas = aiAnalysis?.alertas ?? [];
  if (aiAlertas.length > 0) {
    checkPageBreak(16);
    y = dsMiniHeader(y, 'ALERTAS');

    // Tabela de alertas — autotable com overflow:linebreak (sem truncamento, word-wrap real)
    autoT(
      ["TIPO", "DESCRIÇÃO", "IMPACTO", "MITIGAÇÃO"],
      aiAlertas.map(a => {
        const sevStr = (a.severidade || "INFO").toUpperCase();
        const sevColor: [number,number,number] = sevStr === "ALTA" ? colors.danger : sevStr === "MODERADA" ? colors.warning : [37, 99, 235];
        return [
          { content: sevStr, styles: { textColor: sevColor, fontStyle: "bold" } },
          a.descricao || "—",
          { content: a.impacto || "—", styles: { textColor: colors.textMuted } },
          { content: a.mitigacao || "—", styles: { textColor: colors.primary } },
        ];
      }),
      [0.15, 0.30, 0.25, 0.30].map(r => contentW * r),
      { fontSize: 6.5, headFontSize: 5.5, minCellHeight: 8 },
    );
  }

  // ── BLOCO 4 — Perguntas para Visita ──
  if (perguntasVisita.length > 0) {
    checkPageBreak(14);
    y = dsMiniHeader(y, 'PERGUNTAS PARA A VISITA');

    perguntasVisita.forEach((q, i) => {
      const qLines = doc.splitTextToSize(`${i + 1}. ${q.pergunta}`, contentW - 4) as string[];
      const cLines = q.contexto ? doc.splitTextToSize("Contexto: " + q.contexto, contentW - 8) as string[] : [];
      const needed = qLines.length * 4 + cLines.length * 3.5 + 5;
      checkPageBreak(needed);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...colors.text);
      qLines.forEach((line: string) => { doc.text(line, margin + 2, y); y += 4; });
      if (cLines.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.textMuted);
        cLines.forEach((line: string) => { doc.text(line, margin + 4, y); y += 3.5; });
      }
      y += 3;
    });
    y += 2;
  }

  // ── BLOCO 5 — Parâmetros Operacionais ──
  const paramOp = aiAnalysis?.parametrosOperacionais;
  const hasParamOp = paramOp && Object.values(paramOp).some(v => v && v.trim() !== "");
  if (hasParamOp) {
    checkPageBreak(16);
    y = dsMiniHeader(y, 'PARAMETROS OPERACIONAIS ORIENTATIVOS');

    const paramCW = [contentW * 0.30, contentW * 0.35, contentW * 0.35];

    // Sub-header das colunas
    doc.setFillColor(50, 70, 110);
    doc.rect(margin, y, contentW, 5.5, 'F');
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("PARAMETRO", margin + 2, y + 4);
    doc.text("VALOR SUGERIDO", margin + paramCW[0] + 2, y + 4);
    doc.text("BASE DE CALCULO", margin + paramCW[0] + paramCW[1] + 2, y + 4);
    y += 5.5;

    const paramRows: Array<{ label: string; key: string; base: string }> = [
      { label: "Limite aproximado", key: "limiteAproximado", base: "FMM × fatores de score e risco" },
      { label: "Prazo maximo", key: "prazoMaximo", base: "Baseado no rating" },
      { label: "Concentracao/sacado", key: "concentracaoSacado", base: "Perfil de risco" },
      { label: "Garantias", key: "garantias", base: "Estrutura societaria" },
      { label: "Revisao", key: "revisao", base: "Alertas ativos" },
    ];

    paramRows.forEach((row, idx) => {
      const val = (paramOp as Record<string, string>)[row.key] || "—";
      checkPageBreak(7);
      doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
      doc.rect(margin, y, contentW, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...colors.text);
      doc.text(row.label, margin + 2, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.primary);
      doc.text(val, margin + paramCW[0] + 2, y + 4);
      doc.setTextColor(...colors.textMuted);
      doc.text(row.base, margin + paramCW[0] + paramCW[1] + 2, y + 4);
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, y + 6, margin + contentW, y + 6);
      y += 6;
    });

    // Footnote
    y += 3;
    checkPageBreak(8);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...colors.textMuted);
    doc.text("Parametros indicativos. Limite e condicoes formais definidos pelo Comite.", margin, y);
    y += 6;
  }

  // ── Observações do analista — dentro do bloco Parecer ──
  if (p.observacoes && p.observacoes.trim()) {
    const noteLines = doc.splitTextToSize(p.observacoes.trim(), contentW - 8) as string[];
    const titleH = 10;
    const lineH = 5;

    y += 4;
    checkPageBreak(titleH + 4 + lineH + 4);

    // Cabeçalho da subseção (inline, sem chamar drawSectionTitle para evitar double-checkPageBreak)
    doc.setFillColor(...colors.surface2);
    doc.roundedRect(margin, y, contentW, titleH, 1.5, 1.5, "F");
    doc.setFillColor(...colors.navy);
    doc.roundedRect(margin, y, 3, titleH, 0.5, 0.5, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.navy);
    doc.text("OBS", margin + 7, y + 6.5);
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.text);
    doc.text("OBSERVACOES DO ANALISTA", margin + 14, y + 6.5);
    y += titleH + 4;

    // Renderiza linha a linha com checkPageBreak por linha (suporte a múltiplas páginas)
    noteLines.forEach((line) => {
      checkPageBreak(lineH + 1);
      doc.setFillColor(...colors.surface);
      doc.rect(margin, y, contentW, lineH, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(margin, y, 2.5, lineH, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...colors.text);
      doc.text(line, margin + 6, y + lineH - 1.2);
      y += lineH;
    });
    y += 6;
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...colors.navy);
    doc.rect(0, 284, 210, 13, "F");
    doc.setFillColor(...colors.accent);
    doc.rect(0, 284, 210, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 240);
    doc.text(`Capital Financas — Consolidador | ${footerDateStr} | Confidencial`, margin, 291);
    doc.text(`Pagina ${p} de ${totalPages}`, W - margin, 291, { align: "right" });
  }

  const pdfBlob = doc.output("blob");
  return new Blob([pdfBlob], { type: "application/pdf" });
}
