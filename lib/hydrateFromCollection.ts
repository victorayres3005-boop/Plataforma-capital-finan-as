import { ExtractedData, SCRData } from "@/types";

/**
 * Recalcula carteiraCurtoPrazo/LongoPrazo/vencidos/prejuizos/totalDividasAtivas
 * a partir das faixas detalhadas armazenadas. Usado no hydrate pra corrigir
 * registros antigos salvos com CP errado (ex.: ignorando faixa "De 181 a 360").
 *
 * Regra BACEN:
 *   Curto Prazo = ate30d + d31_60 + d61_90 + d91_180 + d181_360
 *   Longo Prazo = acima360d
 *   Total       = CP + LP + Vencidos + Prejuízos
 *
 * Só sobrescreve se pelo menos uma faixa tiver valor > 0 — caso contrário
 * preserva os valores já presentes (evita zerar tudo por falta de faixas).
 */
export function recomputeSCRTotals<T extends Partial<SCRData>>(scr: T): T {
  if (!scr) return scr;
  const parseBR = (s: unknown): number => {
    if (s == null || s === "") return 0;
    const str = String(s).trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  };
  const fmtBR = (n: number): string =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fa = scr.faixasAVencer;
  const fv = scr.faixasVencidos;
  const fp = scr.faixasPrejuizos;

  const curtoFaixas = fa
    ? parseBR(fa.ate30d) + parseBR(fa.d31_60) + parseBR(fa.d61_90) + parseBR(fa.d91_180) + parseBR(fa.d181_360)
    : 0;
  const longoFaixas = fa ? parseBR(fa.acima360d) : 0;
  const vencFaixas = fv
    ? parseBR(fv.ate30d) + parseBR(fv.d31_60) + parseBR(fv.d61_90) + parseBR(fv.d91_180) + parseBR(fv.d181_360) + parseBR(fv.acima360d)
    : 0;
  const prejFaixas = fp ? parseBR(fp.ate12m) + parseBR(fp.acima12m) : 0;

  // Preserva valores atuais quando não há faixas — não sobrescreve com 0.
  const out = { ...scr } as T;
  if (curtoFaixas > 0) out.carteiraCurtoPrazo = fmtBR(curtoFaixas);
  if (longoFaixas > 0) out.carteiraLongoPrazo = fmtBR(longoFaixas);
  if (vencFaixas > 0)  out.vencidos          = fmtBR(vencFaixas);
  if (prejFaixas > 0)  out.prejuizos         = fmtBR(prejFaixas);
  // carteiraAVencer = CP + LP (total a vencer)
  if (curtoFaixas + longoFaixas > 0) out.carteiraAVencer = fmtBR(curtoFaixas + longoFaixas);
  // totalDividasAtivas = Responsabilidade Total (CP + LP + Vencidos + Prejuízos)
  const total = curtoFaixas + longoFaixas + vencFaixas + prejFaixas;
  if (total > 0) out.totalDividasAtivas = fmtBR(total);

  return out;
}

/**
 * Converte um periodoReferencia em qualquer formato razoável para uma chave
 * numérica comparável (ano*100 + mes). Aceita "MM/YYYY", "MM-YYYY",
 * "YYYY-MM", "YYYY/MM" e nomes de mês em português ("março/2026", "mar/26").
 * Retorna 0 quando não consegue parsear — entradas inválidas vão pro final
 * (interpretadas como "mais antigas") na ordenação DESC.
 */
function periodoRefToKey(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim().toLowerCase();
  if (!s) return 0;
  const mesesPt: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  };
  const parts = s.split(/[\s/\-.]+/).filter(Boolean);
  if (parts.length < 2) return 0;
  const [a, b] = parts;
  const numA = Number(a);
  const numB = Number(b);
  let mes = 0;
  let ano = 0;
  if (!isNaN(numA) && !isNaN(numB)) {
    // Dois números: maior é provavelmente o ano
    if (numA > 12 || (numA >= 100)) { ano = numA; mes = numB; }
    else { mes = numA; ano = numB; }
  } else if (mesesPt[a] && !isNaN(numB)) {
    mes = mesesPt[a]; ano = numB;
  } else if (mesesPt[b] && !isNaN(numA)) {
    mes = mesesPt[b]; ano = numA;
  } else {
    return 0;
  }
  if (ano < 100) ano += 2000;
  if (ano < 1900 || mes < 1 || mes > 12) return 0;
  return ano * 100 + mes;
}

