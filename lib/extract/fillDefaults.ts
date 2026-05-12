/**
 * Defaults de extração: garantem que todo objeto saído do adapter
 * tenha TODOS os campos do tipo preenchidos (com `""` ou `[]` para
 * campos faltantes), evitando `undefined` runtime no consumo posterior.
 *
 * Cada `fill*Defaults(data: Partial<T>): T` corresponde a um tipo de
 * documento. `countFilledFields` e o tipo `AnyExtracted` ficam aqui
 * porque dependem de todos os tipos.
 */

import type {
  BalancoData, CNPJData, ContratoSocialData, CurvaABCData, DREData,
  FaturamentoData, GrupoEconomicoData, IRSocioData, ProcessosData,
  ProtestosData, QSAData, RelatorioVisitaData, SCRData,
  DividaAtivaData, CenprotData, GefipData,
} from "@/types";
import { sanitizeDescricaoDebitos, sanitizeStr, sanitizeEnum, sanitizeMoney } from "@/lib/extract/sanitize";
import { inferirAnosCronologicamente } from "@/lib/extract/inferAnoMeses";

export function fillCNPJDefaults(data: Partial<CNPJData>): CNPJData {
  return {
    razaoSocial: data.razaoSocial || "", nomeFantasia: data.nomeFantasia || "",
    cnpj: data.cnpj || "", dataAbertura: data.dataAbertura || "",
    situacaoCadastral: data.situacaoCadastral || "", dataSituacaoCadastral: data.dataSituacaoCadastral || "",
    motivoSituacao: data.motivoSituacao || "", naturezaJuridica: data.naturezaJuridica || "",
    cnaePrincipal: data.cnaePrincipal || "", cnaeSecundarios: data.cnaeSecundarios || "",
    porte: data.porte || "", capitalSocialCNPJ: data.capitalSocialCNPJ || "",
    endereco: data.endereco || "", telefone: data.telefone || "", email: data.email || "",
  };
}

export function fillQSADefaults(data: Partial<QSAData>): QSAData & { _incompleteCount?: number } {
  // Descarta socios totalmente vazios MAS conta quantos foram descartados
  // pra que a Review possa exibir "N socios foram detectados parcialmente".
  const raw = Array.isArray(data.quadroSocietario) ? data.quadroSocietario : [];
  let incompleteCount = 0;
  const quadro = raw
    .filter(s => {
      if (!s) { incompleteCount++; return false; }
      const hasName = !!(s.nome && s.nome.trim());
      const hasCpf = !!(s.cpfCnpj && s.cpfCnpj.trim());
      const hasQual = !!(s.qualificacao && s.qualificacao.trim());
      // Se so tem qualificacao/participacao e nada identificavel, e ruido
      if (!hasName && !hasCpf && !hasQual) { incompleteCount++; return false; }
      // Se so tem nome OU so tem CPF, mantem com warning no log
      if (!hasName || !hasCpf) {
        console.warn(`[extract][qsa] socio parcial mantido: nome="${s.nome ? s.nome.split(" ")[0] : "—"}" cpf="${s.cpfCnpj ? s.cpfCnpj.replace(/\D/g,"").slice(0,3)+"***" : "—"}"`);
      }
      return true;
    })
    .map(s => ({
      nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
      qualificacao: s.qualificacao || "", participacao: s.participacao || "",
    }));
  if (incompleteCount > 0) {
    console.warn(`[extract][qsa] ${incompleteCount} entrada(s) totalmente vazia(s) descartada(s)`);
  }
  const result: QSAData & { _incompleteCount?: number } = {
    capitalSocial: data.capitalSocial || "", quadroSocietario: quadro,
  };
  if (incompleteCount > 0) result._incompleteCount = incompleteCount;
  return result;
}

