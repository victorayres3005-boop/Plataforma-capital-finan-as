import type { ExtractedData, AIAnalysis, FundValidationResult } from "@/types";
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
    doc.setFillColor(255, 255, 255);
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

  // ── DS Helpers ──────────────────────────────────────────────────────────

  // Section header: navy bar with number + title, returns new pos.y
  const dsSectionHeader = (num: string, title: string) => {
    checkPageBreak(14);
    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(margin, pos.y, contentW, 10, "F");
    doc.setFillColor(...DS.colors.accent);
    doc.rect(margin, pos.y + 10, contentW, 1.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.accent);
    doc.text(num, margin + 4, pos.y + 6.5);
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(title, margin + 14, pos.y + 6.5);
    pos.y += 13;
  };

  // Left-border card: draws card box, returns nothing (caller manages pos.y)
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
    dsSectionHeader("IDX", "INDICE DOCUMENTAL — DOCUMENTOS ANALISADOS");
    pos.y += 2;

    // Empresa subtitle
    const clEmpresa = [
      data.cnpj?.razaoSocial?.substring(0, 45),
      data.cnpj?.cnpj ? "CNPJ: " + data.cnpj.cnpj : "",
    ].filter(Boolean).join("   |   ");
    if (clEmpresa) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(clEmpresa, W / 2, pos.y, { align: "center" });
      pos.y += 7;
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

    const clGap  = 5;
    const clColW = (contentW - clGap) / 2;
    const clRowH = 8.5;
    const clHdrH = 13;

    const clDrawCol = (
      frente: string,
      subtitle: string,
      hdrBg: [number, number, number],
      items: ClItem[],
      cx: number,
      startY: number
    ): number => {
      // Column header card
      doc.setFillColor(...hdrBg);
      doc.roundedRect(cx, startY, clColW, clHdrH, 1.5, 1.5, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(cx, startY + clHdrH - 1.5, clColW, 1.5, "F");

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(frente, cx + 5, startY + 5.5);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 205, 245);
      doc.text(subtitle, cx + 5, startY + 10);

      let iy = startY + clHdrH + 2;

      items.forEach((item, idx) => {
        const ok = !!clStatus[item.key];
        const rowBg: [number, number, number] = idx % 2 === 0 ? [248, 250, 255] : [255, 255, 255];

        doc.setFillColor(...rowBg);
        doc.rect(cx, iy, clColW, clRowH, "F");
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.15);
        doc.line(cx, iy + clRowH, cx + clColW, iy + clRowH);

        // Status dot
        const dotX = cx + 5.5;
        const dotY = iy + clRowH / 2;
        doc.setFillColor(...(ok ? [22, 163, 74] as [number,number,number] : [209, 213, 219] as [number,number,number]));
        doc.circle(dotX, dotY, 2, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(ok ? "+" : "-", dotX, dotY + 1.8, { align: "center" });

        // Document label
        doc.setFontSize(7);
        doc.setFont("helvetica", ok ? "bold" : "normal");
        doc.setTextColor(...(ok
          ? [17, 24, 39] as [number,number,number]
          : [107, 114, 128] as [number,number,number]));
        doc.text(item.label, cx + 10, iy + clRowH / 2 + 2);

        // Badge (OBR / OPC) — vermelho se obrigatório ausente, âmbar se presente, cinza se opcional
        const missing = item.obrigatorio && !ok;
        const badgeLabel = item.obrigatorio ? "OBR" : "OPC";
        const badgeBg: [number,number,number] = missing
          ? [254, 226, 226]
          : item.obrigatorio
            ? [220, 252, 231]
            : [241, 245, 249];
        const badgeFg: [number,number,number] = missing
          ? [185, 28, 28]
          : item.obrigatorio
            ? [22, 101, 52]
            : [107, 114, 128];
        const bw = 11;
        const bx = cx + clColW - bw - 2;
        const by = iy + (clRowH - 4.5) / 2;
        doc.setFillColor(...badgeBg);
        doc.roundedRect(bx, by, bw, 4.5, 0.8, 0.8, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...badgeFg);
        doc.text(badgeLabel, bx + bw / 2, by + 3.1, { align: "center" });

        iy += clRowH;
      });

      return iy;
    };

    const clStartY = pos.y;
    const clEndY1 = clDrawCol(
      "FRENTE 1",
      "Consolidacao de Documentos — dados financeiros e societarios",
      colors.navy,
      clFrente1,
      margin,
      clStartY
    );
    const clEndY2 = clDrawCol(
      "FRENTE 2",
      "Tomada de Decisao para Credito — risco e historico",
      [42, 58, 92] as [number, number, number],
      clFrente2,
      margin + clColW + clGap,
      clStartY
    );
    pos.y = Math.max(clEndY1, clEndY2) + 6;

    // ── Barra de cobertura documental ─────────────────────────────────────────
    checkPageBreak(24);
    const clTotal    = Object.keys(clStatus).length;
    const clPresent  = Object.values(clStatus).filter(Boolean).length;
    const clPct      = Math.round((clPresent / clTotal) * 100);
    const clNivel    = clPct >= 80 ? "COMPLETA" : clPct >= 50 ? "PARCIAL" : "MINIMA";
    const clNivelClr: [number,number,number] = clPct >= 80
      ? [22, 163, 74]
      : clPct >= 50
        ? [217, 119, 6]
        : [220, 38, 38];

    const clCardH = 22;
    doc.setFillColor(248, 250, 255);
    doc.roundedRect(margin, pos.y, contentW, clCardH, 2, 2, "F");
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, pos.y, contentW, clCardH, 2, 2, "D");
    doc.setLineWidth(0.1);

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("COBERTURA DOCUMENTAL TOTAL", margin + 5, pos.y + 6);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...clNivelClr);
    const clCountStr = `${clPresent}/${clTotal}`;
    doc.text(clCountStr, margin + 5, pos.y + 17);
    const clCountW = doc.getTextWidth(clCountStr);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("documentos analisados", margin + 7 + clCountW, pos.y + 17);

    // Nivel badge (right)
    const clBadgeW = 24;
    doc.setFillColor(...clNivelClr);
    doc.roundedRect(W - margin - clBadgeW - 4, pos.y + (clCardH - 8) / 2, clBadgeW, 8, 1.5, 1.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(clNivel, W - margin - clBadgeW / 2 - 4, pos.y + clCardH / 2 + 2.5, { align: "center" });

    // Progress bar (center)
    const clBarX = margin + 60;
    const clBarW = contentW - 105;
    const clBarH = 4;
    const clBarY = pos.y + 14;
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(clBarX, clBarY, clBarW, clBarH, clBarH / 2, clBarH / 2, "F");
    if (clPct > 0) {
      doc.setFillColor(...clNivelClr);
      doc.roundedRect(clBarX, clBarY, clBarW * (clPct / 100), clBarH, clBarH / 2, clBarH / 2, "F");
    }
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...clNivelClr);
    doc.text(`${clPct}%`, clBarX + clBarW + 3, clBarY + 3.5);

    pos.y += clCardH + 4;
  }

  // ===== PAGE 1b — SINTESE PRELIMINAR =====
  newPage();
  drawHeader();
  dsSectionHeader("00", "SINTESE PRELIMINAR");

  // ── Design tokens ──
  const azulInst:   [number,number,number] = [27, 47, 78];
  const vermelho:   [number,number,number] = [220, 38, 38];
  const amarelo:    [number,number,number] = [217, 119, 6];
  const verde:      [number,number,number] = [22, 163, 74];

  // Cor dinâmica de score
  const scoreColor: [number,number,number] = finalRating >= 7.5 ? verde : finalRating >= 6 ? amarelo : vermelho;

  // ═══════════════════════════════════════════════════
  // BLOCO 1 — Score + Status (largura total, ~28mm)
  // ═══════════════════════════════════════════════════
  {
    checkPageBreak(40);
    const bloco1H = 38;
    const bloco1Y = pos.y;

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

    pos.y = bloco1Y + bloco1H + 5;
  }

  // ── Green accent separator ──
  doc.setFillColor(...colors.accent);
  doc.rect(margin, pos.y, contentW, 0.8, "F");
  pos.y += 5;

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

  // ═══════════════════════════════════════════════════
  // BLOCO 6 — Street View (largura total)
  // ═══════════════════════════════════════════════════
  {
    checkPageBreak(30);
    pos.y += 2;
    doc.setFillColor(...azulInst);
    doc.roundedRect(margin, pos.y, contentW, 7, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("ESTABELECIMENTO — STREET VIEW", margin + 4, pos.y + 4.8);
    pos.y += 9;
    if (p.streetViewBase64) {
      checkPageBreak(52);
      doc.addImage(p.streetViewBase64, "JPEG", margin, pos.y, contentW, 48);
      pos.y += 52;
    } else {
      checkPageBreak(36);
      doc.setFillColor(...DS.colors.zebraRow);
      doc.roundedRect(margin, pos.y, contentW, 28, 2, 2, "F");
      doc.setDrawColor(...DS.colors.border);
      doc.setLineWidth(0.25);
      doc.roundedRect(margin, pos.y, contentW, 28, 2, 2, "D");
      doc.setLineWidth(0.1);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text("Foto não disponível", margin + contentW / 2, pos.y + 15, { align: "center" });
      pos.y += 32;
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


  // ===== SEÇÃO FS — PARAMETROS DO FUNDO =====
  if (p.fundValidation && p.fundValidation.criteria.length > 0) {
    const fv = p.fundValidation;
    drawSpacer(10);

    const fsNeeded = 14 + fv.criteria.length * 10 + 8;
    checkPageBreak(Math.min(fsNeeded, 60));

    // Section header
    dsSectionHeader('FS', 'CONFORMIDADE COM PARAMETROS DO FUNDO');

    // Summary bar
    const summaryBg: [number,number,number] = fv.hasEliminatoria ? [254,226,226] : fv.warnCount > 0 ? [254,243,199] : [220,252,231];
    const summaryTxt: [number,number,number] = fv.hasEliminatoria ? [153,27,27] : fv.warnCount > 0 ? [133,77,14] : [22,101,52];
    doc.setFillColor(...summaryBg);
    doc.rect(margin, pos.y, contentW, 8, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...summaryTxt);
    const summaryText = fv.hasEliminatoria
      ?       : fv.warnCount > 0
        ?         : ;
    doc.text(summaryText, margin + 4, pos.y + 5);
    pos.y += 10;

    // Column headers
    const col1 = margin;
    const col2 = margin + 55;
    const col3 = margin + 105;
    const col4 = margin + 150;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(107, 114, 128);
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, pos.y, contentW, 6, 'F');
    doc.text('CRITERIO', col1 + 10, pos.y + 4);
    doc.text('LIMITE DO FUNDO', col2, pos.y + 4);
    doc.text('APURADO', col3, pos.y + 4);
    doc.text('STATUS', col4, pos.y + 4);
    pos.y += 7;

    // Criterion rows
    fv.criteria.forEach((cr, idx2) => {
      const rowH = 9;
      checkPageBreak(rowH + 1);

      const rowBg: [number,number,number] = cr.status === 'error' ? [255,250,250] : cr.status === 'warning' ? [255,253,244] : idx2 % 2 === 0 ? [255,255,255] : [248,249,250];
      doc.setFillColor(...rowBg);
      doc.rect(margin, pos.y, contentW, rowH, 'F');

      // Left accent strip
      const stripColor: [number,number,number] = cr.status === 'error' ? [220,38,38] : cr.status === 'warning' ? [217,119,6] : cr.status === 'ok' ? [22,163,74] : [156,163,175];
      doc.setFillColor(...stripColor);
      doc.rect(margin, pos.y, 3, rowH, 'F');

      // Status icon text (circle placeholder)
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...stripColor);
      const icon = cr.status === 'ok' ? 'OK' : cr.status === 'warning' ? '!' : cr.status === 'error' ? 'X' : '?';
      doc.text(icon, col1 + 4.5, pos.y + 6);

      // Label
      doc.setFontSize(7);
      doc.setFont('helvetica', cr.status === 'error' ? 'bold' : 'normal');
      doc.setTextColor(17, 24, 39);
      const labelText = cr.eliminatoria && cr.status === 'error' ? cr.label + ' *' : cr.label;
      doc.text(labelText, col1 + 12, pos.y + 6);

      // Threshold
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(cr.threshold, col2, pos.y + 6);

      // Actual
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...stripColor);
      doc.text(cr.actual, col3, pos.y + 6);

      // Status pill text
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      const statusLabel = cr.status === 'ok' ? 'APROVADO' : cr.status === 'warning' ? 'ATENCAO' : cr.status === 'error' ? 'REPROVADO' : 'S/DADO';
      const pillBg: [number,number,number] = cr.status === 'ok' ? [220,252,231] : cr.status === 'warning' ? [254,243,199] : cr.status === 'error' ? [254,226,226] : [243,244,246];
      const pillTxt: [number,number,number] = cr.status === 'ok' ? [22,101,52] : cr.status === 'warning' ? [133,77,14] : cr.status === 'error' ? [153,27,27] : [107,114,128];
      const pw = doc.getTextWidth(statusLabel) + 6;
      doc.setFillColor(...pillBg);
      doc.roundedRect(col4, pos.y + 1.5, pw, 5.5, 1, 1, 'F');
      doc.setTextColor(...pillTxt);
      doc.text(statusLabel, col4 + 3, pos.y + 5.8);

      pos.y += rowH + 1;
    });

    // Eliminatória footnote
    const hasElimNote = fv.criteria.some(c => c.eliminatoria && c.status === 'error');
    if (hasElimNote) {
      pos.y += 2;
      doc.setFontSize(6);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(153, 27, 27);
      doc.text('* Criterio eliminatorio — impede aprovacao pelos parametros do fundo', margin + 3, pos.y);
      pos.y += 4;
    }

    pos.y += 6;
  }


  // ===== SEÇÃO FS — PARAMETROS DO FUNDO =====
  if (p.fundValidation && p.fundValidation.criteria.length > 0) {
    const fv = p.fundValidation;
    drawSpacer(10);
    checkPageBreak(Math.min(14 + fv.criteria.length * 10 + 8, 60));

    // Section header
    dsSectionHeader("FS", "CONFORMIDADE COM PARAMETROS DO FUNDO");

    // Summary bar
    const fsSummaryBg: [number,number,number] = fv.hasEliminatoria ? [254,226,226] : fv.warnCount > 0 ? [254,243,199] : [220,252,231];
    const fsSummaryTxt: [number,number,number] = fv.hasEliminatoria ? [153,27,27] : fv.warnCount > 0 ? [133,77,14] : [22,101,52];
    doc.setFillColor(...fsSummaryBg);
    doc.rect(margin, pos.y, contentW, 8, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...fsSummaryTxt);
    const fsSummaryText = fv.hasEliminatoria
      ? `ATENCAO: criterio eliminatorio nao atendido — ${fv.failCount} reprovado(s), ${fv.passCount} de ${fv.criteria.length} aprovados`
      : fv.warnCount > 0
        ? `${fv.passCount} criterios aprovados · ${fv.warnCount} atencao · ${fv.failCount} reprovado(s)`
        : `Todos os ${fv.passCount} criterios atendidos — empresa elegivel`;
    doc.text(fsSummaryText, margin + 4, pos.y + 5);
    pos.y += 10;

    // Column headers row
    const fsCol1 = margin;
    const fsCol2 = margin + 55;
    const fsCol3 = margin + 112;
    const fsCol4 = margin + 155;
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(107, 114, 128);
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, pos.y, contentW, 6, "F");
    doc.text("CRITERIO", fsCol1 + 12, pos.y + 4);
    doc.text("LIMITE DO FUNDO", fsCol2, pos.y + 4);
    doc.text("APURADO", fsCol3, pos.y + 4);
    doc.text("STATUS", fsCol4, pos.y + 4);
    pos.y += 7;

    // Criterion rows
    fv.criteria.forEach((cr, fsIdx) => {
      const fsRowH = 9;
      checkPageBreak(fsRowH + 1);

      const fsRowBg: [number,number,number] = cr.status === "error" ? [255,250,250] : cr.status === "warning" ? [255,253,244] : fsIdx % 2 === 0 ? [255,255,255] : [248,249,250];
      doc.setFillColor(...fsRowBg);
      doc.rect(margin, pos.y, contentW, fsRowH, "F");

      // Left accent strip
      const fsStripC: [number,number,number] = cr.status === "error" ? [220,38,38] : cr.status === "warning" ? [217,119,6] : cr.status === "ok" ? [22,163,74] : [156,163,175];
      doc.setFillColor(...fsStripC);
      doc.rect(margin, pos.y, 3, fsRowH, "F");

      // Status abbreviation
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...fsStripC);
      const fsIcon = cr.status === "ok" ? "OK" : cr.status === "warning" ? "!" : cr.status === "error" ? "X" : "?";
      doc.text(fsIcon, fsCol1 + 4.5, pos.y + 6);

      // Label
      doc.setFontSize(7);
      doc.setFont("helvetica", cr.status === "error" ? "bold" : "normal");
      doc.setTextColor(17, 24, 39);
      const fsLabelTxt = cr.eliminatoria && cr.status === "error" ? cr.label + " *" : cr.label;
      doc.text(fsLabelTxt, fsCol1 + 12, pos.y + 6);

      // Threshold
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      const fsThreshLines = doc.splitTextToSize(cr.threshold, 52);
      doc.text(fsThreshLines[0], fsCol2, pos.y + 6);

      // Actual value
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...fsStripC);
      doc.text(cr.actual, fsCol3, pos.y + 6);

      // Status pill
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      const fsStatusLabel = cr.status === "ok" ? "APROVADO" : cr.status === "warning" ? "ATENCAO" : cr.status === "error" ? "REPROVADO" : "S/DADO";
      const fsPillBg: [number,number,number] = cr.status === "ok" ? [220,252,231] : cr.status === "warning" ? [254,243,199] : cr.status === "error" ? [254,226,226] : [243,244,246];
      const fsPillTxt: [number,number,number] = cr.status === "ok" ? [22,101,52] : cr.status === "warning" ? [133,77,14] : cr.status === "error" ? [153,27,27] : [107,114,128];
      const fsPw = doc.getTextWidth(fsStatusLabel) + 6;
      doc.setFillColor(...fsPillBg);
      doc.roundedRect(fsCol4, pos.y + 1.5, fsPw, 5.5, 1, 1, "F");
      doc.setTextColor(...fsPillTxt);
      doc.text(fsStatusLabel, fsCol4 + 3, pos.y + 5.8);

      pos.y += fsRowH + 1;
    });

    // Eliminatória footnote
    if (fv.criteria.some(c => c.eliminatoria && c.status === "error")) {
      pos.y += 2;
      doc.setFontSize(6);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(153, 27, 27);
      doc.text("* Criterio eliminatorio — impede aprovacao pelos parametros configurados do fundo", margin + 3, pos.y);
      pos.y += 4;
    }

    pos.y += 6;
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
    doc.roundedRect(margin, pos.y, cnpjColW, rowH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(left.label.toUpperCase(), margin + 4, pos.y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(leftLines, margin + 4, pos.y + 9.5);
    // Right cell
    const rx = margin + cnpjColW + 4;
    doc.setFillColor(...colors.surface);
    doc.roundedRect(rx, pos.y, cnpjColW, rowH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text(right.label.toUpperCase(), rx + 4, pos.y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(rightLines, rx + 4, pos.y + 9.5);
    pos.y += rowH + 2;
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
    doc.roundedRect(margin, pos.y, contentW, endBoxH, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("ENDERECO PRINCIPAL", margin + 4, pos.y + 4.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(endLines, margin + 4, pos.y + 10);
    pos.y += endBoxH + 2;
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
        doc.roundedRect(margin, pos.y, contentW, endBoxH, 1, 1, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.textMuted);
        doc.text(`ENDERECO ${idx + 2}`, margin + 4, pos.y + 3.5);
        doc.setFontSize(7);
        doc.setTextColor(...colors.textSec);
        doc.text(endLines, margin + 4, pos.y + 6);
        pos.y += endBoxH + 2;
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
      doc.roundedRect(margin, pos.y, contentW, cnaesBoxH, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text("CNAES SECUNDARIOS", margin + 4, pos.y + 5);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      cnaesLines.forEach((line: string, i: number) => {
        doc.text(line, margin + 4, pos.y + 11 + i * 4);
      });
      pos.y += cnaesBoxH + 2;
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
      doc.setDrawColor(...DS.colors.border);
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
      doc.setDrawColor(...DS.colors.border);
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
        else if (numVal === 0 && display === "—") valColor = DS.colors.textLight;
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
      { label: 'Vigentes R$',     value: protestosNaoConsultados ? 'N/C' : (vigQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.vigentesValor)}` : '—'),   border: vigQtdP > 0 ? DS.colors.danger  : DS.colors.success, valColor: vigQtdP > 0 ? DS.colors.danger  : DS.colors.textLight  },
      { label: 'Regularizados Qtd', value: protestosNaoConsultados ? 'N/C' : String(regQtdP),                                                       border: regQtdP > 0 ? DS.colors.success : DS.colors.border,  valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textPrimary },
      { label: 'Regularizados R$',  value: protestosNaoConsultados ? 'N/C' : (regQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.regularizadosValor)}` : '—'), border: regQtdP > 0 ? DS.colors.success : DS.colors.border, valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textLight },
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
        { label: "Processos Judiciais",  value: String(procTotalSint),   border: procTotalSint  > 0 ? ([217,119,6] as [number,number,number]) : DS.colors.border, valColor: procTotalSint  > 0 ? ([217,119,6] as [number,number,number]) : DS.colors.textPrimary },
        { label: "Polo Ativo (Autor)",   value: poloAtivoSint > 0 ? String(poloAtivoSint)   : "—", border: [59,130,246] as [number,number,number], valColor: [29,78,216] as [number,number,number] },
        { label: "Polo Passivo (Réu)",   value: poloPassivoSint > 0 ? String(poloPassivoSint) : "—", border: poloPassivoSint > 0 ? DS.colors.danger : DS.colors.border, valColor: poloPassivoSint > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: "Falência / RJ",        value: temFalSint ? "ALERTA" : (data.processos?.temRJ ? "RJ" : "—"), border: (temFalSint || data.processos?.temRJ) ? DS.colors.danger : DS.colors.border, valColor: (temFalSint || data.processos?.temRJ) ? DS.colors.danger : DS.colors.textLight },
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

      pos.y = Math.max(yL, yR) + 4;
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
        { label: 'Total Processos', value: nc ?? String(passivosN), border: passivosN > 0 ? DS.colors.warn : DS.colors.border, valColor: passivosN > 0 ? DS.colors.warn : DS.colors.textPrimary },
        { label: 'Polo Ativo (Autor)', value: nc ?? (poloAtivoN > 0 ? String(poloAtivoN) : '—'), border: DS.colors.info ?? [59,130,246], valColor: [59,130,246] as [number,number,number] },
        { label: 'Polo Passivo (Reu)', value: nc ?? (poloPassN > 0 ? String(poloPassN) : '—'), border: poloPassN > 0 ? DS.colors.warn : DS.colors.border, valColor: poloPassN > 0 ? DS.colors.warn : DS.colors.textPrimary },
      ],
      [
        { label: 'Rec. Judicial / Falencia', value: nc ?? (temFalN ? 'FALENCIA' : temRJN ? 'RJ' : 'Nao'), border: (temFalN || temRJN) ? DS.colors.danger : DS.colors.success, valColor: (temFalN || temRJN) ? DS.colors.danger : DS.colors.success },
        { label: 'Dividas Qtd',   value: nc ?? String(dividasQN), border: dividasQN > 0 ? DS.colors.danger : DS.colors.border, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: 'Dividas R$',    value: nc ?? (dividasQN > 0 ? `R$ ${fmtMoney(data.processos?.dividasValor)}` : '—'), border: dividasQN > 0 ? DS.colors.danger : DS.colors.border, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textLight },
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
    renderParecer(ctx, { aiAnalysis, decision, finalRating, resumoExecutivo, pontosFortes, pontosFracos, perguntasVisita, observacoes: p.observacoes });
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