// "atual" tem prioridade 0, "anterior" prioridade 1 — usado como tiebreaker
// determinístico quando periodoReferencia está ausente/inválido nos dois docs.
function slotHintRank(raw: unknown): number {
  const s = String(raw || "").toLowerCase();
  if (s === "scr" || s === "scr_socio") return 0;
  if (s === "scranterior" || s === "scr_socio_anterior") return 1;
  return 2;
}

function sortSCRDocsDesc<T extends { extracted_data?: Record<string, unknown> }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const kA = periodoRefToKey(a.extracted_data?.periodoReferencia);
    const kB = periodoRefToKey(b.extracted_data?.periodoReferencia);
    if (kA !== kB) {
      if (kA === 0) return 1;   // inválido vai pro final
      if (kB === 0) return -1;
      return kB - kA;           // DESC: mais recente primeiro
    }
    // Empate (incluindo ambos inválidos) → desempata pelo slot original do upload
    return slotHintRank(a.extracted_data?._slotHint) - slotHintRank(b.extracted_data?._slotHint);
  });
}

export const defaultData: ExtractedData = {
  cnpj: { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" },
  qsa: { capitalSocial:"", quadroSocietario:[] },
  contrato: { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" },
  faturamento: { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" },
  scr: { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" },
  scrAnterior: null,
  protestos: { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] },
  processos: { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[],fiscais:[],fornecedores:[],outros:[] },
  grupoEconomico: { empresas:[] },
  resumoRisco: "",
};

export function hydrateFromCollection(docs: { type: string; extracted_data: Record<string, unknown> }[]): ExtractedData {
  const result: ExtractedData = JSON.parse(JSON.stringify(defaultData));
  const typeMap: Record<string, keyof ExtractedData> = {
    cnpj: "cnpj",
    qsa: "qsa",
    contrato_social: "contrato",
    faturamento: "faturamento",
    scr_bacen: "scr",
    protestos: "protestos",
    processos: "processos",
    grupo_economico: "grupoEconomico",
    curva_abc: "curvaABC",
    dre: "dre",
    balanco: "balanco",
    ir_socio: "irSocios",
    relatorio_visita: "relatorioVisita",
    ccf: "ccf",
  };

  for (const doc of docs) {
    if (doc.type === "scr_bacen") continue;

    // bureau_meta guarda score + bureausConsultados no mesmo documento
    if (doc.type === "bureau_meta" && doc.extracted_data) {
      const { score, bureausConsultados } = doc.extracted_data as {
        score?: ExtractedData["score"];
        bureausConsultados?: string[];
      };
      if (score) result.score = score;
      if (bureausConsultados && bureausConsultados.length > 0) result.bureausConsultados = bureausConsultados;
      continue;
    }

    const field = typeMap[doc.type];
    if (!field || !doc.extracted_data) continue;
    const { _editedManually, _warnings, ...data } = doc.extracted_data;
    void _editedManually; void _warnings;
    if (field === "irSocios") {
      const arr = ((result as unknown as Record<string, unknown>)[field] as unknown[]) || [];
      (result as unknown as Record<string, unknown>)[field] = [...arr, data];
      continue;
    }
    (result as unknown as Record<string, unknown>)[field] = {
      ...(result as unknown as Record<string, unknown>)[field] as object,
      ...data,
    };
  }

  const scrDocs = docs.filter(d => d.type === "scr_bacen");
  const scrEmpresa = scrDocs.filter(d =>
    (d.extracted_data?.tipoPessoa as string) === "PJ" ||
    !(d.extracted_data?.tipoPessoa)
  );
  const scrSociosDocs = scrDocs.filter(d =>
    (d.extracted_data?.tipoPessoa as string) === "PF"
  );

  if (scrEmpresa.length === 1) {
    const { _editedManually: _em1, _warnings: _w1, ...data1 } = scrEmpresa[0].extracted_data!;
    void _em1; void _w1;
    result.scr = recomputeSCRTotals({ ...result.scr, ...data1 }) as ExtractedData["scr"];
  } else if (scrEmpresa.length >= 2) {
    const sorted = sortSCRDocsDesc(scrEmpresa);
    const kAtual = periodoRefToKey(sorted[0].extracted_data?.periodoReferencia);
    const kAnt = periodoRefToKey(sorted[1].extracted_data?.periodoReferencia);
    console.log(`[hydrate] SCR empresa: atual=${sorted[0].extracted_data?.periodoReferencia} (k=${kAtual}) anterior=${sorted[1].extracted_data?.periodoReferencia} (k=${kAnt})`);
    if (kAtual === 0 || kAnt === 0) {
      console.warn(`[hydrate] SCR empresa com periodoReferencia invalido — ordem atual/anterior pode estar incorreta`);
    }
    const { _editedManually: _em1, _warnings: _w1, ...data1 } = sorted[0].extracted_data!;
    void _em1; void _w1;
    const { _editedManually: _em2, _warnings: _w2, ...data2 } = sorted[1].extracted_data!;
    void _em2; void _w2;
    result.scr = recomputeSCRTotals({ ...result.scr, ...data1 }) as ExtractedData["scr"];
    result.scrAnterior = recomputeSCRTotals({ ...result.scrAnterior, ...data2 }) as ExtractedData["scr"];
  }

  if (scrSociosDocs.length > 0) {
    const porCpf: Record<string, typeof scrSociosDocs> = {};
    for (const doc of scrSociosDocs) {
      // PF = CPF primeiro; cnpjSCR só como fallback se Gemini errou no campo.
      // Normaliza pra só dígitos pra matching robusto entre atual/anterior.
      const cpfRaw = String(doc.extracted_data?.cpfSCR || doc.extracted_data?.cnpjSCR || "desconhecido");
      const cpf = cpfRaw.replace(/\D/g, "") || cpfRaw;
      if (!porCpf[cpf]) porCpf[cpf] = [];
      porCpf[cpf].push(doc);
    }
    result.scrSocios = Object.entries(porCpf).map(([cpf, docs]) => {
      const sorted = sortSCRDocsDesc(docs);
      const kAtual = periodoRefToKey(sorted[0].extracted_data?.periodoReferencia);
      const kAnt = sorted[1] ? periodoRefToKey(sorted[1].extracted_data?.periodoReferencia) : null;
      console.log(`[hydrate] SCR socio ${cpf}: atual=${sorted[0].extracted_data?.periodoReferencia} (k=${kAtual}) anterior=${sorted[1]?.extracted_data?.periodoReferencia ?? "—"} (k=${kAnt ?? "—"})`);
      if (kAtual === 0 || (kAnt !== null && kAnt === 0)) {
        console.warn(`[hydrate] SCR socio ${cpf} com periodoReferencia invalido — ordem atual/anterior pode estar incorreta`);
      }
      const atual = sorted[0].extracted_data as unknown as SCRData;
      const anterior = sorted[1]?.extracted_data as unknown as SCRData | undefined;
      return {
        nomeSocio: String(atual?.nomeCliente || cpf),
        cpfSocio: cpf,
        tipoPessoa: "PF" as const,
        periodoAtual: atual,
        periodoAnterior: anterior,
      };
    });
  }

  // ─── Pós-hidratação: dedupe do QSA ───
  // O cartão CNPJ (via ReceitaWS) e o contrato social podem trazer o mesmo sócio
  // em duas entradas diferentes: uma com CPF preenchido + qualificação por extenso,
  // outra sem CPF + qualificação com código ("49-Sócio-Administrador"). Também
  // é comum o mesmo nome chegar com/sem acentos ("JOÃO" vs "JOAO") de fontes
  // distintas. A dedup prioriza CPF quando disponível, com fallback para nome
  // normalizado sem acentos.
  if (result.qsa?.quadroSocietario && result.qsa.quadroSocietario.length > 1) {
    const stripAccents = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normName = (s: string) => stripAccents(s).trim().toLowerCase().replace(/\s+/g, " ");
    const normCpf  = (s: string) => String(s || "").replace(/\D/g, "");
    const stripQualCode = (q: string) => String(q || "").replace(/^\d+\s*-\s*/, "").trim();
    // Score: quanto mais campos preenchidos, melhor. CPF vale mais que qualificação.
    const score = (s: { nome: string; cpfCnpj: string; qualificacao: string; participacao: string }) => {
      let pts = 0;
      if (normCpf(s.cpfCnpj).length >= 11) pts += 10;
      if (s.participacao && s.participacao !== "—" && s.participacao.trim()) pts += 3;
      if (s.qualificacao && s.qualificacao.trim()) pts += 1;
      // Prefere qualificação por extenso (sem código "49-")
      if (s.qualificacao && !/^\d+\s*-/.test(s.qualificacao)) pts += 1;
      return pts;
    };
    // Chave de dedup: CPF (quando há ≥11 dígitos) ou nome normalizado sem acentos.
    // Usar "cpf:" e "nm:" como prefixo evita colisões acidentais entre CPFs numéricos
    // e nomes que começam com números.
    const dedupKey = (s: { nome: string; cpfCnpj: string }) => {
      const cpf = normCpf(s.cpfCnpj);
      if (cpf.length >= 11) return `cpf:${cpf}`;
      const nm = normName(s.nome);
      return nm ? `nm:${nm}` : "";
    };
    const byKey = new Map<string, typeof result.qsa.quadroSocietario[number]>();
    // Após a passagem principal, um segundo pass tenta unificar entradas "nm:"
    // cujo nome já apareceu em alguma chave "cpf:" (caso o CPF chegou só em uma).
    for (const s of result.qsa.quadroSocietario) {
      const key = dedupKey(s);
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, s);
        continue;
      }
      const winner = score(s) >= score(existing) ? s : existing;
      const loser  = winner === s ? existing : s;
      const merged = {
        nome: winner.nome,
        cpfCnpj: normCpf(winner.cpfCnpj).length >= 11 ? winner.cpfCnpj : (normCpf(loser.cpfCnpj).length >= 11 ? loser.cpfCnpj : winner.cpfCnpj),
        qualificacao: stripQualCode(winner.qualificacao) || stripQualCode(loser.qualificacao),
        participacao: (winner.participacao && winner.participacao !== "—") ? winner.participacao : (loser.participacao || ""),
        dataEntrada: winner.dataEntrada || loser.dataEntrada,
        dataSaida:   winner.dataSaida   || loser.dataSaida,
      };
      byKey.set(key, merged);
    }
    // Segundo pass: se existe uma entrada "nm:<nome>" e outra "cpf:<cpf>" com o
    // mesmo nome normalizado, mescla as duas sob a chave de CPF (preferida).
    const cpfKeys = Array.from(byKey.keys()).filter(k => k.startsWith("cpf:"));
    for (const cpfKey of cpfKeys) {
      const entry = byKey.get(cpfKey);
      if (!entry) continue;
      const nmKey = `nm:${normName(entry.nome)}`;
      const orphan = byKey.get(nmKey);
      if (!orphan || orphan === entry) continue;
      const winner = score(entry) >= score(orphan) ? entry : orphan;
      const loser  = winner === entry ? orphan : entry;
      byKey.set(cpfKey, {
        nome: winner.nome,
        cpfCnpj: normCpf(winner.cpfCnpj).length >= 11 ? winner.cpfCnpj : (normCpf(loser.cpfCnpj).length >= 11 ? loser.cpfCnpj : winner.cpfCnpj),
        qualificacao: stripQualCode(winner.qualificacao) || stripQualCode(loser.qualificacao),
        participacao: (winner.participacao && winner.participacao !== "—") ? winner.participacao : (loser.participacao || ""),
        dataEntrada: winner.dataEntrada || loser.dataEntrada,
        dataSaida:   winner.dataSaida   || loser.dataSaida,
      });
      byKey.delete(nmKey);
    }
    const before = result.qsa.quadroSocietario.length;
    result.qsa.quadroSocietario = Array.from(byKey.values());
    const after = result.qsa.quadroSocietario.length;
    if (after < before) {
      console.log(`[hydrate] QSA dedupe: ${before} → ${after} sócios (removidas ${before - after} duplicatas)`);
    }
  }

  // ─── Pós-hidratação: dedupe do IR dos sócios ───
  // Sócios podem aparecer duplicados quando múltiplos ano-base foram processados
  // do mesmo CPF, ou quando o Gemini não consegue extrair o CPF (recibo de entrega
  // sem CPF visível). Dedupe por CPF+ano quando disponível; fallback para
  // nome+ano (sem acentos) para não descartar registros órfãos.
  if (Array.isArray(result.irSocios) && result.irSocios.length > 1) {
    const normCpf = (s: string) => String(s || "").replace(/\D/g, "");
    const stripAccents = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normName = (s: string) => stripAccents(s).trim().toLowerCase().replace(/\s+/g, " ");
    const numVal = (s: string | undefined) => {
      if (!s) return 0;
      const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const irScore = (ir: { rendimentoTotal?: string; patrimonioLiquido?: string; bensImoveis?: string; impostoPago?: string }) => {
      return numVal(ir.rendimentoTotal) + numVal(ir.patrimonioLiquido) + numVal(ir.bensImoveis) + numVal(ir.impostoPago);
    };
    const byKey = new Map<string, typeof result.irSocios[number]>();
    for (const ir of result.irSocios) {
      const cpf = normCpf(ir.cpf);
      const ano = String(ir.anoBase || "").trim();
      const nm  = normName(ir.nomeSocio);
      // Chave preferida: CPF (11 dígitos) + ano. Senão, nome normalizado + ano.
      // Se nem nome nem CPF forem válidos, descarta (entrada inútil).
      const key = cpf.length >= 11 && ano ? `cpf:${cpf}::${ano}`
                : nm && ano              ? `nm:${nm}::${ano}`
                : nm                     ? `nm:${nm}::?`
                : "";
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing || irScore(ir) > irScore(existing)) {
        byKey.set(key, ir);
      }
    }
    // Segundo pass: se existe uma chave "nm:<nome>::<ano>" e uma "cpf:<cpf>::<ano>"
    // com o mesmo nome normalizado, mescla sob CPF (preferida) mantendo o de maior score.
    const cpfKeys = Array.from(byKey.keys()).filter(k => k.startsWith("cpf:"));
    for (const cpfKey of cpfKeys) {
      const entry = byKey.get(cpfKey);
      if (!entry) continue;
      const ano = cpfKey.split("::")[1] || "";
      const nmKey = `nm:${normName(entry.nomeSocio)}::${ano}`;
      const orphan = byKey.get(nmKey);
      if (!orphan || orphan === entry) continue;
      const winner = irScore(entry) >= irScore(orphan) ? entry : orphan;
      byKey.set(cpfKey, winner);
      byKey.delete(nmKey);
    }
    const beforeIr = result.irSocios.length;
    result.irSocios = Array.from(byKey.values());
    const afterIr = result.irSocios.length;
    if (afterIr < beforeIr) {
      console.log(`[hydrate] IR dedupe: ${beforeIr} → ${afterIr} registros (removidas ${beforeIr - afterIr} duplicatas)`);
    }
  }

  // ─── Pós-hidratação: coerenciaComEmpresa (determinística) ───
  // Regra: IR do sócio é "coerente" quando uma das sociedades declaradas
  // tem CNPJ igual ao da empresa sendo analisada (ignora formatação).
  const empresaCnpj = String(result.cnpj?.cnpj || "").replace(/\D/g, "");
  if (empresaCnpj && Array.isArray(result.irSocios) && result.irSocios.length > 0) {
    result.irSocios = result.irSocios.map(ir => {
      const socs = Array.isArray(ir.sociedades) ? ir.sociedades : [];
      const match = socs.some(s => String(s?.cnpj || "").replace(/\D/g, "") === empresaCnpj);
      return { ...ir, coerenciaComEmpresa: match };
    });
  }

  return result;
}