export function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData & { _incompleteCount?: number } {
  const raw = Array.isArray(data.socios) ? data.socios : [];
  let incompleteCount = 0;
  const socios = raw
    .filter(s => {
      if (!s) { incompleteCount++; return false; }
      const hasName = !!(s.nome && s.nome.trim());
      const hasCpf = !!(s.cpf && s.cpf.trim());
      const hasPart = !!(s.participacao && s.participacao.trim());
      if (!hasName && !hasCpf && !hasPart) { incompleteCount++; return false; }
      if (!hasName || !hasCpf) {
        console.warn(`[extract][contrato] socio parcial mantido: nome="${s.nome ? s.nome.split(" ")[0] : "—"}" cpf="${s.cpf ? s.cpf.replace(/\D/g,"").slice(0,3)+"***" : "—"}"`);
      }
      return true;
    })
    .map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }));
  if (incompleteCount > 0) {
    console.warn(`[extract][contrato] ${incompleteCount} entrada(s) totalmente vazia(s) descartada(s)`);
  }
  const result: ContratoSocialData & { _incompleteCount?: number } = {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
  if (incompleteCount > 0) result._incompleteCount = incompleteCount;
  return result;
}

export function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  const _mesAtualFiltro = new Date().getMonth() + 1;
  const _anoAtualFiltro = new Date().getFullYear();

  // Aplica inferência de ano ANTES dos filtros — cobre coletas antigas
  // no banco que foram salvas com alguns meses sem ano (caso GLOBOPACK).
  // Idempotente: se todos já têm MM/YYYY, retorna o array como veio.
  const mesesEntrada = Array.isArray(data.meses) ? data.meses : [];
  const mesesComAno = inferirAnosCronologicamente(mesesEntrada);

  const _mesesFuturosDropados: string[] = [];
  const meses = mesesComAno
    .filter(m => {
      if (!m.mes) return false;
      const [mesNum, anoNum] = m.mes.split("/").map(Number);
      if (!mesNum || !anoNum) return false;

      // Meses futuros: marca como dropado pra expor na Review, nao silencia
      if (anoNum > _anoAtualFiltro || (anoNum === _anoAtualFiltro && mesNum > _mesAtualFiltro)) {
        _mesesFuturosDropados.push(m.mes);
        return false;
      }
      return true;
    });
  if (_mesesFuturosDropados.length > 0) {
    console.warn(`[extract][faturamento] ${_mesesFuturosDropados.length} mes(es) futuro(s) descartado(s): ${_mesesFuturosDropados.join(", ")}`);
  }
  const parseBR = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenados = [...meses].sort((a, b) => {
    const [mesA, anoA] = (a.mes || "").split("/").map(Number);
    const [mesB, anoB] = (b.mes || "").split("/").map(Number);
    return (anoA - anoB) || (mesA - mesB);
  });

  const meses12 = ordenados.slice(-12);
  const soma12 = meses12.reduce((s, m) => s + parseBR(m.valor), 0);
  const fmm12m = meses12.length > 0 ? soma12 / meses12.length : 0;

  const porAno: Record<string, number[]> = {};
  for (const m of ordenados) {
    const parts = (m.mes || "").split("/");
    const anoRaw = parts[1] || "";
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    if (!ano) continue;
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(parseBR(m.valor));
  }

  const fmmAnual: Record<string, number> = {};
  for (const [ano, valores] of Object.entries(porAno)) {
    const somaAno = valores.reduce((s, v) => s + v, 0);
    fmmAnual[ano] = somaAno / valores.length;
  }

  const anosCompletos = Object.entries(porAno).filter(([, v]) => v.length === 12);
  const fmmMedio = anosCompletos.length > 0
    ? anosCompletos.reduce((s, [ano]) => s + fmmAnual[ano], 0) / anosCompletos.length
    : fmm12m;

  const anoAtual = String(new Date().getFullYear());
  const fmmAnoAtual = fmmAnual[anoAtual];
  let tendencia: "crescimento" | "estavel" | "queda" | "indefinido" = "indefinido";
  if (fmmAnoAtual && fmm12m > 0) {
    const delta = (fmmAnoAtual - fmm12m) / fmm12m;
    if (delta > 0.05) tendencia = "crescimento";
    else if (delta < -0.05) tendencia = "queda";
    else tendencia = "estavel";
  }

  // somatoriaAno = soma dos últimos 12 meses (valor anualizado, não total histórico)
  const soma12m = meses12.reduce((s, m) => s + parseBR(m.valor), 0);

  const mesesZerados = meses12
    .filter(m => parseBR(m.valor) === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  const result = {
    meses,
    somatoriaAno: fmtBR(soma12m),
    mediaAno: fmtBR(fmm12m),
    fmm12m: fmtBR(fmm12m),
    fmmAnual: Object.fromEntries(
      Object.entries(fmmAnual).map(([ano, v]) => [ano, fmtBR(v)])
    ),
    fmmMedio: fmtBR(fmmMedio),
    tendencia,
    faturamentoZerado: meses.length === 0 || meses.every(m => parseBR(m.valor) === 0),
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || (ordenados.length > 0 ? ordenados[ordenados.length - 1].mes : ""),
    mesesZerados,
    quantidadeMesesZerados: mesesZerados.length,
    temMesesZerados: mesesZerados.length > 0,
  } as FaturamentoData & { _mesesFuturosIgnorados?: string[] };
  if (_mesesFuturosDropados.length > 0) result._mesesFuturosIgnorados = _mesesFuturosDropados;
  return result;
}

