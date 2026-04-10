import type { ExtractedData, AIAnalysis, FundValidationResult, CreditLimitResult } from "@/types";
import type { PdfCtx } from "./pdf-ctx";
import { renderParecer } from "./sections/pdf-parecer";

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
  fundValidation?: FundValidationResult;
  creditLimit?: CreditLimitResult;
}

// ─── Design System ───────────────────────────────────────────────────────────
const DS = {
  colors: {
    navy:       '#1E3A5F',
    navyLight:  '#2D5298',
    green:      '#16A34A',
    greenBg:    '#DCFCE7',
    red:        '#DC2626',
    redBg:      '#FEE2E2',
    orange:     '#D97706',
    orangeBg:   '#FEF3C7',
    purple:     '#7C3AED',
    purpleBg:   '#EDE9FE',
    gray:       '#6B7280',
    grayBg:     '#F1F5F9',
    grayLight:  '#F8FAFC',
    border:     '#E5E7EB',
    text:       '#111827',
    textLight:  '#6B7280',
    white:      '#FFFFFF',
    accent:     '#22C55E',
    // RGB para helpers legados que usam spread
    headerBg:   [30, 58, 95]    as [number,number,number],
    accentRGB:  [34, 197, 94]   as [number,number,number],
    pageBg:     [248, 250, 252] as [number,number,number],
    cardBg:     [255, 255, 255] as [number,number,number],
    zebraRow:   [249, 250, 251] as [number,number,number],
    borderRGB:  [229, 231, 235] as [number,number,number],
    borderStrong:[209, 213, 219] as [number,number,number],
    danger:     [220, 38, 38]   as [number,number,number],
    dangerBg:   [254, 226, 226] as [number,number,number],
    dangerText: [153, 27, 27]   as [number,number,number],
    warn:       [217, 119, 6]   as [number,number,number],
    warnBg:     [254, 243, 199] as [number,number,number],
    warnText:   [133, 77, 14]   as [number,number,number],
    info:       [37, 99, 235]   as [number,number,number],
    infoBg:     [219, 234, 254] as [number,number,number],
    infoText:   [29, 78, 216]   as [number,number,number],
    success:    [22, 163, 74]   as [number,number,number],
    successBg:  [220, 252, 231] as [number,number,number],
    successText:[22, 101, 52]   as [number,number,number],
    textPrimary:[17, 24, 39]    as [number,number,number],
    textMuted:  [107, 114, 128] as [number,number,number],
    textLight2: [156, 163, 175] as [number,number,number],
  },
  font: {
    xs:   7,
    sm:   8,
    base: 9,
    md:   10,
    lg:   12,
    xl:   14,
    xxl:  18,
    hero: 24,
  },
  space: {
    xs:  2,
    sm:  4,
    md:  8,
    lg:  12,
    xl:  16,
    xxl: 24,
  },
  radius: 3,
  lineH:  5.5,
} as const

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
    if (ir.debitosEmAberto) out.push({ nivel: 'alta', mensagem: `Sócio ${nome} — Débitos em aberto perante a Receita Federal / PGFN` });
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
  const faturamentoRealmenteZerado = (data.faturamento.meses || []).length === 0 || (data.faturamento.meses || []).every(m => parseMoneyToNumber(m.valor) === 0);

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
  const pos = { y: 0 };

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
    doc.setFillColor(245, 248, 252);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFillColor(...colors.navy);
    doc.rect(0, 0, 210, 1.5, "F");
    pos.y = 1.5;
  };

  const checkPageBreak = (needed: number) => {
    if (pos.y + needed > 275) { newPage(); drawHeader(); }
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

    pos.y = 42;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const drawSectionTitle = (num: string, title: string, color: [number, number, number]) => {
    checkPageBreak(16);
    doc.setFillColor(...colors.surface2);
    doc.roundedRect(margin, pos.y, contentW, 10, 1.5, 1.5, "F");
    doc.setFillColor(...color);
    doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(num, margin + 7, pos.y + 6.5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(title, margin + 14, pos.y + 6.5);
    pos.y += 14;
  };

  const drawField = (label: string, value: string, fullWidth = false) => {
    if (!value) return;
    const fieldW = fullWidth ? contentW : contentW / 2 - 2;
    const textMaxW = fieldW - 8;
    const lineH = 4.5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(value, textMaxW);
    const boxH = Math.max(12, 6 + lines.length * lineH + 3);
    checkPageBreak(boxH + 2);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, fieldW, boxH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(label.toUpperCase(), margin + 4, pos.y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => {
      doc.text(line, margin + 4, pos.y + 9 + i * lineH);
    });
    pos.y += boxH + 2;
  };

  const drawFieldRow = (fields: Array<{ label: string; value: string }>) => {
    const validFields = fields.filter((f) => f.value);
    if (validFields.length === 0) return;
    const fieldW = contentW / validFields.length - 2;
    const textMaxW = fieldW - 8;
    const lineH = 4.5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const allLines = validFields.map(f => doc.splitTextToSize(f.value, textMaxW) as string[]);
    const maxLineCount = Math.max(...allLines.map(l => l.length));
    const boxH = Math.max(12, 6 + maxLineCount * lineH + 3);
    checkPageBreak(boxH + 2);
    let x = margin;
    validFields.forEach((field, idx) => {
      doc.setFillColor(...colors.surface);
      doc.roundedRect(x, pos.y, fieldW, boxH, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(field.label.toUpperCase(), x + 4, pos.y + 4.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      allLines[idx].forEach((line: string, i: number) => {
        doc.text(line, x + 4, pos.y + 9 + i * lineH);
      });
      x += fieldW + 4;
    });
    pos.y += boxH + 2;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const drawMultilineField = (label: string, value: string, _maxLines?: number) => {
    if (!value) return;
    const lineH = 5;
    const paddingV = 6;
    const textMaxW = contentW - 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value, textMaxW) as string[];
    const boxH = lines.length * lineH + paddingV * 2 + 6;
    checkPageBreak(Math.min(boxH + 4, 60));
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, contentW, boxH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(label.toUpperCase(), margin + 4, pos.y + 5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => {
      doc.text(line, margin + 4, pos.y + paddingV + 5 + i * lineH);
    });
    pos.y += boxH + 4;
  };

  const drawSpacer = (h = 6) => { pos.y += h; };

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
      startY: pos.y,
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
    pos.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + gap;
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

  // Deduplicação global de alertas — evita repetir o mesmo alerta em seções diferentes
  const _alertasVistos = new Set<string>();

  // Helper: draw alert row — linha compacta com pill de severidade + texto com quebra automática
  const drawAlertBox = (text: string, severity: AlertSeverity, subtitle?: string) => {
    // Normaliza para deduplicar (ignora espaços e capitalização)
    const dedupKey = text.trim().toLowerCase().replace(/\s+/g, " ").substring(0, 120);
    if (_alertasVistos.has(dedupKey)) return;
    _alertasVistos.add(dedupKey);

    const accentC:  [number,number,number] = severity === "ALTA" ? [220,38,38]  : severity === "MODERADA" ? [217,119,6] : [37,99,235];
    const badgeBg:  [number,number,number] = severity === "ALTA" ? [255,241,241]: severity === "MODERADA" ? [255,251,235]: [239,246,255];
    const badgeTxt: [number,number,number] = severity === "ALTA" ? [185,28,28]  : severity === "MODERADA" ? [161,98,7]  : [29,78,216];
    const rowBg:    [number,number,number] = severity === "ALTA" ? [255,250,250]: severity === "MODERADA" ? [255,253,244]: [248,251,255];
    const badgeLabel = severity === "ALTA" ? "ALTA" : severity === "MODERADA" ? "MODERADO" : "INFO";

    // Pill width fixo por severidade para alinhamento consistente
    const pillW = severity === "MODERADA" ? 22 : 14;
    const textX = margin + 3 + pillW + 4;
    // Desconta todo o offset esquerdo + 6mm de margem segura à direita
    // Bold helvetica é ~8% mais largo que normal, por isso a margem extra
    const textAvailW = contentW - (textX - margin) - 6;

    // Quebra de texto automática — fonte definida ANTES do split
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    const mainLines: string[] = doc.splitTextToSize(text, textAvailW);

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    const subLines: string[] = subtitle ? doc.splitTextToSize(subtitle, textAvailW) : [];

    const lineH = 4.2;
    const rowH = Math.max(9, (mainLines.length + subLines.length) * lineH + 4);
    checkPageBreak(rowH + 1);

    // Fundo da linha
    doc.setFillColor(...rowBg);
    doc.rect(margin, pos.y, contentW, rowH, "F");

    // Borda esquerda colorida (3mm)
    doc.setFillColor(...accentC);
    doc.rect(margin, pos.y, 3, rowH, "F");

    // Pill de severidade
    doc.setFillColor(...badgeBg);
    doc.roundedRect(margin + 4, pos.y + (rowH - 5) / 2, pillW, 5, 1, 1, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...badgeTxt);
    doc.text(badgeLabel, margin + 4 + pillW / 2, pos.y + (rowH - 5) / 2 + 3.5, { align: "center" });

    // Texto principal
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    let ty = pos.y + 3 + lineH * 0.5;
    mainLines.forEach((l: string) => { doc.text(l, textX, ty); ty += lineH; });

    // Subtítulo
    if (subLines.length > 0) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      subLines.forEach((l: string) => { doc.text(l, textX, ty); ty += lineH; });
    }

    // Divisor inferior sutil
    doc.setDrawColor(235, 235, 240);
    doc.setLineWidth(0.2);
    doc.line(margin + 3, pos.y + rowH, margin + contentW, pos.y + rowH);

    pos.y += rowH;
  };

  // Helper: draw deterministic section alert — com deduplicação
  const drawDetAlerts = (alertas: AlertaDet[]) => {
    if (!alertas.length) return;
    alertas.forEach(al => {
      const sev: AlertSeverity = al.nivel === 'alta' ? 'ALTA' : al.nivel === 'media' ? 'MODERADA' : 'INFO';
      drawAlertBox(al.mensagem, sev);
    });
  };

  // ── Novos helpers DS* ─────────────────────────────────────────────────────

  const dsBadge = (
    text: string, x: number, y: number,
    type: 'success'|'danger'|'warning'|'info'|'neutral' = 'neutral'
  ): number => {
    const map = {
      success: { bg: DS.colors.greenBg,  txt: DS.colors.green  },
      danger:  { bg: DS.colors.redBg,    txt: DS.colors.red    },
      warning: { bg: DS.colors.orangeBg, txt: DS.colors.orange },
      info:    { bg: DS.colors.purpleBg, txt: DS.colors.purple },
      neutral: { bg: DS.colors.grayBg,   txt: DS.colors.gray   },
    };
    const c = map[type];
    doc.setFontSize(DS.font.xs);
    doc.setFont('helvetica', 'bold');
    const tw = doc.getTextWidth(text) + 8;
    const th = 5;
    doc.setFillColor(c.bg);
    doc.roundedRect(x, y - th + 1, tw, th, 2, 2, 'F');
    doc.setTextColor(c.txt);
    doc.text(text, x + 4, y);
    doc.setFont('helvetica', 'normal');
    return tw;
  };

  const dsDivider = (y: number, color?: string): number => {
    doc.setDrawColor(color ?? DS.colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentW, y);
    return y + 2;
  };

  const dsLabel = (text: string, x: number, y: number) => {
    doc.setFontSize(DS.font.xs);
    doc.setTextColor(DS.colors.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(text.toUpperCase(), x, y);
  };

  const dsValue = (
    text: string, x: number, y: number,
    opts?: { color?: string; size?: number; bold?: boolean }
  ) => {
    doc.setFontSize(opts?.size ?? DS.font.md);
    doc.setTextColor(opts?.color ?? DS.colors.text);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.text(text, x, y);
  };

  const dsRichText = (
    text: string, x: number, startY: number, maxW: number
  ): number => {
    doc.setFontSize(DS.font.sm);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(DS.colors.text);
    const allLines = doc.splitTextToSize(text, maxW) as string[];
    let cy = startY;
    const boldRe = /R\$\s[\d.,]+|patrimônio líquido negativo|vencidos|inadimplência|prejuízo|risco elevado|capital de giro negativo/gi;
    allLines.forEach((line: string) => {
      checkPageBreak(DS.lineH + 2);
      if (boldRe.test(line)) {
        boldRe.lastIndex = 0;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(DS.colors.navy);
      } else {
        boldRe.lastIndex = 0;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(DS.colors.text);
      }
      doc.text(line, x, cy);
      cy += DS.lineH;
    });
    return cy;
  };

  // Suprimir lint warnings de helpers declarados mas não usados em todos os caminhos
  void dsLabel; void dsValue; void dsDivider; void dsRichText; void dsBadge;

  // ── DS Helpers ──────────────────────────────────────────────────────────

  // Section header: editorial style — light blue-gray bg + green left border + navy pill + navy title
  const dsSectionHeader = (num: string, title: string) => {
    checkPageBreak(17);
    // Background: azul-cinza claro (mais elegante que navy sólido)
    doc.setFillColor(228, 238, 252);
    doc.rect(margin, pos.y, contentW, 12, "F");
    // Borda esquerda verde (3.5mm) — identidade visual mantida
    doc.setFillColor(...DS.colors.accentRGB);
    doc.rect(margin, pos.y, 3.5, 12, "F");
    // Badge número — pílula navy
    doc.setFillColor(...DS.colors.headerBg);
    doc.roundedRect(margin + 6, pos.y + 2.5, 16, 7, 1.5, 1.5, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(num, margin + 14, pos.y + 7.6, { align: "center" });
    // Título — navy bold
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.headerBg);
    doc.text(title, margin + 26, pos.y + 8.2);
    // Linha inferior sutil
    doc.setDrawColor(190, 210, 240);
    doc.setLineWidth(0.4);
    doc.line(margin, pos.y + 12, margin + contentW, pos.y + 12);
    doc.setLineWidth(0.1);
    pos.y += 16;
  };

  // Left-border card: draws card box, returns nothing (caller manages pos.y)
  const dsCard = (cx: number, cy: number, cw: number, ch: number, borderColor: [number,number,number]) => {
    doc.setFillColor(...DS.colors.cardBg);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, "F");
    doc.setDrawColor(...DS.colors.borderRGB);
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
        doc.setTextColor(...DS.colors.textLight2);
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
    doc.setDrawColor(...DS.colors.borderRGB);
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
    doc.setDrawColor(...DS.colors.borderRGB);
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
      doc.setTextColor(...DS.colors.textLight2);
      doc.text(sub, cx + 5, cy + 17);
    }
  };

  // miniHeader: faixa #1a2e4a com título branco — retorna nova posição pos.y
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
    const descText = `${secao}: consulta não realizada nesta análise — dado não disponível no momento da geração do relatório.`;
    const descLines = doc.splitTextToSize(descText, textW);
    const bannerH = padV + 8 + descLines.length * 4 + padV; // padTop + título + linhas desc + padBottom
    checkPageBreak(bannerH + 4);
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(margin, pos.y, contentW, bannerH, 1.5, 1.5, 'F');
    doc.setFillColor(...colors.warning);
    doc.roundedRect(margin, pos.y, 3, bannerH, 0.5, 0.5, 'F');
    // Título — fonte normal, sentence case
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.warning);
    doc.text('Consulta não realizada', margin + padH, pos.y + padV);
    // Texto descritivo — fonte normal, sem uppercase
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 80, 0);
    descLines.forEach((l: string, i: number) => {
      doc.text(l, margin + padH, pos.y + padV + 7 + i * 4);
    });
    pos.y += bannerH + 4;
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

  // ===== PAGE 2 — CHECKLIST DOCUMENTAL =====
  {
    newPage();
    drawHeader();

    // ── IDX Section Header (custom) ──────────────────────────────────────────
    const idxHdrH = 12;
    doc.setFillColor(30, 58, 95); // #1E3A5F
    doc.rect(margin, pos.y, contentW, idxHdrH, "F");

    // Badge "IDX" — #F59E0B, border-radius 4px, padding 3×8
    const idxBadgeW = 14;
    const idxBadgeH = 6;
    const idxBadgeX = margin + 4;
    const idxBadgeY = pos.y + (idxHdrH - idxBadgeH) / 2;
    doc.setFillColor(245, 158, 11); // #F59E0B
    doc.roundedRect(idxBadgeX, idxBadgeY, idxBadgeW, idxBadgeH, 1, 1, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("IDX", idxBadgeX + idxBadgeW / 2, idxBadgeY + 4.1, { align: "center" });

    // Title: 13px bold white
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(
      "INDICE DOCUMENTAL \u2014 DOCUMENTOS ANALISADOS",
      idxBadgeX + idxBadgeW + 4,
      pos.y + idxHdrH / 2 + 2
    );

    // Linha laranja abaixo do header: 2px = 0.7mm
    doc.setFillColor(245, 158, 11); // #F59E0B
    doc.rect(margin, pos.y + idxHdrH, contentW, 0.7, "F");
    pos.y += idxHdrH + 0.7;

    // Subtítulo empresa + CNPJ: 9px, #94A3B8, centralizado, padding-top 6px
    const clEmpresa = [
      data.cnpj?.razaoSocial?.substring(0, 45),
      data.cnpj?.cnpj ? "CNPJ: " + data.cnpj.cnpj : "",
    ].filter(Boolean).join("   |   ");
    if (clEmpresa) {
      pos.y += 2.5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184); // #94A3B8
      doc.text(clEmpresa, W / 2, pos.y, { align: "center" });
      pos.y += 5.5;
    } else {
      pos.y += 3;
    }

    // ── Status detection ─────────────────────────────────────────────────────
    const clStatus: Record<string, boolean> = {
      cnpj:            !!data.cnpj?.cnpj,
      qsa:             (data.qsa?.quadroSocietario?.length ?? 0) > 0,
      contrato:        !!data.contrato?.dataConstituicao,
      faturamento:     (data.faturamento?.meses?.length ?? 0) > 0,
      dre:             !!data.dre,
      balanco:         !!data.balanco,
      curvaABC:        !!data.curvaABC,
      irSocios:        (data.irSocios?.length ?? 0) > 0,
      relatorioVisita: !!data.relatorioVisita,
      scr:             !!data.scr?.periodoReferencia,
      scrAnterior:     !!data.scrAnterior,
      protestos:       !protestosNaoConsultados,
      processos:       !processosNaoConsultados,
      grupoEconomico:  (data.grupoEconomico?.empresas?.length ?? 0) > 0,
      scrSocios:       (data.scrSocios?.length ?? 0) > 0,
      score:           !!data.score,
    };

    type ClItem = { key: string; label: string; obrigatorio: boolean };

    const clFrente1: ClItem[] = [
      { key: "cnpj",            label: "Cartao CNPJ",             obrigatorio: true  },
      { key: "qsa",             label: "QSA / Quadro de Socios",  obrigatorio: true  },
      { key: "contrato",        label: "Contrato Social",          obrigatorio: true  },
      { key: "faturamento",     label: "Faturamento",              obrigatorio: true  },
      { key: "dre",             label: "DRE",                      obrigatorio: false },
      { key: "balanco",         label: "Balanco Patrimonial",      obrigatorio: false },
      { key: "curvaABC",        label: "Curva ABC - Top Clientes", obrigatorio: false },
      { key: "irSocios",        label: "IR dos Socios",            obrigatorio: false },
      { key: "relatorioVisita", label: "Relatorio de Visita",      obrigatorio: false },
    ];

    const clFrente2: ClItem[] = [
      { key: "scr",            label: "SCR / BACEN",          obrigatorio: true  },
      { key: "scrAnterior",    label: "SCR Periodo Anterior",  obrigatorio: false },
      { key: "protestos",      label: "Protestos",             obrigatorio: true  },
      { key: "processos",      label: "Processos Judiciais",   obrigatorio: true  },
      { key: "grupoEconomico", label: "Grupo Economico",       obrigatorio: false },
      { key: "scrSocios",      label: "SCR dos Socios",        obrigatorio: false },
      { key: "score",          label: "Score Bureau",          obrigatorio: false },
    ];

    // Layout: 48% / 4% gap / 48%
    const clGap  = contentW * 0.04;
    const clColW = contentW * 0.48;
    const clRowH = 7;
    const clHdrH = 14;

    const clDrawCol = (
      frente: string,
      subtitle: string,
      borderColor: [number, number, number],
      items: ClItem[],
      cx: number,
      startY: number
    ): number => {
      // Header: gradient simulation #1E3A5F → #2D5298
      const gradSteps = 6;
      const stepW = clColW / gradSteps;
      for (let s = 0; s < gradSteps; s++) {
        const t = s / (gradSteps - 1);
        const r = Math.round(30  + t * (45  - 30));
        const g = Math.round(58  + t * (82  - 58));
        const b = Math.round(95  + t * (152 - 95));
        doc.setFillColor(r, g, b);
        doc.rect(cx + s * stepW, startY, stepW + 0.4, clHdrH, "F");
      }

      // Borda esquerda 3px ≈ 1.1mm
      doc.setFillColor(...borderColor);
      doc.rect(cx, startY, 1.1, clHdrH, "F");

      // "FRENTE 1" / "FRENTE 2": 11pt bold, branco
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(frente, cx + 5.5, startY + 6.2);

      // Subtítulo descritivo: 7pt, rgba(255,255,255,0.65)
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 200, 235);
      doc.text(subtitle, cx + 5.5, startY + 11.5);

      // Linha colorida abaixo do header: 0.7mm
      doc.setFillColor(...borderColor);
      doc.rect(cx, startY + clHdrH, clColW, 0.7, "F");

      let iy = startY + clHdrH + 0.7;

      items.forEach((item, idx) => {
        const ok = !!clStatus[item.key];
        // Zebra suave: branco / #FAFAFA
        const rowBg: [number, number, number] = idx % 2 === 0
          ? [255, 255, 255]
          : [250, 250, 250];

        doc.setFillColor(...rowBg);
        doc.rect(cx, iy, clColW, clRowH, "F");

        // Separador tracejado leve: 0.2mm, #F1F5F9
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.2);
        doc.line(cx, iy + clRowH, cx + clColW, iy + clRowH);

        // Ícone de checklist — quadrado 3.6×3.6mm
        const sqSize = 3.6;
        const sqX = cx + 3.0;
        const sqY = iy + (clRowH - sqSize) / 2;
        if (ok) {
          // Quadrado preenchido verde com check branco
          doc.setFillColor(16, 185, 129); // #10B981
          doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "F");
          doc.setDrawColor(5, 150, 105); // #059669
          doc.setLineWidth(0.2);
          doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "D");
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.65);
          doc.line(sqX + 0.7,              sqY + sqSize * 0.55,
                   sqX + sqSize * 0.42,    sqY + sqSize * 0.82);
          doc.line(sqX + sqSize * 0.42,    sqY + sqSize * 0.82,
                   sqX + sqSize - 0.6,     sqY + sqSize * 0.22);
          doc.setLineWidth(0.2);
        } else {
          // Quadrado vazio com borda tracejada (ausência, não erro)
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "F");
          doc.setLineDashPattern([0.6, 0.5], 0);
          doc.setDrawColor(209, 213, 219); // #D1D5DB
          doc.setLineWidth(0.3);
          doc.roundedRect(sqX, sqY, sqSize, sqSize, 0.5, 0.5, "D");
          doc.setLineDashPattern([], 0);
          doc.setLineWidth(0.2);
        }

        // Nome do documento: 8pt; não enviado → itálico, #9CA3AF
        // OBR ausente → nome sobe para abrir espaço ao subtexto
        const nameY = (!ok && item.obrigatorio) ? iy + clRowH / 2 - 0.5 : iy + clRowH / 2 + 2;
        doc.setFontSize(8);
        doc.setFont("helvetica", ok ? "normal" : "italic");
        doc.setTextColor(...(ok
          ? [31, 41, 55]   as [number, number, number]  // #1F2937
          : [156, 163, 175] as [number, number, number] // #9CA3AF
        ));
        doc.text(item.label, cx + 10, nameY);

        // Subtexto "Nao enviado" para obrigatórios ausentes
        if (!ok && item.obrigatorio) {
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(217, 119, 6); // #D97706
          doc.text("Nao enviado", cx + 10, iy + clRowH / 2 + 3.2);
        }

        // Badge OBR / OPC
        const missing = item.obrigatorio && !ok;
        const badgeLabel = item.obrigatorio ? "OBR" : "OPC";
        const badgeBg: [number, number, number] = missing
          ? [254, 243, 199]    // OBR ausente → âmbar #FEF3C7 (pendência, não erro crítico)
          : item.obrigatorio
            ? [219, 234, 254]  // OBR presente → #DBEAFE
            : [243, 244, 246]; // OPC → #F3F4F6
        const badgeFg: [number, number, number] = missing
          ? [217, 119, 6]      // #D97706
          : item.obrigatorio
            ? [29, 78, 216]    // #1D4ED8
            : [107, 114, 128]; // #6B7280
        const bw = 11;
        const bh = 4;
        const bx = cx + clColW - bw - 2.5;
        const by = iy + (clRowH - bh) / 2;
        doc.setFillColor(...badgeBg);
        doc.roundedRect(bx, by, bw, bh, 0.8, 0.8, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...badgeFg);
        doc.text(badgeLabel, bx + bw / 2, by + bh - 0.8, { align: "center" });

        iy += clRowH;
      });

      return iy;
    };

    // Margem entre header IDX e cards: 10px ≈ 3.5mm
    pos.y += 3.5;
    const clStartY = pos.y;
    const clEndY1 = clDrawCol(
      "FRENTE 1",
      "Consolidacao de Documentos \u2014 dados financeiros e societarios",
      [16, 185, 129] as [number, number, number],  // #10B981 verde
      clFrente1,
      margin,
      clStartY
    );
    const clEndY2 = clDrawCol(
      "FRENTE 2",
      "Tomada de Decisao para Credito \u2014 risco e historico",
      [59, 130, 246] as [number, number, number],  // #3B82F6 azul
      clFrente2,
      margin + clColW + clGap,
      clStartY
    );
    // Margem entre cards e legenda: 4mm
    pos.y = Math.max(clEndY1, clEndY2) + 4;

    // ── Legenda do Índice Documental ──────────────────────────────────────────
    {
      // Separador pontilhado superior
      doc.setLineDashPattern([0.8, 0.6], 0);
      doc.setDrawColor(229, 231, 235); // #E5E7EB
      doc.setLineWidth(0.3);
      doc.line(margin, pos.y, margin + contentW, pos.y);
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.2);

      const lY = pos.y + 5.5;
      const lSq = 3.0;
      let lX = margin;

      // [✓] Documento recebido
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(lX, lY - lSq + 0.5, lSq, lSq, 0.3, 0.3, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.55);
      doc.line(lX + 0.5,           lY - lSq + 0.5 + lSq * 0.55,
               lX + lSq * 0.42,   lY - lSq + 0.5 + lSq * 0.82);
      doc.line(lX + lSq * 0.42,   lY - lSq + 0.5 + lSq * 0.82,
               lX + lSq - 0.4,    lY - lSq + 0.5 + lSq * 0.22);
      doc.setLineWidth(0.2);
      lX += lSq + 1.8;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128); // #6B7280
      doc.text("Documento recebido", lX, lY);
      lX += doc.getTextWidth("Documento recebido") + 6;

      // [☐] Nao enviado
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(lX, lY - lSq + 0.5, lSq, lSq, 0.3, 0.3, "F");
      doc.setLineDashPattern([0.5, 0.4], 0);
      doc.setDrawColor(209, 213, 219); // #D1D5DB
      doc.setLineWidth(0.25);
      doc.roundedRect(lX, lY - lSq + 0.5, lSq, lSq, 0.3, 0.3, "D");
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.2);
      lX += lSq + 1.8;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text("Nao enviado", lX, lY);
      lX += doc.getTextWidth("Nao enviado") + 6;

      // [OBR] Obrigatorio
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      const obrW = doc.getTextWidth("OBR") + 4;
      const lBh  = 3.2;
      doc.setFillColor(219, 234, 254); // #DBEAFE
      doc.roundedRect(lX, lY - lBh + 0.5, obrW, lBh, 0.4, 0.4, "F");
      doc.setTextColor(29, 78, 216); // #1D4ED8
      doc.text("OBR", lX + obrW / 2, lY - 0.1, { align: "center" });
      lX += obrW + 1.8;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text("Obrigatorio", lX, lY);
      lX += doc.getTextWidth("Obrigatorio") + 6;

      // [OPC] Opcional
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      const opcW = doc.getTextWidth("OPC") + 4;
      doc.setFillColor(243, 244, 246); // #F3F4F6
      doc.roundedRect(lX, lY - lBh + 0.5, opcW, lBh, 0.4, 0.4, "F");
      doc.setTextColor(107, 114, 128); // #6B7280
      doc.text("OPC", lX + opcW / 2, lY - 0.1, { align: "center" });
      lX += opcW + 1.8;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text("Opcional", lX, lY);

      pos.y += 10;
    }

    // ── Cobertura Documental Total ────────────────────────────────────────────
    checkPageBreak(30);
    const clTotal   = Object.keys(clStatus).length;
    const clPresent = Object.values(clStatus).filter(Boolean).length;
    const clPct     = Math.round((clPresent / clTotal) * 100);
    // Nível baseado em contagem: 16/16 = COMPLETA, 10-15 = PARCIAL, <10 = INCOMPLETA
    const clNivel   = clPresent === clTotal ? "COMPLETA" : clPresent >= 10 ? "PARCIAL" : "INCOMPLETA";

    // Cores do badge por nível
    const clBadgeBg: [number, number, number] = clNivel === "COMPLETA"
      ? [220, 252, 231]   // #DCFCE7
      : clNivel === "PARCIAL"
        ? [254, 243, 199]  // #FEF3C7
        : [254, 226, 226]; // #FEE2E2
    const clBadgeFg: [number, number, number] = clNivel === "COMPLETA"
      ? [21, 128, 61]     // #15803D
      : clNivel === "PARCIAL"
        ? [217, 119, 6]   // #D97706
        : [220, 38, 38];  // #DC2626
    const clBadgeBorder: [number, number, number] = clNivel === "COMPLETA"
      ? [134, 239, 172]   // #86EFAC
      : clNivel === "PARCIAL"
        ? [252, 211, 77]  // #FCD34D
        : [252, 165, 165]; // #FCA5A5

    // Container: border-radius 8px, border 1px #E5E7EB, fundo #F8FAFC, padding 12×16
    const clCardH = 32; // aumentado para acomodar subtexto abaixo da barra
    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.roundedRect(margin, pos.y, contentW, clCardH, 3, 3, "F");
    doc.setDrawColor(229, 231, 235); // #E5E7EB
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, pos.y, contentW, clCardH, 3, 3, "D");
    doc.setLineWidth(0.1);

    // Label "COBERTURA DOCUMENTAL TOTAL": 8pt, uppercase, #6B7280
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128); // #6B7280
    doc.text("COBERTURA DOCUMENTAL TOTAL", margin + 6, pos.y + 6);

    // Número "13/16": 18pt, bold, #1E3A5F
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 95); // #1E3A5F
    const clCountStr = `${clPresent}/${clTotal}`;
    doc.text(clCountStr, margin + 6, pos.y + 16);
    const clCountW = doc.getTextWidth(clCountStr);

    // Subtexto inline: "documentos recebidos": 9pt, #6B7280
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("documentos recebidos", margin + 8 + clCountW, pos.y + 16);

    // Barra de progresso segmentada: verde (enviados) + cinza tracejado (pendentes)
    const clBarX = margin + 6;
    const clBarW = contentW - 68;
    const clBarH = 4; // altura 4mm = ~6px
    const clBarY = pos.y + 20;
    const clFillW = clBarW * (clPct / 100);

    // Fundo cinza (pendentes)
    doc.setFillColor(229, 231, 235); // #E5E7EB
    doc.roundedRect(clBarX, clBarY, clBarW, clBarH, clBarH / 2, clBarH / 2, "F");

    // Parte tracejada cinza sobre a área pendente (efeito visual de "ausência")
    if (clPct < 100 && clFillW < clBarW) {
      doc.setLineDashPattern([1.2, 0.8], 0);
      doc.setDrawColor(156, 163, 175); // #9CA3AF
      doc.setLineWidth(0.5);
      const pendX = clBarX + clFillW + 1;
      doc.line(pendX, clBarY + clBarH / 2, clBarX + clBarW - 1, clBarY + clBarH / 2);
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.2);
    }

    // Preenchimento verde (enviados)
    if (clPct > 0) {
      doc.setFillColor(16, 185, 129); // #10B981
      doc.roundedRect(clBarX, clBarY, clFillW, clBarH, clBarH / 2, clBarH / 2, "F");
    }

    // Percentual à direita da barra
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(`${clPct}%`, clBarX + clBarW + 2.5, clBarY + clBarH - 0.3);

    // Subtexto abaixo da barra: "13 de 16 documentos recebidos · 3 pendentes"
    const clPendentes = clTotal - clPresent;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128); // #6B7280
    doc.text(
      `${clPresent} de ${clTotal} documentos recebidos  -  ${clPendentes} pendente${clPendentes !== 1 ? "s" : ""}`,
      clBarX,
      clBarY + clBarH + 5
    );

    // Badge COMPLETA / PARCIAL / INCOMPLETA
    const clBadgeW = 28;
    const clBadgeH = 9;
    const clBadgeX = margin + contentW - clBadgeW - 4;
    const clBadgeY = pos.y + (clCardH - clBadgeH) / 2;
    doc.setFillColor(...clBadgeBg);
    doc.roundedRect(clBadgeX, clBadgeY, clBadgeW, clBadgeH, 1.5, 1.5, "F");
    doc.setDrawColor(...clBadgeBorder);
    doc.setLineWidth(0.35);
    doc.roundedRect(clBadgeX, clBadgeY, clBadgeW, clBadgeH, 1.5, 1.5, "D");
    doc.setLineWidth(0.1);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...clBadgeFg);
    doc.text(clNivel, clBadgeX + clBadgeW / 2, clBadgeY + clBadgeH - 2.1, { align: "center" });

    pos.y += clCardH + 4;
  }

  // ===== PAGE 1b — SINTESE PRELIMINAR =====
  newPage();
  drawHeader();
  dsSectionHeader("00", "SINTESE PRELIMINAR");

  // ── Design tokens ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const azulInst:   [number,number,number] = [27, 47, 78];
  const vermelho:   [number,number,number] = [220, 38, 38];
  const amarelo:    [number,number,number] = [217, 119, 6];
  const verde:      [number,number,number] = [22, 163, 74];

  // Cor dinâmica de score
  const scoreColor: [number,number,number] = finalRating >= 7.5 ? verde : finalRating >= 6 ? amarelo : vermelho;

  // ═══════════════════════════════════════════════════
  // BLOCO 1 — Score + Status (hero compacto, 30mm)
  // ═══════════════════════════════════════════════════
  {
    checkPageBreak(35);
    const bloco1H = 30;
    const bloco1Y = pos.y;

    // Fundo navy — gradient suave (6 faixas)
    const gSteps = 6;
    const gStepW  = contentW / gSteps;
    for (let s = 0; s < gSteps; s++) {
      const t = s / (gSteps - 1);
      doc.setFillColor(
        Math.round(27 + t * 10),
        Math.round(47 + t * 12),
        Math.round(78 + t * 20)
      );
      doc.rect(margin + s * gStepW, bloco1Y, gStepW + 0.5, bloco1H, "F");
    }
    doc.setFillColor(...scoreColor);
    doc.rect(margin, bloco1Y, 4, bloco1H, "F");
    doc.setFillColor(...amarelo);
    doc.rect(margin, bloco1Y + bloco1H - 1.5, contentW, 1.5, "F");

    // ── LADO ESQUERDO: Score ──
    const scoreX = margin + 8;
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 175, 220);
    doc.text("SCORE DE RISCO", scoreX, bloco1Y + 7);

    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...scoreColor);
    const scoreStr = String(finalRating);
    doc.text(scoreStr, scoreX, bloco1Y + 22);
    const scoreNumW = doc.getTextWidth(scoreStr);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 175, 220);
    doc.text("/10", scoreX + scoreNumW + 1, bloco1Y + 22);

    // Rating label
    const ratingLabel = finalRating >= 8 ? "EXCELENTE" : finalRating >= 6.5 ? "SATISFATORIO" : finalRating >= 5 ? "MODERADO" : "ALTO RISCO";
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...scoreColor);
    doc.text(ratingLabel, scoreX, bloco1Y + 27);

    // Barra de progresso
    const barX = scoreX + scoreNumW + 14;
    const barY = bloco1Y + 19;
    const barW = 40; const barH = 2;
    doc.setFillColor(50, 70, 100);
    doc.roundedRect(barX, barY, barW, barH, 0.8, 0.8, "F");
    const fillW = Math.min(barW, (finalRating / 10) * barW);
    if (fillW > 0) { doc.setFillColor(...scoreColor); doc.roundedRect(barX, barY, fillW, barH, 0.8, 0.8, "F"); }

    // Divisória vertical
    const divX = margin + 90;
    doc.setDrawColor(60, 85, 125);
    doc.setLineWidth(0.25);
    doc.line(divX, bloco1Y + 5, divX, bloco1Y + bloco1H - 5);
    doc.setLineWidth(0.1);

    // ── LADO DIREITO: Decisão ──
    const decC: [number,number,number] = decision === "APROVADO" ? verde : decision === "REPROVADO" ? vermelho : amarelo;
    const rightX = divX + 6;
    const rightW = contentW - (divX - margin) - 10;

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 175, 220);
    doc.text("DECISAO", rightX, bloco1Y + 7);

    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...decC);
    const decLabel = decision.replace(/_/g, " ");
    const decLabelLines = doc.splitTextToSize(decLabel, rightW) as string[];
    doc.text(decLabelLines[0], rightX, bloco1Y + 19);

    const decSubtitle = decision === "APROVADO" ? "Operacao recomendada pelo sistema" :
      decision === "REPROVADO" ? "Operacao nao recomendada" :
      decision === "APROVACAO_CONDICIONAL" ? "Aprovacao mediante condicoes" :
      "Pendente de informacoes adicionais";
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 175, 220);
    doc.text(decSubtitle, rightX, bloco1Y + 26);

    // Risco badge (top-right corner)
    const riscoBg: [number,number,number] = riskScore === "baixo" ? [22,163,74] : riskScore === "medio" ? [217,119,6] : [220,38,38];
    const riscoBw = 30; const riscoBh = 7;
    const riscoBx = margin + contentW - riscoBw - 4;
    const riscoBy = bloco1Y + 4;
    doc.setFillColor(...riscoBg);
    doc.roundedRect(riscoBx, riscoBy, riscoBw, riscoBh, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`RISCO ${riskScore.toUpperCase()}`, riscoBx + riscoBw / 2, riscoBy + 4.8, { align: "center" });

    pos.y = bloco1Y + bloco1H + 5;
  }

  // ── Green accent separator ──
  doc.setFillColor(...colors.accent);
  doc.rect(margin, pos.y, contentW, 0.8, "F");
  pos.y += 5;

  // ── 3 Metric Cards — Rating / Decisão / Risco ──
  {
    const mcGap = 4;
    const mcW   = (contentW - mcGap * 2) / 3;
    const mcH   = 22;
    checkPageBreak(mcH + DS.space.md);

    // Rating de Crédito
    const ratingBorderC: [number,number,number] = finalRating >= 7.5 ? DS.colors.success
      : finalRating >= 6 ? DS.colors.warn : DS.colors.danger;
    const ratingValC: [number,number,number] = ratingBorderC;
    dsMetricCard(
      margin, pos.y, mcW, mcH,
      "Rating de Crédito", `${finalRating}/10`,
      finalRating >= 7.5 ? "Excelente" : finalRating >= 6 ? "Satisfatório" : "Atenção",
      ratingBorderC, ratingValC
    );

    // Decisão
    const decBorderC: [number,number,number] = decision === "APROVADO" ? DS.colors.success
      : decision === "REPROVADO" ? DS.colors.danger : DS.colors.warn;
    const decValC: [number,number,number] = decBorderC;
    dsMetricCard(
      margin + mcW + mcGap, pos.y, mcW, mcH,
      "Decisão", decision.replace(/_/g, " "),
      decision === "APROVADO" ? "Operação recomendada"
        : decision === "REPROVADO" ? "Não recomendada"
        : "Mediante condições",
      decBorderC, decValC
    );

    // Nível de Risco
    const riscoBorderC: [number,number,number] = riskScore === "baixo" ? DS.colors.success
      : riskScore === "medio" ? DS.colors.warn : DS.colors.danger;
    const riscoValC: [number,number,number] = riscoBorderC;
    dsMetricCard(
      margin + (mcW + mcGap) * 2, pos.y, mcW, mcH,
      "Nível de Risco", riskScore.toUpperCase(),
      riskScore === "baixo" ? "Perfil conservador"
        : riskScore === "medio" ? "Perfil moderado"
        : "Perfil agressivo",
      riscoBorderC, riscoValC
    );

    pos.y += mcH + DS.space.md;
  }

  // ── Plano C — tipografia pura, hierarquia por tamanho de fonte ──
  const IR_PAD_TOP   = 3.5;
  const IR_LABEL_H   = 2.2;
  const IR_LV_GAP    = 1.8;
  const IR_VAL_H     = 5.5;   // linha valor a 10.5pt (escala com primarySize)
  const IR_DET_H     = 4.0;
  const IR_FIELD_GAP = 5.0;
  const IR_PAD_BOT   = 4.0;

  const calcRowH = (value: string, rw: number, isLast: boolean, primarySize = 10.5): number => {
    const segs = value.split("\n");
    const scaledValH = (primarySize / 10.5) * IR_VAL_H;
    doc.setFontSize(primarySize); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
    const primCount = (doc.splitTextToSize(segs[0].trim(), rw - 10) as string[]).length;
    let detCount = 0;
    if (segs.length > 1) {
      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      segs.slice(1).forEach(s => {
        detCount += (doc.splitTextToSize(s.trim(), rw - 10) as string[]).length;
      });
    }
    const bot = isLast ? IR_PAD_BOT : IR_FIELD_GAP;
    return Math.max(18, IR_PAD_TOP + IR_LABEL_H + IR_LV_GAP + primCount * scaledValH + detCount * IR_DET_H + bot);
  };

  // renderInfoRow — sem fundo por row (fundo único já desenhado no bloco)
  const renderInfoRow = (
    rx: number, ry: number, rw: number,
    label: string, value: string,
    isLast = false,
    overrideH?: number,
    valueColor?: [number, number, number],
    primarySize = 10.5
  ): number => {
    const segs = value.split("\n");
    const scaledValH = (primarySize / 10.5) * IR_VAL_H;

    doc.setFontSize(primarySize); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
    const primLines = doc.splitTextToSize(segs[0].trim(), rw - 10) as string[];

    const detSegs: string[][] = [];
    if (segs.length > 1) {
      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      segs.slice(1).forEach(s => detSegs.push(doc.splitTextToSize(s.trim(), rw - 10) as string[]));
    }

    const totalDet = detSegs.reduce((a, b) => a + b.length, 0);
    const bot = isLast ? IR_PAD_BOT : IR_FIELD_GAP;
    const naturalH = Math.max(18,
      IR_PAD_TOP + IR_LABEL_H + IR_LV_GAP + primLines.length * scaledValH + totalDet * IR_DET_H + bot
    );
    const rH = overrideH ?? naturalH;

    // Label — 6pt all-caps, letter-spacing para legibilidade
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setCharSpace(0.4);
    doc.setTextColor(156, 163, 175);
    doc.text(label.toUpperCase(), rx + 5, ry + IR_PAD_TOP + IR_LABEL_H);
    doc.setCharSpace(0);

    // Valor principal — primarySize bold, cor por severidade
    doc.setFontSize(primarySize); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
    doc.setTextColor(...(valueColor ?? ([17, 24, 39] as [number, number, number])));
    const valBaseY = ry + IR_PAD_TOP + IR_LABEL_H + IR_LV_GAP + scaledValH * 0.82;
    primLines.forEach((line, i) => doc.text(line, rx + 5, valBaseY + i * scaledValH));

    // Linhas de detalhe — 7pt normal muted (sempre cinza, independente de valueColor)
    if (detSegs.length > 0) {
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setCharSpace(0);
      doc.setTextColor(107, 114, 128);
      let dY = valBaseY + primLines.length * scaledValH;
      detSegs.forEach(seg => seg.forEach(line => { doc.text(line, rx + 5, dY); dY += IR_DET_H; }));
    }

    // Separador assimétrico — alinhado ao texto, não flutuante
    if (!isLast) {
      doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.25);
      doc.line(rx + 5, ry + rH, rx + rw - 5, ry + rH);
      doc.setLineWidth(0.1);
    }

    doc.setCharSpace(0);
    return ry + rH;
  };

  // ── Prepare data ──
  const anoAbSint = data.cnpj?.dataAbertura ? new Date(data.cnpj.dataAbertura).getFullYear() : null;
  const idadeEmpSint = anoAbSint && !isNaN(anoAbSint) ? `${new Date().getFullYear() - anoAbSint} anos` : "—";
  const fmmSint = data.faturamento?.fmm12m
    ? `R$ ${fmtMoney(data.faturamento.fmm12m)}`
    : data.faturamento?.mediaAno ? `R$ ${fmtMoney(data.faturamento.mediaAno)}` : "—";
  const pleitoSint = data.relatorioVisita?.pleito ? `R$ ${fmtMoney(data.relatorioVisita.pleito)}` : "—";
  const grupoQtdSint = data.grupoEconomico?.empresas?.length ?? 0;
  const grupoSint = grupoQtdSint > 0 ? `Sim — ${grupoQtdSint} empresa(s)` : "Não identificado";
  const refComSint = (data.relatorioVisita as { referenciaComercial?: string } | undefined)?.referenciaComercial || "—";
  const modalSint = data.relatorioVisita?.modalidade
    ? ({ comissaria: "Comissária", convencional: "Convencional", hibrida: "Comissária e Convencional", outra: "Outra" } as Record<string, string>)[data.relatorioVisita.modalidade] ?? "—"
    : "—";
  const concTop3Val = data.curvaABC?.concentracaoTop3 ? parseFloat(String(data.curvaABC.concentracaoTop3)) : 0;
  const concTop3Sint = concTop3Val > 0 ? `${data.curvaABC!.concentracaoTop3}%` : "—";

  const vigQtdSint = parseInt(data.protestos?.vigentesQtd || "0");
  const vigValSint = data.protestos?.vigentesValor || "0";
  const protOrdSint = [...(data.protestos?.detalhes ?? [])].filter(d => d.data).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  const protRecenteSint = protOrdSint[0]?.data ?? null;
  const protestoSint = vigQtdSint > 0
    ? `${vigQtdSint} reg. | R$ ${fmtMoney(vigValSint)}${protRecenteSint ? ` | Rec: ${protRecenteSint}` : ""}`
    : "Nenhum registro";

  const totalOcorrSint = data.ccf?.qtdRegistros || 0;
  const ccfBancosSint = (data.ccf?.bancos ?? []);
  const ccfBancosStr = ccfBancosSint.length > 0
    ? ccfBancosSint.slice(0, 4).map(b => `${b.banco}${b.quantidade > 1 ? ` (${b.quantidade})` : ""}`).join(" · ")
      + (ccfBancosSint.length > 4 ? ` +${ccfBancosSint.length - 4}` : "")
    : "";
  const ccfSint = totalOcorrSint > 0
    ? [`${totalOcorrSint} registro(s)`, ccfBancosStr].filter(Boolean).join("\n")
    : "Nenhuma ocorrência";

  const passivostSint  = parseInt(data.processos?.passivosTotal  || "0");
  const poloAtivoSint  = parseInt(data.processos?.poloAtivoQtd   || "0");
  const poloPassSint   = parseInt(data.processos?.poloPassivoQtd  || "0");
  const processoSint = passivostSint > 0
    ? [
        `${passivostSint} total`,
        [
          poloAtivoSint > 0 ? `Ativo: ${poloAtivoSint}`  : "",
          poloPassSint  > 0 ? `Passivo: ${poloPassSint}` : "",
        ].filter(Boolean).join("  |  "),
      ].filter(Boolean).join("\n")
    : "Nenhum processo";

  const scrVencSint = vencidosSCR > 0 ? (data.scr?.vencidos || "Sim") : "Nenhum";
  const alavSint = alavancagem > 0 ? `${fmtBR(alavancagem, 2)}x` : "—";

  // ── Two-column data layout — Plano C ──
  {
    checkPageBreak(150);
    const colGapSint = 3;
    const col1WSint = (contentW - colGapSint) * 0.44;   // 44% — mais espaço para risco
    const col2WSint = contentW - col1WSint - colGapSint;
    const col2XSint = margin + col1WSint + colGapSint;
    const hdrH = 14;  // cabeçalho mais alto para acomodar subtítulo
    const blockYSint = pos.y;

    type SintRow = {
      label: string;
      value: string;
      color?: [number, number, number];
      primarySize?: number;
    };
    const c1Rows: SintRow[] = [
      { label: "Idade da Empresa",         value: idadeEmpSint  },
      { label: "Faturamento Médio (12M)",  value: fmmSint       },
      { label: "Pleito",                   value: pleitoSint    },
      { label: "Grupo Econômico",          value: grupoSint     },
      { label: "Referência Comercial",     value: refComSint    },
      { label: "Modalidade",               value: modalSint     },
      { label: "ABC — Concentração Top 3", value: concTop3Sint, color: concTop3Val > 80 ? [220, 38, 38] : concTop3Val > 60 ? [217, 119, 6] : undefined },
    ];
    const c2Rows: SintRow[] = [
      {
        label: "Protestos",
        value: protestoSint,
        color: vigQtdSint > 0 ? [220, 38, 38] : undefined,
      },
      {
        label: "CCF — Cheques Sem Fundo",
        value: ccfSint,
        color: totalOcorrSint > 0 ? [220, 38, 38] : undefined,
      },
      {
        label: "Processos Judiciais",
        value: processoSint,
        color: passivostSint > 0 ? [217, 119, 6] : undefined,
        primarySize: 13,   // valor principal maior — dado mais crítico do bloco
      },
      {
        label: "SCR — Vencido",
        value: scrVencSint,
        color: vencidosSCR > 0 ? [220, 38, 38] : undefined,
      },
      {
        label: "Alavancagem",
        value: alavSint,
        color: alavancagem > 4 ? [220, 38, 38] : alavancagem > 2 ? [217, 119, 6] : undefined,
      },
    ];

    // Pré-computa + equaliza alturas
    const c1H = c1Rows.map((r, i) => calcRowH(r.value, col1WSint, i === c1Rows.length - 1, r.primarySize));
    const c2H = c2Rows.map((r, i) => calcRowH(r.value, col2WSint, i === c2Rows.length - 1, r.primarySize));
    const c1Tot = c1H.reduce((a, b) => a + b, 0);
    const c2Tot = c2H.reduce((a, b) => a + b, 0);
    if (c1Tot < c2Tot) c1H[c1H.length - 1] += c2Tot - c1Tot;
    else if (c2Tot < c1Tot) c2H[c2H.length - 1] += c1Tot - c2Tot;
    const bodyH = c1H.reduce((a, b) => a + b, 0);

    // Fundo único do corpo (ambas as colunas)
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, blockYSint + hdrH, contentW, bodyH, "F");

    // Cabeçalho col1 — navy + faixa gold + subtítulo
    doc.setFillColor(26, 46, 74);
    doc.rect(margin, blockYSint, col1WSint, hdrH, "F");
    doc.setFillColor(232, 160, 32);
    doc.rect(margin, blockYSint, 3, hdrH, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("PERFIL & OPERACIONAL", margin + 7, blockYSint + 6);
    doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 200, 240);
    doc.text("Cadastro e operações", margin + 7, blockYSint + 10.5);

    // Cabeçalho col2 — navy + faixa gold + subtítulo
    doc.setFillColor(26, 46, 74);
    doc.rect(col2XSint, blockYSint, col2WSint, hdrH, "F");
    doc.setFillColor(232, 160, 32);
    doc.rect(col2XSint, blockYSint, 3, hdrH, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("INDICADORES DE RISCO", col2XSint + 7, blockYSint + 6);
    doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 200, 240);
    doc.text("Exposição a riscos", col2XSint + 7, blockYSint + 10.5);

    // Divisória vertical entre colunas
    const divX = margin + col1WSint + colGapSint / 2;
    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.3);
    doc.line(divX, blockYSint + hdrH, divX, blockYSint + hdrH + bodyH);
    doc.setLineWidth(0.1);

    // Borda externa do card
    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.3);
    doc.roundedRect(margin, blockYSint, contentW, hdrH + bodyH, 1.5, 1.5, "S");
    doc.setLineWidth(0.1);

    let y1Sint = blockYSint + hdrH;
    let y2Sint = blockYSint + hdrH;

    c1Rows.forEach((r, i) => {
      y1Sint = renderInfoRow(margin, y1Sint, col1WSint, r.label, r.value, i === c1Rows.length - 1, c1H[i], r.color, r.primarySize);
    });
    c2Rows.forEach((r, i) => {
      y2Sint = renderInfoRow(col2XSint, y2Sint, col2WSint, r.label, r.value, i === c2Rows.length - 1, c2H[i], r.color, r.primarySize);
    });

    pos.y = Math.max(y1Sint, y2Sint) + 6;
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
    pos.y += 8;

    // Título da síntese
    doc.setFillColor(...colors.primary);
    doc.rect(margin, pos.y, contentW, 7, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("SÍNTESE EXECUTIVA", margin + 3, pos.y + 4.8);
    pos.y += 10;

    // Texto da síntese
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);

    const linhasSintese = doc.splitTextToSize(aiAnalysis.sinteseExecutiva, contentW - 6);

    for (const linha of linhasSintese) {
      checkPageBreak(10);
      doc.text(linha, margin + 3, pos.y);
      pos.y += 4.5;
    }

    pos.y += 6;
  }


  // ===== SEÇÃO FS — CONFORMIDADE COM PARAMETROS DO FUNDO =====
  if (p.fundValidation && p.fundValidation.criteria.length > 0) {
    const fv = p.fundValidation;
    drawSpacer(10);

    // Bug fix 1: calcula altura total e força nova página se a seção não couber inteira
    const fsRowH = 14;
    const fsElimFailCount = fv.criteria.filter(c => c.eliminatoria && c.status === 'error').length;
    const fsHasElimFail = fsElimFailCount > 0;
    const fsHasAnyElim = fv.criteria.some(c => c.eliminatoria);
    const fsAlturaTotal = 13 + 12 + 8 + fv.criteria.length * (fsRowH + 1) + 13 + (fsHasAnyElim ? 10 : 0);
    if (pos.y + fsAlturaTotal > 265) { newPage(); drawHeader(); }

    // Bug fix 2: normaliza ≥ e ≤ → >= e <= para evitar corrupção de caracteres no jsPDF
    const normalizeThreshold = (t: string) => t.replace(/≥/g, '>=').replace(/≤/g, '<=');

    // Section header
    dsSectionHeader('FS', 'CONFORMIDADE COM PARAMETROS DO FUNDO');

    // Column positions (margin=20, contentW=170)
    const fsColBadge = margin + 7;
    const fsColCrit  = margin + 17;
    const fsColLim   = margin + 76;
    const fsColApur  = margin + 118;
    const fsColStat  = margin + 143;

    // ── BANNER DE AVISO ──────────────────────────────────────────────
    const fsBannerBg: [number,number,number] = fv.hasEliminatoria
      ? [254, 226, 226] : fv.warnCount > 0 ? [254, 243, 199] : [220, 252, 231];
    const fsBannerTxt: [number,number,number] = fv.hasEliminatoria
      ? [220, 38, 38] : fv.warnCount > 0 ? [133, 77, 14] : [21, 128, 61];
    doc.setFillColor(...fsBannerBg);
    doc.roundedRect(margin, pos.y, contentW, 10, 2, 2, 'F');
    if (fv.hasEliminatoria || fv.warnCount > 0) {
      doc.setFillColor(...fsBannerTxt);
      doc.rect(margin, pos.y, 3, 10, 'F');
    }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...fsBannerTxt);
    const fsBannerText = fv.hasEliminatoria
      ? `! ATENCAO: criterio eliminatorio nao atendido — ${fv.failCount} reprovado(s), ${fv.passCount} de ${fv.criteria.length} aprovados`
      : fv.warnCount > 0
        ? `${fv.passCount} criterios aprovados · ${fv.warnCount} atencao · ${fv.failCount} reprovado(s)`
        : `Todos os ${fv.passCount} criterios atendidos — empresa elegivel`;
    doc.text(fsBannerText, margin + 6, pos.y + 6.5);
    pos.y += 12;

    // ── HEADER DAS COLUNAS ───────────────────────────────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, pos.y, contentW, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(107, 114, 128);
    doc.text('CRITERIO',        fsColCrit,  pos.y + 5);
    doc.text('LIMITE DO FUNDO', fsColLim,   pos.y + 5);
    doc.text('APURADO',         fsColApur,  pos.y + 5);
    doc.text('STATUS',          fsColStat,  pos.y + 5);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, pos.y + 7, margin + contentW, pos.y + 7);
    pos.y += 8;

    // ── LINHAS DE CRITÉRIOS ──────────────────────────────────────────
    fv.criteria.forEach((cr, idx) => {
      checkPageBreak(fsRowH + 1);
      const isOk   = cr.status === 'ok';
      const isErr  = cr.status === 'error';
      const isWarn = cr.status === 'warning';

      // Zebra + reprovado override
      const rowBg: [number,number,number] = isErr
        ? [255, 245, 245] : idx % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
      doc.setFillColor(...rowBg);
      doc.rect(margin, pos.y, contentW, fsRowH, 'F');

      // Barra lateral colorida 3px
      const stripC: [number,number,number] = isErr
        ? [220, 38, 38] : isWarn ? [217, 119, 6] : isOk ? [16, 185, 129] : [156, 163, 175];
      doc.setFillColor(...stripC);
      doc.rect(margin, pos.y, 3, fsRowH, 'F');

      // Badge OK / X / !
      const badgeLabel = isOk ? 'OK' : isErr ? 'X' : '!';
      const badgeBg: [number,number,number] = isOk ? [220,252,231] : isErr ? [254,226,226] : [254,243,199];
      const badgeTxt: [number,number,number] = isOk ? [21,128,61] : isErr ? [220,38,38] : [133,77,14];
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const badgeW = doc.getTextWidth(badgeLabel) + 8;
      doc.setFillColor(...badgeBg);
      doc.roundedRect(fsColBadge, pos.y + (fsRowH - 5) / 2, badgeW, 5, 1.5, 1.5, 'F');
      doc.setTextColor(...badgeTxt);
      doc.text(badgeLabel, fsColBadge + 4, pos.y + fsRowH / 2 + 1.5);

      // Critério label (* em todos os eliminatórios)
      const labelText = cr.eliminatoria ? cr.label + ' *' : cr.label;
      doc.setFontSize(9);
      doc.setFont('helvetica', isErr ? 'bold' : 'normal');
      doc.setTextColor(...(isErr ? [220,38,38] as [number,number,number] : [31,41,55] as [number,number,number]));
      doc.text(labelText, fsColCrit, pos.y + fsRowH / 2 + 1.5);

      // Limite do fundo
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      const threshNorm = normalizeThreshold(cr.threshold);
      const threshLines = doc.splitTextToSize(threshNorm, fsColApur - fsColLim - 4);
      doc.text(threshLines[0], fsColLim, pos.y + fsRowH / 2 + 1.5);

      // Apurado
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...stripC);
      doc.text(cr.actual, fsColApur, pos.y + fsRowH / 2 + 1.5);

      // Badge de status
      const sLabel = isOk ? 'APROVADO' : isWarn ? 'ATENCAO' : isErr ? 'REPROVADO' : 'S/DADO';
      const sBg: [number,number,number] = isOk ? [220,252,231] : isWarn ? [254,243,199] : isErr ? [254,226,226] : [243,244,246];
      const sTxt: [number,number,number] = isOk ? [21,128,61] : isWarn ? [133,77,14] : isErr ? [220,38,38] : [107,114,128];
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const sPw = doc.getTextWidth(sLabel) + 10;
      doc.setFillColor(...sBg);
      doc.roundedRect(fsColStat, pos.y + (fsRowH - 6) / 2, sPw, 6, 1.5, 1.5, 'F');
      doc.setTextColor(...sTxt);
      doc.text(sLabel, fsColStat + 5, pos.y + fsRowH / 2 + 1.5);

      // Separador horizontal suave entre linhas
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, pos.y + fsRowH, margin + contentW, pos.y + fsRowH);

      pos.y += fsRowH + 1;
    });

    // ── LINHA DE RESUMO ──────────────────────────────────────────────
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(1);
    doc.line(margin, pos.y, margin + contentW, pos.y);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, pos.y, contentW, 12, 'F');

    const fsResultText = fsHasElimFail
      ? `Resultado: ${fv.passCount}/${fv.criteria.length} aprovados · ${fv.failCount} reprovados (${fsElimFailCount} elim.)`
      : `Resultado: ${fv.passCount}/${fv.criteria.length} aprovados · ${fv.failCount} reprovados`;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(fsResultText, margin + 4, pos.y + 8);

    const fsFinalStatus = fv.hasEliminatoria || fv.failCount > 0
      ? 'REPROVADO PELO FUNDO' : fv.warnCount > 0 ? 'CONDICIONAL' : 'APROVADO PELO FUNDO';
    const fsFinalBg: [number,number,number] = fsFinalStatus === 'APROVADO PELO FUNDO'
      ? [220,252,231] : fsFinalStatus === 'CONDICIONAL' ? [254,243,199] : [254,226,226];
    const fsFinalTxt: [number,number,number] = fsFinalStatus === 'APROVADO PELO FUNDO'
      ? [21,128,61] : fsFinalStatus === 'CONDICIONAL' ? [133,77,14] : [220,38,38];
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const fsFPw = doc.getTextWidth(fsFinalStatus) + 14;
    doc.setFillColor(...fsFinalBg);
    doc.roundedRect(margin + contentW - fsFPw - 4, pos.y + 2.5, fsFPw, 7, 2, 2, 'F');
    doc.setTextColor(...fsFinalTxt);
    doc.text(fsFinalStatus, margin + contentW - fsFPw - 4 + 7, pos.y + 8);
    pos.y += 13;

    // ── RODAPÉ COM ASTERISCO ─────────────────────────────────────────
    if (fsHasAnyElim) {
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, pos.y, margin + contentW, pos.y);
      pos.y += 4;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(156, 163, 175);
      doc.text('* Criterio eliminatorio — impede aprovacao pelos parametros configurados do fundo', margin + 3, pos.y);
      pos.y += 6;
    }

    pos.y += 6;
  }


  // ===== SEÇÃO FS — CONFORMIDADE COM PARAMETROS DO FUNDO =====
  if (p.fundValidation && p.fundValidation.criteria.length > 0) {
    const fv = p.fundValidation;
    drawSpacer(10);

    // Bug fix 1: calcula altura total e força nova página se a seção não couber inteira
    const fsRowH2 = 14;
    const fsElimFailCount2 = fv.criteria.filter(c => c.eliminatoria && c.status === 'error').length;
    const fsHasElimFail2 = fsElimFailCount2 > 0;
    const fsHasAnyElim2 = fv.criteria.some(c => c.eliminatoria);
    const fsAlturaTotal2 = 13 + 12 + 8 + fv.criteria.length * (fsRowH2 + 1) + 13 + (fsHasAnyElim2 ? 10 : 0);
    if (pos.y + fsAlturaTotal2 > 265) { newPage(); drawHeader(); }

    // Bug fix 2: normaliza ≥ e ≤ → >= e <= para evitar corrupção de caracteres no jsPDF
    const normalizeThreshold2 = (t: string) => t.replace(/≥/g, '>=').replace(/≤/g, '<=');

    // Section header
    dsSectionHeader('FS', 'CONFORMIDADE COM PARAMETROS DO FUNDO');

    // Column positions (margin=20, contentW=170)
    const fs2ColBadge = margin + 7;
    const fs2ColCrit  = margin + 17;
    const fs2ColLim   = margin + 76;
    const fs2ColApur  = margin + 118;
    const fs2ColStat  = margin + 143;

    // ── BANNER DE AVISO ──────────────────────────────────────────────
    const fs2BannerBg: [number,number,number] = fv.hasEliminatoria
      ? [254, 226, 226] : fv.warnCount > 0 ? [254, 243, 199] : [220, 252, 231];
    const fs2BannerTxt: [number,number,number] = fv.hasEliminatoria
      ? [220, 38, 38] : fv.warnCount > 0 ? [133, 77, 14] : [21, 128, 61];
    doc.setFillColor(...fs2BannerBg);
    doc.roundedRect(margin, pos.y, contentW, 10, 2, 2, 'F');
    if (fv.hasEliminatoria || fv.warnCount > 0) {
      doc.setFillColor(...fs2BannerTxt);
      doc.rect(margin, pos.y, 3, 10, 'F');
    }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...fs2BannerTxt);
    const fs2BannerText = fv.hasEliminatoria
      ? `! ATENCAO: criterio eliminatorio nao atendido — ${fv.failCount} reprovado(s), ${fv.passCount} de ${fv.criteria.length} aprovados`
      : fv.warnCount > 0
        ? `${fv.passCount} criterios aprovados · ${fv.warnCount} atencao · ${fv.failCount} reprovado(s)`
        : `Todos os ${fv.passCount} criterios atendidos — empresa elegivel`;
    doc.text(fs2BannerText, margin + 6, pos.y + 6.5);
    pos.y += 12;

    // ── HEADER DAS COLUNAS ───────────────────────────────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, pos.y, contentW, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(107, 114, 128);
    doc.text('CRITERIO',        fs2ColCrit,  pos.y + 5);
    doc.text('LIMITE DO FUNDO', fs2ColLim,   pos.y + 5);
    doc.text('APURADO',         fs2ColApur,  pos.y + 5);
    doc.text('STATUS',          fs2ColStat,  pos.y + 5);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, pos.y + 7, margin + contentW, pos.y + 7);
    pos.y += 8;

    // ── LINHAS DE CRITÉRIOS ──────────────────────────────────────────
    fv.criteria.forEach((cr, idx) => {
      checkPageBreak(fsRowH2 + 1);
      const isOk   = cr.status === 'ok';
      const isErr  = cr.status === 'error';
      const isWarn = cr.status === 'warning';

      // Zebra + reprovado override
      const rowBg2: [number,number,number] = isErr
        ? [255, 245, 245] : idx % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
      doc.setFillColor(...rowBg2);
      doc.rect(margin, pos.y, contentW, fsRowH2, 'F');

      // Barra lateral colorida 3px
      const stripC2: [number,number,number] = isErr
        ? [220, 38, 38] : isWarn ? [217, 119, 6] : isOk ? [16, 185, 129] : [156, 163, 175];
      doc.setFillColor(...stripC2);
      doc.rect(margin, pos.y, 3, fsRowH2, 'F');

      // Badge OK / X / !
      const badgeLabel2 = isOk ? 'OK' : isErr ? 'X' : '!';
      const badgeBg2: [number,number,number] = isOk ? [220,252,231] : isErr ? [254,226,226] : [254,243,199];
      const badgeTxt2: [number,number,number] = isOk ? [21,128,61] : isErr ? [220,38,38] : [133,77,14];
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const badgeW2 = doc.getTextWidth(badgeLabel2) + 8;
      doc.setFillColor(...badgeBg2);
      doc.roundedRect(fs2ColBadge, pos.y + (fsRowH2 - 5) / 2, badgeW2, 5, 1.5, 1.5, 'F');
      doc.setTextColor(...badgeTxt2);
      doc.text(badgeLabel2, fs2ColBadge + 4, pos.y + fsRowH2 / 2 + 1.5);

      // Critério label (* em todos os eliminatórios)
      const labelText2 = cr.eliminatoria ? cr.label + ' *' : cr.label;
      doc.setFontSize(9);
      doc.setFont('helvetica', isErr ? 'bold' : 'normal');
      doc.setTextColor(...(isErr ? [220,38,38] as [number,number,number] : [31,41,55] as [number,number,number]));
      doc.text(labelText2, fs2ColCrit, pos.y + fsRowH2 / 2 + 1.5);

      // Limite do fundo
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      const threshNorm2 = normalizeThreshold2(cr.threshold);
      const threshLines2 = doc.splitTextToSize(threshNorm2, fs2ColApur - fs2ColLim - 4);
      doc.text(threshLines2[0], fs2ColLim, pos.y + fsRowH2 / 2 + 1.5);

      // Apurado
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...stripC2);
      doc.text(cr.actual, fs2ColApur, pos.y + fsRowH2 / 2 + 1.5);

      // Badge de status
      const sLabel2 = isOk ? 'APROVADO' : isWarn ? 'ATENCAO' : isErr ? 'REPROVADO' : 'S/DADO';
      const sBg2: [number,number,number] = isOk ? [220,252,231] : isWarn ? [254,243,199] : isErr ? [254,226,226] : [243,244,246];
      const sTxt2: [number,number,number] = isOk ? [21,128,61] : isWarn ? [133,77,14] : isErr ? [220,38,38] : [107,114,128];
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const sPw2 = doc.getTextWidth(sLabel2) + 10;
      doc.setFillColor(...sBg2);
      doc.roundedRect(fs2ColStat, pos.y + (fsRowH2 - 6) / 2, sPw2, 6, 1.5, 1.5, 'F');
      doc.setTextColor(...sTxt2);
      doc.text(sLabel2, fs2ColStat + 5, pos.y + fsRowH2 / 2 + 1.5);

      // Separador horizontal suave entre linhas
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, pos.y + fsRowH2, margin + contentW, pos.y + fsRowH2);

      pos.y += fsRowH2 + 1;
    });

    // ── LINHA DE RESUMO ──────────────────────────────────────────────
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(1);
    doc.line(margin, pos.y, margin + contentW, pos.y);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, pos.y, contentW, 12, 'F');

    const fs2ResultText = fsHasElimFail2
      ? `Resultado: ${fv.passCount}/${fv.criteria.length} aprovados · ${fv.failCount} reprovados (${fsElimFailCount2} elim.)`
      : `Resultado: ${fv.passCount}/${fv.criteria.length} aprovados · ${fv.failCount} reprovados`;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(fs2ResultText, margin + 4, pos.y + 8);

    const fs2FinalStatus = fv.hasEliminatoria || fv.failCount > 0
      ? 'REPROVADO PELO FUNDO' : fv.warnCount > 0 ? 'CONDICIONAL' : 'APROVADO PELO FUNDO';
    const fs2FinalBg: [number,number,number] = fs2FinalStatus === 'APROVADO PELO FUNDO'
      ? [220,252,231] : fs2FinalStatus === 'CONDICIONAL' ? [254,243,199] : [254,226,226];
    const fs2FinalTxt: [number,number,number] = fs2FinalStatus === 'APROVADO PELO FUNDO'
      ? [21,128,61] : fs2FinalStatus === 'CONDICIONAL' ? [133,77,14] : [220,38,38];
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const fs2FPw = doc.getTextWidth(fs2FinalStatus) + 14;
    doc.setFillColor(...fs2FinalBg);
    doc.roundedRect(margin + contentW - fs2FPw - 4, pos.y + 2.5, fs2FPw, 7, 2, 2, 'F');
    doc.setTextColor(...fs2FinalTxt);
    doc.text(fs2FinalStatus, margin + contentW - fs2FPw - 4 + 7, pos.y + 8);
    pos.y += 13;

    // ── RODAPÉ COM ASTERISCO ─────────────────────────────────────────
    if (fsHasAnyElim2) {
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, pos.y, margin + contentW, pos.y);
      pos.y += 4;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(156, 163, 175);
      doc.text('* Criterio eliminatorio — impede aprovacao pelos parametros configurados do fundo', margin + 3, pos.y);
      pos.y += 6;
    }

    pos.y += 6;
  }


  // ===== SEÇÃO LC — LIMITE DE CRÉDITO SUGERIDO =====
  if (p.creditLimit) {
    const lc = p.creditLimit;
    const lcColor = lc.classificacao === 'APROVADO' ? [22, 101, 52] as [number,number,number]
      : lc.classificacao === 'CONDICIONAL' ? [120, 53, 15] as [number,number,number]
      : [127, 29, 29] as [number,number,number];
    // lcBgHex reserved for future use
    const fmtM = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    drawSpacer(10);
    checkPageBreak(55);

    dsSectionHeader('LC', 'LIMITE DE CREDITO SUGERIDO');
    pos.y += 4;

    checkPageBreak(40);

    // Classificação banner
    const bannerBg = lc.classificacao === 'APROVADO' ? [220, 252, 231] as [number,number,number]
      : lc.classificacao === 'CONDICIONAL' ? [254, 243, 199] as [number,number,number]
      : [254, 226, 226] as [number,number,number];
    doc.setFillColor(...bannerBg);
    doc.rect(margin, pos.y, contentW, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...lcColor);
    const bannerText = lc.classificacao === 'REPROVADO'
      ? 'NAO ELEGIVEL — Criterio eliminatorio nao atendido'
      : lc.classificacao === 'CONDICIONAL'
        ? `APROVACAO CONDICIONAL — Limite de ${fmtM(lc.limiteAjustado)} (reduzido 30%)`
        : `APROVADO — Limite de ${fmtM(lc.limiteAjustado)}`;
    doc.text(bannerText, margin + 4, pos.y + 6.5);
    pos.y += 14;

    if (lc.classificacao !== 'REPROVADO') {
      // Details grid: 4 items
      const cols = [
        { label: 'PRAZO MAXIMO', value: lc.prazo + ' dias' },
        { label: 'REVISAO EM', value: new Date(lc.dataRevisao).toLocaleDateString('pt-BR') },
        { label: 'CONC. MAX/SACADO', value: fmtM(lc.limiteConcentracao) },
        { label: 'BASE (FMM x FATOR)', value: `${fmtM(lc.fmmBase)} x ${lc.fatorBase}` },
      ];
      const cellW = contentW / 4;
      cols.forEach((col, i) => {
        const cx = margin + i * cellW;
        doc.setFillColor(248, 250, 252);
        doc.rect(cx, pos.y, cellW - 1, 16, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(col.label, cx + 3, pos.y + 5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...lcColor);
        doc.text(col.value, cx + 3, pos.y + 12);
      });
      pos.y += 20;
    }

    // Note line
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    const noteText = lc.classificacao === 'REPROVADO'
      ? `Perfil: ${lc.presetName} — revise os criterios eliminatorios antes de prosseguir.`
      : `Perfil: ${lc.presetName} | Base: FMM ${fmtM(lc.fmmBase)} x ${lc.fatorBase} = ${fmtM(lc.limiteBase)}${lc.fatorReducao < 1 ? ` | Fator reducao: ${Math.round((1 - lc.fatorReducao) * 100)}%` : ''}`;
    doc.text(noteText, margin + 2, pos.y + 3);
    pos.y += 8;
  }

  // ===== SEÇÃO 01 — CARTAO CNPJ (flui se couber na página) =====
  drawSpacer(10);
  checkPageBreak(120);

  dsSectionHeader("01", "CARTAO CNPJ");

  // ── Hero: Razão Social + CNPJ + Badge Situação ───────────────────────────
  {
    const heroH = 24;
    const situ = (data.cnpj.situacaoCadastral || "").toUpperCase();
    const situOk = situ.includes("ATIVA");
    const situColor: [number,number,number] = situOk ? [22,163,74] : [220,38,38];
    const situBg:    [number,number,number] = situOk ? [220,252,231] : [254,226,226];

    // Fundo navy com borda esquerda colorida
    doc.setFillColor(26, 46, 74);
    doc.rect(margin, pos.y, contentW, heroH, "F");
    doc.setFillColor(...situColor);
    doc.rect(margin, pos.y, 3.5, heroH, "F");

    // Razão Social
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const rzStr = data.cnpj.razaoSocial || "—";
    const rzLines = doc.splitTextToSize(rzStr, contentW - 68) as string[];
    doc.text(rzLines[0], margin + 8, pos.y + 10);
    if (rzLines[1]) {
      doc.setFontSize(9);
      doc.text(rzLines[1], margin + 8, pos.y + 17);
    }

    // Nome Fantasia abaixo (se diferente)
    const nf = data.cnpj.nomeFantasia;
    if (nf && nf.toLowerCase() !== (data.cnpj.razaoSocial || "").toLowerCase()) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(160, 185, 220);
      doc.text(`"${nf}"`, margin + 8, pos.y + 21);
    }

    // CNPJ label (bottom-left)
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 165, 210);
    doc.text("CNPJ: " + (data.cnpj.cnpj || "—"), margin + 8, pos.y + (nf ? 21 : 20));

    // Badge de situação (right)
    const bw = 44; const bh = 11;
    const bx = margin + contentW - bw - 5;
    const by = pos.y + (heroH - bh) / 2;
    doc.setFillColor(...situBg);
    doc.roundedRect(bx, by, bw, bh, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...situColor);
    const situLabel = situ || "N/D";
    doc.text(situLabel.length > 12 ? situLabel.substring(0,12) + "…" : situLabel, bx + bw / 2, by + 7.5, { align: "center" });

    pos.y += heroH + 5;
  }

  // ── Linha 1: 4 métricas principais ───────────────────────────────────────
  {
    const mgGap = 3;
    const mgW = (contentW - mgGap * 3) / 4;
    const mgH = 19;
    checkPageBreak(mgH + 4);
    const capitalSocial = data.qsa?.capitalSocial || "";
    const mg1 = [
      { label: "Data de Abertura",  value: data.cnpj.dataAbertura || "—",    border: DS.colors.info     as [number,number,number] },
      { label: "Natureza Jurídica", value: data.cnpj.naturezaJuridica || "—", border: DS.colors.borderStrong as [number,number,number] },
      { label: "Porte",             value: data.cnpj.porte || "—",            border: DS.colors.borderStrong as [number,number,number] },
      { label: "Capital Social",    value: capitalSocial ? `R$ ${fmtMoney(capitalSocial)}` : "—", border: DS.colors.success as [number,number,number] },
    ];
    mg1.forEach((item, i) => {
      dsMetricCard(margin + i * (mgW + mgGap), pos.y, mgW, mgH, item.label, item.value, undefined, item.border);
    });
    pos.y += mgH + 4;
  }

  // ── Linha 2: dados complementares (se existirem) ─────────────────────────
  {
    const tipoEmp = data.cnpj.tipoEmpresa || "";
    const func    = data.cnpj.funcionarios || "";
    const regime  = data.cnpj.regimeTributario || "";
    const tel     = data.cnpj.telefone || "";
    const email   = data.cnpj.email || "";
    const dataSitu = data.cnpj.dataSituacaoCadastral || "";
    const items2 = [
      tipoEmp   ? { label: "Tipo Empresa",       value: tipoEmp }   : null,
      func      ? { label: "Funcionários",        value: func }      : null,
      regime    ? { label: "Regime Tributário",   value: regime }    : null,
      tel       ? { label: "Telefone",            value: tel }       : null,
      email     ? { label: "E-mail",              value: email }     : null,
      dataSitu  ? { label: "Data da Situação",    value: dataSitu }  : null,
    ].filter(Boolean) as { label: string; value: string }[];

    if (items2.length > 0) {
      const n = Math.min(items2.length, 4);
      const mgGap2 = 3;
      const mgW2   = (contentW - mgGap2 * (n - 1)) / n;
      const mgH2   = 17;
      checkPageBreak(mgH2 + 4);
      items2.slice(0, n).forEach((item, i) => {
        dsMetricCard(margin + i * (mgW2 + mgGap2), pos.y, mgW2, mgH2, item.label, item.value, undefined, DS.colors.borderStrong);
      });
      pos.y += mgH2 + 4;
    }
  }

  // ── Endereço principal + Street View inline ───────────────────────────────
  {
    const hasStreetView = !!p.streetViewBase64;
    const svW    = hasStreetView ? 58 : 0;
    const svGap  = hasStreetView ? 4 : 0;
    const endW   = contentW - svW - svGap;
    const endVal = data.cnpj.endereco || "—";
    const endMinH = hasStreetView ? 46 : 18;

    checkPageBreak(endMinH + 6);

    // Card de endereço
    const endLines = doc.splitTextToSize(endVal, endW - 10) as string[];
    const endBoxH  = Math.max(endMinH, endLines.length * 4.5 + 14);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, pos.y, endW, endBoxH, 2, 2, "F");
    doc.setDrawColor(...DS.colors.borderRGB);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, pos.y, endW, endBoxH, 2, 2, "D");
    doc.setLineWidth(0.1);
    // Borda esquerda verde
    doc.setFillColor(...DS.colors.accentRGB);
    doc.rect(margin, pos.y, 3, endBoxH, "F");

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textMuted);
    doc.text("ENDEREÇO PRINCIPAL", margin + 7, pos.y + 5.5);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.textPrimary);
    endLines.forEach((line, i) => doc.text(line, margin + 7, pos.y + 11 + i * 5));

    // Street View ao lado
    if (hasStreetView) {
      const svX = margin + endW + svGap;
      // Header stripe
      doc.setFillColor(26, 46, 74);
      doc.rect(svX, pos.y, svW, 8, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("ESTABELECIMENTO — STREET VIEW", svX + svW / 2, pos.y + 5.2, { align: "center" });
      doc.addImage(p.streetViewBase64!, "JPEG", svX, pos.y + 8, svW, endBoxH - 8);
    }

    pos.y += endBoxH + 4;
  }

  // ── Endereços adicionais ─────────────────────────────────────────────────
  {
    const endExtras: string[] = data.cnpj.enderecos || [];
    if (endExtras.length > 1) {
      endExtras.slice(1).forEach((end, idx) => {
        checkPageBreak(10);
        const el = doc.splitTextToSize(end, contentW - 8) as string[];
        const eh = Math.max(9, el.length * 4.5 + 6);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, pos.y, contentW, eh, 1, 1, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DS.colors.textMuted);
        doc.text(`ENDEREÇO ${idx + 2}`, margin + 4, pos.y + 3.5);
        doc.setFontSize(7);
        doc.setTextColor(...DS.colors.textPrimary);
        doc.text(el, margin + 4, pos.y + 7);
        pos.y += eh + 2;
      });
    }
  }

  // ── CNAEs Secundários (compacto) ─────────────────────────────────────────
  {
    const cnaesRaw = data.cnpj.cnaeSecundarios || "";
    const cnaesStr = Array.isArray(cnaesRaw) ? (cnaesRaw as string[]).join("; ") : String(cnaesRaw);
    if (cnaesStr.trim() !== "") {
      const cl = doc.splitTextToSize(cnaesStr, contentW - 8) as string[];
      const ch = cl.length * 4 + 14;
      checkPageBreak(ch + 2);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, pos.y, contentW, ch, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text("CNAES SECUNDÁRIOS", margin + 4, pos.y + 5);
      doc.setFontSize(7);
      doc.setTextColor(...DS.colors.textPrimary);
      cl.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + 10 + i * 4));
      pos.y += ch + 2;
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
    drawAlertBox("Contrato Social com alterações societárias recentes — verificar impacto na estrutura de controle", "MODERADA");
  }

  if (data.contrato.objetoSocial) {
    const _lineH = 5;
    const _paddingTop = 10; // altura da área de label
    const _paddingBot = 4;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const _lines = doc.splitTextToSize(data.contrato.objetoSocial, contentW - 8) as string[];
    const _boxH = _paddingTop + _lines.length * _lineH + _paddingBot;
    checkPageBreak(_boxH + 4);
    // Caixa única cobrindo label + texto
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, contentW, _boxH, 1, 1, "F");
    // Label
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("OBJETO SOCIAL", margin + 4, pos.y + 5);
    // Texto — começa após o label, dentro da caixa
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    _lines.forEach((line: string, i: number) => {
      doc.text(line, margin + 4, pos.y + _paddingTop + 3 + i * _lineH);
    });
    pos.y += _boxH + 4;
  }
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
  // Usa nova página só se não há espaço suficiente para o cabeçalho + tabela inicial
  drawSpacer(6);
  if (pos.y > 215) { // menos de 60mm restantes na página
    newPage();
    drawHeader();
  }

  // Section header bar — Gestao e Grupo Economico
  dsSectionHeader("04", "GESTAO E GRUPO ECONOMICO");

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
      doc.text("QUADRO SOCIETÁRIO", margin, pos.y + 4);
      pos.y += 8;

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
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(4.8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
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
        if (pos.y + gRowH > 275) { newPage(); drawHeader(); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, gRowH, "F");

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
        doc.text(nomeT, gxR + 2, pos.y + 4.5);
        gxR += gColNome;

        doc.setTextColor(...colors.textSec);
        doc.text(s.cpfCnpj || "—", gxR + 2, pos.y + 4.5);
        gxR += gColCpf;

        doc.setTextColor(...colors.text);
        doc.text(s.participacao || "—", gxR + gColPart - 1, pos.y + 4.5, { align: "right" });
        gxR += gColPart;

        doc.text(toAbbrev(scrTotal), gxR + gColScr - 1, pos.y + 4.5, { align: "right" });
        gxR += gColScr;

        doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrVencido), gxR + gColVenc - 1, pos.y + 4.5, { align: "right" });
        gxR += gColVenc;

        doc.setTextColor(...(hasPrej ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrPrejuizo), gxR + gColPrej - 1, pos.y + 4.5, { align: "right" });
        gxR += gColPrej;

        doc.setTextColor(...colors.textMuted);
        doc.text("—", gxR + gColProt - 1, pos.y + 4.5, { align: "right" });
        gxR += gColProt;
        doc.text("—", gxR + gColProc - 1, pos.y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);

        pos.y += gRowH;
      });
      pos.y += 6;
    }
  }

  // ── Tabela Empresas Vinculadas ──
  {
    const empresasGrupo = data.grupoEconomico?.empresas || [];

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text("EMPRESAS VINCULADAS (GRUPO ECONÔMICO)", margin, pos.y + 4);
    pos.y += 8;

    if (empresasGrupo.length === 0) {
      checkPageBreak(10);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, pos.y, contentW, 8, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text("Nenhuma empresa vinculada identificada", margin + 4, pos.y + 5.5);
      pos.y += 10;
    } else {
      const geNome = contentW * 0.30;
      const geCnpj = contentW * 0.18;
      const geSit  = contentW * 0.12;
      const geVia  = contentW * 0.22;
      const gePart = contentW * 0.10;
      // geRelacao — resto (contentW * 0.08)
      const geRowH = 7;

      const geNeeded = 6 + empresasGrupo.length * geRowH + 8;
      checkPageBreak(geNeeded);

      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      let ex = margin;
      doc.text("RAZÃO SOCIAL", ex + 2, pos.y + 4); ex += geNome;
      doc.text("CNPJ", ex + 2, pos.y + 4); ex += geCnpj;
      doc.text("SITUAÇÃO", ex + 2, pos.y + 4); ex += geSit;
      doc.text("VIA SÓCIO", ex + 2, pos.y + 4); ex += geVia;
      doc.text("PARTICIPAÇÃO", ex + gePart - 1, pos.y + 4, { align: "right" }); ex += gePart;
      doc.text("RELAÇÃO", margin + contentW - 1, pos.y + 4, { align: "right" });
      pos.y += 6;

      empresasGrupo.forEach((emp, idx) => {
        if (pos.y + geRowH > 275) { newPage(); drawHeader(); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, geRowH, "F");

        let ex2 = margin;
        doc.setFontSize(4.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.text);
        // splitTextToSize para não vazar à direita — pega só a 1ª linha se caber em geNome - 4mm
        const nomeLines = doc.splitTextToSize(emp.razaoSocial || "—", geNome - 4) as string[];
        doc.text(nomeLines[0] + (nomeLines.length > 1 ? "…" : ""), ex2 + 2, pos.y + 4.5);
        ex2 += geNome;

        doc.setTextColor(...colors.textSec);
        doc.text(emp.cnpj || "—", ex2 + 2, pos.y + 4.5); ex2 += geCnpj;

        // Situação com cor
        const sit = (emp.situacao || "—").toUpperCase();
        const sitColor: [number, number, number] = sit === "ATIVA" ? [22, 163, 74] : sit === "BAIXADA" ? [220, 38, 38] : [217, 119, 6];
        doc.setTextColor(...sitColor);
        doc.setFont("helvetica", "bold");
        doc.text(sit, ex2 + 2, pos.y + 4.5); ex2 += geSit;

        // Via sócio
        doc.setFont("helvetica", "normal");
        doc.setFontSize(4.3);
        doc.setTextColor(...colors.textSec);
        const viaLines = doc.splitTextToSize(emp.socioOrigem || "—", geVia - 4) as string[];
        doc.text(viaLines[0] + (viaLines.length > 1 ? "…" : ""), ex2 + 2, pos.y + 4.5); ex2 += geVia;

        doc.setFontSize(4.8);
        doc.setTextColor(...colors.text);
        doc.text(emp.participacao || "—", ex2 + gePart - 1, pos.y + 4.5, { align: "right" }); ex2 += gePart;

        doc.setTextColor(...colors.textMuted);
        doc.text(emp.relacao || "—", margin + contentW - 1, pos.y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);
        pos.y += geRowH;
      });

      pos.y += 4;
    }

    // Bloco de parentesco
    const geParentescosPdf = data.grupoEconomico?.parentescosDetectados || [];
    geParentescosPdf.forEach(pt => {
      drawAlertBox(
        `Possível parentesco entre sócios: ${pt.socio1} e ${pt.socio2}`,
        "MODERADA",
        `Sobrenome em comum: ${pt.sobrenomeComum}`
      );
    });
  }

  // ===== PAGE 3 — FATURAMENTO / SCR =====
  newPage();
  drawHeader();

  // Section header bar — Faturamento / SCR
  dsSectionHeader("04", "FATURAMENTO / SCR");

  // ── Stacked layout ──
  const leftW = contentW;
  const leftX = margin;
  const sectionY = pos.y;
  // Gráfico usa os mesmos 12 meses do FMM
  const chartMeses = mesesFMM;

  // ── LEFT COLUMN: Bar chart ──
  let yLeft = sectionY;

  if (faturamentoRealmenteZerado) {
    pos.y = yLeft;
    drawAlertBox("Faturamento zerado no período — sem receita declarada", "ALTA");
    yLeft = pos.y;
  }
  if ((data.faturamento.meses || []).length > 0 && !data.faturamento.dadosAtualizados) {
    pos.y = yLeft;
    drawAlertBox(`Faturamento desatualizado — último mês com dados: ${data.faturamento.ultimoMesComDados || "N/A"}`, "MODERADA");
    yLeft = pos.y;
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

    // ── Tabela faturamento mensal — 2 colunas para maximizar densidade ──
    yLeft += 6;
    const tbl2RowH = 5.2;
    const tbl2HdrH = 6;
    const tbl2ColW  = (leftW - 4) / 2;         // largura de cada bloco col

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.headerBg);
    doc.text("FATURAMENTO MENSAL DETALHADO", leftX, yLeft);
    yLeft += 5;
    checkPageBreak(20);

    // Cabeçalhos das duas colunas
    const drawTbl2Header = (cx: number) => {
      doc.setFillColor(...DS.colors.headerBg);
      doc.rect(cx, yLeft, tbl2ColW, tbl2HdrH, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("MÊS",             cx + 2,          yLeft + 4.2);
      doc.text("FATURAMENTO (R$)", cx + tbl2ColW - 2, yLeft + 4.2, { align: "right" });
    };
    drawTbl2Header(leftX);
    drawTbl2Header(leftX + tbl2ColW + 4);
    yLeft += tbl2HdrH;

    const midIdx  = Math.ceil(validMeses.length / 2);
    const colA    = validMeses.slice(0, midIdx);
    const colB    = validMeses.slice(midIdx);
    const maxRows = Math.max(colA.length, colB.length);

    const drawTbl2Row = (cx: number, mes: { mes: string; valor: string } | null, idx: number) => {
      const bg: [number,number,number] = idx % 2 === 0 ? [235, 243, 255] : [247, 251, 255];
      doc.setFillColor(...bg);
      doc.rect(cx, yLeft, tbl2ColW, tbl2RowH, "F");
      if (!mes) return;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(parseMesLabel(mes.mes), cx + 2, yLeft + 3.6);
      const valNum = parseMoneyToNumber(mes.valor || "0");
      const valColor: [number,number,number] = valNum === 0 ? DS.colors.warn : DS.colors.textPrimary;
      doc.setTextColor(...valColor);
      doc.text(mes.valor || "—", cx + tbl2ColW - 2, yLeft + 3.6, { align: "right" });
      doc.setDrawColor(210, 225, 250);
      doc.setLineWidth(0.15);
      doc.line(cx, yLeft + tbl2RowH, cx + tbl2ColW, yLeft + tbl2RowH);
      doc.setLineWidth(0.1);
    };

    for (let i = 0; i < maxRows; i++) {
      if (yLeft + tbl2RowH > 275) { doc.addPage(); drawHeader(); yLeft = pos.y + 4; }
      drawTbl2Row(leftX,              colA[i] ?? null, i);
      drawTbl2Row(leftX + tbl2ColW + 4, colB[i] ?? null, i);
      yLeft += tbl2RowH;
    }
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
    pos.y = yLeft;
    drawDetAlerts(alertasFat);
    yLeft = pos.y;
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

  // ── Tabela SCR Redesenhada — EVOLUÇÃO SCR ──
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

    // Col widths
    const cLabel = contentW * 0.38;
    const cAnt   = contentW * 0.19;
    const cAt    = contentW * 0.19;

    const scrRowH  = 7;
    const grpRowH  = 5.5;

    // Var string: "+X,X%" / "-X,X%" / "=" / "—" — sem setas (helvetica não suporta unicode)
    const buildVar = (atRaw: number, antRaw: number, positiveIsGood: boolean): { str: string; color: [number,number,number] } => {
      if (antRaw === 0) return { str: "—", color: [160,160,160] };
      const diff = atRaw - antRaw;
      if (Math.abs(diff / antRaw) < 0.001) return { str: "=  0%", color: [160,160,160] };
      const pct = (diff / antRaw) * 100;
      const str = (pct > 0 ? "+" : "") + fmtBR(pct, 1) + "%";
      const isGood = (diff > 0 && positiveIsGood) || (diff < 0 && !positiveIsGood);
      return { str, color: isGood ? [22,163,74] : [220,38,38] };
    };

    type DataRow = { type:"data"; label: string; antVal: string; atVal: string; antRaw: number; atRaw: number; positiveIsGood: boolean; bold?: boolean; skipVar?: boolean };
    type GrpRow  = { type:"group"; label: string };
    type ScrRow  = DataRow | GrpRow;

    const allRows: ScrRow[] = [
      { type:"group", label:"CARTEIRA" },
      { type:"data", label:"Em Dia",          antVal: toKu(data.scrAnterior?.emDia),              atVal: toKu(data.scr.emDia),              antRaw: parseMoneyToNumber(data.scrAnterior?.emDia||"0"),              atRaw: parseMoneyToNumber(data.scr.emDia||"0"),              positiveIsGood: true  },
      { type:"data", label:"Curto Prazo",      antVal: toKu(data.scrAnterior?.carteiraCurtoPrazo), atVal: toKu(data.scr.carteiraCurtoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraCurtoPrazo||"0"), atRaw: parseMoneyToNumber(data.scr.carteiraCurtoPrazo||"0"), positiveIsGood: false },
      { type:"data", label:"Longo Prazo",      antVal: toKu(data.scrAnterior?.carteiraLongoPrazo), atVal: toKu(data.scr.carteiraLongoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraLongoPrazo||"0"), atRaw: parseMoneyToNumber(data.scr.carteiraLongoPrazo||"0"), positiveIsGood: false },
      { type:"data", label:"A Vencer (total)", antVal: toKu(data.scrAnterior?.carteiraAVencer),    atVal: toKu(data.scr.carteiraAVencer),    antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraAVencer||"0"),    atRaw: parseMoneyToNumber(data.scr.carteiraAVencer||"0"),    positiveIsGood: false },
      { type:"group", label:"INADIMPLÊNCIA" },
      { type:"data", label:"Total Dívidas",   antVal: toKu(data.scrAnterior?.totalDividasAtivas), atVal: toKu(data.scr.totalDividasAtivas), antRaw: parseMoneyToNumber(data.scrAnterior?.totalDividasAtivas||"0"), atRaw: parseMoneyToNumber(data.scr.totalDividasAtivas||"0"), positiveIsGood: false, bold: true },
      { type:"data", label:"Vencidos",         antVal: toKu(data.scrAnterior?.vencidos),           atVal: toKu(data.scr.vencidos),           antRaw: parseMoneyToNumber(data.scrAnterior?.vencidos||"0"),           atRaw: parseMoneyToNumber(data.scr.vencidos||"0"),           positiveIsGood: false },
      { type:"data", label:"Prejuízos",        antVal: toKu(data.scrAnterior?.prejuizos),          atVal: toKu(data.scr.prejuizos),          antRaw: parseMoneyToNumber(data.scrAnterior?.prejuizos||"0"),          atRaw: parseMoneyToNumber(data.scr.prejuizos||"0"),          positiveIsGood: false },
      { type:"group", label:"CAPACIDADE BANCÁRIA" },
      { type:"data", label:"Limite de Crédito", antVal: toKu(data.scrAnterior?.limiteCredito),      atVal: toKu(data.scr.limiteCredito),      antRaw: parseMoneyToNumber(data.scrAnterior?.limiteCredito||"0"),      atRaw: parseMoneyToNumber(data.scr.limiteCredito||"0"),      positiveIsGood: true  },
      { type:"data", label:"Nº Instituições",  antVal: data.scrAnterior?.qtdeInstituicoes||data.scrAnterior?.numeroIfs||"—", atVal: data.scr.qtdeInstituicoes||data.scr.numeroIfs||"—", antRaw: parseFloat(data.scrAnterior?.qtdeInstituicoes||data.scrAnterior?.numeroIfs||"0")||0, atRaw: parseFloat(data.scr.qtdeInstituicoes||data.scr.numeroIfs||"0")||0, positiveIsGood: true },
      { type:"data", label:"Nº Operações",     antVal: data.scrAnterior?.qtdeOperacoes||"—",   atVal: data.scr.qtdeOperacoes||"—",   antRaw: parseFloat(data.scrAnterior?.qtdeOperacoes||"0")||0,   atRaw: parseFloat(data.scr.qtdeOperacoes||"0")||0,   positiveIsGood: true  },
      { type:"group", label:"RESUMO" },
      { type:"data", label:"Alavancagem / FMM", antVal: alavAntU, atVal: alavAtU, antRaw: 0, atRaw: 0, positiveIsGood: false, skipVar: true, bold: true },
    ];

    // Remove linhas de dados onde ambos atual e anterior são "—" (sem informação)
    // Mantém grupos mesmo se todas as linhas do grupo forem removidas? Não — filtramos grupos vazios.
    const filteredRows: ScrRow[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.type === "group") {
        // Verifica se o próximo grupo tem pelo menos uma linha de dados visível
        let hasData = false;
        for (let j = i + 1; j < allRows.length; j++) {
          if (allRows[j].type === "group") break;
          const dr = allRows[j] as DataRow;
          if (!(dr.atVal === "—" && dr.antVal === "—")) { hasData = true; break; }
        }
        if (hasData) filteredRows.push(row);
      } else {
        const dr = row as DataRow;
        if (!(dr.atVal === "—" && dr.antVal === "—")) filteredRows.push(row);
      }
    }

    const scrTableTitle = hasAnterior
      ? `EVOLUÇÃO SCR — ${periodoAnt}  »  ${periodoAt}`
      : `POSIÇÃO SCR — ${periodoAt}`;

    const dataRowCount = filteredRows.filter(r => r.type === "data").length;
    const grpRowCount  = filteredRows.filter(r => r.type === "group").length;
    const scrNeeded = 16 + grpRowCount * grpRowH + dataRowCount * scrRowH + 4;
    if (yRight + scrNeeded > 220) {
      doc.addPage();
      drawHeader();
      currentSCRPage = doc.getCurrentPageInfo().pageNumber;
      yRight = 35;
    }

    // Título
    yRight += 4;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(scrTableTitle, margin, yRight + 4.5);
    yRight += 6;
    doc.setFontSize(5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...colors.textMuted);
    doc.text("Saldos em mil R$ extraidos do Banco Central (SCR/Bacen). Variação: verde = melhora, vermelho = piora.", margin, yRight + 4);
    yRight += 6;

    // Header da tabela
    doc.setFillColor(...colors.navy);
    doc.rect(margin, yRight, contentW, 7, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("MÉTRICA", margin + 3, yRight + 4.8);
    if (hasAnterior) {
      doc.text(periodoAnt, margin + cLabel + cAnt - 2, yRight + 4.8, { align: "right" });
      doc.text(periodoAt,  margin + cLabel + cAnt + cAt - 2, yRight + 4.8, { align: "right" });
      doc.text("VARIAÇÃO", margin + contentW - 2, yRight + 4.8, { align: "right" });
    } else {
      doc.text(periodoAt, margin + contentW - 2, yRight + 4.8, { align: "right" });
    }
    yRight += 8;

    let dataIdx = 0;
    filteredRows.forEach((row) => {
      if (row.type === "group") {
        // Linha separadora de grupo
        if (yRight + grpRowH > 275) { doc.addPage(); drawHeader(); currentSCRPage = doc.getCurrentPageInfo().pageNumber; yRight = 25; }
        doc.setFillColor(240, 244, 252);
        doc.rect(margin, yRight, contentW, grpRowH, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 138);
        doc.text(row.label, margin + 3, yRight + 3.8);
        // linha accent esquerda
        doc.setFillColor(30, 58, 138);
        doc.rect(margin, yRight, 2, grpRowH, "F");
        yRight += grpRowH;
      } else {
        const dr = row as DataRow;
        if (yRight + scrRowH > 275) { doc.addPage(); drawHeader(); currentSCRPage = doc.getCurrentPageInfo().pageNumber; yRight = 25; }

        const bg: [number,number,number] = dataIdx % 2 === 0 ? [255,255,255] : [248,250,252];
        doc.setFillColor(...bg);
        doc.rect(margin, yRight, contentW, scrRowH, "F");

        // Label
        doc.setFontSize(6.5);
        doc.setFont("helvetica", dr.bold ? "bold" : "normal");
        doc.setTextColor(...(dr.bold ? colors.text : [60,70,90] as [number,number,number]));
        doc.text((dr.bold ? "  " : "    ") + dr.label, margin + 2, yRight + 4.8);

        if (hasAnterior) {
          // Anterior (acinzentado)
          doc.setFont("helvetica", "normal");
          doc.setTextColor(140, 150, 165);
          doc.text(dr.antVal, margin + cLabel + cAnt - 2, yRight + 4.8, { align: "right" });

          // Atual (destaque)
          doc.setFont("helvetica", dr.bold ? "bold" : "normal");
          doc.setTextColor(...colors.text);
          doc.text(dr.atVal, margin + cLabel + cAnt + cAt - 2, yRight + 4.8, { align: "right" });

          // Variação
          if (!dr.skipVar) {
            const { str, color } = buildVar(dr.atRaw, dr.antRaw, dr.positiveIsGood);
            doc.setFont("helvetica", dr.bold ? "bold" : "normal");
            doc.setTextColor(...color);
            doc.text(str, margin + contentW - 2, yRight + 4.8, { align: "right" });
          } else {
            doc.setTextColor(140, 150, 165);
            doc.text(dr.atVal !== "—" ? dr.atVal : "—", margin + contentW - 2, yRight + 4.8, { align: "right" });
          }
        } else {
          doc.setFont("helvetica", dr.bold ? "bold" : "normal");
          doc.setTextColor(...colors.text);
          doc.text(dr.atVal, margin + contentW - 2, yRight + 4.8, { align: "right" });
        }

        // Divider
        doc.setDrawColor(225, 230, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, yRight + scrRowH, margin + contentW, yRight + scrRowH);
        yRight += scrRowH;
        dataIdx++;
      }
    });
    yRight += 4;
  }

  // Advance pos.y past SCR
  if (doc.getCurrentPageInfo().pageNumber < currentSCRPage) {
    doc.setPage(currentSCRPage);
  }
  pos.y = yRight + 6;

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
      const vColLabel = contentW * 0.35;
      const vColData  = (contentW - vColLabel) / vencEntities.length;
      const vRowH     = 5.5;

      // Detecta se há detalhamento por faixa em alguma entidade
      const hasFaixaBreakdown = vencEntities.some(e =>
        faixaKeys.some(k => parseMoneyToNumber((e.aVencer as Record<string,string> | undefined)?.[k] || "0") > 0
                         || parseMoneyToNumber((e.vencidos as Record<string,string> | undefined)?.[k] || "0") > 0)
      );

      const totalRows = hasFaixaBreakdown
        ? 1 + 6 + 1 + 1 + 6 + 1   // header + faixas aVencer + total + sep + faixas vencidos + total
        : 1 + 2;                    // header + total aVencer + total vencido
      const vNeeded = 10 + 6 + totalRows * vRowH + 4;

      drawSpacer(6);
      checkPageBreak(vNeeded);

      // Título
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      doc.text("SCR VENCIMENTOS", margin, pos.y + 4);
      pos.y += 5;
      doc.setFontSize(5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text(
        hasFaixaBreakdown
          ? "Distribuicao da carteira por prazo — valores em mil R$ (extraidos do documento SCR enviado)."
          : "Detalhamento por faixa nao disponivel — valores totais extraidos do SCR/Bacen.",
        margin, pos.y + 4
      );
      pos.y += 7;

      // Cabeçalho
      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(hasFaixaBreakdown ? "FAIXA" : "POSIÇÃO", margin + 2, pos.y + 4);
      vencEntities.forEach((ent, i) => {
        doc.text(ent.label, margin + vColLabel + i * vColData + vColData / 2, pos.y + 4, { align: "center" });
      });
      pos.y += 6;

      const fmtV = (v: string) => {
        const n = parseMoneyToNumber(v || "0");
        if (n === 0) return "—";
        return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
      };

      let vIdx = 0;
      const drawVRow = (
        label: string,
        vals: string[],
        opts: { bold?: boolean; sectionBg?: "blue" | "red"; summaryBg?: "blue" | "red" } = {}
      ) => {
        if (pos.y + vRowH > 275) { newPage(); drawHeader(); }

        if (opts.sectionBg) {
          const isBlue = opts.sectionBg === "blue";
          doc.setFillColor(...(isBlue ? [22, 78, 140] as [number,number,number] : [185, 28, 28] as [number,number,number]));
          doc.rect(margin, pos.y, contentW, vRowH, "F");
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(label, margin + 2, pos.y + 3.8);
          pos.y += vRowH;
          vIdx = 0;
          return;
        }

        if (opts.summaryBg) {
          const isBlue = opts.summaryBg === "blue";
          doc.setFillColor(...(isBlue ? [215, 237, 255] as [number,number,number] : [255, 220, 220] as [number,number,number]));
          doc.rect(margin, pos.y, contentW, vRowH, "F");
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "bold");
          const summaryColor = isBlue ? colors.primary : [185, 28, 28] as [number,number,number];
          doc.setTextColor(...summaryColor);
          doc.text(label, margin + 2, pos.y + 3.8);
          vals.forEach((v, i) => {
            doc.setTextColor(...summaryColor);
            doc.text(fmtV(v), margin + vColLabel + i * vColData + vColData - 1, pos.y + 3.8, { align: "right" });
          });
          doc.setTextColor(...colors.text);
          pos.y += vRowH;
          return;
        }

        const isVencida = opts.bold === false && vals.some(v => parseMoneyToNumber(v) > 0);
        doc.setFillColor(...(vIdx % 2 === 0 ? [248, 250, 252] as [number,number,number] : [255, 255, 255] as [number,number,number]));
        doc.rect(margin, pos.y, contentW, vRowH, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textSec);
        doc.text(label, margin + 2, pos.y + 3.8);
        vals.forEach((v, i) => {
          const display = fmtV(v);
          const hasVal = display !== "—";
          doc.setTextColor(...(isVencida && hasVal ? [185, 28, 28] as [number,number,number] : hasVal ? colors.text : colors.textMuted));
          doc.text(display, margin + vColLabel + i * vColData + vColData - 1, pos.y + 3.8, { align: "right" });
        });
        doc.setTextColor(...colors.text);
        pos.y += vRowH;
        vIdx++;
      };

      if (hasFaixaBreakdown) {
        // Detalhamento completo por faixa
        drawVRow("A VENCER", [], { sectionBg: "blue" });
        faixaKeys.forEach(key => {
          const vals = vencEntities.map(e => (e.aVencer as Record<string,string> | undefined)?.[key] || "0,00");
          if (vals.some(v => parseMoneyToNumber(v) > 0)) {
            drawVRow(faixaKeyLabels[key], vals);
          }
        });
        drawVRow("Total a Vencer", vencEntities.map(e => e.totalAVencer), { summaryBg: "blue" });

        drawVRow("VENCIDOS", [], { sectionBg: "red" });
        faixaKeys.forEach(key => {
          const vals = vencEntities.map(e => (e.vencidos as Record<string,string> | undefined)?.[key] || "0,00");
          if (vals.some(v => parseMoneyToNumber(v) > 0)) {
            drawVRow(faixaKeyLabels[key], vals, { bold: false });
          }
        });
        drawVRow("Total Vencido", vencEntities.map(e => e.totalVencido), { summaryBg: "red" });
      } else {
        // Apenas totais quando faixas não disponíveis
        drawVRow("Total a Vencer", vencEntities.map(e => e.totalAVencer), { summaryBg: "blue" });
        drawVRow("Total Vencido",  vencEntities.map(e => e.totalVencido),  { summaryBg: "red"  });
      }

      pos.y += 4;

      if (!data.scrSocios || data.scrSocios.length === 0) {
        doc.setFontSize(5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...colors.textMuted);
        doc.text("* SCR dos socios nao enviado — apenas dados da empresa exibidos.", margin, pos.y);
        pos.y += 6;
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
    if (pos.y + modPJNeeded > 275) { newPage(); drawHeader(); } else { pos.y += 4; }

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    const razaoFull = data.cnpj?.razaoSocial || "Empresa";
    const cnpjFmt = (data.cnpj?.cnpj || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    doc.text(`MODALIDADES SCR — ${razaoFull} — ${cnpjFmt}`, margin, pos.y + 4, { maxWidth: contentW });
    pos.y += 8;

    const modColNomePJ = contentW * 0.32;
    const modColGrpPJ = (contentW - modColNomePJ) / (temAntPJ ? 2 : 1);
    const modSubColsPJ = [modColGrpPJ / 4, modColGrpPJ / 4, modColGrpPJ / 4, modColGrpPJ / 4];

    // Grupo de períodos
    doc.setFillColor(...colors.navy);
    doc.rect(margin, pos.y, contentW, 6, "F");
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    if (temAntPJ) {
      doc.text(periodoAnt, margin + modColNomePJ + modColGrpPJ / 2, pos.y + 4, { align: "center" });
      doc.text(periodoAt, margin + modColNomePJ + modColGrpPJ + modColGrpPJ / 2, pos.y + 4, { align: "center" });
    } else {
      doc.text(periodoAt, margin + modColNomePJ + modColGrpPJ / 2, pos.y + 4, { align: "center" });
    }
    pos.y += 6;

    // Sub-cabeçalho
    doc.setFillColor(50, 70, 110);
    doc.rect(margin, pos.y, contentW, 5, "F");
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("MODALIDADE", margin + 2, pos.y + 3.5);

    const drawPJSubHeader = (startX: number) => {
      doc.text("TOTAL", startX + modSubColsPJ[0] - 1, pos.y + 3.5, { align: "right" });
      doc.text("A VENCER", startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, pos.y + 3.5, { align: "right" });
      doc.text("VENCIDO", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, pos.y + 3.5, { align: "right" });
      doc.text("PART.", startX + modColGrpPJ - 1, pos.y + 3.5, { align: "right" });
    };
    if (temAntPJ) drawPJSubHeader(margin + modColNomePJ);
    drawPJSubHeader(margin + modColNomePJ + (temAntPJ ? modColGrpPJ : 0));
    pos.y += 5;

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
        doc.text("—", startX + modSubColsPJ[0] - 1, pos.y + 4, { align: "right" });
        doc.text("—", startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, pos.y + 4, { align: "right" });
        doc.text("—", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, pos.y + 4, { align: "right" });
        doc.text("—", startX + modColGrpPJ - 1, pos.y + 4, { align: "right" });
      } else {
        const hasVencPJ = mod.vencido && mod.vencido !== "0,00" && mod.vencido !== "—";
        doc.setTextColor(...colors.text);
        doc.text(toKPJ(mod.total), startX + modSubColsPJ[0] - 1, pos.y + 4, { align: "right" });
        doc.text(toKPJ(mod.aVencer), startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, pos.y + 4, { align: "right" });
        doc.setTextColor(...(hasVencPJ ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(hasVencPJ ? toKPJ(mod.vencido) : "—", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, pos.y + 4, { align: "right" });
        doc.setTextColor(...colors.textSec);
        doc.text(mod.participacao || "—", startX + modColGrpPJ - 1, pos.y + 4, { align: "right" });
      }
    };

    let bgIdxPJ = 0;
    let separadorRendered = false;

    orderedModPJ.forEach((m) => {
      // Linha separadora antes das contingentes
      if (m.ehContingente && !separadorRendered) {
        separadorRendered = true;
        if (pos.y + modPJRowH + 1 > 275) { newPage(); drawHeader(); }
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, pos.y, contentW, modPJRowH, "F");
        doc.setFontSize(4.8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...colors.textMuted);
        doc.text("Responsabilidades contingentes / Títulos fora da carteira", margin + 2, pos.y + 4);
        pos.y += modPJRowH;
        bgIdxPJ = 0;
      }

      if (pos.y + modPJRowH > 275) { newPage(); drawHeader(); }
      const bg: [number, number, number] = bgIdxPJ % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(...bg);
      doc.rect(margin, pos.y, contentW, modPJRowH, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.text);
      const nomeT = m.nome.length > 38 ? m.nome.substring(0, 37) + "…" : m.nome;
      doc.text(nomeT, margin + 2, pos.y + 4);

      if (temAntPJ) {
        drawPJCells(margin + modColNomePJ, modPJAnt.find(a => a.nome === m.nome));
        drawPJCells(margin + modColNomePJ + modColGrpPJ, m);
      } else {
        drawPJCells(margin + modColNomePJ, m);
      }
      doc.setTextColor(...colors.text);
      pos.y += modPJRowH;
      bgIdxPJ++;
    });
    pos.y += 4;
  }

  if (data.scr.instituicoes && data.scr.instituicoes.length > 0) {
    drawSpacer(4);
    checkPageBreak(8 + 8 + data.scr.instituicoes.length * 10 + 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text("INSTITUICOES CREDORAS", margin, pos.y + 4);
    pos.y += 8;
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

      pos.y += 6;

      // Header do sócio
      doc.setFillColor(...colors.primary);
      doc.roundedRect(margin, pos.y, contentW, 7, 1, 1, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(
        `SCR SÓCIO — ${socio.nomeSocio || socio.cpfSocio}`,
        margin + 3,
        pos.y + 4.8
      );
      pos.y += 9;

      // Tabela comparativa igual à da empresa
      const temAnteriorSocio = !!(socio.periodoAnterior?.periodoReferencia);
      const periodoAtSocio = socio.periodoAtual?.periodoReferencia || "Atual";
      const periodoAntSocio = socio.periodoAnterior?.periodoReferencia || "Anterior";

      // Cabeçalho da tabela
      doc.setFillColor(...colors.primary);
      doc.roundedRect(margin, pos.y, contentW, 6, 1, 1, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);

      const colMetrica = contentW * 0.40;
      const colAt = contentW * 0.22;
      const colAnt = contentW * 0.22;
      const colVar = contentW * 0.16;
      void colVar;

      doc.text("MÉTRICA", margin + 2, pos.y + 4);
      doc.text(periodoAtSocio, margin + colMetrica + 2, pos.y + 4);
      if (temAnteriorSocio) {
        doc.text(periodoAntSocio, margin + colMetrica + colAt + 2, pos.y + 4);
        doc.text("VAR.", margin + colMetrica + colAt + colAnt + 2, pos.y + 4);
      }
      pos.y += 6;

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
        doc.rect(margin, pos.y, contentW, 5.5, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", (linha as { bold?: boolean }).bold ? "bold" : "normal");
        doc.setTextColor(...colors.text);
        doc.text(linha.label, margin + 2, pos.y + 3.8);
        doc.text(linha.at, margin + colMetrica + 2, pos.y + 3.8);

        if (temAnteriorSocio) {
          doc.text(linha.ant, margin + colMetrica + colAt + 2, pos.y + 3.8);

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
            doc.text(varStr, margin + colMetrica + colAt + colAnt + 2, pos.y + 3.8);
            doc.setTextColor(...colors.text);
          } else {
            doc.setTextColor(...colors.textMuted);
            doc.text("—", margin + colMetrica + colAt + colAnt + 2, pos.y + 3.8);
            doc.setTextColor(...colors.text);
          }
        }
        pos.y += 5.5;
      });

      // Modalidades do sócio — comparativo
      if (socio.periodoAtual?.modalidades && socio.periodoAtual.modalidades.length > 0) {
        const modS = socio.periodoAtual.modalidades;
        const modSAnt = socio.periodoAnterior?.modalidades || [];
        const modSRowH = 6;
        const modSNeeded = 8 + 6 + 6 + modS.length * modSRowH + 4;
        checkPageBreak(modSNeeded);
        pos.y += 4;

        const labelMod = `MODALIDADES — ${(socio.nomeSocio || socio.cpfSocio || "Sócio").split(" ").slice(0, 2).join(" ")}`;
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(labelMod, margin, pos.y + 4);
        pos.y += 7;

        // Grupo de período anterior e atual
        const temAntMod = modSAnt.length > 0 && !!socio.periodoAnterior?.periodoReferencia;
        const modColNome = contentW * 0.32;
        const modColGrp = (contentW - modColNome) / (temAntMod ? 2 : 1);
        const modSubCols = [modColGrp / 4, modColGrp / 4, modColGrp / 4, modColGrp / 4];

        // Cabeçalho — grupo de períodos
        doc.setFillColor(...colors.navy);
        doc.rect(margin, pos.y, contentW, 6, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        if (temAntMod) {
          const midAnt = margin + modColNome + modColGrp / 2;
          const midAt = margin + modColNome + modColGrp + modColGrp / 2;
          doc.text(periodoAtSocio, midAt, pos.y + 4, { align: "center" });
          doc.text(periodoAntSocio, midAnt, pos.y + 4, { align: "center" });
        } else {
          doc.text(periodoAtSocio, margin + modColNome + modColGrp / 2, pos.y + 4, { align: "center" });
        }
        pos.y += 6;

        // Sub-cabeçalho — colunas
        doc.setFillColor(50, 70, 110);
        doc.rect(margin, pos.y, contentW, 5, "F");
        doc.setFontSize(4.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("MODALIDADE", margin + 2, pos.y + 3.5);

        const drawModSubHeader = (startX: number) => {
          doc.text("TOTAL", startX + modSubCols[0] - 1, pos.y + 3.5, { align: "right" });
          doc.text("A VENCER", startX + modSubCols[0] + modSubCols[1] - 1, pos.y + 3.5, { align: "right" });
          doc.text("VENCIDO", startX + modSubCols[0] + modSubCols[1] + modSubCols[2] - 1, pos.y + 3.5, { align: "right" });
          doc.text("PART.", startX + modColGrp - 1, pos.y + 3.5, { align: "right" });
        };
        if (temAntMod) drawModSubHeader(margin + modColNome);
        drawModSubHeader(margin + modColNome + (temAntMod ? modColGrp : 0));
        pos.y += 5;

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
              doc.text(v, cx, pos.y + 4, { align: "right" });
            });
          } else {
            const hasVenc = mod.vencido && mod.vencido !== "0,00" && mod.vencido !== "—";
            doc.setTextColor(...colors.text);
            doc.text(toKS(mod.total), startX + modSubCols[0] - 1, pos.y + 4, { align: "right" });
            doc.text(toKS(mod.aVencer), startX + modSubCols[0] + modSubCols[1] - 1, pos.y + 4, { align: "right" });
            doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
            doc.text(hasVenc ? toKS(mod.vencido) : "—", startX + modSubCols[0] + modSubCols[1] + modSubCols[2] - 1, pos.y + 4, { align: "right" });
            doc.setTextColor(...colors.textSec);
            doc.text(mod.participacao || "—", startX + modColGrp - 1, pos.y + 4, { align: "right" });
          }
        };

        let bgIdxS = 0;
        let sepRenderedS = false;

        orderedModS.forEach((m) => {
          if (m.ehContingente && !sepRenderedS) {
            sepRenderedS = true;
            if (pos.y + modSRowH > 275) { newPage(); drawHeader(); }
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, pos.y, contentW, modSRowH, "F");
            doc.setFontSize(4.8);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...colors.textMuted);
            doc.text("Responsabilidades contingentes / Títulos fora da carteira", margin + 2, pos.y + 4);
            pos.y += modSRowH;
            bgIdxS = 0;
          }
          if (pos.y + modSRowH > 275) { newPage(); drawHeader(); }
          const bg: [number, number, number] = bgIdxS % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          doc.setFillColor(...bg);
          doc.rect(margin, pos.y, contentW, modSRowH, "F");
          doc.setFontSize(5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          const nomeT = m.nome.length > 38 ? m.nome.substring(0, 37) + "…" : m.nome;
          doc.text(nomeT, margin + 2, pos.y + 4);

          if (temAntMod) {
            drawModCells(margin + modColNome, modSAnt.find(a => a.nome === m.nome));
            drawModCells(margin + modColNome + modColGrp, m);
          } else {
            drawModCells(margin + modColNome, m);
          }
          doc.setTextColor(...colors.text);
          pos.y += modSRowH;
          bgIdxS++;
        });
        pos.y += 4;
      }

      pos.y += 4;
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
    doc.rect(margin, pos.y, contentW, 7, "F");
    doc.setFontSize(dreFontSz);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("METRICA", margin + 2, pos.y + 4.8);
    dreAnos.forEach((ano, i) => {
      doc.text(ano.ano, margin + dreColLabel + i * dreColAno + 2, pos.y + 4.8);
    });
    pos.y += 7;

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
      doc.rect(margin, pos.y, contentW, 6, "F");
      // Borda bottom sutil
      doc.setDrawColor(...DS.colors.borderRGB);
      doc.setLineWidth(0.15);
      doc.line(margin, pos.y + 6, margin + contentW, pos.y + 6);
      doc.setLineWidth(0.1);
      doc.setFontSize(dreFontSz);
      doc.setFont("helvetica", linha.bold ? "bold" : "normal");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(linha.label, margin + 2, pos.y + 4.2);
      dreAnos.forEach((ano, i) => {
        const val = (ano as unknown as Record<string, string>)[linha.campo] || "0,00";
        const numVal = parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
        const display = linha.isPct ? `${val}%` : `R$ ${fmtMoney(val)}`;
        // Cor semântica: negativo = danger, zero/ausente = textLight2, positivo = padrão
        let valColor: [number,number,number] = DS.colors.textPrimary;
        if (linha.isPct) {
          if (numVal < 0) valColor = DS.colors.danger;
          else if (numVal === 0) valColor = DS.colors.textLight2;
        } else {
          if (numVal < 0) valColor = DS.colors.danger;
          else if (numVal === 0) valColor = DS.colors.textLight2;
        }
        doc.setTextColor(...valColor);
        doc.text(display, margin + dreColLabel + i * dreColAno + 2, pos.y + 4.2);
        doc.setTextColor(...DS.colors.textPrimary);
      });
      pos.y += 6;
    });

    // Tendência
    pos.y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.primary);
    const tendenciaDRE = normalizeTendencia(data.dre.tendenciaLucro);
    doc.text(`Tendencia: ${tendenciaDRE} | Crescimento de Receita: ${data.dre.crescimentoReceita}%`, margin + 2, pos.y);
    pos.y += 6;

    if (data.dre.observacoes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(...colors.textMuted);
      const obsLines = doc.splitTextToSize(data.dre.observacoes, contentW - 4);
      obsLines.forEach((l: string) => { doc.text(l, margin + 2, pos.y); pos.y += 4; });
    }
    // Alertas determinísticos — DRE
    if (alertasDRE.length > 0) { pos.y += 4; drawDetAlerts(alertasDRE); }
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
    doc.rect(margin, pos.y, contentW, 7, "F");
    doc.setFontSize(balFontSz);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("METRICA", margin + 2, pos.y + 4.8);
    balAnos.forEach((ano, i) => {
      doc.text(ano.ano, margin + colLabelB + i * colAnoB + 2, pos.y + 4.8);
    });
    pos.y += 7;

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
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setDrawColor(...DS.colors.borderRGB);
      doc.setLineWidth(0.15);
      doc.line(margin, pos.y + 6, margin + contentW, pos.y + 6);
      doc.setLineWidth(0.1);
      doc.setFontSize(balFontSz);
      doc.setFont("helvetica", linha.bold ? "bold" : "normal");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(linha.label, margin + 2, pos.y + 4.2);
      balAnos.forEach((ano, i) => {
        const val = (ano as unknown as Record<string, string>)[linha.campo] || "0,00";
        const valClean = String(val).replace(/%/g, "").trim();
        const display = linha.isIndice ? (val && val !== "0,00" ? `${val}x` : "—") : linha.isPct ? `${valClean}%` : `R$ ${fmtMoney(val)}`;
        const numVal = parseFloat(valClean.replace(/\./g, '').replace(',', '.')) || 0;
        // Cor semântica: PL negativo, liquidez < 1 = perigo
        let valColor: [number,number,number] = DS.colors.textPrimary;
        if (numVal < 0) valColor = DS.colors.danger;
        else if (numVal === 0 && display === "—") valColor = DS.colors.textLight2;
        else if (linha.isIndice && numVal < 1 && numVal > 0) valColor = DS.colors.warn;
        else if (linha.campo === 'liquidezCorrente' && numVal < 1 && numVal > 0) valColor = DS.colors.warn;
        doc.setTextColor(...valColor);
        doc.text(display, margin + colLabelB + i * colAnoB + 2, pos.y + 4.2);
        doc.setTextColor(...DS.colors.textPrimary);
      });
      pos.y += 6;
    });
    // Alertas determinísticos — Balanço
    if (alertasBalanco.length > 0) { pos.y += 4; drawDetAlerts(alertasBalanco); }
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
      // Sanitiza maiorClientePct — extrai só a parte numérica antes do primeiro %
      const rawPct = String(data.curvaABC.maiorClientePct || "");
      const cleanPct = rawPct.includes("%") ? rawPct.split("%")[0].trim() : rawPct.replace(/[^0-9,.]/g, "");
      const nomeCliente = String(data.curvaABC.maiorCliente || "Cliente").split(/[!'\[]/)[0].trim();

      const BADGE_W = 9; const BADGE_H = 3.8;
      const ACCENT = 2; const PAD_H = 3; const PAD_L = 4;
      const textX = margin + ACCENT + PAD_L + BADGE_W + 2.5;
      const textMaxW = contentW - ACCENT - PAD_L - BADGE_W - 4;
      const ctxX = margin + ACCENT + PAD_L;
      const ctxMaxW = contentW - ACCENT - PAD_L - 2;

      // Split com fonte correta já ativa
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
      const linhaPrincipal = `${nomeCliente} — ${cleanPct}% da receita total`;
      const mainLines = doc.splitTextToSize(linhaPrincipal, textMaxW) as string[];

      doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
      const linhaContexto = `Limite: 30%  ·  Período: ${data.curvaABC.periodoReferencia || "—"}`;
      const ctxLines = doc.splitTextToSize(linhaContexto, ctxMaxW) as string[];

      const mainLineH = 4; const ctxLineH = 3.8;
      const alertaH = PAD_H + BADGE_H + 1.5 + ctxLines.length * ctxLineH + PAD_H;
      checkPageBreak(alertaH + 2);

      // Fundo
      doc.setFillColor(255, 245, 245);
      doc.rect(margin, pos.y, contentW, alertaH, "F");
      // Borda esquerda fina
      doc.setFillColor(220, 38, 38);
      doc.rect(margin, pos.y, ACCENT, alertaH, "F");

      const bx = margin + ACCENT + PAD_L;
      const by = pos.y + PAD_H;

      // Badge compacto "ALTA"
      doc.setFillColor(220, 38, 38);
      doc.roundedRect(bx, by, BADGE_W, BADGE_H, 0.8, 0.8, "F");
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setCharSpace(0.3);
      doc.setTextColor(255, 255, 255);
      doc.text("ALTA", bx + BADGE_W / 2, by + BADGE_H - 0.9, { align: "center" });

      // Texto principal alinhado ao centro do badge
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
      doc.setTextColor(153, 27, 27);
      const mainBaseline = by + BADGE_H - 0.9;
      mainLines.forEach((line: string, i: number) => {
        doc.text(line, textX, mainBaseline + i * mainLineH);
      });

      // Linha de contexto abaixo
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setCharSpace(0);
      doc.setTextColor(185, 28, 28);
      const ctxY = by + BADGE_H + 1.5;
      ctxLines.forEach((line: string, i: number) => {
        doc.text(line, ctxX, ctxY + i * ctxLineH);
      });

      pos.y += alertaH + 2;
    }

    // Resumo de concentração
    const top10Txt = data.curvaABC.concentracaoTop10 && data.curvaABC.concentracaoTop10 !== "0,00"
      ? `   |   Top 10: ${data.curvaABC.concentracaoTop10}%` : "";
    const classeATxt = data.curvaABC.totalClientesClasseA
      ? `   |   Classe A: ${data.curvaABC.totalClientesClasseA} clientes (R$ ${fmtMoney(data.curvaABC.receitaClasseA)})` : "";
    const resumoTexto = `Periodo: ${data.curvaABC.periodoReferencia || "—"}   |   Top 3: ${data.curvaABC.concentracaoTop3}%   |   Top 5: ${data.curvaABC.concentracaoTop5}%${top10Txt}   |   Total clientes: ${data.curvaABC.totalClientesNaBase || "—"}${classeATxt}`;
    // Fonte definida ANTES do split para que o cálculo de quebra use o mesmo tamanho de render
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    const resumoLines = doc.splitTextToSize(resumoTexto, contentW - 4);
    // pos.y é a posição do topo — adiciona offset de baseline para não sobrepor elemento anterior
    doc.text(resumoLines, margin + 2, pos.y);
    pos.y += resumoLines.length * 5 + 4;

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
      { label: 'Vigentes R$',     value: protestosNaoConsultados ? 'N/C' : (vigQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.vigentesValor)}` : '—'),   border: vigQtdP > 0 ? DS.colors.danger  : DS.colors.success, valColor: vigQtdP > 0 ? DS.colors.danger  : DS.colors.textLight2  },
      { label: 'Regularizados Qtd', value: protestosNaoConsultados ? 'N/C' : String(regQtdP),                                                       border: regQtdP > 0 ? DS.colors.success : DS.colors.borderRGB,  valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textPrimary },
      { label: 'Regularizados R$',  value: protestosNaoConsultados ? 'N/C' : (regQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.regularizadosValor)}` : '—'), border: regQtdP > 0 ? DS.colors.success : DS.colors.borderRGB, valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textLight2 },
    ];
    kpiDataP.forEach((k, i) => {
      dsMetricCard(margin + i * (kpiWP + kpiGapP), pos.y, kpiWP, kpiHP, k.label, k.value, undefined, k.border, k.valColor);
    });
    pos.y += kpiHP + 4;
  }

  // ── BLOCO 1b — Processos Judiciais (polo ativo/passivo) como contexto de risco ──
  {
    const procTotalSint  = parseInt(data.processos?.passivosTotal  || "0");
    const poloAtivoSint  = parseInt(data.processos?.poloAtivoQtd   || "0");
    const poloPassivoSint = parseInt(data.processos?.poloPassivoQtd || "0");
    const temFalSint     = !!data.processos?.temFalencia;
    if (procTotalSint > 0 || temFalSint) {
      checkPageBreak(22);
      const kpiGapP2 = 3;
      const kpiWP2   = (contentW - kpiGapP2 * 3) / 4;
      const kpiHP2   = 20;
      const procKpis = [
        { label: "Processos Judiciais",  value: String(procTotalSint),   border: procTotalSint  > 0 ? ([217,119,6] as [number,number,number]) : DS.colors.borderRGB, valColor: procTotalSint  > 0 ? ([217,119,6] as [number,number,number]) : DS.colors.textPrimary },
        { label: "Polo Ativo (Autor)",   value: poloAtivoSint > 0 ? String(poloAtivoSint)   : "—", border: [59,130,246] as [number,number,number], valColor: [29,78,216] as [number,number,number] },
        { label: "Polo Passivo (Réu)",   value: poloPassivoSint > 0 ? String(poloPassivoSint) : "—", border: poloPassivoSint > 0 ? DS.colors.danger : DS.colors.borderRGB, valColor: poloPassivoSint > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: "Falência / RJ",        value: temFalSint ? "ALERTA" : (data.processos?.temRJ ? "RJ" : "—"), border: (temFalSint || data.processos?.temRJ) ? DS.colors.danger : DS.colors.borderRGB, valColor: (temFalSint || data.processos?.temRJ) ? DS.colors.danger : DS.colors.textLight2 },
      ];
      procKpis.forEach((k, i) => {
        dsMetricCard(margin + i * (kpiWP2 + kpiGapP2), pos.y, kpiWP2, kpiHP2, k.label, k.value, undefined, k.border, k.valColor);
      });
      pos.y += kpiHP2 + 4;
    }
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
    doc.roundedRect(margin, pos.y, contentW, 10, 1, 1, "F");
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Nenhum protesto identificado", margin + 8, pos.y + 6.5);
    pos.y += 14;
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

      const yDistStart = pos.y;
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
        doc.setTextColor(...(b.qtd > 0 ? DS.colors.danger : DS.colors.textLight2));
        doc.text(b.qtd > 0 ? fmtProt(b.valor) : '—', margin + colWD - 1, yL + 4, { align: 'right' });
        doc.setDrawColor(...DS.colors.borderRGB);
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
        doc.setTextColor(...(b.qtd > 0 ? DS.colors.textPrimary : DS.colors.textLight2));
        doc.text(b.qtd > 0 ? fmtProt(b.valor) : '—', cx2 + colWD - 1, yR + 4, { align: 'right' });
        doc.setDrawColor(...DS.colors.borderRGB);
        doc.line(cx2, yR + rowHD, cx2 + colWD, yR + rowHD);
        yR += rowHD;
      });

      pos.y = Math.max(yL, yR) + 4;
    }

    // Helper: draw protestos detail table via autoT (jspdf-autotable)
    const protWidths  = [28, contentW - 28 - 38 - 22, 38, 22];
    const drawProtTable = (rows: typeof protestoDetalhes) => {
      checkPageBreak(6.5 + rows.length * 6 + 2);
      autoT(
        ["Data", "Credor / Apresentante", "Valor (R$)", "Regularizado"],
        rows.map((p) => {
          const regLabel = p.regularizado ? "Sim" : "Não";
          const valColor: [number,number,number] = p.regularizado ? DS.colors.successText : DS.colors.danger;
          const regColor: [number,number,number] = p.regularizado ? DS.colors.successText : DS.colors.danger;
          return [
            p.data || "—",
            [p.credor || p.apresentante || "—", p.especie ? ` (${p.especie})` : ""].join(""),
            { content: p.valor || "—", styles: { textColor: valColor } },
            { content: regLabel, styles: { textColor: regColor } },
          ];
        }),
        protWidths,
      );
    };

    // Detecta se o bureau retornou detalhes reais ou apenas localidades
    const semDetalhesReais = protestoDetalhes.every(p => !p.data && !p.apresentante && parseProt(p.valor || "0") === 0);

    if (semDetalhesReais) {
      // ── BLOCO 4 (simplificado) — Locais dos Protestos ──
      drawSpacer(4);
      checkPageBreak(16);
      pos.y = dsMiniHeader(pos.y, 'LOCAIS DOS PROTESTOS');
      drawProtTable(protestoDetalhes.slice(0, 10));

      // Nota de limitação do bureau
      checkPageBreak(10);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text("* Detalhes (valor, data, apresentante) nao disponiveis no plano atual do Credit Hub — confirmar diretamente nos cartorios.", margin, pos.y);
      pos.y += 7;
    } else {
      // ── BLOCO 4 — Top 10 Mais Recentes ──
      drawSpacer(4);
      checkPageBreak(16);
      pos.y = dsMiniHeader(pos.y, 'TOP 10 MAIS RECENTES');
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
      pos.y = dsMiniHeader(pos.y, 'TOP 10 POR VALOR');
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

  // ── BLOCO 1 — KPI Cards ──
  {
    checkPageBreak(52);
    const kpiGapQ = 3;
    const kpiWQ = (contentW - kpiGapQ * 2) / 3;
    const kpiHQ = 20;
    const passivosN  = parseInt(data.processos?.passivosTotal  || '0');
    const poloAtivoN = parseInt(data.processos?.poloAtivoQtd   || '0');
    const poloPassN  = parseInt(data.processos?.poloPassivoQtd || '0');
    const temRJN     = !!data.processos?.temRJ;
    const temFalN    = !!data.processos?.temFalencia;
    const dividasQN  = parseInt(data.processos?.dividasQtd || '0');

    const nc = processosNaoConsultados ? 'N/C' : null;
    const kpiRowsQ = [
      [
        { label: 'Total Processos', value: nc ?? String(passivosN), border: passivosN > 0 ? DS.colors.warn : DS.colors.borderRGB, valColor: passivosN > 0 ? DS.colors.warn : DS.colors.textPrimary },
        { label: 'Polo Ativo (Autor)', value: nc ?? (poloAtivoN > 0 ? String(poloAtivoN) : '—'), border: DS.colors.info, valColor: [59,130,246] as [number,number,number] },
        { label: 'Polo Passivo (Reu)', value: nc ?? (poloPassN > 0 ? String(poloPassN) : '—'), border: poloPassN > 0 ? DS.colors.warn : DS.colors.borderRGB, valColor: poloPassN > 0 ? DS.colors.warn : DS.colors.textPrimary },
      ],
      [
        { label: 'Rec. Judicial / Falencia', value: nc ?? (temFalN ? 'FALENCIA' : temRJN ? 'RJ' : 'Nao'), border: (temFalN || temRJN) ? DS.colors.danger : DS.colors.success, valColor: (temFalN || temRJN) ? DS.colors.danger : DS.colors.success },
        { label: 'Dividas Qtd',   value: nc ?? String(dividasQN), border: dividasQN > 0 ? DS.colors.danger : DS.colors.borderRGB, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: 'Dividas R$',    value: nc ?? (dividasQN > 0 ? `R$ ${fmtMoney(data.processos?.dividasValor)}` : '—'), border: dividasQN > 0 ? DS.colors.danger : DS.colors.borderRGB, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textLight2 },
      ],
    ];
    kpiRowsQ.forEach((row, ri) => {
      row.forEach((k, ci) => {
        dsMetricCard(margin + ci * (kpiWQ + kpiGapQ), pos.y + ri * (kpiHQ + kpiGapQ), kpiWQ, kpiHQ, k.label, k.value, undefined, k.border, k.valColor);
      });
    });
    pos.y += kpiHQ * 2 + kpiGapQ * 2 + 4;
  }

  if (processosNaoConsultados) {
    drawSpacer(4);
    drawBannerNaoConsultado("Processos judiciais");
  } else if (data.processos?.temFalencia) {
    drawAlertBox("PEDIDO DE FALENCIA identificado nos processos judiciais", "ALTA");
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
    doc.roundedRect(margin, pos.y, contentW, 10, 1, 1, "F");
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Nenhum processo judicial identificado", margin + 8, pos.y + 6.5);
    pos.y += 14;
  } else if (!processosNaoConsultados) {
    // Helper: label de seção de processos
    const drawProcLabel = (title: string) => {
      drawSpacer(4);
      checkPageBreak(14);
      pos.y = dsMiniHeader(pos.y, title);
    };

    // Status color helper
    const statusColor = (s: string): [number, number, number] =>
      /arquivado/i.test(s) ? [22, 163, 74] : colors.warning;

    type ProcCell = { text: string; color?: [number, number, number]; bold?: boolean; align?: "left" | "right" };

    // Helper unificado: drawProcAutoTable via autoT (jspdf-autotable)
    const drawProcAutoTable = (headers: string[], cellRows: ProcCell[][], colWidths: number[]) => {
      checkPageBreak(6.5 + cellRows.length * 6 + 2);
      autoT(
        headers,
        cellRows.map(row =>
          row.map(cell =>
            cell.color || cell.bold
              ? { content: cell.text, styles: { textColor: cell.color, fontStyle: cell.bold ? "bold" : "normal" } as Record<string, unknown> }
              : cell.text
          )
        ),
        colWidths,
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
      drawAlertBox(
        `${proc?.passivosTotal} processo(s) identificado(s) — valores e partes não disponíveis no plano atual`,
        "MODERADA",
        "O Credit Hub retornou apenas a contagem e UF dos processos. Solicitar relatório detalhado ou consultar diretamente."
      );
    } else if (parseInt(proc?.passivosTotal || "0") > 0
        && (proc?.top10Valor?.length ?? 0) === 0
        && (proc?.top10Recentes?.length ?? 0) === 0
        && distribuicao.length === 0) {
      drawSpacer(4);
      drawAlertBox(
        `${proc?.passivosTotal} processo(s) identificado(s) — detalhamento não disponível`,
        "MODERADA",
        "Consultar diretamente nos tribunais competentes."
      );
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
        doc.text("OCORRÊNCIAS POR BANCO", margin, pos.y + 4);
        pos.y += 7;

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
        doc.roundedRect(margin, pos.y, contentW, 10, 1, 1, "F");
        doc.setFillColor(22, 163, 74);
        doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text("Nenhuma ocorrência de Cheque sem Fundo identificada", margin + 8, pos.y + 6.5);
        pos.y += 14;
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
      doc.text(`${hist.length} consulta(s) registrada(s) — mostrando as mais recentes`, margin, pos.y + 4);
      pos.y += 7;

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
        doc.line(margin, pos.y, margin + contentW, pos.y);
        pos.y += 6;
      }

      // Header do sócio
      doc.setFillColor(240, 246, 255);
      doc.rect(margin, pos.y, contentW, 8, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text(
        `Sócio ${idx + 1} — ${ir.nomeSocio || "Nome não informado"}`,
        margin + 3,
        pos.y + 5.2
      );
      // CPF e ano base no lado direito
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      const cpfAno = [ir.cpf && `CPF: ${ir.cpf}`, ir.anoBase && `Ano-base: ${ir.anoBase}`]
        .filter(Boolean).join("   |   ");
      if (cpfAno) {
        doc.text(cpfAno, margin + contentW - 3, pos.y + 5.2, { align: "right" });
      }
      pos.y += 10;

      // Tipo do documento
      const tipoLabel = ir.tipoDocumento === "declaracao" ? "Declaração Completa" : "Recibo de Entrega";
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text(`Documento: ${tipoLabel}`, margin + 3, pos.y);
      pos.y += 6;

      // Alertas de malhas e débitos
      if (ir.situacaoMalhas) {
        drawAlertBox(`Sócio ${ir.nomeSocio || ""} — Pendência de malhas fiscais na Receita Federal`.trim(), "ALTA");
      }
      if (ir.debitosEmAberto) {
        const _desc = ir.descricaoDebitos?.trim();
        // Mostra descricaoDebitos como subtitle apenas se for curto e informativo (não o boilerplate longo da RF)
        const _debitosSubtitle = _desc && _desc.length < 100 && !_desc.toLowerCase().includes("constavam débitos") ? _desc : undefined;
        drawAlertBox(
          `Sócio ${ir.nomeSocio || ""} — Débitos em aberto perante a Receita Federal / PGFN`.trim(),
          "ALTA",
          _debitosSubtitle
        );
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
        doc.rect(margin, pos.y, contentW, 6, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", (linha as { label: string; valor: string; bold?: boolean }).bold ? "bold" : "normal");
        doc.setTextColor(...colors.text);
        doc.text(linha.label, margin + 3, pos.y + 4.2);
        doc.text(linha.valor, margin + contentW - 3, pos.y + 4.2, { align: "right" });
        pos.y += 6;
      });

      pos.y += 4;

      // Participação em outras sociedades
      if (ir.temSociedades && ir.sociedades && ir.sociedades.length > 0) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.primary);
        doc.text("Participação em outras sociedades:", margin + 3, pos.y);
        pos.y += 5;
        ir.sociedades.forEach((soc: { razaoSocial?: string; cnpj?: string; participacao?: string }) => {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...colors.text);
          doc.setFontSize(6.5);
          doc.text(
            `• ${soc.razaoSocial || "N/D"}${soc.cnpj ? ` — CNPJ: ${soc.cnpj}` : ""}${soc.participacao ? ` (${soc.participacao})` : ""}`,
            margin + 5,
            pos.y
          );
          pos.y += 4.5;
        });
        pos.y += 3;
      }

      // Indicador de coerência
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      if (ir.coerenciaComEmpresa) {
        doc.setTextColor(22, 163, 74);
        doc.text("✓ Renda compatível com o porte da empresa", margin + 3, pos.y);
      } else {
        doc.setTextColor(220, 38, 38);
        doc.text("⚠ Renda incompatível com o porte da empresa", margin + 3, pos.y);
      }
      pos.y += 6;

      // Observações
      if (ir.observacoes) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.5);
        doc.setTextColor(...colors.textMuted);
        const obsLines = doc.splitTextToSize(ir.observacoes, contentW - 6);
        obsLines.forEach((l: string) => {
          doc.text(l, margin + 3, pos.y);
          pos.y += 4;
        });
        pos.y += 2;
      }
    }

    // Alertas determinísticos — IR Sócios
    if (alertasIR.length > 0) { drawSpacer(4); drawDetAlerts(alertasIR); }

    pos.y += 6;
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
    pos.y += 8; // padding-top após header

    // Cabeçalho da visita
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    doc.text(`Data: ${data.relatorioVisita.dataVisita || "—"}   |   Responsavel: ${data.relatorioVisita.responsavelVisita || "—"}   |   Duracao: ${data.relatorioVisita.duracaoVisita || "—"}`, margin + 2, pos.y);
    pos.y += 6;
    doc.text(`Local: ${data.relatorioVisita.localVisita || "—"}`, margin + 2, pos.y);
    pos.y += 8;

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
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(7);
      const itemColor: [number, number, number] = item.ok ? [22, 163, 74] : [220, 38, 38];
      doc.setTextColor(...itemColor);
      doc.text(item.ok ? "+" : "x", margin + 3, pos.y + 4.2);
      doc.setTextColor(...colors.text);
      doc.text(item.label, margin + 10, pos.y + 4.2);
      pos.y += 6;
    });

    pos.y += 4;

    // Pontos positivos
    if (data.relatorioVisita.pontosPositivos?.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text("Pontos Positivos:", margin + 2, pos.y);
      pos.y += 5;
      data.relatorioVisita.pontosPositivos.forEach((p: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(22, 163, 74);
        doc.text(`+ ${p}`, margin + 4, pos.y);
        pos.y += 4.5;
      });
      pos.y += 2;
    }

    // Pontos de atenção
    if (data.relatorioVisita.pontosAtencao?.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text("Pontos de Atencao:", margin + 2, pos.y);
      pos.y += 5;
      data.relatorioVisita.pontosAtencao.forEach((p: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(220, 38, 38);
        doc.text(`! ${p}`, margin + 4, pos.y);
        pos.y += 4.5;
      });
      pos.y += 2;
    }

    // Recomendação
    pos.y += 4;
    const recCor: [number, number, number] = data.relatorioVisita.recomendacaoVisitante === "aprovado" ? [22, 163, 74] :
      data.relatorioVisita.recomendacaoVisitante === "condicional" ? [234, 179, 8] : [220, 38, 38];
    doc.setFillColor(...recCor);
    doc.roundedRect(margin, pos.y, contentW, 9, 1, 1, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const recTexto = data.relatorioVisita.recomendacaoVisitante === "aprovado" ? "Recomendação do visitante: Aprovado" :
      data.relatorioVisita.recomendacaoVisitante === "condicional" ? "Recomendação do visitante: Condicional" :
        "Recomendação do visitante: Reprovado";
    doc.text(recTexto, margin + 4, pos.y + 6);
    pos.y += 11;

    // Observações livres — espaçamento de 12pt entre bloco recomendação e texto
    if (data.relatorioVisita.observacoesLivres) {
      pos.y += 12;
      checkPageBreak(16);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.textMuted);
      doc.text("Observações:", margin + 2, pos.y);
      pos.y += 6;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...colors.text);
      const obsLines = doc.splitTextToSize(data.relatorioVisita.observacoesLivres, contentW - 6);
      obsLines.forEach((l: string) => { checkPageBreak(5); doc.text(l, margin + 2, pos.y); pos.y += 4.5; });
      pos.y += 4;
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
        doc.rect(margin, pos.y, contentW, 6, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(label, margin + 3, pos.y + 4);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...colors.text);
        doc.text(value || "—", margin + colLW, pos.y + 4, { maxWidth: colRW - 4 });
        pos.y += 6;
      });
      pos.y += 3;
    };

    if (temParamsOp) {
      checkPageBreak(20);
      pos.y += 6;
      pos.y = dsMiniHeader(pos.y, 'PARAMETROS OPERACIONAIS');
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
      pos.y += 2;
      pos.y = dsMiniHeader(pos.y, 'DADOS DA EMPRESA');
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
  {
    const ctx: PdfCtx = { doc, pos, W, margin, contentW, colors, DS, newPage, drawHeader, checkPageBreak, dsSectionHeader, dsMiniHeader, autoT };
    renderParecer(ctx, {
      aiAnalysis, decision, finalRating, resumoExecutivo, pontosFortes, pontosFracos, perguntasVisita,
      observacoes:       p.observacoes,
      data:              p.data,
      vencidosSCR,
      fmmNum,
      protestosVigentes,
      alavancagem,
      validMeses,
    });
  }

  // ── Footer em todas as páginas (exceto capa) ──
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    if (pg === 1) continue; // capa tem seu próprio rodapé

    // Fundo navy profundo
    doc.setFillColor(22, 38, 68);
    doc.rect(0, 284, 210, 13, "F");
    // Linha verde no topo do footer
    doc.setFillColor(...DS.colors.accentRGB);
    doc.rect(0, 284, 210, 1.2, "F");

    // Esquerda: logo + nome
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.accentRGB);
    doc.text("capital", margin, 291);
    const capFW = doc.getTextWidth("capital");
    doc.setTextColor(168, 200, 240);
    doc.text("financas", margin + capFW + 0.8, 291);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 140, 190);
    doc.text("CONSOLIDADOR DE DOCUMENTOS  |  " + footerDateStr + "  |  CONFIDENCIAL", margin, 294.5);

    // Centro: separador vertical + empresa
    if (data.cnpj.razaoSocial) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(130, 160, 205);
      doc.text(data.cnpj.razaoSocial.substring(0, 40), W / 2, 292, { align: "center" });
    }

    // Direita: número de página
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 220, 245);
    doc.text(`${pg}`, W - margin, 290, { align: "right" });
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 140, 190);
    doc.text(`de ${totalPages}`, W - margin, 294, { align: "right" });
  }

  const pdfBlob = doc.output("blob");
  return new Blob([pdfBlob], { type: "application/pdf" });
}
