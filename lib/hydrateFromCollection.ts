import { ExtractedData, SCRData } from "@/types";

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
    const { _editedManually, ...data } = doc.extracted_data;
    void _editedManually;
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
    const { _editedManually: _em1, ...data1 } = scrEmpresa[0].extracted_data!;
    void _em1;
    result.scr = { ...result.scr, ...data1 } as ExtractedData["scr"];
  } else if (scrEmpresa.length >= 2) {
    const sorted = sortSCRDocsDesc(scrEmpresa);
    const kAtual = periodoRefToKey(sorted[0].extracted_data?.periodoReferencia);
    const kAnt = periodoRefToKey(sorted[1].extracted_data?.periodoReferencia);
    console.log(`[hydrate] SCR empresa: atual=${sorted[0].extracted_data?.periodoReferencia} (k=${kAtual}) anterior=${sorted[1].extracted_data?.periodoReferencia} (k=${kAnt})`);
    if (kAtual === 0 || kAnt === 0) {
      console.warn(`[hydrate] SCR empresa com periodoReferencia invalido — ordem atual/anterior pode estar incorreta`);
    }
    const { _editedManually: _em1, ...data1 } = sorted[0].extracted_data!;
    void _em1;
    const { _editedManually: _em2, ...data2 } = sorted[1].extracted_data!;
    void _em2;
    result.scr = { ...result.scr, ...data1 } as ExtractedData["scr"];
    result.scrAnterior = { ...result.scrAnterior, ...data2 } as ExtractedData["scr"];
  }

  if (scrSociosDocs.length > 0) {
    const porCpf: Record<string, typeof scrSociosDocs> = {};
    for (const doc of scrSociosDocs) {
      const cpf = String(doc.extracted_data?.cnpjSCR || doc.extracted_data?.cpfSCR || "desconhecido");
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

  return result;
}