export function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  // Normaliza faixas key-por-key para evitar objetos vazios {} que passam pelo ||
  const f = data.faixasAVencer as Record<string, string> | undefined;
  const fv = data.faixasVencidos as Record<string, string> | undefined;
  const faixasAVencer: SCRData["faixasAVencer"] = {
    ate30d: f?.ate30d || "", d31_60: f?.d31_60 || "", d61_90: f?.d61_90 || "",
    d91_180: f?.d91_180 || "", d181_360: f?.d181_360 || "", acima360d: f?.acima360d || "",
    prazoIndeterminado: f?.prazoIndeterminado || "", total: f?.total || "",
  };
  const faixasVencidos: SCRData["faixasVencidos"] = {
    ate30d: fv?.ate30d || "", d31_60: fv?.d31_60 || "", d61_90: fv?.d61_90 || "",
    d91_180: fv?.d91_180 || "", d181_360: fv?.d181_360 || "", acima360d: fv?.acima360d || "",
    total: fv?.total || "",
  };

  // ─── FALLBACK: curto/longo prazo quando faixas não foram extraídas ───
  // Se o prompt não encontrou a seção "Discriminação A Vencer por Faixa de
  // Prazo", carteiraCurtoPrazo fica vazia mas carteiraAVencer pode ter valor.
  // Deriva: curto = aVencer - acima360d (fallback mínimo: tudo é curto prazo).
  const parseMoney = (s: unknown): number => {
    if (s == null || s === "") return 0;
    const str = String(s).trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  };
  let carteiraCurtoPrazo = data.carteiraCurtoPrazo || "";
  let carteiraLongoPrazo = data.carteiraLongoPrazo || "";
  const aVencerNum = parseMoney(data.carteiraAVencer);
  const curtoNum   = parseMoney(carteiraCurtoPrazo);
  const longoNum   = parseMoney(carteiraLongoPrazo);
  if (curtoNum === 0 && longoNum === 0 && aVencerNum > 0) {
    // Nenhum dado de faixa — deriva pelo total a vencer.
    // Longo prazo (BCB) = acima 360 dias + prazo indeterminado.
    const acima360 = parseMoney(faixasAVencer.acima360d);
    const indeterminado = parseMoney(faixasAVencer.prazoIndeterminado);
    const longoDerivado = acima360 + indeterminado;
    const curtoDerivado = Math.max(0, aVencerNum - longoDerivado);
    carteiraCurtoPrazo = curtoDerivado.toFixed(2).replace(".", ",");
    carteiraLongoPrazo = longoDerivado.toFixed(2).replace(".", ",");
    console.log(`[scr-fallback] curto/longo derivados de carteiraAVencer=${aVencerNum} (curto=${curtoDerivado}, longo=${longoDerivado})`);
  }

  return {
    // Identificação — preservar para roteamento PJ vs PF
    tipoPessoa: data.tipoPessoa || undefined,
    nomeCliente: data.nomeCliente || "",
    cpfSCR: data.cpfSCR || "",
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer: data.carteiraAVencer || "", vencidos: data.vencidos || "",
    prejuizos: data.prejuizos || "", limiteCredito: data.limiteCredito || "",
    qtdeInstituicoes: data.qtdeInstituicoes || "", qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas: data.totalDividasAtivas || "", operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "", operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "", coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo, carteiraLongoPrazo,
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
    // Campos detalhados
    cnpjSCR: data.cnpjSCR || "",
    pctDocumentosProcessados: data.pctDocumentosProcessados || "",
    pctVolumeProcessado: data.pctVolumeProcessado || "",
    faixasAVencer,
    faixasVencidos,
    faixasPrejuizos: { ate12m: data.faixasPrejuizos?.ate12m || "", acima12m: data.faixasPrejuizos?.acima12m || "", total: data.faixasPrejuizos?.total || "" },
    faixasLimite: { ate360d: data.faixasLimite?.ate360d || "", acima360d: data.faixasLimite?.acima360d || "", total: data.faixasLimite?.total || "" },
    outrosValores: {
      carteiraCredito: data.outrosValores?.carteiraCredito || "",
      responsabilidadeTotal: data.outrosValores?.responsabilidadeTotal || "",
      riscoTotal: data.outrosValores?.riscoTotal || "",
      coobrigacaoAssumida: data.outrosValores?.coobrigacaoAssumida || "",
      coobrigacaoRecebida: data.outrosValores?.coobrigacaoRecebida || "",
      creditosALiberar: data.outrosValores?.creditosALiberar || "",
    },
    emDia: data.emDia || "",
    semHistorico: data.semHistorico ?? (!data.totalDividasAtivas && !data.carteiraAVencer && !data.vencidos && !data.prejuizos && !data.limiteCredito),
    numeroIfs: data.numeroIfs || "",
  };
}

