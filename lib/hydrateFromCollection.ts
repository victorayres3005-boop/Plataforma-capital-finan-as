import { ExtractedData, SCRData } from "@/types";

export const defaultData: ExtractedData = {
  cnpj: { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" },
  qsa: { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] },
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
  };

  for (const doc of docs) {
    if (doc.type === "scr_bacen") continue;
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
    const sorted = [...scrEmpresa].sort((a, b) => {
      const periodoA = String(a.extracted_data?.periodoReferencia || "00/0000");
      const periodoB = String(b.extracted_data?.periodoReferencia || "00/0000");
      const [mA, yA] = periodoA.split("/").map(s => parseInt(s, 10) || 0);
      const [mB, yB] = periodoB.split("/").map(s => parseInt(s, 10) || 0);
      if (yB !== yA) return yB - yA;
      return mB - mA;
    });
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
      const sorted = [...docs].sort((a, b) => {
        const periodoA = String(a.extracted_data?.periodoReferencia || "00/0000");
        const periodoB = String(b.extracted_data?.periodoReferencia || "00/0000");
        const [mA, yA] = periodoA.split("/").map(s => parseInt(s, 10) || 0);
        const [mB, yB] = periodoB.split("/").map(s => parseInt(s, 10) || 0);
        if (yB !== yA) return yB - yA;
        return mB - mA;
      });
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
