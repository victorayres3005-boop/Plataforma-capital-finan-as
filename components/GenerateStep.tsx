"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Pencil, RotateCcw, ArrowRight } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Image from "next/image";
import { buildHTMLReport } from "@/lib/generators/html";
import { buildDOCXReport } from "@/lib/generators/docx";
import { buildExcelReport } from "@/lib/generators/excel";
import { buildPDFReport, generatePDF as generatePDFViaAPI, generateHTMLPreview } from "@/lib/generators/pdf";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { buildCollectionDocs } from "@/lib/buildCollectionDocs";
import { validateReport, type ReportValidation } from "@/lib/validateReport";
import GoalfyButton from "@/components/GoalfyButton";
import AlertList from "@/components/AlertList";
import NotasSection from "@/components/generate/NotasSection";
import VisitaSection from "@/components/generate/VisitaSection";
import ExportSection from "@/components/generate/ExportSection";
import { ExtractedData, CollectionDocument, DocumentCollection, FundSettings, DEFAULT_FUND_SETTINGS, AIAnalysis, FundCriterion, FundValidationResult, CriterionStatus, FundPreset, CreditLimitResult } from "@/types";
import type { OriginalFiles } from "@/components/UploadStep";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SectionCard, KpiCard, StatusPill, CriteriaItem, MetricBarChart, ScrTable, AlertBanner, ResultadoBox } from "@/components/report/ReportComponents";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface GenerateStepProps {
  data: ExtractedData;
  originalFiles?: OriginalFiles;
  onBack: () => void;
  onReset?: () => void;
  onNotify?: (msg: string) => void;
  onFirstCollection?: () => void;
  // Lift do collectionId para o parent — evita duplicacao quando o auto-save
  // do parent ja criou uma coleta antes do GenerateStep montar.
  collectionId?: string | null;
  onCollectionIdChange?: (id: string) => void;
}

// Module-level refs for upload context (set by component)
let _uploadCtx: { userId: string; collectionId: string } | null = null;

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  // Also save to Supabase Storage if we have a collection context
  if (_uploadCtx) {
    uploadFile(_uploadCtx.userId, _uploadCtx.collectionId, "reports", fileName, blob).catch(() => {});
  }
}

// ── Alert & Analysis types ──
type AlertSeverity = "CRÍTICO" | "RESTRITIVO" | "OBSERVAÇÃO";
interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

// ── Data Validation ──
interface ValidationIssue {
  field: string;
  document: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  isValid: boolean;
  canProceed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  coverage: {
    total: number;
    filled: number;
    pct: number;
  };
}

// ── Fund Parameter Validation ──────────────────────────────────────────────