export function fillProtestosDefaults(data: Partial<ProtestosData>): ProtestosData {
  return {
    vigentesQtd: data.vigentesQtd || "", vigentesValor: data.vigentesValor || "",
    regularizadosQtd: data.regularizadosQtd || "", regularizadosValor: data.regularizadosValor || "",
    detalhes: Array.isArray(data.detalhes) ? data.detalhes : [],
  };
}

export function fillProcessosDefaults(data: Partial<ProcessosData>): ProcessosData {
  return {
    passivosTotal: data.passivosTotal || "", ativosTotal: data.ativosTotal || "",
    valorTotalEstimado: data.valorTotalEstimado || "", temRJ: data.temRJ || false,
    distribuicao: Array.isArray(data.distribuicao) ? data.distribuicao : [],
    bancarios: Array.isArray(data.bancarios) ? data.bancarios : [],
    fiscais: Array.isArray(data.fiscais) ? data.fiscais : [],
    fornecedores: Array.isArray(data.fornecedores) ? data.fornecedores : [],
    outros: Array.isArray(data.outros) ? data.outros : [],
  };
}

export function fillGrupoEconomicoDefaults(data: Partial<GrupoEconomicoData>): GrupoEconomicoData {
  return { empresas: Array.isArray(data.empresas) ? data.empresas : [] };
}

export function fillCurvaABCDefaults(data: Partial<CurvaABCData>): CurvaABCData {
  return {
    clientes: data.clientes ?? [],
    totalClientesNaBase: data.totalClientesNaBase ?? 0,
    totalClientesExtraidos: data.totalClientesExtraidos ?? 0,
    periodoReferencia: data.periodoReferencia ?? "",
    receitaTotalBase: data.receitaTotalBase ?? "0,00",
    concentracaoTop3: data.concentracaoTop3 ?? "0.00",
    concentracaoTop5: data.concentracaoTop5 ?? "0.00",
    concentracaoTop10: data.concentracaoTop10 ?? "0.00",
    totalClientesClasseA: data.totalClientesClasseA ?? 0,
    receitaClasseA: data.receitaClasseA ?? "0,00",
    maiorCliente: data.maiorCliente ?? "",
    maiorClientePct: data.maiorClientePct ?? "0.00",
    alertaConcentracao: data.alertaConcentracao ?? false,
  };
}

export function fillDREDefaults(data: Partial<DREData>): DREData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    crescimentoReceita: data.crescimentoReceita || "0,00",
    tendenciaLucro: data.tendenciaLucro || "estavel",
    periodoMaisRecente: data.periodoMaisRecente || "",
    observacoes: data.observacoes || "",
  };
}

