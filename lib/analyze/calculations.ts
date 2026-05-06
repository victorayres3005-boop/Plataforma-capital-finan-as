/**
 * Cálculos da rota /api/analyze.
 *
 * Funções puras de cálculo de cobertura documental, pré-requisitos do
 * fundo, alavancagem, e helpers (parseBRL, pct, countEmptyFieldRatio).
 * Não fazem chamadas a rede ou banco — só transformam dados.
 *
 * Importadas por `app/api/analyze/route.ts` (POST handler) e por
 * `lib/analyze/prompts.ts` (PROMPT_SINTESE depende de
 * calcularPreRequisitos para ReturnType).
 */

import type { FundSettings } from "@/types";
import { DEFAULT_FUND_SETTINGS } from "@/types";

const DOC_WEIGHTS: Record<string, number> = {
  cnpj:             15,  // obrigatório
  scr:              25,  // essencial
  faturamento:      20,  // essencial
  dre:              12,  // complementar
  balanco:           8,  // complementar
  irSocios:          6,  // complementar
  curvaABC:         10,  // essencial FIDC — qualidade da carteira de sacados
  relatorio_visita:  4,  // diferencial
};

// Pesos dos sinais CreditHub (bônus de cobertura — máx 18pts)
const CH_WEIGHTS = {
  protestos:         5,  // bureau de protestos consultado
  ccf:               5,  // cheque sem fundo consultado
  processos:         4,  // processos judiciais consultados
  capitalSocial:     2,  // capital social informado → proxy financeiro
  porteFuncionarios: 2,  // porte + funcionários → proxy operacional
};

type CreditHubSinal = {
  chave: string;
  label: string;
  valor: string;        // valor textual para injetar no prompt
  limpo: boolean;       // true = sinal positivo (sem ocorrências)
};

export type CoberturaResult = {
  cobertura: number;           // 0–100 (apenas documentos)
  coberturaEfetiva: number;    // 0–100 (documentos + bônus CreditHub)
  nivel: "PRELIMINAR" | "BASICO" | "PADRAO" | "COMPLETO";
  docsPresentes: string[];
  docsFaltantes: string[];
  confiancaBase: number;       // 0–100
  chBonus: number;             // pontos extras do CreditHub (0–18)
  chSinais: CreditHubSinal[];  // sinais CH disponíveis para o prompt
};