function parseMoney(v: string): number {
  return parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtMoney(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getAgeYears(dataAbertura: string): number | null {
  if (!dataAbertura) return null;
  const parts = dataAbertura.split("/");
  let year: number;
  if (parts.length === 3) {
    year = parseInt(parts[2], 10);
  } else {
    const dash = dataAbertura.split("-");
    year = parseInt(dash[0], 10);
  }
  if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) return null;
  return new Date().getFullYear() - year;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validarContraParametros(data: ExtractedData, settings: FundSettings): FundValidationResult {
  const criteria: FundCriterion[] = [];

  // ── 1. Situação Cadastral ─────────────────────────────────────────────────
  const situacao = data.cnpj.situacaoCadastral?.toUpperCase().trim() || "";
  const situacaoOk = situacao.includes("ATIVA");
  criteria.push({
    id: "situacao",
    label: "Situação Cadastral",
    threshold: "ATIVA",
    actual: situacao || "Não informada",
    status: !situacao ? "unknown" : situacaoOk ? "ok" : "error",
    eliminatoria: true,
    detail: !situacaoOk && situacao ? `Situação: ${situacao}` : undefined,
  });

  // ── 2. FMM Mínimo ──────────────────────────────────────────────────────────
  const fmmStr = data.faturamento.fmm12m || data.faturamento.mediaAno || "";
  const fmmVal = parseMoney(fmmStr);
  const fmmOk = fmmVal >= settings.fmm_minimo;
  criteria.push({
    id: "fmm",
    label: "Faturamento Médio Mensal (FMM)",
    threshold: `≥ ${fmtMoney(settings.fmm_minimo)}/mês`,
    actual: fmmVal > 0 ? `${fmtMoney(fmmVal)}/mês` : "Não informado",
    status: fmmVal === 0 ? "unknown" : fmmOk ? "ok" : "error",
    eliminatoria: true,
    detail: !fmmOk && fmmVal > 0 ? `Déficit: ${fmtMoney(settings.fmm_minimo - fmmVal)}` : undefined,
  });

  // ── 3. Idade Mínima ────────────────────────────────────────────────────────
  const ageYears = getAgeYears(data.cnpj.dataAbertura);
  const idadeOk = ageYears !== null && ageYears >= settings.idade_minima_anos;
  criteria.push({
    id: "idade",
    label: "Idade da Empresa",
    threshold: `≥ ${settings.idade_minima_anos} ano${settings.idade_minima_anos !== 1 ? "s" : ""}`,
    actual: ageYears !== null ? `${ageYears} ano${ageYears !== 1 ? "s" : ""}` : "Não informada",
    status: ageYears === null ? "unknown" : idadeOk ? "ok" : "error",
    eliminatoria: true,
    detail: ageYears !== null && !idadeOk ? `Faltam ${settings.idade_minima_anos - ageYears} ano(s)` : undefined,
  });

  // ── 4. Alavancagem ────────────────────────────────────────────────────────
  const dividaTotal = parseMoney(data.scr.totalDividasAtivas);
  const alavancagem = fmmVal > 0 && dividaTotal > 0 ? dividaTotal / fmmVal : 0;
  const alavStr = fmmVal > 0 && dividaTotal > 0 ? `${alavancagem.toFixed(1)}x FMM` : dividaTotal === 0 ? "Sem dívida" : "Sem FMM";
  const alavStatus: CriterionStatus =
    fmmVal === 0 ? "unknown" :
    dividaTotal === 0 ? "ok" :
    alavancagem <= settings.alavancagem_saudavel ? "ok" :
    alavancagem <= settings.alavancagem_maxima ? "warning" : "error";
  criteria.push({
    id: "alavancagem",
    label: "Alavancagem (Dívida / FMM)",
    threshold: `Saudável ≤ ${settings.alavancagem_saudavel}x · Máx ≤ ${settings.alavancagem_maxima}x`,
    actual: alavStr,
    status: alavStatus,
    eliminatoria: alavStatus === "error",
    detail: alavStatus === "warning" ? "Acima do saudável, dentro do limite máximo" : undefined,
  });

  // ── 5. SCR Vencidos % ─────────────────────────────────────────────────────
  const vencidosVal = parseMoney(data.scr.vencidos);
  const carteira = parseMoney(data.scr.carteiraAVencer) || dividaTotal;
  const vencidosPct = carteira > 0 && vencidosVal > 0 ? (vencidosVal / carteira) * 100 : 0;
  const vencidosStr = carteira > 0
    ? (vencidosVal === 0 ? "0%" : `${vencidosPct.toFixed(1)}% (${fmtMoney(vencidosVal)})`)
    : dividaTotal === 0 ? "Sem dívida" : "Sem carteira";
  const vencidosStatus: CriterionStatus =
    carteira === 0 && dividaTotal === 0 ? "ok" :
    carteira === 0 ? "unknown" :
    vencidosPct <= settings.scr_vencidos_max_pct ? "ok" : "error";
  criteria.push({
    id: "scr_vencidos",
    label: "SCR — Vencidos",
    threshold: `≤ ${settings.scr_vencidos_max_pct}% da carteira`,
    actual: vencidosStr,
    status: vencidosStatus,
    eliminatoria: true,
  });

  // ── 6. Prejuízos SCR ──────────────────────────────────────────────────────
  const prejVal = parseMoney(data.scr.prejuizos);
  criteria.push({
    id: "prejuizos",
    label: "SCR — Prejuízos",
    threshold: "Ausentes (R$ 0)",
    actual: prejVal > 0 ? fmtMoney(prejVal) : "R$ 0",
    status: prejVal > 0 ? "error" : "ok",
    eliminatoria: false,
  });

  // ── 7. Protestos ─────────────────────────────────────────────────────────
  const protestosN = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  const protestosOk = protestosN <= settings.protestos_max;
  criteria.push({
    id: "protestos",
    label: "Protestos Vigentes",
    threshold: `≤ ${settings.protestos_max}`,
    actual: String(protestosN),
    status: protestosOk ? "ok" : "error",
    eliminatoria: true,
    detail: !protestosOk ? `Excede o limite em ${protestosN - settings.protestos_max} protesto(s)` : undefined,
  });

  // ── 8. Processos Passivos ─────────────────────────────────────────────────
  const passivosN = parseInt(data.processos?.passivosTotal || data.processos?.poloPassivoQtd || "0", 10) || 0;
  const passivosOk = passivosN <= settings.processos_passivos_max;
  const passivosStatus: CriterionStatus = passivosN === 0 ? "ok" : passivosOk ? "warning" : "error";
  criteria.push({
    id: "processos",
    label: "Processos Passivos",
    threshold: `≤ ${settings.processos_passivos_max}`,
    actual: String(passivosN),
    status: passivosStatus,
    eliminatoria: false,
    detail: passivosN > 0 && passivosOk ? "Dentro do limite — monitorar" : !passivosOk ? `Excede em ${passivosN - settings.processos_passivos_max}` : undefined,
  });

  // ── 9. Recuperação Judicial ───────────────────────────────────────────────
  const temRJ = data.processos?.temRJ === true;
  criteria.push({
    id: "rj",
    label: "Recuperação Judicial",
    threshold: "Não detectada",
    actual: temRJ ? "ATIVA" : "Não detectada",
    status: temRJ ? "error" : "ok",
    eliminatoria: true,
  });

  const passCount   = criteria.filter(c => c.status === "ok").length;
  const warnCount   = criteria.filter(c => c.status === "warning").length;
  const failCount   = criteria.filter(c => c.status === "error").length;
  const unknownCount = criteria.filter(c => c.status === "unknown").length;
  const hasEliminatoria = criteria.some(c => c.eliminatoria && c.status === "error");

  return { criteria, passCount, warnCount, failCount, unknownCount, hasEliminatoria };
}

// Recomputa faturamentoZerado dos meses reais (nunca confia no flag armazenado)
function calcFaturamentoZerado(fat: ExtractedData["faturamento"]): boolean {
  if (!fat.meses || fat.meses.length === 0) return false; // sem meses = falta de doc, não zero
  const parseFat = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  return fat.meses.every(m => parseFat(m.valor) === 0);
}

function validateExtractedData(data: ExtractedData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const parseFatVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const now = new Date();
  const anoAtual = now.getFullYear();

  // ═══════════════════════════════════════════════════════════════════════════
  // DADOS OBRIGATÓRIOS (erros que impedem análise)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── CNPJ ──
  if (!data.cnpj.razaoSocial) {
    errors.push({ field: "razaoSocial", document: "cnpj", message: "Razão Social não extraída", severity: "error" });
  }
  if (!data.cnpj.cnpj) {
    errors.push({ field: "cnpj", document: "cnpj", message: "CNPJ não extraído", severity: "error" });
  }
  if (!data.cnpj.dataAbertura) {
    warnings.push({ field: "dataAbertura", document: "cnpj", message: "Data de abertura não encontrada", severity: "warning" });
  }
  if (!data.cnpj.cnaePrincipal) {
    warnings.push({ field: "cnaePrincipal", document: "cnpj", message: "CNAE principal não encontrado", severity: "warning" });
  }
  const situacao = data.cnpj.situacaoCadastral?.toUpperCase().trim() || "";
  if (situacao && !situacao.includes("ATIVA")) {
    errors.push({ field: "situacaoCadastral", document: "cnpj", message: `Situação cadastral: ${situacao} — empresa não está ativa`, severity: "error" });
  }

  // ── QSA ──
  const sociosQSA = data.qsa.quadroSocietario.filter(s => s.nome);
  if (sociosQSA.length === 0) {
    errors.push({ field: "quadroSocietario", document: "qsa", message: "Nenhum sócio encontrado no QSA", severity: "error" });
  } else {
    const semDoc = sociosQSA.filter(s => !s.cpfCnpj);
    if (semDoc.length > 0) {
      warnings.push({ field: "cpfCnpj", document: "qsa", message: `${semDoc.length} sócio(s) sem CPF/CNPJ`, severity: "warning" });
    }
  }

  // ── Contrato Social ──
  if (!data.contrato.dataConstituicao) {
    warnings.push({ field: "dataConstituicao", document: "contrato", message: "Data de constituição não encontrada", severity: "warning" });
  }
  const sociosContrato = data.contrato.socios.filter(s => s.nome);
  if (sociosContrato.length === 0) {
    warnings.push({ field: "socios", document: "contrato", message: "Nenhum sócio encontrado no contrato", severity: "warning" });
  }
  if (!data.contrato.administracao) {
    warnings.push({ field: "administracao", document: "contrato", message: "Administração não identificada", severity: "warning" });
  }

  // ── Faturamento ──
  if (data.faturamento.meses.length === 0) {
    errors.push({ field: "meses", document: "faturamento", message: "Nenhum mês de faturamento extraído", severity: "error" });
  }
  const mediaNum = parseFatVal(data.faturamento.mediaAno);
  if (data.faturamento.meses.length > 0 && mediaNum === 0) {
    errors.push({ field: "mediaAno", document: "faturamento", message: "Faturamento médio é zero", severity: "error" });
  }
  if (data.faturamento.meses.length > 0 && data.faturamento.meses.length < 6) {
    warnings.push({ field: "meses", document: "faturamento", message: `Apenas ${data.faturamento.meses.length} meses — ideal ter 6+`, severity: "warning" });
  }
  if (calcFaturamentoZerado(data.faturamento)) {
    warnings.push({ field: "faturamentoZerado", document: "faturamento", message: "Faturamento zerado no período", severity: "warning" });
  }

  // ── SCR ──
  const scrVazio = !data.scr.totalDividasAtivas && !data.scr.carteiraAVencer && !data.scr.periodoReferencia;
  if (scrVazio) {
    warnings.push({ field: "periodoReferencia", document: "scr", message: "SCR sem dados extraídos — verifique o documento", severity: "warning" });
  }

  // ── Protestos ──
  const protestosQtd = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  if (protestosQtd > 0) {
    warnings.push({ field: "vigentesQtd", document: "protestos", message: `${protestosQtd} protesto(s) vigente(s) encontrado(s)`, severity: "warning" });
  }

  // ── Processos ──
  if (data.processos?.temRJ) {
    errors.push({ field: "temRJ", document: "processos", message: "Recuperação Judicial detectada", severity: "error" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE VALIDADE TEMPORAL
  // ═══════════════════════════════════════════════════════════════════════════

  // IR dos sócios — ano-base desatualizado
  if (data.irSocios && data.irSocios.length > 0) {
    for (const ir of data.irSocios) {
      const anoBase = parseInt(ir.anoBase, 10);
      if (anoBase && anoBase < anoAtual - 1) {
        warnings.push({ field: "anoBase", document: "ir_socio", message: `IR de ${ir.nomeSocio || "sócio"}: ano-base ${anoBase} — desatualizado (esperado ${anoAtual - 1} ou ${anoAtual})`, severity: "warning" });
      }
    }
  }

  // SCR — período de referência antigo (> 90 dias)
  if (data.scr.periodoReferencia) {
    const parts = data.scr.periodoReferencia.match(/(\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const scrDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, 28);
      const diffDays = Math.floor((now.getTime() - scrDate.getTime()) / 86400000);
      if (diffDays > 90) {
        warnings.push({ field: "periodoReferencia", document: "scr", message: `SCR com data de referência ${data.scr.periodoReferencia} — ${diffDays} dias atrás (> 90 dias)`, severity: "warning" });
      }
    }
  }

  // Faturamento — último mês com dados defasado (> 3 meses)
  if (data.faturamento.ultimoMesComDados) {
    const parts = data.faturamento.ultimoMesComDados.match(/(\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const fatDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, 28);
      const diffMonths = (now.getFullYear() - fatDate.getFullYear()) * 12 + (now.getMonth() - fatDate.getMonth());
      if (diffMonths > 3) {
        warnings.push({ field: "ultimoMesComDados", document: "faturamento", message: `Faturamento defasado — último mês: ${data.faturamento.ultimoMesComDados} (${diffMonths} meses atrás)`, severity: "warning" });
      }
    }
  }

  // Balanço — ano mais recente desatualizado
  if (data.balanco?.anos && data.balanco.anos.length > 0) {
    const anosBalanco = data.balanco.anos.map(a => parseInt(a.ano, 10)).filter(a => !isNaN(a));
    const maxAno = Math.max(...anosBalanco);
    if (maxAno < anoAtual - 1) {
      warnings.push({ field: "anos", document: "balanco", message: `Balanço mais recente: ${maxAno} — desatualizado (esperado ${anoAtual - 1} ou ${anoAtual})`, severity: "warning" });
    }
  }

  // DRE — ano mais recente desatualizado
  if (data.dre?.anos && data.dre.anos.length > 0) {
    const anosDRE = data.dre.anos.map(a => parseInt(a.ano, 10)).filter(a => !isNaN(a));
    const maxAno = Math.max(...anosDRE);
    if (maxAno < anoAtual - 1) {
      warnings.push({ field: "anos", document: "dre", message: `DRE mais recente: ${maxAno} — desatualizado (esperado ${anoAtual - 1} ou ${anoAtual})`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE IR DOS SÓCIOS (risco pessoal)
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.irSocios && data.irSocios.length > 0) {
    for (const ir of data.irSocios) {
      const nome = ir.nomeSocio || "Sócio";
      if (ir.situacaoMalhas) {
        errors.push({ field: "situacaoMalhas", document: "ir_socio", message: `${nome}: retido em MALHA FINA na Receita Federal`, severity: "error" });
      }
      if (ir.debitosEmAberto) {
        warnings.push({ field: "debitosEmAberto", document: "ir_socio", message: `${nome}: possui débitos em aberto na Receita Federal${ir.descricaoDebitos ? ` (${ir.descricaoDebitos})` : ""}`, severity: "warning" });
      }
      const pl = parseFatVal(ir.patrimonioLiquido);
      if (ir.patrimonioLiquido && pl < 0) {
        warnings.push({ field: "patrimonioLiquido", document: "ir_socio", message: `${nome}: patrimônio líquido negativo (${ir.patrimonioLiquido})`, severity: "warning" });
      }
    }
  }

  // Sócios do QSA sem IR enviado
  if (sociosQSA.length > 0 && (!data.irSocios || data.irSocios.length === 0)) {
    warnings.push({ field: "irSocios", document: "ir_socio", message: "Nenhum IR de sócio enviado — impossível avaliar capacidade patrimonial", severity: "warning" });
  } else if (data.irSocios && sociosQSA.length > data.irSocios.length) {
    warnings.push({ field: "irSocios", document: "ir_socio", message: `IR enviado para ${data.irSocios.length} de ${sociosQSA.length} sócios — faltam ${sociosQSA.length - data.irSocios.length}`, severity: "warning" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS FINANCEIROS (saúde da empresa)
  // ═══════════════════════════════════════════════════════════════════════════

  // Faturamento em queda
  if (data.faturamento.tendencia === "queda") {
    warnings.push({ field: "tendencia", document: "faturamento", message: "Faturamento em tendência de queda", severity: "warning" });
  }

  // Meses zerados intercalados
  if (data.faturamento.meses.length >= 3) {
    const vals = data.faturamento.meses.map(m => parseFatVal(m.valor));
    const temZeroIntercalado = vals.some((v, i) => v === 0 && i > 0 && i < vals.length - 1 && vals[i - 1] > 0 && vals[i + 1] > 0);
    if (temZeroIntercalado) {
      warnings.push({ field: "mesesZerados", document: "faturamento", message: "Faturamento com meses zerados intercalados — possível irregularidade ou sazonalidade extrema", severity: "warning" });
    }
  }

  // Variação brusca entre meses (> 80%)
  if (data.faturamento.meses.length >= 2) {
    const vals = data.faturamento.meses.map(m => parseFatVal(m.valor)).filter(v => v > 0);
    for (let i = 1; i < vals.length; i++) {
      const variacao = Math.abs(vals[i] - vals[i - 1]) / vals[i - 1];
      if (variacao > 0.8) {
        warnings.push({ field: "variacaoBrusca", document: "faturamento", message: `Variação brusca de ${Math.round(variacao * 100)}% entre meses consecutivos no faturamento`, severity: "warning" });
        break; // só alerta uma vez
      }
    }
  }

  // Balanço — patrimônio líquido negativo
  if (data.balanco?.anos && data.balanco.anos.length > 0) {
    const maisRecente = data.balanco.anos[data.balanco.anos.length - 1];
    const plEmpresa = parseFatVal(maisRecente.patrimonioLiquido);
    if (maisRecente.patrimonioLiquido && plEmpresa < 0) {
      errors.push({ field: "patrimonioLiquido", document: "balanco", message: `Patrimônio líquido negativo no balanço (${maisRecente.ano}): ${maisRecente.patrimonioLiquido}`, severity: "error" });
    }
    // Liquidez corrente < 1
    const lc = parseFloat(maisRecente.liquidezCorrente?.replace(",", ".") || "0");
    if (lc > 0 && lc < 1) {
      warnings.push({ field: "liquidezCorrente", document: "balanco", message: `Liquidez corrente ${maisRecente.liquidezCorrente} (< 1.0) — passivo circulante supera ativo circulante`, severity: "warning" });
    }
  }

  // DRE — prejuízo no exercício mais recente
  if (data.dre?.anos && data.dre.anos.length > 0) {
    const maisRecente = data.dre.anos[data.dre.anos.length - 1];
    const lucro = parseFatVal(maisRecente.lucroLiquido);
    if (maisRecente.lucroLiquido && lucro < 0) {
      warnings.push({ field: "lucroLiquido", document: "dre", message: `Prejuízo líquido no exercício ${maisRecente.ano}: ${maisRecente.lucroLiquido}`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE CONCENTRAÇÃO (risco de carteira)
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.curvaABC) {
    const pctTop1 = parseFloat(data.curvaABC.maiorClientePct?.replace(",", ".").replace("%", "") || "0");
    if (pctTop1 > 30) {
      warnings.push({ field: "concentracaoTop1", document: "curva_abc", message: `Maior cliente concentra ${data.curvaABC.maiorClientePct} da receita (${data.curvaABC.maiorCliente || "N/I"}) — risco de dependência`, severity: "warning" });
    }
    const pctTop3 = parseFloat(data.curvaABC.concentracaoTop3?.replace(",", ".").replace("%", "") || "0");
    if (pctTop3 > 60) {
      warnings.push({ field: "concentracaoTop3", document: "curva_abc", message: `Top 3 clientes concentram ${data.curvaABC.concentracaoTop3} da receita — alta dependência`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE CRÉDITO (SCR / Endividamento)
  // ═══════════════════════════════════════════════════════════════════════════

  if (!scrVazio) {
    const emAtraso = parseFatVal(data.scr.operacoesEmAtraso);
    if (emAtraso > 0) {
      warnings.push({ field: "operacoesEmAtraso", document: "scr", message: `Operações em atraso no SCR: R$ ${data.scr.operacoesEmAtraso}`, severity: "warning" });
    }
    const vencidas = parseFatVal(data.scr.operacoesVencidas || data.scr.vencidos);
    if (vencidas > 0) {
      warnings.push({ field: "vencidos", document: "scr", message: `Operações vencidas no SCR: R$ ${data.scr.vencidos || data.scr.operacoesVencidas}`, severity: "warning" });
    }
    const prejuizos = parseFatVal(data.scr.prejuizos);
    if (prejuizos > 0) {
      errors.push({ field: "prejuizos", document: "scr", message: `Prejuízos registrados no SCR: R$ ${data.scr.prejuizos}`, severity: "error" });
    }
    const qtdeInst = parseInt(data.scr.qtdeInstituicoes || "0", 10);
    if (qtdeInst > 5) {
      warnings.push({ field: "qtdeInstituicoes", document: "scr", message: `${qtdeInst} instituições financeiras — possível busca excessiva por crédito`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS SOCIETÁRIOS (risco estrutural)
  // ═══════════════════════════════════════════════════════════════════════════

  // Sócio com participação > 95%
  if (sociosQSA.length > 0) {
    for (const s of sociosQSA) {
      const pctNum = parseFloat(s.participacao?.replace(",", ".").replace("%", "") || "0");
      if (pctNum > 95) {
        warnings.push({ field: "participacao", document: "qsa", message: `${s.nome}: participação de ${s.participacao} — empresa unipessoal de fato`, severity: "warning" });
        break;
      }
    }
  }

  // Capital social muito baixo vs faturamento
  const capitalStr = data.contrato.capitalSocial || data.cnpj.capitalSocialCNPJ || "";
  const capitalVal = parseFatVal(capitalStr);
  const fmmAnual = mediaNum * 12;
  if (capitalVal > 0 && fmmAnual > 0 && capitalVal < fmmAnual * 0.01) {
    warnings.push({ field: "capitalSocial", document: "contrato", message: `Capital social (${capitalStr}) inferior a 1% do faturamento anual — possível subcapitalização`, severity: "warning" });
  }

  // Divergência de sócios QSA vs Contrato
  if (sociosQSA.length > 0 && sociosContrato.length > 0) {
    const nomesQSA = new Set(sociosQSA.map(s => s.nome.toUpperCase().trim()));
    const nomesContrato = new Set(sociosContrato.map(s => s.nome.toUpperCase().trim()));
    const apenasQSA = sociosQSA.filter(s => !nomesContrato.has(s.nome.toUpperCase().trim()));
    const apenasContrato = sociosContrato.filter(s => !nomesQSA.has(s.nome.toUpperCase().trim()));
    if (apenasQSA.length > 0 || apenasContrato.length > 0) {
      warnings.push({ field: "divergenciaSocios", document: "qsa", message: `Divergência no quadro societário: ${apenasQSA.length} sócio(s) só no QSA, ${apenasContrato.length} só no Contrato — verificar alteração contratual`, severity: "warning" });
    }
  }

  // Grupo econômico com empresa em situação irregular
  if (data.grupoEconomico?.empresas && data.grupoEconomico.empresas.length > 0) {
    const irregulares = data.grupoEconomico.empresas.filter(e => e.situacao && !e.situacao.toUpperCase().includes("ATIVA"));
    if (irregulares.length > 0) {
      warnings.push({ field: "grupoIrregular", document: "grupo_economico", message: `${irregulares.length} empresa(s) do grupo econômico com situação irregular: ${irregulares.map(e => e.razaoSocial).join(", ")}`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE PROCESSOS (risco jurídico)
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.processos) {
    // Processos bancários ativos
    const bancarios = data.processos.bancarios?.filter(p => p.status?.toUpperCase().includes("ANDAMENTO")) || [];
    if (bancarios.length > 0) {
      warnings.push({ field: "processosBancarios", document: "processos", message: `${bancarios.length} processo(s) bancário(s) em andamento — indica inadimplência com instituições financeiras`, severity: "warning" });
    }

    // Valor total de processos vs faturamento
    const valorEstimado = parseFatVal(data.processos.valorTotalEstimado);
    if (valorEstimado > 0 && fmmAnual > 0 && valorEstimado > fmmAnual * 0.5) {
      const pct = Math.round((valorEstimado / fmmAnual) * 100);
      warnings.push({ field: "valorTotalEstimado", document: "processos", message: `Valor estimado de processos (R$ ${data.processos.valorTotalEstimado}) representa ${pct}% do faturamento anual — risco jurídico elevado`, severity: "warning" });
    }

    // Muitos processos passivos
    const passivos = parseInt(data.processos.passivosTotal || data.processos.poloPassivoQtd || "0", 10) || 0;
    if (passivos > 10) {
      warnings.push({ field: "passivosTotal", document: "processos", message: `${passivos} processos no polo passivo — volume elevado`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE PROTESTOS (valor vs faturamento)
  // ═══════════════════════════════════════════════════════════════════════════

  if (protestosQtd > 0 && mediaNum > 0) {
    const protestosValor = parseFatVal(data.protestos?.vigentesValor || "0");
    if (protestosValor > 0 && protestosValor > mediaNum * 0.1) {
      const pct = Math.round((protestosValor / mediaNum) * 100);
      warnings.push({ field: "protestosValor", document: "protestos", message: `Valor de protestos (R$ ${data.protestos?.vigentesValor}) = ${pct}% do faturamento mensal`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTA DE VISITA
  // ═══════════════════════════════════════════════════════════════════════════

  if (!data.relatorioVisita || (!data.relatorioVisita.dataVisita && !data.relatorioVisita.descricaoEstrutura)) {
    warnings.push({ field: "relatorioVisita", document: "relatorio_visita", message: "Relatório de visita não enviado — recomendado para operações acima de R$ 100 mil", severity: "warning" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COBERTURA DE DADOS
  // ═══════════════════════════════════════════════════════════════════════════

  let total = 0;
  let filled = 0;
  function countFields(obj: unknown) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const v of Object.values(obj as Record<string, unknown>)) {
        countFields(v);
      }
    } else if (typeof obj === "string") {
      total++;
      if (obj !== "") filled++;
    }
  }
  countFields(data.cnpj);
  countFields(data.qsa);
  countFields(data.contrato);
  countFields(data.faturamento);
  countFields(data.scr);

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return {
    isValid: errors.length === 0,
    canProceed: errors.length === 0 && pct >= 40,
    errors,
    warnings,
    coverage: { total, filled, pct },
  };
}

export default function GenerateStep({ data: initialData, originalFiles, onBack, onReset, collectionId: collectionIdProp, onCollectionIdChange, ...rest }: GenerateStepProps) {
  void rest; // onNotify e onFirstCollection substituídos pela página /parecer
  const [data, setData] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(initialData)));
  const [editing, setEditing] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<Format | null>(null);
  const [generatedFormats, setGeneratedFormats] = useState<Set<Format>>(new Set());

  const setCNPJ = (k: keyof typeof data.cnpj, v: string) => setData(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof data.contrato, v: string | boolean) => setData(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof data.scr, v: string) => setData(p => ({ ...p, scr: { ...p.scr, [k]: v } }));
  const setResumoRisco = (v: string) => setData(p => ({ ...p, resumoRisco: v }));

  // ── Data Validation (mantido para uso interno, card removido da UI) ──
  void validateExtractedData(data);

  // ── Collection ID — fonte unica de verdade no parent ──
  // Usa a prop quando presente; cai num state local apenas quando o
  // GenerateStep cria a coleta antes do parent ter um id (caso legacy).
  const [collectionIdLocal, setCollectionIdLocal] = useState<string | null>(collectionIdProp ?? null);
  useEffect(() => { if (collectionIdProp) setCollectionIdLocal(collectionIdProp); }, [collectionIdProp]);
  const collectionId = collectionIdLocal;
  const setCollectionId = useCallback((id: string | null) => {
    setCollectionIdLocal(id);
    if (id) onCollectionIdChange?.(id);
  }, [onCollectionIdChange]);

  // ── Observações do analista ──
  const NOTES_KEY = "cf_analyst_notes_draft";
  const [analystNotes, setAnalystNotes] = useState<string>(() => {
    try { return localStorage.getItem(NOTES_KEY) || ""; } catch { return ""; }
  });
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Integrantes do Comitê ──
  const COMMITTEE_KEY = "cf_committee_members";
  const [committeMembers, setCommitteMembers] = useState<string>(() => {
    try { return localStorage.getItem(COMMITTEE_KEY) || "Luiz Carlos, Débora Santos, Gleyson Azevedo"; } catch { return "Luiz Carlos, Débora Santos, Gleyson Azevedo"; }
  });
  useEffect(() => {
    try { localStorage.setItem(COMMITTEE_KEY, committeMembers); } catch { /* ignore */ }
  }, [committeMembers]);

  // Persiste no localStorage a cada mudança
  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, analystNotes); } catch { /* ignore */ }
  }, [analystNotes]);

  // ── Fund Settings + Presets ──
  const [fundSettings, setFundSettings] = useState<FundSettings>(DEFAULT_FUND_SETTINGS);
  const [fundPresets, setFundPresets] = useState<FundPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | "active" | null>("active");
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: s }, { data: presets }] = await Promise.all([
          supabase.from("fund_settings").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("fund_presets").select("*").eq("user_id", user.id).order("created_at"),
        ]);
        if (s) setFundSettings({ ...DEFAULT_FUND_SETTINGS, ...s });
        if (presets) setFundPresets(presets);
      } catch { /* use defaults */ }
    };
    loadSettings();
  }, []);

  // Derives the settings to validate against (active or selected preset)
  const activeValidationSettings: FundSettings = (() => {
    if (selectedPresetId === "active" || selectedPresetId === null) return fundSettings;
    const preset = fundPresets.find(p => p.id === selectedPresetId);
    return preset ? { ...DEFAULT_FUND_SETTINGS, ...preset } : fundSettings;
  })();
  const selectedPresetName = selectedPresetId === "active" || selectedPresetId === null
    ? "Configurações Ativas"
    : fundPresets.find(p => p.id === selectedPresetId)?.name ?? "Configurações Ativas";
  const selectedPresetColor = selectedPresetId === "active" || selectedPresetId === null
    ? "#203b88"
    : fundPresets.find(p => p.id === selectedPresetId)?.color ?? "#203b88";

  // ── AI Analysis with cache ──
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [analysisFromCache, setAnalysisFromCache] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  const analysisFetched = useRef(false);

  const normalizeParecer = (parecer: unknown): Record<string, unknown> => {
    if (typeof parecer === "string") {
      return { resumoExecutivo: parecer };
    }
    if (typeof parecer === "object" && parecer !== null) {
      return parecer as Record<string, unknown>;
    }
    return { resumoExecutivo: "" };
  };

  const applyAnalysis = (analysis: AIAnalysis) => {
    const normalizedParecer = normalizeParecer(analysis.parecer);
    const normalizedAnalysis = { ...analysis, parecer: normalizedParecer };
    setAiAnalysis(normalizedAnalysis as AIAnalysis);
    const resumo = String(normalizedParecer.textoCompleto || normalizedParecer.resumoExecutivo || "");
    if (resumo) setResumoRisco(resumo);
  };

  const loadCachedAnalysis = async (colId: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { data: row, error } = await supabase
        .from("document_collections")
        .select("ai_analysis, rating, decisao")
        .eq("id", colId)
        .single();
      if (error || !row?.ai_analysis) return false;
      const cached = row.ai_analysis as Record<string, unknown>;
      // Aceita cache se tiver rating OU decisao — antes exigia tambem parametrosOperacionais
      // e alertas[0].mitigacao, o que fazia o cache ser REJEITADO com frequencia e forcava
      // nova chamada ao Gemini (com tempo 0.3, gerando rating diferente a cada retomada).
      // Agora qualquer cache minimamente utilizavel e aceito; campos ausentes recebem
      // defaults ou ficam undefined para o render decidir.
      if (cached.rating == null && !cached.decisao) return false;
      // IMPORTANTE: NÃO auto-copiamos mais `row.rating` → `parecerAnalista.ratingAnalista`.
      // O /parecer agora escreve os dois simultaneamente, então a coluna e o parecerAnalista
      // ficam sincronizados naturalmente. A auto-cópia antiga causava bug: a coluna era
      // atualizada automaticamente pela IA (e pelo trigger), e isso vazava para o
      // parecerAnalista.ratingAnalista como se fosse override manual do comitê,
      // "travando" o display no valor antigo quando a IA re-rodava com rating diferente.
      // Se parecerAnalista.ratingAnalista está vazio, a UI cai no aiAnalysis.rating — correto.
      const parecerNorm = normalizeParecer(cached.parecer);
      applyAnalysis({ ...cached, parecer: parecerNorm } as unknown as AIAnalysis);
      setAnalysisFromCache(true);
      return true;
    } catch {
      return false;
    }
  };

  const saveAnalysisCache = async (colId: string, analysis: AIAnalysis) => {
    try {
      const supabase = createClient();
      const analysisData = analysis as unknown as Record<string, unknown>;

      // Busca o estado atual para decidir se preserva rating/decisao do analista.
      // Se o analista ja definiu um rating manual em parecer/page, preserva SÓ quando
      // é um override REAL (diferente da ai_analysis.rating anterior).
      const { data: existing } = await supabase
        .from("document_collections")
        .select("ai_analysis, rating, decisao, status")
        .eq("id", colId)
        .maybeSingle();
      const existingAi = (existing?.ai_analysis as Record<string, unknown>) || {};
      const parecerAnalista = existingAi.parecerAnalista as { ratingAnalista?: number | null; decisaoComite?: string | null } | undefined;
      const rawAnalistaRating = parecerAnalista?.ratingAnalista;
      const analistaDecisao = parecerAnalista?.decisaoComite;
      const finished = existing?.status === "finished";

      // Detecta se o ratingAnalista é um override REAL do comitê ou só um resíduo
      // de auto-cópia antiga (bug anterior): se ele bate exatamente com o
      // ai_analysis.rating anterior, provavelmente foi auto-copiado — ignorar.
      const prevAiRating = existingAi.rating != null ? Number(existingAi.rating) : null;
      const analistaRatingNum = rawAnalistaRating != null && String(rawAnalistaRating) !== "" ? Number(rawAnalistaRating) : null;
      const isLegitimateOverride =
        analistaRatingNum != null &&
        !isNaN(analistaRatingNum) &&
        (prevAiRating == null || Math.abs(analistaRatingNum - prevAiRating) > 0.01);
      const analistaRating = isLegitimateOverride ? analistaRatingNum : null;

      // Merge do ai_analysis: preserva parecerAnalista SÓ se for override legítimo.
      // Caso contrário, remove o parecerAnalista.ratingAnalista para evitar
      // que o display pegue um valor fantasma.
      const mergedAi: Record<string, unknown> = { ...existingAi, ...analysisData };
      if (parecerAnalista) {
        if (isLegitimateOverride) {
          mergedAi.parecerAnalista = parecerAnalista;
        } else {
          // Remove o ratingAnalista fantasma mas preserva outros campos do parecerAnalista
          const cleanParecer = { ...parecerAnalista, ratingAnalista: null };
          mergedAi.parecerAnalista = cleanParecer;
          if (rawAnalistaRating != null) {
            console.log(`[saveAnalysisCache] ratingAnalista fantasma removido: ${rawAnalistaRating} (coincidia com ai_analysis.rating anterior)`);
          }
        }
      }

      // rating da coluna: se analista tem override legítimo, mantem; senão usa IA
      const ratingParaGravar = analistaRating != null ? analistaRating : (analysis.rating ?? null);
      // decisao: se analista setou decisaoComite, mantem a decisao atual (que ja reflete ele)
      const decisaoParaGravar = analistaDecisao
        ? (existing?.decisao as DocumentCollection["decisao"] ?? null)
        : ((analysis.decisao as DocumentCollection["decisao"]) ?? null);

      if (finished) {
        // Coleta finalizada: nao mexe em rating/decisao, so merge do JSONB
        await supabase
          .from("document_collections")
          .update({ ai_analysis: mergedAi })
          .eq("id", colId);
      } else {
        await supabase
          .from("document_collections")
          .update({
            ai_analysis: mergedAi,
            rating: ratingParaGravar,
            decisao: decisaoParaGravar,
          })
          .eq("id", colId);
      }
    } catch (err) {
      console.warn("[generate] Failed to cache analysis:", err);
    }
  };

  const handleReanalyze = async () => {
    analysisFetched.current = false;
    setAiAnalysis(null);
    setAnalysisFromCache(false);
    setAnalysisError(null);
    setAnalysisStatus("");
    if (collectionId) {
      try {
        const supabase = createClient();
        await supabase.from("document_collections").update({ ai_analysis: null }).eq("id", collectionId);
      } catch { /* ignore */ }
    }
    runAnalysisRef.current?.();
  };

  const runAnalysisRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (analysisFetched.current) return;
    analysisFetched.current = true;

    const runAnalysis = async () => {
      // 1. Try cache first
      if (collectionId) {
        const hasCached = await loadCachedAnalysis(collectionId);
        if (hasCached) return;
      }

      // 2. Call AI analysis API (bureaus já foram consultados no UploadStep)
      setAnalyzingAI(true);
      setAnalysisError(null);
      setAnalysisStatus("Iniciando análise...");
      try {
        const supabase = createClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, settings: fundSettings, user_id: currentUser?.id }),
        });
        if (!res.ok) {
          throw new Error(res.status === 504 ? "Timeout (504) — tente novamente." : `Erro HTTP ${res.status}`);
        }

        // ── Lê SSE stream ou JSON ──
        let analysisJson: { success: boolean; analysis?: AIAnalysis; error?: string } | null = null;
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              if (!part.trim()) continue;
              const lines = part.trim().split("\n");
              let ev = "message"; let rawData = "";
              for (const line of lines) {
                if (line.startsWith("event: ")) ev = line.slice(7).trim();
                if (line.startsWith("data: ")) rawData = line.slice(6).trim();
              }
              if (!rawData) continue;
              try {
                const payload = JSON.parse(rawData);
                if (ev === "status") setAnalysisStatus(payload.message || "");
                if (ev === "result") { analysisJson = payload; break outer; }
                if (ev === "error") throw new Error(payload.error || "Erro na análise");
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        } else {
          analysisJson = await res.json().catch(() => ({ success: false, error: `Erro HTTP ${res.status}` }));
        }

        if (analysisJson?.success && analysisJson?.analysis) {
          // 3. Garantir coleta no Supabase antes de salvar o cache.
          // Usa _uploadCtx.collectionId como fonte de verdade (set sincronamente pelo handleSave/auto-save),
          // evitando race condition de criação duplicada com o auto-save useEffect.
          let idParaSalvar = collectionId || _uploadCtx?.collectionId || null;

          if (!idParaSalvar) {
            // Espera breve para o auto-save terminar (normalmente já completou)
            await new Promise(r => setTimeout(r, 500));
            idParaSalvar = _uploadCtx?.collectionId || null;
          }

          if (!idParaSalvar) {
            // Auto-save não criou — cria a coleta aqui como fallback
            try {
              const supabase = createClient();
              const { data: userData, error: userError } = await supabase.auth.getUser();
              if (userError) console.warn("[generate] getUser error:", userError.message);

              if (userData?.user?.id) {
                const documents = buildDocuments();
                const { data: row, error: insertError } = await supabase
                  .from("document_collections")
                  .insert({
                    user_id: userData.user.id,
                    status: "in_progress",
                    documents,
                    label: data.cnpj.razaoSocial || null,
                    company_name: data.cnpj?.razaoSocial || null,
                    cnpj: data.cnpj?.cnpj || null,
                  })
                  .select("id")
                  .single();

                if (insertError) {
                  console.error("[generate] Failed to insert collection:", insertError.message, insertError.details, insertError.hint);
                } else if (row?.id) {
                  setCollectionId(row.id);
                  _uploadCtx = { userId: userData.user.id, collectionId: row.id };
                  idParaSalvar = row.id;
                }
              } else {
                console.warn("[generate] No authenticated user found — cache will not be saved");
              }
            } catch (err) {
              console.warn("[generate] Failed to auto-create collection:", err);
            }
          }

          console.log("[generate] parecer raw:", JSON.stringify(analysisJson.analysis!.parecer));
          applyAnalysis(analysisJson.analysis!);

          if (idParaSalvar) {
            await saveAnalysisCache(idParaSalvar, { ...analysisJson.analysis!, parecer: normalizeParecer(analysisJson.analysis!.parecer) } as AIAnalysis);
          } else {
            console.warn("[generate] idParaSalvar is null — ai_analysis not saved to Supabase");
          }

          // Auto-send to Goalfy (fire-and-forget)
          try {
            fetch("/api/goalfy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data, aiAnalysis: analysisJson.analysis, settings: fundSettings }),
            }).then(r => r.json()).then(gj => {
              if (gj.mock) {
                console.log("[generate] Goalfy: webhook não configurado (mock)");
              } else if (gj.success) {
                console.log("[generate] Goalfy: dados enviados com sucesso");
              } else {
                console.warn("[generate] Goalfy: falha no envio:", gj.error);
              }
            }).catch(e => console.warn("[generate] Goalfy fetch error:", e));
          } catch {
            // non-blocking
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate] AI analysis failed:", msg);
        setAnalysisError(msg);
      } finally {
        setAnalyzingAI(false);
        setAnalysisStatus("");
      }
    };

    runAnalysisRef.current = runAnalysis;
    runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── Supabase: Salvar / Finalizar coleta ──
  const [, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Helper: campos desnormalizados para a tabela
  // IMPORTANTE: só inclui rating/decisao quando aiAnalysis está disponível,
  // para não sobrescrever valores existentes no banco durante o auto-save inicial.
  // BUG FIX CRITICO: getCollectionMeta nao deve mais retornar rating/decisao.
  // A ownership dos campos rating e decisao fica com:
  //   - saveAnalysisCache (rating inicial da IA, apenas se analista ainda nao setou)
  //   - parecer/page.tsx doSave (override manual do analista, prioridade total)
  //   - parecer/page.tsx handleFinish (decisao final ao finalizar coleta)
  // Antes, handleSave rodando em auto-save reescrevia rating com aiAnalysis.rating
  // (valor em memoria, frequentemente stale) e sobrescrevia o rating do analista.
  const getCollectionMeta = () => {
    const mediaStr = data.faturamento.mediaAno || "0";
    const fmm = parseFloat(mediaStr.replace(/\./g, "").replace(",", ".")) || null;
    return {
      company_name: data.cnpj.razaoSocial || null,
      cnpj: data.cnpj.cnpj || null,
      fmm_12m: fmm,
    };
  };

  const buildDocuments = (): CollectionDocument[] => buildCollectionDocs(data);

  const handleSave = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const supabase = createClient();
      const documents = buildDocuments();

      if (collectionId) {
        // Ensure upload context is set for report saves
        if (!_uploadCtx) {
          const { data: session } = await supabase.auth.getUser();
          _uploadCtx = { userId: session.user?.id ?? "anonymous", collectionId };
        }
        const { error } = await supabase.from("document_collections").update({ documents, label: data.cnpj.razaoSocial || null, ...getCollectionMeta() }).eq("id", collectionId);
        if (error) throw error;
        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return collectionId;
      } else {
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) {
          toast.error("Você precisa estar logado para salvar coletas.");
          return null;
        }
        const userId = session.user.id;
        const { data: row, error } = await supabase.from("document_collections").insert({
          user_id: userId,
          status: "in_progress",
          label: data.cnpj.razaoSocial || null,
          documents,
          ...getCollectionMeta(),
        }).select("id").single();
        if (error) throw error;
        setCollectionId(row.id);
        _uploadCtx = { userId, collectionId: row.id };

        // Upload original files to Supabase Storage (fire-and-forget)
        if (originalFiles) {
          const fileMap = {
            cnpj: "cartao-cnpj", qsa: "qsa", contrato: "contrato-social",
            faturamento: "faturamento", scr: "scr-bacen", scrAnterior: "scr-anterior",
          } as const;
          for (const [key, label] of Object.entries(fileMap)) {
            const filesArr = originalFiles[key as keyof typeof originalFiles];
            if (Array.isArray(filesArr)) {
              filesArr.forEach((file, i) => {
                const suffix = filesArr.length > 1 ? `-${i + 1}` : "";
                uploadFile(userId, row.id, "originals", `${label}${suffix}.${file.name.split(".").pop() || "pdf"}`, file)
                  .catch(() => {});
              });
            }
          }
        }

        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return row.id;
      }
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Verifique a conexão com o Supabase"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleGoToParecer = async () => {
    setFinishing(true);
    try {
      let id = collectionId;
      if (!id) {
        id = await handleSave();
      }
      if (!id) throw new Error("Não foi possível salvar a coleta");
      window.location.href = `/parecer?id=${id}`;
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Verifique a conexão"));
      setFinishing(false);
    }
  };

  // ── Auto-save: salva automaticamente ao entrar no step ──
  // Proteção contra duplicatas: verifica se já existe coleta recente com mesmo CNPJ
  const autoSaved = useRef(false);
  useEffect(() => {
    if (autoSaved.current) return;
    autoSaved.current = true;

    (async () => {
      // Se já tem collectionId (ex: retomou coleta), só atualiza
      if (collectionId) {
        handleSave();
        return;
      }

      // Verifica se já existe coleta in_progress recente com o mesmo CNPJ (últimos 5 min)
      // para evitar duplicatas por StrictMode ou re-renders
      try {
        const supabase = createClient();
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) { handleSave(); return; }
        const cnpj = data.cnpj.cnpj;
        if (cnpj) {
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("document_collections")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("cnpj", cnpj)
            .eq("status", "in_progress")
            .gte("created_at", fiveMinAgo)
            .order("created_at", { ascending: false })
            .limit(1);
          if (existing && existing.length > 0) {
            // Já existe uma coleta recente para o mesmo CNPJ, reutiliza
            setCollectionId(existing[0].id);
            const documents = buildDocuments();
            await supabase.from("document_collections").update({ documents, label: data.cnpj.razaoSocial || null, ...getCollectionMeta() }).eq("id", existing[0].id);
            setSavedFeedback(true);
            setTimeout(() => setSavedFeedback(false), 2000);
            return;
          }
        }
      } catch { /* continue com save normal */ }

      handleSave();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeName = (data.cnpj.cnpj || "relatorio").replace(/[\/\\.:]/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  // ── Helpers ──
  const parseMoneyToNumber = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const dividaAtiva = parseMoneyToNumber(data.scr.totalDividasAtivas);
  const atraso = parseMoneyToNumber(data.scr.operacoesEmAtraso);
  const prejuizosVal = parseMoneyToNumber(data.scr.prejuizos);
  const vencidas = parseMoneyToNumber(data.scr.operacoesVencidas);
  const vencidosSCR = parseMoneyToNumber(data.scr.vencidos);
  const protestosVigentes = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  const processosBancariosAtivos = (data.processos?.bancarios || []).filter(b => b.status && /andamento|distribu/i.test(b.status)).length;

  // ── Rating local (0-10) — usado como fallback se IA não disponível ──
  const ratingScore = (() => {
    // Sem dados mínimos → rating 0 (ausência de documento não é mérito)
    const temDadosMinimos = !!(
      data.cnpj.razaoSocial ||
      (data.faturamento.meses?.length ?? 0) > 0 ||
      data.scr.totalDividasAtivas
    );
    if (!temDadosMinimos) return 0;

    let s = 0;
    // Situação ATIVA (+1)
    if (data.cnpj.situacaoCadastral?.toUpperCase().includes("ATIVA")) s += 1;
    // Empresa > 5 anos from dataAbertura (+1)
    if (data.cnpj.dataAbertura) {
      const parts = data.cnpj.dataAbertura.split("/");
      if (parts.length >= 3) {
        const year = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(year) && new Date().getFullYear() - year > 5) s += 1;
      }
    }
    // Faturamento consistente não-zerado (+1.5)
    if (!data.faturamento.faturamentoZerado) s += 1.5;
    // Faturamento atualizado (+0.5)
    if (data.faturamento.dadosAtualizados) s += 0.5;
    // SCR sem vencidos (+1.5)
    if (vencidosSCR === 0 && vencidas === 0) s += 1.5;
    // SCR sem prejuízos (+1.5)
    if (prejuizosVal === 0) s += 1.5;
    // Classificação risco A-C (+1)
    const cl = data.scr.classificacaoRisco?.toUpperCase().trim();
    if (cl && ["A", "AA", "B", "C"].includes(cl)) s += 1;
    // Sem protestos vigentes (+1)
    if (protestosVigentes === 0) s += 1;
    // Sem RJ e processos bancários ativos (+0.5)
    if (!data.processos?.temRJ && processosBancariosAtivos === 0) s += 0.5;
    // Base (+0.5)
    s += 0.5;
    return Math.min(10, Math.round(s * 10) / 10);
  })();

  // ── Decision (prioridade: override do analista > comite > IA > calculo local) ──
  // O analista pode sobrescrever o rating e a decisao na pagina /parecer.
  // O PDF deve respeitar esse override — senao mostra o rating cru da IA e
  // diverge do que aparece na plataforma.
  const parecerAnalistaOverride = (aiAnalysis as unknown as { parecerAnalista?: { ratingAnalista?: number | string | null; decisao?: string | null; decisaoComite?: string | null } } | null)?.parecerAnalista;
  const ratingOverrideRaw = parecerAnalistaOverride?.ratingAnalista;
  const ratingOverride = ratingOverrideRaw != null && ratingOverrideRaw !== "" ? Number(ratingOverrideRaw) : null;
  const finalRating = (ratingOverride != null && !isNaN(ratingOverride))
    ? ratingOverride
    : (aiAnalysis ? aiAnalysis.rating : ratingScore);
  const decisaoOverride = parecerAnalistaOverride?.decisaoComite || parecerAnalistaOverride?.decisao || null;
  const decision: string =
    decisaoOverride ? String(decisaoOverride).toUpperCase() :
    aiAnalysis ? aiAnalysis.decisao :
    (finalRating >= 7 ? "APROVADO" : finalRating >= 4 ? "PENDENTE" : "REPROVADO");
  const decisionColor = decision === "APROVADO" ? "#16A34A" : decision === "REPROVADO" ? "#DC2626" : "#D97706";
  const decisionBg = decision === "APROVADO" ? "#F0FDF4" : decision === "PENDENTE" ? "#FFFBEB" : "#FEF2F2";
  const decisionBorder = decision === "APROVADO" ? "#BBF7D0" : decision === "PENDENTE" ? "#FDE68A" : "#FECACA";

  // ── Alerts (usa IA se disponível) ──
  const alerts: Alert[] = (() => {
    if (aiAnalysis && aiAnalysis.alertas.length > 0) {
      return aiAnalysis.alertas.map(a => ({
        message: a.descricao,
        severity: a.severidade as AlertSeverity,
        impacto: a.impacto,
      }));
    }
    const a: Alert[] = [];
    if (vencidosSCR > 0 || vencidas > 0) a.push({ message: "SCR com operações vencidas", severity: "CRÍTICO" });
    if (prejuizosVal > 0) a.push({ message: "SCR com prejuízos registrados", severity: "CRÍTICO" });
    if (calcFaturamentoZerado(data.faturamento)) a.push({ message: "Faturamento zerado no período", severity: "CRÍTICO" });
    if (data.faturamento.meses.length > 0 && !data.faturamento.dadosAtualizados) a.push({ message: "Faturamento desatualizado", severity: "RESTRITIVO" });
    const rl = data.scr.classificacaoRisco?.toUpperCase();
    if (rl && ["D", "E", "F", "G", "H"].includes(rl)) a.push({ message: `Classificação de risco ${rl}`, severity: "RESTRITIVO" });
    if (atraso > 0) a.push({ message: "Operações em atraso no SCR", severity: "RESTRITIVO" });
    return a;
  })();

  const alertsHigh = alerts.filter(a => a.severity === "CRÍTICO");
  const alertsMod = alerts.filter(a => a.severity === "RESTRITIVO" || a.severity === "OBSERVAÇÃO");

  // ── Pontos fortes/fracos e parecer da IA ──
  // parecer é string | objeto — narrowar antes de acessar propriedades
  const _parecerObj = (typeof aiAnalysis?.parecer === 'object' && aiAnalysis?.parecer !== null)
    ? aiAnalysis!.parecer as { resumoExecutivo?: string; textoCompleto?: string; pontosFortes?: string[]; pontosNegativosOuFracos?: string[]; perguntasVisita?: Array<{pergunta: string; contexto: string}> }
    : null;
  const pontosFortes   = (aiAnalysis?.pontosFortes   || _parecerObj?.pontosFortes              || []) as string[];
  const pontosFracos   = (aiAnalysis?.pontosFracos   || _parecerObj?.pontosNegativosOuFracos   || []) as string[];
  const perguntasVisita = (aiAnalysis?.perguntasVisita || _parecerObj?.perguntasVisita           || []) as Array<{pergunta: string; contexto: string}>;
  // textoCompleto = análise completa (3-4 parágrafos); resumoExecutivo = 1 parágrafo. Prioriza o completo no PDF.
  const resumoExecutivo = _parecerObj?.textoCompleto
    || aiAnalysis?.resumoExecutivo
    || (typeof aiAnalysis?.parecer === 'string' ? aiAnalysis.parecer : _parecerObj?.resumoExecutivo)
    || "";

  // ── Legacy risk for UI badge ──
  const riskScore = (() => {
    if (alertsHigh.length > 0) return "alto";
    if (alertsMod.length > 0) return "medio";
    return "baixo";
  })();

  const qsaCount = data.qsa.quadroSocietario.filter(s => s.nome).length;

  // Company age helper
  const companyAge = (() => {
    if (!data.cnpj.dataAbertura) return "";
    const parts = data.cnpj.dataAbertura.split("/");
    if (parts.length >= 3) {
      const year = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(year)) {
        const age = new Date().getFullYear() - year;
        return `${age} ano${age !== 1 ? "s" : ""}`;
      }
    }
    return "";
  })();

  // ── Fund parameter validation ──
  const fundValidation = validarContraParametros(data, activeValidationSettings);

  // ── Credit Limit Result ──
  const creditLimit: CreditLimitResult = (() => {
    const fmmRaw = parseMoney(data.faturamento.fmm12m || data.faturamento.mediaAno || data.faturamento.somatoriaAno || '0');
    const fator = activeValidationSettings.fator_limite_base;
    const limiteBase = fmmRaw * fator;
    const classificacao: 'APROVADO' | 'CONDICIONAL' | 'REPROVADO' =
      (fundValidation.hasEliminatoria || fundValidation.failCount > 0) ? 'REPROVADO'
      : fundValidation.warnCount > 0 ? 'CONDICIONAL' : 'APROVADO';
    const fatorReducao = classificacao === 'REPROVADO' ? 0 : classificacao === 'CONDICIONAL' ? 0.7 : 1;
    const limiteAjustado = limiteBase * fatorReducao;
    const prazo = classificacao === 'APROVADO' ? activeValidationSettings.prazo_maximo_aprovado
      : classificacao === 'CONDICIONAL' ? activeValidationSettings.prazo_maximo_condicional : 0;
    const revisaoDias = classificacao !== 'REPROVADO'
      ? (classificacao === 'APROVADO' ? activeValidationSettings.revisao_aprovado_dias : activeValidationSettings.revisao_condicional_dias)
      : 0;
    const dataRevisao = new Date();
    dataRevisao.setDate(dataRevisao.getDate() + revisaoDias);
    return {
      classificacao, limiteAjustado, limiteBase, fmmBase: fmmRaw, fatorBase: fator, fatorReducao,
      prazo, revisaoDias, dataRevisao: dataRevisao.toISOString(),
      concentracaoMaxPct: activeValidationSettings.concentracao_max_sacado,
      limiteConcentracao: limiteAjustado * (activeValidationSettings.concentracao_max_sacado / 100),
      presetName: selectedPresetName,
    };
  })();

  // ── Persist fund_status to collection ──
  useEffect(() => {
    if (!collectionId || fundValidation.criteria.length === 0) return;
    const status = fundValidation.hasEliminatoria || fundValidation.failCount > 0 ? "error"
      : fundValidation.warnCount > 0 ? "warning" : "ok";
    const payload = {
      status,
      pass_count: fundValidation.passCount,
      fail_count: fundValidation.failCount,
      warn_count: fundValidation.warnCount,
      total: fundValidation.criteria.length,
      preset_name: selectedPresetName,
      preset_color: selectedPresetColor,
      validated_at: new Date().toISOString(),
    };
    const save = async () => {
      try {
        const supabase = createClient();
        await supabase.from("document_collections").update({ fund_status: payload }).eq("id", collectionId);
      } catch { /* ignore */ }
    };
    save();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, selectedPresetId, fundValidation.passCount, fundValidation.failCount, fundValidation.warnCount]);

  // ═══════════════════════════════════════════════════
  // PDF Generation
  // ═══════════════════════════════════════════════════
  // Carrega notas salvas no Supabase quando collectionId muda.
  // IMPORTANTE: sempre reseta primeiro para evitar contaminação entre cedentes.
  useEffect(() => {
    if (!collectionId) return;
    setAnalystNotes("");
    const supabase = createClient();
    supabase.from("document_collections").select("observacoes").eq("id", collectionId).single()
      .then(({ data: row }) => {
        setAnalystNotes(row?.observacoes ?? "");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const saveNotes = async (notes: string) => {
    if (!collectionId) return;
    setSavingNotes(true);
    try {
      const supabase = createClient();
      await supabase.from("document_collections").update({ observacoes: notes.trim() || null }).eq("id", collectionId);
    } catch { /* silently fail */ } finally { setSavingNotes(false); }
  };

  // Busca o rating/decisao MAIS RECENTES direto do Supabase antes de gerar
  // relatorios. Isso elimina race conditions onde aiAnalysis em memoria esta
  // stale (usuario editou no parecer em outra aba, autosave ainda nao propagou,
  // ou o mount do GenerateStep ainda nao completou loadCachedAnalysis).
  const getFreshFinalRating = async (): Promise<{ rating: number; decisao: string }> => {
    const localFallback = { rating: finalRating, decisao: decision };
    if (!collectionId) return localFallback;
    try {
      const supabase = createClient();
      const { data: row } = await supabase
        .from("document_collections")
        .select("ai_analysis, rating, decisao")
        .eq("id", collectionId)
        .maybeSingle();
      if (!row) return localFallback;
      const aiA = row.ai_analysis as Record<string, unknown> | null;
      const pa = aiA?.parecerAnalista as { ratingAnalista?: number | string | null; decisaoComite?: string | null } | undefined;
      // Prioridade: override analista > coluna rating > ai_analysis.rating > local
      const analistaRaw = pa?.ratingAnalista;
      const analistaNum = analistaRaw != null && analistaRaw !== "" ? Number(analistaRaw) : null;
      let freshRating = finalRating;
      if (analistaNum != null && !isNaN(analistaNum)) freshRating = analistaNum;
      else if (row.rating != null) freshRating = Number(row.rating);
      else if (aiA && typeof aiA.rating === "number") freshRating = aiA.rating;
      const freshDecisao = pa?.decisaoComite
        ? String(pa.decisaoComite).toUpperCase()
        : (row.decisao ? String(row.decisao).toUpperCase() : decision);
      return { rating: freshRating, decisao: freshDecisao };
    } catch {
      return localFallback;
    }
  };

  const generatePDF = async () => {
    console.log("[generatePDF] ▶ iniciando");
    toast.info("Gerando PDF…");
    setGeneratingFormat("pdf");
    try {
      // Busca 4 vistas do Street View (0°/90°/180°/270°) + mapa aéreo em paralelo
      // com TIMEOUT INDIVIDUAL — se uma falhar, não trava o restante.
      let streetViewBase64: string | undefined;
      let streetView90Base64: string | undefined;
      let streetView180Base64: string | undefined;
      let streetView270Base64: string | undefined;
      let mapStaticBase64: string | undefined;
      let streetViewInteractiveUrl: string | undefined;
      const endereco = data.cnpj?.endereco;
      if (endereco) {
        console.log("[generatePDF] buscando imagens do Street View…");
        const fetchMapProxy = async (type: "streetview" | "map", heading?: number): Promise<string | undefined> => {
          try {
            const qs = new URLSearchParams({ address: endereco, type });
            if (heading != null) qs.set("heading", String(heading));
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), 8000); // 8s timeout
            const res = await fetch(`/api/map-image?${qs.toString()}`, { signal: ctrl.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return undefined;
            const json = await res.json();
            if (json.error || !json.base64) return undefined;
            return `data:image/${json.mime ?? "jpeg"};base64,${json.base64}`;
          } catch (e) {
            console.warn(`[generatePDF] fetchMapProxy ${type}/${heading} falhou:`, e instanceof Error ? e.message : e);
            return undefined;
          }
        };
        try {
          const [sv0, sv90, sv180, sv270, mp] = await Promise.all([
            fetchMapProxy("streetview", 0),
            fetchMapProxy("streetview", 90),
            fetchMapProxy("streetview", 180),
            fetchMapProxy("streetview", 270),
            fetchMapProxy("map"),
          ]);
          streetViewBase64 = sv0;
          streetView90Base64 = sv90;
          streetView180Base64 = sv180;
          streetView270Base64 = sv270;
          mapStaticBase64 = mp;
          console.log(`[generatePDF] imagens: sv0=${!!sv0} sv90=${!!sv90} sv180=${!!sv180} sv270=${!!sv270} mp=${!!mp}`);
        } catch (e) {
          console.warn("[generatePDF] fetch de mapas falhou — seguindo sem imagens:", e);
        }
        streetViewInteractiveUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
      }

      // ── Busca histórico de operações do cedente ────────────────────────────
      let histOperacoes: import("@/types").Operacao[] = [];
      const cnpjCedente = data.cnpj?.cnpj;
      if (cnpjCedente) {
        try {
          const supabase = createClient();
          const { data: { user: u } } = await supabase.auth.getUser();
          if (u) {
            const { data: ops } = await supabase
              .from("operacoes")
              .select("*")
              .eq("user_id", u.id)
              .eq("cnpj", cnpjCedente.replace(/\D/g, ""))
              .order("data_operacao", { ascending: false });
            if (ops) histOperacoes = ops as import("@/types").Operacao[];
          }
        } catch { /* histórico indisponível — segue sem */ }
      }

      // Busca rating/decisao frescos do Supabase para evitar estado stale
      const fresh = await getFreshFinalRating();
      // ── Geração via Puppeteer (servidor) ──────────────────────────────────
      const payload = {
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
        dividaAtiva, atraso, riskScore: riskScore as "alto" | "medio" | "baixo", decisionColor, decisionBg, decisionBorder,
        observacoes: analystNotes.trim() || undefined,
        streetViewBase64,
        streetView90Base64,
        streetView180Base64,
        streetView270Base64,
        streetViewInteractiveUrl,
        mapStaticBase64,
        fundValidation,
        creditLimit,
        histOperacoes: histOperacoes.length ? histOperacoes : undefined,
        committeMembers: committeMembers.trim() || undefined,
      };

      // Adiciona mapEmbedUrl para preview interativo (usado no HTML, ignorado no PDF)
      const mapsEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const mapEmbedUrl = endereco && mapsEmbedKey
        ? `https://www.google.com/maps/embed/v1/place?key=${mapsEmbedKey}&q=${encodeURIComponent(endereco)}`
        : undefined;
      Object.assign(payload, { mapEmbedUrl });

      console.log("[generatePDF] payload montado, chamando /api/generate-pdf");

      // Tenta nova API Puppeteer (funciona local + prod)
      let usedApi = false;
      try {
        const blob = await generatePDFViaAPI(payload);
        console.log(`[generatePDF] /api/generate-pdf OK — blob size=${blob.size}`);
        triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
        usedApi = true;
      } catch (apiErr) {
        const apiErrMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        console.warn("[generatePDF] /api/generate-pdf falhou:", apiErrMsg);
        // Fallback para rota legada (Vercel com CHROMIUM_URL)
        try {
          console.log("[generatePDF] tentando /api/exportar-pdf");
          const res = await fetch("/api/exportar-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const blob = await res.blob();
            console.log(`[generatePDF] /api/exportar-pdf OK — blob size=${blob.size}`);
            triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
            usedApi = true;
          } else {
            console.warn(`[generatePDF] /api/exportar-pdf HTTP ${res.status}`);
          }
        } catch (legacyErr) {
          console.warn("[generatePDF] /api/exportar-pdf falhou:", legacyErr instanceof Error ? legacyErr.message : legacyErr);
        }
      }

      // Fallback: jsPDF local (último recurso, sempre funciona)
      if (!usedApi) {
        console.warn("[generatePDF] APIs Puppeteer indisponíveis, usando jsPDF local");
        try {
          const blob = await buildPDFReport(payload);
          console.log(`[generatePDF] jsPDF OK — blob size=${blob.size}`);
          triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
          usedApi = true;
        } catch (jspdfErr) {
          console.error("[generatePDF] jsPDF falhou também:", jspdfErr);
          throw new Error(`Todas as rotas de geração falharam: ${jspdfErr instanceof Error ? jspdfErr.message : "erro desconhecido"}`);
        }
      }

      setGeneratedFormats(p => new Set(p).add("pdf"));
      toast.success("PDF gerado com sucesso");
      console.log("[generatePDF] ✔ concluído");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error(`Erro ao gerar PDF: ${err instanceof Error ? err.message : "tente novamente"}`);
      // Fallback final: jsPDF (tambem com fresh rating)
      try {
        const fresh2 = await getFreshFinalRating();
        const blob = await buildPDFReport({
          data, aiAnalysis, decision: fresh2.decisao, finalRating: fresh2.rating, alerts, alertsHigh,
          pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
          companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
          dividaAtiva, atraso, riskScore, decisionColor, decisionBg, decisionBorder,
          observacoes: analystNotes.trim() || undefined,
          fundValidation, creditLimit,
          committeMembers: committeMembers.trim() || undefined,
        });
        triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
        setGeneratedFormats(p => new Set(p).add("pdf"));
        toast.success("PDF gerado via fallback (qualidade reduzida)");
      } catch (fallbackErr) {
        console.error("Fallback jsPDF também falhou:", fallbackErr);
      }
    } finally {
      setGeneratingFormat(null);
    }
  };

  // Helper: busca 4 vistas do Street View (0°/90°/180°/270°) + Static Map via proxy
  // com timeout individual de 8s — se falhar, segue sem as imagens.
  const fetchGoogleMapsImages = async (): Promise<{
    streetViewBase64?: string;
    streetView90Base64?: string;
    streetView180Base64?: string;
    streetView270Base64?: string;
    mapStaticBase64?: string;
    streetViewInteractiveUrl?: string;
  }> => {
    const endereco = data.cnpj?.endereco;
    if (!endereco) return {};
    const fetchMapProxy = async (type: "streetview" | "map", heading?: number): Promise<string | undefined> => {
      try {
        const qs = new URLSearchParams({ address: endereco, type });
        if (heading != null) qs.set("heading", String(heading));
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`/api/map-image?${qs.toString()}`, { signal: ctrl.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return undefined;
        const json = await res.json();
        if (json.error || !json.base64) return undefined;
        return `data:image/${json.mime ?? "jpeg"};base64,${json.base64}`;
      } catch (e) {
        console.warn(`[fetchGoogleMapsImages] ${type}/${heading} falhou:`, e instanceof Error ? e.message : e);
        return undefined;
      }
    };
    try {
      const [sv0, sv90, sv180, sv270, mp] = await Promise.all([
        fetchMapProxy("streetview", 0),
        fetchMapProxy("streetview", 90),
        fetchMapProxy("streetview", 180),
        fetchMapProxy("streetview", 270),
        fetchMapProxy("map"),
      ]);
      return {
        streetViewBase64: sv0,
        streetView90Base64: sv90,
        streetView180Base64: sv180,
        streetView270Base64: sv270,
        mapStaticBase64: mp,
        streetViewInteractiveUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`,
      };
    } catch (e) {
      console.warn("[fetchGoogleMapsImages] Promise.all falhou:", e);
      return {
        streetViewInteractiveUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`,
      };
    }
  };

  // ═══════════════════════════════════════════════════
  // HTML View (abre relatório visual em nova aba)
  // ═══════════════════════════════════════════════════
  const generateHTMLView = async () => {
    console.log("[generateHTMLView] ▶ iniciando");
    toast.info("Gerando preview HTML…");
    setGeneratingFormat("html");
    try {
      console.log("[generateHTMLView] buscando mapas…");
      const maps = await fetchGoogleMapsImages();
      console.log("[generateHTMLView] mapas OK, buscando rating fresco…");
      const fresh = await getFreshFinalRating();
      console.log("[generateHTMLView] construindo payload…");
      const htmlEndereco = data.cnpj?.endereco;
      const htmlApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const payload = {
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
        dividaAtiva, atraso, riskScore: riskScore as "alto" | "medio" | "baixo", decisionColor, decisionBg, decisionBorder,
        observacoes: analystNotes.trim() || undefined,
        streetViewBase64: maps.streetViewBase64,
        streetView90Base64: maps.streetView90Base64,
        streetView180Base64: maps.streetView180Base64,
        streetView270Base64: maps.streetView270Base64,
        streetViewInteractiveUrl: maps.streetViewInteractiveUrl,
        mapStaticBase64: maps.mapStaticBase64,
        mapEmbedUrl: htmlEndereco && htmlApiKey
          ? `https://www.google.com/maps/embed/v1/place?key=${htmlApiKey}&q=${encodeURIComponent(htmlEndereco)}`
          : undefined,
        fundValidation,
        creditLimit,
        committeMembers: committeMembers.trim() || undefined,
      };
      const html = await generateHTMLPreview(payload);

      // 1) Tenta abrir em nova aba. Se popup bloqueado → fallback pra blob URL.
      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } else {
        // Fallback: cria blob e abre via link — funciona mesmo com popup blocker
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const opened = window.open(url, "_blank");
        if (!opened) {
          toast.error("Popup bloqueado pelo navegador. Desative o bloqueador ou permita popups desta página.");
          URL.revokeObjectURL(url);
          throw new Error("popup_blocked");
        }
        // Limpa a URL depois que a aba carrega (não bloqueia a render)
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      setGeneratedFormats(p => new Set(p).add("html"));
      toast.success("Preview HTML aberto em nova aba");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gerar preview HTML";
      console.error("HTML view error:", err);
      if (msg !== "popup_blocked") {
        toast.error(`Erro ao gerar preview: ${msg}`);
      }
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // DOCX Generation
  // ═══════════════════════════════════════════════════
  const generateDOCX = async () => {
    setGeneratingFormat("docx");
    try {
      const fresh = await getFreshFinalRating();
      const blob = await buildDOCXReport({
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.docx`);
      setGeneratedFormats(p => new Set(p).add("docx"));
    } catch (err) {
      console.error("DOCX generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // Excel Generation
  // ═══════════════════════════════════════════════════
  const generateExcel = async () => {
    setGeneratingFormat("xlsx");
    try {
      const fresh = await getFreshFinalRating();
      const blob = await buildExcelReport({
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts,
        pontosFortes, pontosFracos, companyAge, protestosVigentes,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.xlsx`);
      setGeneratedFormats(p => new Set(p).add("xlsx"));
    } catch (err) {
      console.error("Excel generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // HTML Generation (extracted to lib/generators/html.ts)
  // ═══════════════════════════════════════════════════
  const generateHTML = async () => {
    setGeneratingFormat("html");
    try {
      const fresh = await getFreshFinalRating();
      const htmlContent = buildHTMLReport({
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, vencidosSCR, vencidas, prejuizosVal, protestosVigentes,
      });
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.html`);
      setGeneratedFormats(p => new Set(p).add("html"));
    } catch (err) {
      console.error("HTML generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  /* old generateHTML body removed — see lib/generators/html.ts */

  // ═══════════════════════════════════════════════════
  // Validação pré-geração (Fase 3.2)
  // ═══════════════════════════════════════════════════
  const [pendingGenerator, setPendingGenerator] = useState<{ fn: () => Promise<void>; label: string } | null>(null);
  const [gateValidation, setGateValidation] = useState<ReportValidation | null>(null);

  // Guarda: antes de chamar qualquer gerador, valida gaps.
  // - Se tem crítico → bloqueia e força confirmação explícita
  // - Se tem só warning → ainda mostra modal mas permite "Gerar mesmo assim"
  // - Se está tudo OK → dispara direto (com error handling)
  const confirmAndGenerate = useCallback((fn: () => Promise<void>, label: string) => {
    let v: ReportValidation;
    try {
      v = validateReport(data);
    } catch (err) {
      // Se a validação em si quebrar, não bloqueia a geração — apenas dispara direto
      console.warn(`[confirmAndGenerate] validateReport falhou, disparando ${label} direto:`, err);
      v = { gaps: [], criticalCount: 0, warningCount: 0, canGenerate: true };
    }
    if (v.gaps.length === 0) {
      console.log(`[confirmAndGenerate] ${label} — sem gaps, gerando direto`);
      // CRÍTICO: envolver em try/catch pra erros não serem engolidos silenciosamente
      (async () => {
        try {
          await fn();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "erro desconhecido";
          console.error(`[generate-${label}] falha:`, err);
          toast.error(`Falha ao gerar ${label}: ${msg}`);
        }
      })();
      return;
    }
    console.log(`[confirmAndGenerate] ${label} — ${v.gaps.length} gap(s), abrindo modal`);
    setGateValidation(v);
    setPendingGenerator({ fn, label });
  }, [data]);

  const wrappedGeneratePDF      = useCallback(() => confirmAndGenerate(generatePDF,      "PDF"),      [confirmAndGenerate]);
  const wrappedGenerateDOCX     = useCallback(() => confirmAndGenerate(generateDOCX,     "DOCX"),     [confirmAndGenerate]);
  const wrappedGenerateExcel    = useCallback(() => confirmAndGenerate(generateExcel,    "Excel"),    [confirmAndGenerate]);
  const wrappedGenerateHTML     = useCallback(() => confirmAndGenerate(generateHTML,     "HTML"),     [confirmAndGenerate]);
  const wrappedGenerateHTMLView = useCallback(() => confirmAndGenerate(generateHTMLView, "Preview"),  [confirmAndGenerate]);

  // ═══════════════════════════════════════════════════
  // UI Render
  // ═══════════════════════════════════════════════════
  // Sidebar nav items
  const navItems = [
    { id: "sec-00", icon: "00", label: "Sumário Executivo" },
    { id: "sec-fs", icon: "FS", label: "Política do Fundo" },
    { id: "sec-05", icon: "05", label: "SCR / Bacen" },
    { id: "sec-07", icon: "07", label: "Processos Judiciais" },
    { id: "sec-op", icon: "OP", label: "Relatório de Visita" },
    { id: "sec-nt", icon: "✎", label: "Anotações" },
    { id: "sec-ex", icon: "⬇", label: "Exportar" },
  ];

  return (
    <div className="w-full animate-slide-up flex gap-8 items-start">

      {/* ── Sidebar de navegação (desktop) ── */}
      <nav className="hidden lg:flex flex-col gap-1.5 w-[240px] flex-shrink-0 sticky self-start" style={{ top: "80px" }}>
        <p className="text-[11px] font-bold text-cf-text-4 uppercase tracking-[0.14em] px-3 mb-1">Navegação</p>
        {navItems.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="flex items-center gap-3 py-2.5 px-3 rounded-xl text-[13px] font-medium text-cf-text-2 no-underline transition-all hover:bg-blue-50/80 hover:text-cf-navy hover:shadow-sm"
            onClick={e => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          >
            <span className="w-9 h-9 rounded-xl bg-cf-surface-2 flex items-center justify-center text-[11px] font-bold text-cf-text-3 shrink-0 shadow-sm">
              {item.icon}
            </span>
            <span className="leading-snug">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 min-w-0 pb-28 flex flex-col gap-7">

        {/* ════════════════════════════════════════
            SEÇÃO 00 — SUMÁRIO EXECUTIVO
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-00"
          badge="00"
          badgeVariant="navy"
          sectionLabel="Análise de Crédito"
          title="Sumário Executivo"
          headerRight={
            <StatusPill
              label={decision}
              variant={decision === "APROVADO" ? "green" : decision === "REPROVADO" ? "red" : "yellow"}
              dot
            />
          }
        >
          <div className="p-8 flex flex-col gap-6">

            {/* Alert banner: SCR vencidos ou prejuízos */}
            {(vencidosSCR > 0 || prejuizosVal > 0) && (
              <AlertBanner
                variant="danger"
                label="SCR"
                message={
                  vencidosSCR > 0 && prejuizosVal > 0
                    ? `Operações vencidas (R$ ${data.scr.vencidos}) e prejuízos (R$ ${data.scr.prejuizos}) detectados`
                    : vencidosSCR > 0
                    ? `Operações vencidas: R$ ${data.scr.vencidos}`
                    : `Prejuízos registrados: R$ ${data.scr.prejuizos}`
                }
              />
            )}

            {/* 4 KPI cards */}
            <div className="kpi-grid">
              <KpiCard
                label="Rating"
                value={`${finalRating}/10`}
                sub={(() => {
                  const conf = aiAnalysis?.ratingConfianca;
                  const nivel = aiAnalysis?.nivelAnalise;
                  if (conf != null) {
                    const nivelLabel = nivel === "PRELIMINAR" ? "Preliminar" : nivel === "BASICO" ? "Básica" : nivel === "PADRAO" ? "Padrão" : nivel === "COMPLETO" ? "Completa" : "";
                    return `${nivelLabel ? `${nivelLabel} · ` : ""}${conf}% confiança`;
                  }
                  return finalRating >= 7 ? "Perfil saudável" : finalRating >= 4 ? "Atenção recomendada" : "Perfil crítico";
                })()}
                variant={decision === "APROVADO" ? "success" : decision === "REPROVADO" ? "danger" : "warning"}
              />
              <KpiCard
                label="Dívida Total"
                value={dividaAtiva > 0 ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
                sub="SCR / Bacen"
                variant={dividaAtiva > 1000000 ? "warning" : "default"}
              />
              <KpiCard
                label="Protestos"
                value={String(protestosVigentes)}
                sub="vigentes"
                variant={protestosVigentes > 0 ? "danger" : "success"}
              />
              <KpiCard
                label="Proc. Passivos"
                value={data.processos ? (parseInt(data.processos.poloPassivoQtd || "0") > 0 ? String(parseInt(data.processos.poloPassivoQtd || "0")) : "—") : "—"}
                sub="polo passivo"
                variant={data.processos && parseInt(data.processos.poloPassivoQtd || "0") > 0 ? "warning" : "default"}
              />
            </div>

            {/* Banner de cobertura parcial */}
            {aiAnalysis?.nivelAnalise && aiAnalysis.nivelAnalise !== "COMPLETO" && (
              <div className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-2.5 mt-1 border ${
                aiAnalysis.nivelAnalise === "PRELIMINAR" ? "bg-orange-50 border-orange-200" :
                aiAnalysis.nivelAnalise === "BASICO" ? "bg-amber-50 border-amber-200" : "bg-sky-50 border-sky-200"
              }`}>
                <span className="text-base shrink-0 mt-px">
                  {aiAnalysis.nivelAnalise === "PRELIMINAR" ? "⚠️" : aiAnalysis.nivelAnalise === "BASICO" ? "📋" : "📊"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900">
                    Análise {aiAnalysis.nivelAnalise === "PRELIMINAR" ? "Preliminar" : aiAnalysis.nivelAnalise === "BASICO" ? "Básica" : "Padrão"}
                    {" "}· {aiAnalysis.ratingConfianca}% de confiança
                    {(aiAnalysis.coberturaDocumental?.chBonus ?? 0) > 0 && (
                      <span className="font-normal text-sky-700 ml-1.5">
                        (+{aiAnalysis.coberturaDocumental!.chBonus}pts CreditHub)
                      </span>
                    )}
                  </p>
                  {aiAnalysis.impactoDocsFaltantes && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {aiAnalysis.impactoDocsFaltantes as string}
                    </p>
                  )}
                  {/* Sinais CreditHub que compensaram a falta de docs */}
                  {(aiAnalysis.coberturaDocumental?.chSinais?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {aiAnalysis.coberturaDocumental!.chSinais!.map((s, i) => (
                        <span key={i} className={`text-[10px] font-medium px-[7px] py-0.5 rounded-[10px] border ${
                          s.limpo ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"
                        }`}>
                          {s.limpo ? "✓" : "!"} {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Info row 1: Empresa, CNPJ, Situação, Idade, Sócios */}
            <div className="border-t border-gray-200 pt-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200 rounded-xl overflow-hidden">
                <div className="bg-white px-6 py-5 col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Empresa</p>
                  <p className="text-lg font-bold text-gray-900">{data.cnpj.razaoSocial || "—"}</p>
                </div>
                <div className="bg-white px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">CNPJ</p>
                  <p className="text-base font-medium text-gray-900 font-mono tracking-wide">{data.cnpj.cnpj || "—"}</p>
                </div>
                <div className="bg-white px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Situação</p>
                  <p className="text-base font-medium text-gray-900">{data.cnpj.situacaoCadastral || "—"}</p>
                </div>
                <div className="bg-white px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Idade</p>
                  <p className="text-base font-medium text-gray-900">{companyAge || "—"}</p>
                </div>
              </div>
            </div>

            {/* Info row 2: Capital, Fat. Anual, Em Atraso, Prejuízos */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200 rounded-xl overflow-hidden">
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Sócios (QSA)</p>
                <p className="text-base font-medium text-gray-900">{String(qsaCount)}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Capital Social</p>
                <p className="text-base font-medium text-gray-900 font-mono">{data.qsa.capitalSocial || data.contrato.capitalSocial || "—"}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Fat. Anual</p>
                <p className="text-base font-medium text-gray-900 font-mono">{data.faturamento.somatoriaAno ? `R$ ${data.faturamento.somatoriaAno}` : "—"}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Em Atraso</p>
                <p className={`text-base font-medium font-mono ${atraso > 0 ? "text-red-600" : "text-gray-900"}`}>{atraso > 0 ? `R$ ${data.scr.operacoesEmAtraso}` : "—"}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Prejuízos</p>
                <p className={`text-base font-medium font-mono ${prejuizosVal > 0 ? "text-red-600" : "text-gray-900"}`}>{prejuizosVal > 0 ? `R$ ${data.scr.prejuizos}` : "—"}</p>
              </div>
            </div>

            {/* IA: loading */}
            {analyzingAI && (
              <div className="flex items-center gap-2.5 px-3.5 py-3 bg-cf-surface-2 rounded-lg">
                <Loader2 size={14} className="animate-spin text-cf-navy shrink-0" />
                <div>
                  <p className="text-xs font-medium text-cf-text-2">Analisando com IA...</p>
                  {analysisStatus && <p className="text-[11px] text-cf-text-4 mt-0.5">{analysisStatus}</p>}
                </div>
              </div>
            )}

            {/* IA: erro */}
            {!analyzingAI && analysisError && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-600 shrink-0" />
                  <span className="text-xs text-red-600">{analysisError}</span>
                </div>
                <button
                  onClick={handleReanalyze}
                  className="text-xs font-semibold text-white bg-red-600 border-none rounded-md px-3 py-1.5 cursor-pointer shrink-0 hover:bg-red-700 transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* IA: badges de contexto */}
            {aiAnalysis && !analyzingAI && (
              <>
                {aiAnalysis.coberturaAnalise && aiAnalysis.coberturaAnalise.nivel !== "completa" && (() => {
                  const ausentes = aiAnalysis.coberturaAnalise!.documentos.filter(d => !d.presente).map(d => d.label);
                  return ausentes.length > 0 ? (
                    <AlertBanner variant="warn" label="Análise Parcial" message={`Documentos ausentes: ${ausentes.join(", ")}. Score calculado com dados disponíveis.`} />
                  ) : null;
                })()}
                <div className="flex justify-end">
                  {analysisFromCache && (
                    <span className="text-[11px] text-cf-text-4 mr-3">Análise carregada do cache</span>
                  )}
                  <button onClick={handleReanalyze} disabled={analyzingAI} className="text-[11px] text-cf-text-4 bg-transparent border-none cursor-pointer underline hover:text-cf-text-2">
                    Reanalisar
                  </button>
                </div>
              </>
            )}

            {/* Alertas */}
            {alerts.length > 0 && <AlertList alerts={alerts} />}

            {/* Resumo executivo */}
            {resumoExecutivo && (
              <div className="px-6 py-5 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-bold uppercase tracking-[0.04em] text-blue-700 mb-2">Resumo Executivo</p>
                <p className="text-sm text-blue-800 leading-relaxed">{resumoExecutivo}</p>
              </div>
            )}

            {/* Pontos fortes */}
            {pontosFortes.length > 0 && (
              <div className="px-6 py-5 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm font-bold uppercase tracking-[0.04em] text-green-700 mb-3">
                  Pontos Fortes ({pontosFortes.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {pontosFortes.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-green-700">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pontos fracos */}
            {pontosFracos.length > 0 && (
              <div className="px-6 py-5 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-bold uppercase tracking-[0.04em] text-red-700 mb-3">
                  Pontos Fracos ({pontosFracos.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {pontosFracos.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-red-600">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Perguntas para visita */}
            {perguntasVisita.length > 0 && (
              <div className="px-6 py-5 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm font-bold uppercase tracking-[0.04em] text-amber-700 mb-3">
                  Perguntas para Visita ({perguntasVisita.length})
                </p>
                <div className="flex flex-col gap-2.5">
                  {perguntasVisita.map((q, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-amber-700">{i + 1}. {q.pergunta}</p>
                      <p className="text-[11px] text-amber-900 mt-0.5">{q.contexto}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </SectionCard>

        {/* ── Editar dados do relatório (collapsible) ── */}
        <div className="bg-white overflow-hidden border border-gray-200 rounded-[14px]">
          <button
            onClick={() => setEditing(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200 ${editing ? "bg-cf-navy" : "bg-cf-surface-2"}`}>
                <Pencil size={14} className={editing ? "text-white" : "text-cf-text-3"} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-cf-text-1">Editar dados do relatório</p>
                <p className="text-[11px] text-cf-text-4 mt-px">Ajuste os campos antes de gerar</p>
              </div>
            </div>
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-all duration-200 ${editing ? "bg-cf-navy text-white" : "bg-cf-surface-2 text-cf-text-3"}`}>
              {editing ? "Fechar" : "Abrir"}
            </span>
          </button>

          {editing && (
            <div className="border-t border-gray-200 px-5 pt-4 pb-5 animate-fade-in space-y-5">
              {/* Identificação */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" />
                  Identificação da Empresa
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Razão Social", "razaoSocial"], ["Nome Fantasia", "nomeFantasia"], ["CNPJ", "cnpj"],
                    ["Data Abertura", "dataAbertura"], ["Situação", "situacaoCadastral"], ["Data Situação", "dataSituacaoCadastral"],
                    ["Motivo Situação", "motivoSituacao"], ["Natureza Jurídica", "naturezaJuridica"],
                    ["CNAE Principal", "cnaePrincipal"], ["Porte", "porte"], ["Capital Social", "capitalSocialCNPJ"],
                    ["Endereço", "endereco"], ["Telefone", "telefone"], ["E-mail", "email"],
                  ] as [string, keyof typeof data.cnpj][]).map(([label, key]) => (
                    <div key={key} className={key === "razaoSocial" || key === "endereco" || key === "naturezaJuridica" || key === "cnaePrincipal" ? "col-span-2" : ""}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      <input value={data.cnpj[key]} onChange={e => setCNPJ(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Estrutura Societária */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block" />
                  Estrutura Societária
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([["Capital Social", "capitalSocial"], ["Data Constituição", "dataConstituicao"]] as [string, keyof typeof data.contrato][]).map(([label, key]) => (
                    <div key={key}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      <input value={data.contrato[key] as string} onChange={e => setContrato(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Objeto Social</label>
                    <textarea value={data.contrato.objetoSocial} onChange={e => setContrato("objetoSocial", e.target.value)} rows={3} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                  </div>
                </div>
              </div>

              {/* Perfil de Crédito */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-warning inline-block" />
                  Perfil de Crédito
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Total Dívidas (R$)", "totalDividasAtivas"], ["Classificação Risco", "classificacaoRisco"],
                    ["A Vencer (R$)", "operacoesAVencer"], ["Em Atraso", "operacoesEmAtraso"],
                    ["Vencidas (R$)", "operacoesVencidas"], ["Tempo Atraso", "tempoAtraso"],
                    ["Prejuízos", "prejuizos"], ["Coobrigações", "coobrigacoes"],
                    ["Carteira a Vencer", "carteiraAVencer"], ["Vencidos", "vencidos"],
                    ["Limite Crédito", "limiteCredito"], ["Histórico", "historicoInadimplencia"],
                  ] as [string, keyof typeof data.scr][]).map(([label, key]) => (
                    <div key={key as string} className={key === "historicoInadimplencia" ? "col-span-2" : ""}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      {key === "historicoInadimplencia"
                        ? <textarea value={data.scr[key] as string} onChange={e => setSCR(key, e.target.value)} rows={2} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                        : <input value={data.scr[key] as string} onChange={e => setSCR(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* Parecer */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" />
                  Parecer Final
                </p>
                <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Resumo do Risco / Parecer</label>
                <textarea value={data.resumoRisco} onChange={e => setResumoRisco(e.target.value)} rows={4} className="input-field py-1.5 text-xs mt-0.5 resize-none" placeholder="Descreva o parecer final sobre a empresa analisada..." />
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
            SEÇÃO FS — PARÂMETROS DO FUNDO
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-fs"
          badge="FS"
          badgeVariant="navy"
          sectionLabel="Critérios de Elegibilidade"
          title="Política do Fundo"
          headerRight={
            <div className="flex items-center gap-2">
              {fundPresets.length > 0 && (
                <select
                  value={selectedPresetId ?? "active"}
                  onChange={e => setSelectedPresetId(e.target.value)}
                  className="text-[11px] font-medium text-cf-text-2 bg-cf-surface-2 border border-cf-border rounded-md px-2 py-1 cursor-pointer outline-none max-w-[160px]"
                >
                  <option value="active">Configurações Ativas</option>
                  {fundPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {fundValidation.failCount > 0 && (
                <StatusPill label={`${fundValidation.failCount} reprovado${fundValidation.failCount !== 1 ? "s" : ""}`} variant="red" />
              )}
              {fundValidation.warnCount > 0 && (
                <StatusPill label={`${fundValidation.warnCount} atenção`} variant="yellow" />
              )}
              <StatusPill
                label={`${fundValidation.passCount}/${fundValidation.criteria.length} ok`}
                variant={fundValidation.failCount > 0 ? "red" : fundValidation.warnCount > 0 ? "yellow" : "green"}
              />
            </div>
          }
        >
          {/* Critérios */}
          <div className="border-b border-gray-200 divide-y divide-gray-100">
            {fundValidation.criteria.map((c) => (
              <div key={c.id}>
                <CriteriaItem
                  status={c.status}
                  name={c.label}
                  eliminatorio={c.eliminatoria}
                  limit={c.threshold}
                  value={c.actual}
                  detail={c.detail}
                />
              </div>
            ))}
          </div>

          {/* Resultado + detalhes LC */}
          <div className="px-8 py-6 flex flex-col gap-4">
            <ResultadoBox
              title={
                creditLimit.classificacao === "REPROVADO"
                  ? "Empresa não elegível para este perfil"
                  : `Limite sugerido: R$ ${Math.round(creditLimit.limiteAjustado).toLocaleString("pt-BR")}`
              }
              sub={
                creditLimit.classificacao === "REPROVADO"
                  ? `${fundValidation.failCount} critério(s) eliminatório(s) não atendido(s)`
                  : creditLimit.classificacao === "CONDICIONAL"
                  ? `Reduzido 30% por ${fundValidation.warnCount} critério(s) de atenção — perfil "${selectedPresetName}"`
                  : `Todos os ${fundValidation.passCount} critérios atendidos — perfil "${selectedPresetName}"`
              }
              badge={creditLimit.classificacao === "CONDICIONAL" ? "APROVAÇÃO CONDICIONAL" : creditLimit.classificacao}
              variant={creditLimit.classificacao === "APROVADO" ? "aprovado" : creditLimit.classificacao === "REPROVADO" ? "reprovado" : "pendente"}
            />

            {creditLimit.classificacao !== "REPROVADO" && (
              <div className="kpi-grid">
                <KpiCard
                  label="Prazo máximo"
                  value={`${creditLimit.prazo} dias`}
                  sub={creditLimit.classificacao === "APROVADO" ? "Aprovado" : "Condicional"}
                />
                <KpiCard
                  label="Revisão em"
                  value={new Date(creditLimit.dataRevisao).toLocaleDateString("pt-BR")}
                  sub={`em ${creditLimit.revisaoDias} dias`}
                />
                <KpiCard
                  label="Conc. máx./sacado"
                  value={`R$ ${Math.round(creditLimit.limiteConcentracao).toLocaleString("pt-BR")}`}
                  sub={`${creditLimit.concentracaoMaxPct}% do limite`}
                />
                <KpiCard
                  label="Base de cálculo"
                  value={`R$ ${Math.round(creditLimit.fmmBase).toLocaleString("pt-BR")}`}
                  sub={`FMM × ${creditLimit.fatorBase}x`}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: selectedPresetColor }} />
                <span className="text-[11px] text-cf-text-4">{selectedPresetName}</span>
              </div>
              <a href="/configuracoes" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-cf-navy no-underline hover:underline">
                Gerenciar perfis →
              </a>
            </div>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════
            SEÇÃO 05 — SCR / BACEN
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-05"
          badge="05"
          badgeVariant="navy"
          sectionLabel="Perfil de Crédito"
          title="SCR / Bacen"
        >
          <div className="px-8 py-6 flex flex-col gap-5">

            {data.scr.semHistorico && (
              <AlertBanner variant="warn" label="Sem histórico bancário" message="Empresa sem operações registradas no SCR / Banco Central" />
            )}

            {/* KPIs linha 1 */}
            <div className="kpi-grid">
              <KpiCard
                label="Total Dívidas"
                value={dividaAtiva > 0 ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
                variant={dividaAtiva > 1000000 ? "warning" : "default"}
              />
              <KpiCard
                label="A Vencer"
                value={data.scr.carteiraAVencer ? `R$ ${data.scr.carteiraAVencer}` : "—"}
              />
              <KpiCard
                label="Vencidos"
                value={vencidosSCR > 0 ? `R$ ${data.scr.vencidos}` : "—"}
                variant={vencidosSCR > 0 ? "danger" : "default"}
              />
              <KpiCard
                label="Prejuízos"
                value={prejuizosVal > 0 ? `R$ ${data.scr.prejuizos}` : "—"}
                variant={prejuizosVal > 0 ? "danger" : "default"}
              />
            </div>

            {/* KPIs linha 2 */}
            <div className="kpi-grid">
              <KpiCard label="Op. a Vencer" value={data.scr.operacoesAVencer ? `R$ ${data.scr.operacoesAVencer}` : "—"} />
              <KpiCard
                label="Em Atraso"
                value={atraso > 0 ? `R$ ${data.scr.operacoesEmAtraso}` : "—"}
                variant={atraso > 0 ? "warning" : "default"}
              />
              <KpiCard
                label="Vencidas"
                value={vencidas > 0 ? `R$ ${data.scr.operacoesVencidas}` : "—"}
                variant={vencidas > 0 ? "danger" : "default"}
              />
              <KpiCard label="Coobrigações" value={data.scr.coobrigacoes ? `R$ ${data.scr.coobrigacoes}` : "—"} />
            </div>

            {/* KPIs linha 3 */}
            <div className="kpi-grid">
              <KpiCard label="Curto Prazo" value={data.scr.carteiraCurtoPrazo ? `R$ ${data.scr.carteiraCurtoPrazo}` : "—"} />
              <KpiCard label="Longo Prazo" value={data.scr.carteiraLongoPrazo ? `R$ ${data.scr.carteiraLongoPrazo}` : "—"} />
              <KpiCard label="Limite de Crédito" value={data.scr.limiteCredito ? `R$ ${data.scr.limiteCredito}` : "—"} />
            </div>

            {/* Modalidades */}
            {data.scr.modalidades.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2">Modalidades de Crédito</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <ScrTable
                    columns={["Modalidade", "Total", "A Vencer", "Vencido", "Part."]}
                    rows={data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido, m.participacao])}
                  />
                </div>
              </div>
            )}

            {/* Instituições */}
            {data.scr.instituicoes.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2">Instituições Credoras</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.scr.instituicoes.map((inst, i) => (
                    <span key={i} className="bg-gray-100 text-cf-text-2 text-xs font-medium px-2.5 py-1 rounded-md">
                      {inst.nome}: <span className="font-mono">R$ {inst.valor}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Inadimplência */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2">Histórico de Inadimplência</p>
              {data.scr.historicoInadimplencia ? (
                <AlertBanner variant="warn" label="Histórico" message={data.scr.historicoInadimplencia} />
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                  <p className="text-xs font-medium text-green-700">Sem registro de operações vencidas ou prejuízos</p>
                </div>
              )}
            </div>

          </div>
        </SectionCard>

        {/* ════════════════════════════════════════
            SEÇÃO 07 — PROCESSOS JUDICIAIS
            ════════════════════════════════════════ */}
        {data.processos && (parseInt(data.processos.passivosTotal || "0") > 0 || data.processos.temRJ || (data.processos.distribuicao?.length ?? 0) > 0) && (() => {
          const proc = data.processos!;
          const passivosN  = parseInt(proc.passivosTotal  || "0");
          const ativosN    = parseInt(proc.ativosTotal    || "0");
          if (passivosN === 0 && ativosN === 0 && !proc.temRJ) return null;
          const poloAtivoN = parseInt(proc.poloAtivoQtd  || "0");
          const poloPassN  = parseInt(proc.poloPassivoQtd || "0");
          const dividasN   = parseInt(proc.dividasQtd    || "0");
          return (
            <SectionCard
              id="sec-07"
              badge="07"
              badgeVariant="navy"
              sectionLabel="Processos Judiciais"
              title="Credit Hub"
              headerRight={proc.temRJ ? <StatusPill label="RECUPERAÇÃO JUDICIAL" variant="red" /> : undefined}
            >
              <div className="px-8 py-6 flex flex-col gap-5">

                <div className="kpi-grid">
                  <KpiCard label="Total Processos" value={passivosN > 0 ? String(passivosN) : "—"} sub="todos os polos" variant={passivosN > 0 ? "warning" : "default"} />
                  <KpiCard label="Polo Ativo"      value={poloAtivoN > 0 ? String(poloAtivoN) : "—"} sub="empresa autora" />
                  <KpiCard label="Polo Passivo"    value={poloPassN > 0 ? String(poloPassN) : "—"} sub="empresa ré" variant={poloPassN > 0 ? "warning" : "default"} />
                  <KpiCard label="Dívidas"         value={dividasN > 0 ? String(dividasN) : "—"} sub="vencidas" variant={dividasN > 0 ? "danger" : "default"} />
                </div>

                {proc.valorTotalEstimado && proc.valorTotalEstimado !== "0,00" && (
                  <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-amber-700">Valor Total Estimado</p>
                    <p className="text-xl font-medium text-amber-700 font-mono">R$ {proc.valorTotalEstimado}</p>
                  </div>
                )}

                {(proc.distribuicao?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2.5">Distribuição por Tipo</p>
                    <MetricBarChart
                      items={proc.distribuicao!.slice(0, 8).map(d => ({
                        label: d.tipo,
                        count: Number(d.qtd),
                        pct: Number(d.pct),
                        highlight: /execu|falên/i.test(d.tipo),
                      }))}
                    />
                  </div>
                )}

                {(proc.distribuicaoTemporal?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2.5">Antiguidade dos Processos</p>
                    <div className="kpi-grid">
                      {proc.distribuicaoTemporal!.map((dt, i) => (
                        <KpiCard key={i} label={dt.periodo} value={String(dt.qtd)} sub={`R$ ${dt.valor}`} />
                      ))}
                    </div>
                  </div>
                )}

                {proc.top10Valor && proc.top10Valor.filter(p => p.numero || p.tipo).length > 0 && (() => {
                  const reais = proc.top10Valor!.filter(p => (p.numero || p.tipo) && p.tipo !== "DÍVIDA");
                  if (reais.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2.5">Maiores Processos por Valor</p>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <ScrTable
                          columns={["Número", "Tipo", "Data", "Valor", "Status"]}
                          rows={reais.slice(0, 5).map(p => [
                            <span key="n" className="font-mono text-[10px]">{p.numero || "—"}</span>,
                            p.tipo || "—",
                            p.data || "—",
                            <span key="v" className="font-medium text-amber-700 font-mono">R$ {p.valor}</span>,
                            p.status ? <StatusPill key="s" label={p.status.slice(0, 20)} variant="gray" /> : <span key="s" className="text-cf-text-4">—</span>,
                          ])}
                        />
                      </div>
                    </div>
                  );
                })()}

              </div>
            </SectionCard>
          );
        })()}

        {/* ════════════════════════════════════════
            SEÇÃO OP — RELATÓRIO DE VISITA
            ════════════════════════════════════════ */}
        <VisitaSection data={data} />

        {/* ════════════════════════════════════════
            SEÇÃO ✎ — ANOTAÇÕES
            ════════════════════════════════════════ */}
        <NotasSection
          analystNotes={analystNotes}
          onNotesChange={setAnalystNotes}
          onSave={saveNotes}
          savingNotes={savingNotes}
        />

        {/* ── Integrantes do Comitê ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Integrantes do Comit&ecirc;
          </label>
          <input
            type="text"
            value={committeMembers}
            onChange={e => setCommitteMembers(e.target.value)}
            placeholder="Ex: Luiz Carlos, Débora Santos, Gleyson Azevedo"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
          />
        </div>

        {/* ════════════════════════════════════════
            SEÇÃO ↓ — EXPORTAR
            ════════════════════════════════════════ */}
        <ExportSection
          generatedFormats={generatedFormats}
          generatingFormat={generatingFormat}
          generatePDF={wrappedGeneratePDF}
          generateDOCX={wrappedGenerateDOCX}
          generateExcel={wrappedGenerateExcel}
          generateHTML={wrappedGenerateHTML}
          generateHTMLView={wrappedGenerateHTMLView}
        />

        {/* ── Sticky bottom action bar ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200">
          <div className="max-w-[1720px] mx-auto px-8 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="btn-secondary min-h-0 px-4 py-2 text-[13px]">
                <ArrowLeft size={13} /> Voltar
              </button>
              {onReset && (
                <button
                  onClick={() => { try { localStorage.removeItem(NOTES_KEY); } catch { /* ignore */ } onReset(); }}
                  className="flex items-center gap-1 text-xs text-cf-text-4 bg-transparent border-none cursor-pointer px-2 py-1.5 rounded-md hover:text-cf-text-2 hover:bg-gray-100 transition-colors"
                >
                  <RotateCcw size={12} /> Recomeçar
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {savedFeedback && <StatusPill label="Salvo" variant="green" dot />}
              {generatedFormats.size > 0 && (
                <StatusPill
                  label={`${generatedFormats.size} formato${generatedFormats.size > 1 ? "s" : ""} gerado${generatedFormats.size > 1 ? "s" : ""}`}
                  variant="green"
                  dot
                />
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <GoalfyButton data={data} aiAnalysis={aiAnalysis} settings={fundSettings} disabled={!aiAnalysis} />
              <button
                onClick={handleGoToParecer}
                disabled={finishing}
                className="btn-green min-h-0 px-[18px] py-2 text-[13px] flex items-center gap-1.5"
              >
                {finishing
                  ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                  : <>Registrar Parecer <ArrowRight size={13} /></>
                }
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ── Validation gate modal (Fase 3.2) ── */}
      {/* Portal porque o wrapper pai tem animate-slide-up (transform) que cria
          um stacking context novo, fazendo position:fixed ficar confinado.
          Renderizar direto no document.body resolve. */}
      {pendingGenerator && gateValidation && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-fade-in"
          onClick={() => setPendingGenerator(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-6 py-4 border-b flex items-center gap-3 ${gateValidation.criticalCount > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <AlertTriangle size={22} className={gateValidation.criticalCount > 0 ? "text-red-600" : "text-amber-600"} />
              <div className="flex-1">
                <div className={`text-sm font-bold ${gateValidation.criticalCount > 0 ? "text-red-900" : "text-amber-900"}`}>
                  {gateValidation.criticalCount > 0
                    ? `${gateValidation.criticalCount} problema${gateValidation.criticalCount > 1 ? "s" : ""} crítico${gateValidation.criticalCount > 1 ? "s" : ""} impede${gateValidation.criticalCount > 1 ? "m" : ""} a geração`
                    : `${gateValidation.warningCount} alerta${gateValidation.warningCount > 1 ? "s" : ""} — revisar antes de gerar?`}
                </div>
                <div className={`text-[11px] mt-0.5 ${gateValidation.criticalCount > 0 ? "text-red-700" : "text-amber-700"}`}>
                  {gateValidation.criticalCount > 0
                    ? "Corrija os pontos abaixo ou escolha gerar mesmo assim."
                    : `O relatório ${pendingGenerator.label} será gerado com os campos disponíveis.`}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
              {gateValidation.gaps.map((gap, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${gap.severity === "critical" ? "bg-red-50/50 border-red-200" : "bg-amber-50/40 border-amber-200"}`}
                >
                  <div className={`text-[12px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${gap.severity === "critical" ? "text-red-800" : "text-amber-800"}`}>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{
                      background: gap.severity === "critical" ? "#dc2626" : "#d97706",
                      color: "#fff",
                    }}>{gap.severity === "critical" ? "CRÍTICO" : "ALERTA"}</span>
                    {gap.label}
                  </div>
                  <ul className="text-[11px] text-[#374151] space-y-0.5 pl-1">
                    {gap.fields.map((f, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <span className={gap.severity === "critical" ? "text-red-500" : "text-amber-500"}>•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setPendingGenerator(null)}
                className="text-[13px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors"
              >
                Voltar e revisar
              </button>
              <button
                onClick={async () => {
                  const fn = pendingGenerator.fn;
                  const label = pendingGenerator.label;
                  setPendingGenerator(null);
                  try {
                    await fn();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Erro desconhecido";
                    console.error(`[generate-${label}] falha:`, err);
                    toast.error(`Falha ao gerar ${label}: ${msg}`);
                  }
                }}
                className={`text-[13px] font-semibold text-white rounded-lg px-4 py-2 transition-colors ${gateValidation.criticalCount > 0 ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
              >
                {gateValidation.criticalCount > 0 ? "Gerar assim mesmo" : "Gerar " + pendingGenerator.label}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