export function fillBalancoDefaults(data: Partial<BalancoData>): BalancoData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    periodoMaisRecente: data.periodoMaisRecente || "",
    tendenciaPatrimonio: data.tendenciaPatrimonio || "estavel",
    observacoes: data.observacoes || "",
  };
}

export function fillIRSocioDefaults(data: Partial<IRSocioData>): IRSocioData {
  const parseMoney = (v: string | undefined | null): number => {
    if (!v || v === "0,00") return 0;
    const s = String(v).replace(/[R$\s]/g, "").trim();
    const lastComma = s.lastIndexOf(",");
    const lastDot   = s.lastIndexOf(".");
    if (lastComma > lastDot) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s.replace(/,/g, "")) || 0;
  };
  const fmtMoney = (n: number): string =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bensImoveis        = sanitizeMoney(data.bensImoveis);
  const bensVeiculos       = sanitizeMoney(data.bensVeiculos);
  const aplicacoes         = sanitizeMoney(data.aplicacoesFinanceiras);
  const outrosBens         = sanitizeMoney(data.outrosBens);
  // participacoesSocietarias: novo campo (grupo 03). Dados antigos usam outrosBens para isso.
  const participacoes      = sanitizeMoney(data.participacoesSocietarias);
  const dividasOnus        = sanitizeMoney(data.dividasOnus);

  // Reconciliação de totalBensDireitos.
  // O Gemini às vezes retorna um total que é só o primeiro item da lista (ex: "640k" quando
  // na verdade o total é 1.2M), ou retorna subcategorias incompletas. Quando há divergência
  // significativa, usamos o MAIOR dos dois — parte-se da premissa de que o menor está
  // incompleto (o agregador raramente inventa valor, mas frequentemente perde itens).
  const totalDoc   = parseMoney(data.totalBensDireitos);
  const totalCalc  = parseMoney(bensImoveis) + parseMoney(bensVeiculos) + parseMoney(aplicacoes) + parseMoney(outrosBens) + parseMoney(participacoes);
  const maxTotal   = Math.max(totalDoc, totalCalc);
  const diverges   = totalDoc > 0 && totalCalc > 0 && Math.abs(totalDoc - totalCalc) > maxTotal * 0.05;
  if (diverges) {
    console.warn(
      `[IR extract] totalBensDireitos divergente: doc=${totalDoc}, calc=${totalCalc}. ` +
      `Usando o maior (${maxTotal}). Subcategorias provavelmente incompletas.`,
    );
  }
  const totalBens = maxTotal > 0 ? fmtMoney(maxTotal) : "0,00";

  // patrimonioLiquido: recalcula server-side para garantir consistência
  const totalBensN = parseMoney(totalBens);
  const dividasN   = parseMoney(dividasOnus);
  const plDocN     = parseMoney(data.patrimonioLiquido);
  // Usa o valor do Gemini se razoável (diferença < 1% do total), senão recalcula
  const plFinal = (plDocN !== 0 && Math.abs(plDocN - (totalBensN - dividasN)) < totalBensN * 0.01)
    ? sanitizeMoney(data.patrimonioLiquido)
    : fmtMoney(Math.max(0, totalBensN - dividasN));

  return {
    nomeSocio: sanitizeStr(data.nomeSocio, 100),
    cpf: data.cpf || "",
    anoBase: data.anoBase || "",
    tipoDocumento: sanitizeEnum(data.tipoDocumento, ["recibo", "declaracao", "extrato"] as const, "recibo"),
    numeroRecibo: data.numeroRecibo || "",
    dataEntrega: data.dataEntrega || "",
    situacaoMalhas: data.situacaoMalhas ?? false,
    debitosEmAberto: data.debitosEmAberto ?? false,
    descricaoDebitos: sanitizeDescricaoDebitos(data.descricaoDebitos),
    rendimentosTributaveis: sanitizeMoney(data.rendimentosTributaveis),
    rendimentosIsentos: sanitizeMoney(data.rendimentosIsentos),
    rendimentoTotal: sanitizeMoney(data.rendimentoTotal),
    bensImoveis,
    bensVeiculos,
    aplicacoesFinanceiras: aplicacoes,
    outrosBens,
    ...(parseMoney(participacoes) > 0 ? { participacoesSocietarias: participacoes } : {}),
    totalBensDireitos: totalBens,
    dividasOnus,
    patrimonioLiquido: plFinal,
    impostoDefinido: sanitizeMoney(data.impostoDefinido),
    valorQuota: sanitizeMoney(data.valorQuota),
    impostoPago: sanitizeMoney(data.impostoPago),
    impostoRestituir: sanitizeMoney(data.impostoRestituir),
    temSociedades: data.temSociedades ?? false,
    sociedades: Array.isArray(data.sociedades) ? data.sociedades : [],
    coerenciaComEmpresa: data.coerenciaComEmpresa ?? true,
    observacoes: sanitizeStr(data.observacoes, 500),
    bensEDireitos: Array.isArray(data.bensEDireitos) ? data.bensEDireitos : [],
    dividasOnusReais: Array.isArray(data.dividasOnusReais) ? data.dividasOnusReais : [],
    pagamentosEfetuados: Array.isArray(data.pagamentosEfetuados) ? data.pagamentosEfetuados : [],
  };
}