export function calcularCobertura(data: Record<string, unknown>): CoberturaResult {
  const docsPresentes: string[] = [];
  const docsFaltantes: string[] = [];
  let pesoTotal = 0;
  let pesoPresente = 0;

  for (const [doc, peso] of Object.entries(DOC_WEIGHTS)) {
    pesoTotal += peso;
    const val = data[doc];
    // Considera presente se tem dados extraídos e não é só erro de IA
    const temDados = val && typeof val === "object" &&
      !(val as Record<string, unknown>).aiError &&
      Object.values(val as Record<string, unknown>).some(v => v !== null && v !== "" && v !== undefined);

    if (temDados) {
      docsPresentes.push(doc);
      pesoPresente += peso;
    } else {
      docsFaltantes.push(doc);
    }
  }

  const cobertura = Math.round((pesoPresente / pesoTotal) * 100);

  // ── CreditHub: bônus de cobertura ──────────────────────────────
  let chBonus = 0;
  const chSinais: CreditHubSinal[] = [];

  // Protestos
  const protestos = data.protestos as Record<string, unknown> | null | undefined;
  const protestosConsultado = protestos &&
    (protestos.vigentesQtd !== undefined || protestos.detalhes !== undefined);
  if (protestosConsultado) {
    chBonus += CH_WEIGHTS.protestos;
    const qtd = parseInt(String(protestos?.vigentesQtd ?? "0"), 10) || 0;
    // parseBRL respeita formato BR (ex: "R$ 1.234,56" → 1234.56);
    // antes era replace(/\D/g, "") que misinterpretava "R$ 1.234,56" como 123456.
    const valNum = parseBRL(protestos?.vigentesValor);
    const limpo = qtd === 0;
    chSinais.push({
      chave: "protestos",
      label: "Protestos",
      valor: limpo
        ? "Sem protestos vigentes"
        : `${qtd} protesto(s) vigente(s) — R$ ${valNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      limpo,
    });
  }

  // CCF
  const ccf = data.ccf as Record<string, unknown> | null | undefined;
  if (ccf) {
    chBonus += CH_WEIGHTS.ccf;
    const qtd = Number(ccf.qtdRegistros ?? 0);
    const limpo = qtd === 0;
    chSinais.push({
      chave: "ccf",
      label: "CCF (Cheque Sem Fundo)",
      valor: limpo
        ? "Sem registros de cheque sem fundo"
        : `${qtd} registro(s) de CCF`,
      limpo,
    });
  }

  // Processos
  const processos = data.processos as Record<string, unknown> | null | undefined;
  const processosConsultado = processos &&
    (processos.passivosTotal !== undefined || processos.ativosTotal !== undefined);
  if (processosConsultado) {
    chBonus += CH_WEIGHTS.processos;
    const passivos = parseInt(String(processos?.passivosTotal ?? "0"), 10) || 0;
    const temRJ = Boolean(processos?.temRJ);
    const limpo = passivos === 0 && !temRJ;
    chSinais.push({
      chave: "processos",
      label: "Processos Judiciais",
      valor: limpo
        ? "Sem processos passivos relevantes"
        : temRJ
          ? `RECUPERAÇÃO JUDICIAL — ${passivos} processo(s) passivo(s)`
          : `${passivos} processo(s) passivo(s)`,
      limpo,
    });
  }

  // Capital Social (proxy financeiro para quando DRE/Balanço não estão disponíveis)
  const cnpj = data.cnpj as Record<string, unknown> | null | undefined;
  const capitalSocial = cnpj?.capitalSocialCNPJ as string | undefined;
  if (capitalSocial && capitalSocial !== "0" && capitalSocial !== "") {
    chBonus += CH_WEIGHTS.capitalSocial;
    chSinais.push({
      chave: "capitalSocial",
      label: "Capital Social",
      valor: `R$ ${capitalSocial} (proxy de porte financeiro)`,
      limpo: true,
    });
  }

  // Porte + Funcionários (proxy operacional)
  const porte = cnpj?.porte as string | undefined;
  const funcionarios = cnpj?.funcionarios as string | undefined;
  if (porte || funcionarios) {
    chBonus += CH_WEIGHTS.porteFuncionarios;
    const partes = [
      porte ? `Porte: ${porte}` : null,
      funcionarios ? `Funcionários: ${funcionarios}` : null,
    ].filter(Boolean).join(" | ");
    chSinais.push({
      chave: "porteFuncionarios",
      label: "Porte / Funcionários",
      valor: partes,
      limpo: true,
    });
  }

  // ── Cobertura efetiva = docs + bônus CH (máx 100) ──────────────
  const coberturaEfetiva = Math.min(100, cobertura + chBonus);

  const nivel: CoberturaResult["nivel"] =
    coberturaEfetiva < 45 ? "PRELIMINAR" :
    coberturaEfetiva < 65 ? "BASICO" :
    coberturaEfetiva < 85 ? "PADRAO" : "COMPLETO";

  // Confiança base: cobertura efetiva ponderada com teto por nível
  const confiancaBase =
    nivel === "PRELIMINAR" ? Math.min(55, Math.round(coberturaEfetiva * 1.1)) :
    nivel === "BASICO"     ? Math.min(72, Math.round(40 + coberturaEfetiva * 0.5)) :
    nivel === "PADRAO"     ? Math.min(88, Math.round(55 + coberturaEfetiva * 0.4)) :
    Math.min(100, Math.round(70 + coberturaEfetiva * 0.3));

  return { cobertura, coberturaEfetiva, nivel, docsPresentes, docsFaltantes, confiancaBase, chBonus, chSinais };
}

const DOC_LABELS: Record<string, string> = {
  cnpj: "Cartão CNPJ", scr: "SCR/Bacen", faturamento: "Extrato de Faturamento",
  dre: "DRE", balanco: "Balanço Patrimonial", irSocios: "IR dos Sócios",
  curvaABC: "Curva ABC de Clientes", relatorio_visita: "Relatório de Visita",
};

export function buildCoberturaBlock(cob: CoberturaResult): string {
  const presentesStr = cob.docsPresentes.map(d => DOC_LABELS[d] ?? d).join(", ") || "Nenhum";
  const faltantesStr = cob.docsFaltantes.map(d => DOC_LABELS[d] ?? d).join(", ") || "Nenhum";

  // Bloco CreditHub — só exibe se houver sinais
  let chBlock = "";
  if (cob.chSinais.length > 0) {
    const sinaisStr = cob.chSinais
      .map(s => `  • ${s.label}: ${s.valor}`)
      .join("\n");

    // Regras de compensação: quando docs financeiros faltam, o que o CH pode suprir
    const compensacoes: string[] = [];
    const temCapital = cob.chSinais.find(s => s.chave === "capitalSocial");
    const protestosLimpo = cob.chSinais.find(s => s.chave === "protestos" && s.limpo);
    const ccfLimpo = cob.chSinais.find(s => s.chave === "ccf" && s.limpo);
    const processosLimpo = cob.chSinais.find(s => s.chave === "processos" && s.limpo);
    const protestosSujo = cob.chSinais.find(s => s.chave === "protestos" && !s.limpo);
    const ccfSujo = cob.chSinais.find(s => s.chave === "ccf" && !s.limpo);
    const processosSujo = cob.chSinais.find(s => s.chave === "processos" && !s.limpo);

    const docsFaltantes = new Set(cob.docsFaltantes);
    if (temCapital && (docsFaltantes.has("dre") || docsFaltantes.has("balanco"))) {
      compensacoes.push(`Capital social disponível — use como referência de porte financeiro mínimo na ausência de DRE/Balanço`);
    }
    if (protestosLimpo && ccfLimpo) {
      compensacoes.push(`Bureau limpo (sem protestos + sem CCF) — sinal positivo de histórico de pagamentos; pode atenuar limitação documental em até 0.5 ponto no rating`);
    }
    if (processosLimpo && (docsFaltantes.has("dre") || docsFaltantes.has("faturamento"))) {
      compensacoes.push(`Sem passivos judiciais — reduz risco oculto; considere como fator positivo na análise`);
    }
    if (protestosSujo) {
      compensacoes.push(`ATENÇÃO: ${protestosSujo.valor} — penalize o rating mesmo sem documentos financeiros`);
    }
    if (ccfSujo) {
      compensacoes.push(`ATENÇÃO: ${ccfSujo.valor} — histórico de inadimplência bancária; limite rating a no máximo 6.0`);
    }
    if (processosSujo) {
      compensacoes.push(`ATENÇÃO: ${processosSujo.valor} — penalize conforme gravidade dos processos`);
    }

    const compensacoesStr = compensacoes.length > 0
      ? `\nRegras de compensação CH:\n${compensacoes.map(c => `  → ${c}`).join("\n")}`
      : "";

    chBlock = `\nDados CreditHub disponíveis (bônus +${cob.chBonus}pts na cobertura):\n${sinaisStr}${compensacoesStr}`;
  }

  return `\n\n--- COBERTURA DOCUMENTAL ---
Nível de análise: ${cob.nivel}
Cobertura documentos: ${cob.cobertura}% | Cobertura efetiva (c/ CreditHub): ${cob.coberturaEfetiva}%
Confiança base: ${cob.confiancaBase}%
Documentos disponíveis: ${presentesStr}
Documentos ausentes: ${faltantesStr}${chBlock}
--- FIM COBERTURA ---\n`;
}

// ─────────────────────────────────────────
// Few-shot: calibração do rating via histórico do comitê
// Fase 2 (vetorial) com fallback automático para Fase 1 (divergência)
export function parseBRL(val: unknown): number {
  if (typeof val === "number") return val;
  if (!val || typeof val !== "string") return 0;
  // Remove prefixos monetários (R$, espaços) — adapters de extração entregam
  // valores como "R$ 1.234,56" via _fmtMoneyBR. Sem este strip, parseFloat
  // tropeçava no R e retornava 0, derrubando eliminatórios SCR/alavancagem.
  const cleaned = val.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

// ─────────────────────────────────────────
// Pré-requisitos determinísticos
// ─────────────────────────────────────────
export function calcularPreRequisitos(data: Record<string, unknown>, settings: FundSettings) {
  const fat = (data.faturamento ?? {}) as Record<string, unknown>;

  // Recalcular FMM diretamente dos meses — ignora mediaAno cached
  const parseDateKey = (s: string): number => {
    if (!s) return 0;
    const parts = s.split("/");
    if (parts.length !== 2) return 0;
    const [p1, p2] = parts;
    const monthMap: Record<string, number> = {
      jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,
      jul:7,ago:8,set:9,out:10,nov:11,dez:12
    };
    const month = isNaN(Number(p1))
      ? (monthMap[p1.toLowerCase()] || 0)
      : Number(p1);
    const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
    return year * 100 + month;
  };

  const mesesValidos = [...((fat.meses as Array<{mes:string;valor:string}>) || [])]
    .filter((m) => m?.mes && m?.valor)
    .sort((a, b) => parseDateKey(a.mes) - parseDateKey(b.mes))
    .slice(-12);

  const fmm = mesesValidos.length > 0
    ? mesesValidos.reduce((s, m) => s + parseBRL(m.valor), 0) / mesesValidos.length
    : parseBRL(fat.mediaAno) || parseBRL(fat.mediaMensal) || 0;

  const cnpj = (data.cnpj ?? {}) as Record<string, unknown>;
  const dataAbertura = String(cnpj?.dataAbertura ?? "")
  let idadeAnos = 0

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataAbertura)) {
    // formato DD/MM/YYYY
    const [d, m, a] = dataAbertura.split("/").map(Number)
    idadeAnos = (Date.now() - new Date(a, m - 1, d).getTime())
                / (1000 * 60 * 60 * 24 * 365.25)
  } else if (/^\d{2}\/\d{4}$/.test(dataAbertura)) {
    // formato MM/YYYY — usar dia 1 do mês
    const [m, a] = dataAbertura.split("/").map(Number)
    idadeAnos = (Date.now() - new Date(a, m - 1, 1).getTime())
                / (1000 * 60 * 60 * 24 * 365.25)
  } else if (/^\d{4}$/.test(dataAbertura)) {
    // formato YYYY — usar 1º de janeiro
    const a = parseInt(dataAbertura)
    idadeAnos = (Date.now() - new Date(a, 0, 1).getTime())
                / (1000 * 60 * 60 * 24 * 365.25)
  }

  const motivoReprovacao: string[] = [];
  if (fmm > 0 && fmm < settings.fmm_minimo) {
    motivoReprovacao.push(`FMM de R$ ${fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} abaixo do minimo de R$ ${settings.fmm_minimo.toLocaleString("pt-BR")}/mes`);
  }
  if (idadeAnos === 0) {
    motivoReprovacao.push(
      "Data de abertura ausente ou formato inválido — " +
      "não foi possível verificar critério de idade mínima"
    )
  } else if (idadeAnos < settings.idade_minima_anos) {
    motivoReprovacao.push(`Empresa com ${idadeAnos.toFixed(1)} anos abaixo do minimo de ${settings.idade_minima_anos} anos`);
  }

  // ── Sanções CEIS/CNEP — eliminatório fixo ──
  const sancoes = (data as unknown as Record<string, unknown>).sancoes as Record<string, unknown> | undefined;
  if (sancoes?.consultado) {
    const sancoesCNPJ = (sancoes.sancoesCNPJ as unknown[]) ?? [];
    const sancoesSocios = (sancoes.sancoesSocios as unknown[]) ?? [];
    const ativas = [...sancoesCNPJ, ...sancoesSocios].filter((s: unknown) => (s as Record<string, unknown>).ativa);
    if (ativas.length > 0) {
      motivoReprovacao.push(`${ativas.length} sancao(oes) ativa(s) em CEIS/CNEP (Portal da Transparencia) — criterio eliminatorio`);
    }
  }

  // ── CCF — eliminatório fixo ──
  const protestos = (data.protestos ?? {}) as Record<string, unknown>;
  const processos = (data.processos ?? {}) as Record<string, unknown>;
  const scr = (data.scr ?? {}) as Record<string, unknown>;
  const ccf = (data.ccf ?? {}) as Record<string, unknown>;

  // Shape canônico: data.ccf.qtdRegistros (mesmo usado em calcularCobertura).
  // Aceita protestos.ccfQuantidade como fallback histórico (shape antigo).
  const ccfQtd = Number(ccf.qtdRegistros ?? protestos.ccfQuantidade ?? 0);
  if (ccfQtd > 0) {
    motivoReprovacao.push(`CCF: ${ccfQtd} ocorrencia(s) de cheques sem fundos — criterio eliminatorio`);
  }

  // ── Recuperação Judicial / Falência — eliminatório fixo ──
  const temRJ =
    String(processos.temRecuperacaoJudicial ?? processos.temRJ ?? "")
    .toLowerCase()
  const rjNaDistribuicao = Array.isArray(processos.distribuicao) &&
    processos.distribuicao.some((d: { tipo?: string }) =>
      String(d.tipo ?? "").toUpperCase().includes("RECUPERA") &&
      String(d.tipo ?? "").toUpperCase().includes("JUDICIAL")
    )
  if (temRJ === "sim" || temRJ === "true" || rjNaDistribuicao) {
    motivoReprovacao.push("Recuperação Judicial ativa — critério eliminatório")
  }
  const temRJExt = String(processos.temRecuperacaoExtrajudicial ?? "").toLowerCase();
  if (temRJExt === "sim" || temRJExt === "true") {
    motivoReprovacao.push("Recuperacao Extrajudicial ativa — criterio eliminatorio");
  }

  // ── Razão social — fallback RJ ──
  const razaoSocial = String(cnpj?.razaoSocial ?? "").toUpperCase()
  if (
    razaoSocial.includes("RECUPERACAO JUDICIAL") ||
    razaoSocial.includes("RECUPERAÇÃO JUDICIAL") ||
    razaoSocial.includes("EM RECUPERACAO") ||
    razaoSocial.includes("EM RECUPERAÇÃO")
  ) {
    motivoReprovacao.push(
      "Razão social indica Recuperação Judicial ativa — critério eliminatório"
    )
  }

  // ── Protestos vigentes — eliminatório configurável ──
  // Shape canônico: protestos.vigentesQtd (mesmo usado em calcularCobertura).
  // Aceita quantidadeVigentes/quantidade como fallback histórico.
  const protestosVigentes = Number(
    protestos.vigentesQtd ?? protestos.quantidadeVigentes ?? protestos.quantidade ?? 0,
  );
  const protestosMax = settings.protestos_max ?? DEFAULT_FUND_SETTINGS.protestos_max;
  if (protestosVigentes > protestosMax) {
    motivoReprovacao.push(`${protestosVigentes} protestos vigentes acima do limite de ${protestosMax}`);
  }

  // ── Processos passivos — eliminatório configurável ──
  // Shape canônico: processos.passivosTotal (mesmo usado em calcularCobertura).
  // Aceita iteração de processos.processos[] como fallback APENAS se o canônico
  // estiver ausente — passivosTotal===0 é valor legítimo (empresa sem passivos)
  // e não deve ativar o fallback.
  let processosPassivos: number;
  if (processos.passivosTotal != null) {
    processosPassivos = Number(processos.passivosTotal);
  } else {
    const processosLista = (processos.processos as Array<Record<string, unknown>>) ?? [];
    processosPassivos = processosLista.filter(p =>
      String(p.tipo ?? "").toLowerCase().includes("passivo") ||
      String(p.polo ?? "").toLowerCase().includes("passivo") ||
      String(p.polo ?? "").toLowerCase().includes("reu") ||
      String(p.polo ?? "").toLowerCase().includes("réu")
    ).length;
  }
  const processosMax = settings.processos_passivos_max ?? DEFAULT_FUND_SETTINGS.processos_passivos_max;
  if (processosPassivos > processosMax) {
    motivoReprovacao.push(`${processosPassivos} processos passivos acima do limite de ${processosMax}`);
  }

  // ── SCR vencidos % — eliminatório configurável ──
  const totalDividas = parseBRL(scr.totalDividasAtivas) || parseBRL(scr.carteiraAVencer) || 0;
  const vencidosSCR = parseBRL(scr.vencidos) || 0;
  const scrMaxPct = settings.scr_vencidos_max_pct ?? DEFAULT_FUND_SETTINGS.scr_vencidos_max_pct;
  if (totalDividas > 0 && vencidosSCR > 0) {
    const pctVencidos = (vencidosSCR / totalDividas) * 100;
    if (pctVencidos > scrMaxPct) {
      motivoReprovacao.push(`SCR vencidos em ${pctVencidos.toFixed(1)}% do total (limite: ${scrMaxPct}%)`);
    }
  }
  // Vencidos sem carteira ativa — dado inconsistente, reprova por segurança
  if (vencidosSCR > 0 && totalDividas === 0) {
    motivoReprovacao.push(`SCR vencidos declarados sem carteira ativa registrada — dado inconsistente, criterio eliminatorio por seguranca`);
  }

  // ── SCR prejuízos — eliminatório absoluto ──
  const prejuizosSCR = parseBRL(scr.prejuizos) || 0;
  if (prejuizosSCR > 0) {
    const prejFmt = prejuizosSCR.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    motivoReprovacao.push(`SCR prejuizos registrados: R$ ${prejFmt} — criterio eliminatorio`);
  }

  // ── Alavancagem > máxima — eliminatório da Política V2 ──
  const alavMax = settings.alavancagem_maxima ?? DEFAULT_FUND_SETTINGS.alavancagem_maxima;
  const totalDividasAlav = parseBRL(scr.totalDividasAtivas) || parseBRL(scr.carteiraAVencer) || 0;
  if (fmm > 0 && totalDividasAlav > 0) {
    const alavCalc = totalDividasAlav / fmm;
    if (alavCalc > alavMax) {
      motivoReprovacao.push(`Alavancagem ${alavCalc.toFixed(2)}x acima do limite maximo V2 de ${alavMax}x — criterio eliminatorio`);
    }
  }

  return {
    fmm,
    idadeAnos: Math.round(idadeAnos * 10) / 10,
    aprovadoPorPreRequisito: motivoReprovacao.length === 0,
    reprovadoPorPreRequisito: motivoReprovacao.length > 0,
    motivoReprovacao,
  };
}

// ─────────────────────────────────────────
// Cálculo de alavancagem
// ─────────────────────────────────────────
export function calcularAlavancagem(data: Record<string, unknown>, settings: FundSettings) {
  const scr = (data.scr ?? {}) as Record<string, unknown>;
  const fat = (data.faturamento ?? {}) as Record<string, unknown>;

  const totalDivida = parseBRL(scr.totalDividasAtivas) || parseBRL(scr.carteiraAVencer);
  const fmm = parseBRL(fat.mediaAno) || parseBRL(fat.mediaMensal) || parseBRL(fat.fmm12m);

  if (fmm === 0 || totalDivida === 0) {
    return { alavancagem: null, totalDivida, fmm, label: "Nao calculavel (FMM ou divida zerados)" };
  }

  const alavancagem = totalDivida / fmm;
  const label = alavancagem <= settings.alavancagem_saudavel
    ? `${alavancagem.toFixed(2)}x — dentro do limite saudavel`
    : alavancagem <= settings.alavancagem_maxima
    ? `${alavancagem.toFixed(2)}x — elevado (limite aceitavel ate ${settings.alavancagem_maxima}x)`
    : `${alavancagem.toFixed(2)}x — CRITICO (acima de ${settings.alavancagem_maxima}x)`;

  return { alavancagem: Math.round(alavancagem * 100) / 100, totalDivida, fmm, label };
}

// ─────────────────────────────────────────
// Validação de dados de entrada
// ─────────────────────────────────────────
export function countEmptyFieldRatio(obj: Record<string, unknown>): number {
  let total = 0;
  let empty = 0;

  function walk(value: unknown) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const v of Object.values(value as Record<string, unknown>)) {
        walk(v);
      }
    } else if (typeof value === "string") {
      total++;
      if (value === "") empty++;
    } else if (value === null || value === undefined) {
      total++;
      empty++;
    }
  }

  walk(obj);
  return total > 0 ? empty / total : 1;
}

export const pct = (v: string | number | null | undefined): string => {
  if (!v && v !== 0) return "0";
  return String(v).replace(/%/g, "").trim();
};