export function fillRelatorioVisitaDefaults(data: Partial<RelatorioVisitaData>): RelatorioVisitaData {
  return {
    dataVisita: data.dataVisita || "",
    responsavelVisita: data.responsavelVisita || "",
    localVisita: data.localVisita || "",
    duracaoVisita: data.duracaoVisita || "",
    estruturaFisicaConfirmada: data.estruturaFisicaConfirmada ?? true,
    funcionariosObservados: data.funcionariosObservados ?? 0,
    estoqueVisivel: data.estoqueVisivel ?? false,
    estimativaEstoque: data.estimativaEstoque || "",
    operacaoCompativelFaturamento: data.operacaoCompativelFaturamento ?? true,
    maquinasEquipamentos: data.maquinasEquipamentos ?? false,
    descricaoEstrutura: data.descricaoEstrutura || "",
    pontosPositivos: Array.isArray(data.pontosPositivos) ? data.pontosPositivos : [],
    pontosAtencao: Array.isArray(data.pontosAtencao) ? data.pontosAtencao : [],
    recomendacaoVisitante: data.recomendacaoVisitante || "aprovado",
    nivelConfiancaVisita: data.nivelConfiancaVisita || "alto",
    presencaSocios: data.presencaSocios ?? false,
    sociosPresentes: Array.isArray(data.sociosPresentes) ? data.sociosPresentes : [],
    documentosVerificados: Array.isArray(data.documentosVerificados) ? data.documentosVerificados : [],
    observacoesLivres: data.observacoesLivres || "",
    pleito: data.pleito || "",
    modalidade: data.modalidade || undefined,
    taxaConvencional: data.taxaConvencional || "",
    taxaComissaria: data.taxaComissaria || "",
    limiteTotal: data.limiteTotal || "",
    limiteConvencional: data.limiteConvencional || "",
    limiteComissaria: data.limiteComissaria || "",
    limitePorSacado: data.limitePorSacado || "",
    limiteDuplicatasPJ: data.limiteDuplicatasPJ || "",
    limiteChequesPJ: data.limiteChequesPJ || "",
    limitePrincipaisSacados: data.limitePrincipaisSacados || "",
    ticketMedio: data.ticketMedio || "",
    valorCobrancaBoleto: data.valorCobrancaBoleto || "",
    prazoRecompraCedente: data.prazoRecompraCedente || "",
    prazoEnvioCartorio: data.prazoEnvioCartorio || "",
    prazoMaximoOp: data.prazoMaximoOp || "",
    cobrancaTAC: data.cobrancaTAC || "",
    tranche: data.tranche || "",
    trancheChecagem: data.trancheChecagem || "",
    prazoTranche: data.prazoTranche || "",
    folhaPagamento: data.folhaPagamento || "",
    endividamentoBanco: data.endividamentoBanco || "",
    endividamentoFactoring: data.endividamentoFactoring || "",
    vendasCheque: data.vendasCheque || "",
    vendasDuplicata: data.vendasDuplicata || "",
    vendasOutras: data.vendasOutras || "",
    prazoMedioFaturamento: data.prazoMedioFaturamento || "",
    prazoMedioEntrega: data.prazoMedioEntrega || "",
    referenciasFornecedores: data.referenciasFornecedores || (data as Record<string, unknown>).referenciaComercial as string || "",
    referenciasComerciais: Array.isArray(data.referenciasComerciais) ? data.referenciasComerciais : [],
  };
}

export function fillDividaAtivaDefaults(data: Partial<DividaAtivaData>): DividaAtivaData {
  const registros = Array.isArray(data.registros) ? data.registros : [];
  return {
    qtdRegistros: typeof data.qtdRegistros === "number" ? data.qtdRegistros : registros.length,
    valorTotal: data.valorTotal || "",
    registros: registros.map(r => ({
      origem: r?.origem || "",
      numeroInscricao: r?.numeroInscricao || "",
      valor: r?.valor || "",
      situacao: r?.situacao || "",
      dataInscricao: r?.dataInscricao || "",
      natureza: r?.natureza || "",
    })),
    certidaoNegativa: !!data.certidaoNegativa,
    dataConsulta: data.dataConsulta || "",
  };
}

export function fillCenprotDefaults(data: Partial<CenprotData>): CenprotData {
  const registros = Array.isArray(data.registros) ? data.registros : [];
  return {
    qtdRegistros: typeof data.qtdRegistros === "number" ? data.qtdRegistros : registros.length,
    valorTotal: data.valorTotal || "",
    registros: registros.map(r => ({
      cartorio: r?.cartorio || "",
      cidade: r?.cidade || "",
      uf: r?.uf || "",
      data: r?.data || "",
      valor: r?.valor || "",
      devedor: r?.devedor || "",
      cedente: r?.cedente || "",
      protocolo: r?.protocolo || "",
      // Campos opcionais adicionados em 2026-05-11 — mesmo bug do GEFIP:
      // fillDefaults estava descartando antes do save.
      status: r?.status || undefined,
      tipoTitulo: r?.tipoTitulo || undefined,
    })),
    certidaoNegativa: !!data.certidaoNegativa,
    dataConsulta: data.dataConsulta || "",
    chaveValidacao: data.chaveValidacao || undefined,
  };
}

export function fillGefipDefaults(data: Partial<GefipData>): GefipData {
  const competencias = Array.isArray(data.competencias) ? data.competencias : [];
  return {
    competenciaInicio: data.competenciaInicio || "",
    competenciaFim: data.competenciaFim || "",
    totalFuncionarios: typeof data.totalFuncionarios === "number" ? data.totalFuncionarios : 0,
    valorFgtsTotal: data.valorFgtsTotal || "",
    valorInssTotal: data.valorInssTotal || "",
    competenciasEmAtraso: typeof data.competenciasEmAtraso === "number" ? data.competenciasEmAtraso : 0,
    competencias: competencias.map(c => ({
      mes: c?.mes || "",
      funcionarios: typeof c?.funcionarios === "number" ? c.funcionarios : 0,
      valorFgts: c?.valorFgts || "",
      valorInss: c?.valorInss || "",
      situacao: c?.situacao || "",
      // Campos opcionais adicionados em 2026-05-11 — preserva quando extraídos
      // (bug histórico: fillDefaults estava descartando estes 3 campos por
      // competência mais 3 do header, fazendo o template renderizar vazio).
      folhaPagamento: c?.folhaPagamento || undefined,
      valorMultas: c?.valorMultas || undefined,
      valorJuros: c?.valorJuros || undefined,
    })),
    // Header da declaração — utilíssimo pra validação cruzada (cnpjDeclarado
    // × cnpj do cedente evita misturar declarações de empresas diferentes).
    tipoDeclaracao: data.tipoDeclaracao || undefined,
    cnpjDeclarado: data.cnpjDeclarado || undefined,
    razaoSocialDeclarada: data.razaoSocialDeclarada || undefined,
  };
}

export type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData | CurvaABCData | DREData | BalancoData | IRSocioData | RelatorioVisitaData | DividaAtivaData | CenprotData | GefipData;

export function countFilledFields(data: AnyExtracted): number {
  const obj = data as unknown as Record<string, unknown>;
  return Object.values(obj).filter(v =>
    typeof v === "string" ? v.length > 0 :
    Array.isArray(v) ? v.length > 0 :
    typeof v === "boolean" ? true : false
  ).length;
}
