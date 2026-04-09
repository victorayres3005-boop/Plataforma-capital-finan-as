/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ProtestosData, ProcessosData, BureauScore,
  ProcessoItem, DistribuicaoTemporal, DistribuicaoPorFaixa,
  CCFData, HistoricoConsultaItem, QSAData,
  GrupoEconomicoData, ParentescoDetectado,
} from "@/types";

const CREDITHUB_API_URL = process.env.CREDITHUB_API_URL || "";
const CREDITHUB_API_KEY = process.env.CREDITHUB_API_KEY || "";

export interface CreditHubEnrichment {
  capitalSocialCNPJ?: string;
  porte?: string;
  naturezaJuridica?: string;
  cnaePrincipal?: string;
  cnaeDescricao?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  enderecos?: string[];       // todos os endereços disponíveis
  tipoEmpresa?: string;       // MATRIZ / FILIAL
  funcionarios?: string;      // quantidade ou faixa
  regimeTributario?: string;
  nire?: string;
  site?: string;
}

export interface CreditHubResult {
  success: boolean;
  mock: boolean;
  protestos?: ProtestosData;
  processos?: ProcessosData;
  score?: BureauScore["credithub"];
  ccf?: CCFData;
  historicoConsultas?: HistoricoConsultaItem[];
  qsaEnrichment?: QSAData;
  cnpjEnrichment?: CreditHubEnrichment;
  grupoEconomicoEnrichment?: GrupoEconomicoData;
  error?: string;
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // ISO: 2020-01-15 ou 2020-01-15T00:00:00
  const ts = Date.parse(s);
  if (!isNaN(ts)) return new Date(ts);
  // DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return null;
}

function ageLabel(date: Date): string {
  const hoje = new Date();
  const anos = (hoje.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (anos < 1) return "< 1 ano";
  if (anos < 3) return "1-3 anos";
  if (anos < 5) return "3-5 anos";
  return "> 5 anos";
}

function faixaValorLabel(n: number): string {
  if (n < 10000) return "< R$10k";
  if (n < 50000) return "R$10k-50k";
  if (n < 200000) return "R$50k-200k";
  if (n < 1000000) return "R$200k-1M";
  return "> R$1M";
}

// ─── Protestos ─────────────────────────────────────────────────────────────
// Estrutura real:
//   d.protestos = {
//     qtdProtestos: number,
//     cartorios: [{
//       nome, cidade, uf, telefone, qtdProtestos,
//       protestos: [{ data, dataProtesto, valor, nomeCedente, nomeApresentante, temAnuencia }]
//     }]
//   }
function parseProtestos(d: any): ProtestosData {
  const cartorios: any[] = d?.protestos?.cartorios ?? [];

  // Flatten: cada protesto individual dentro de cada cartório
  type ProtestoFlat = {
    data: string; valor: number; nomeCedente: string;
    nomeApresentante: string; temAnuencia: boolean;
    cartorioNome: string; municipio: string; uf: string;
    regularizado: boolean;
  };

  const todos: ProtestoFlat[] = [];
  cartorios.forEach((c: any) => {
    const cartorioNome = c.nome ?? c.nomeCartorio ?? c.cartorio ?? "";
    const municipio = c.cidade ?? c.municipio ?? "";
    const uf = c.uf ?? c.estado ?? "";
    const protestosInner: any[] = Array.isArray(c.protestos) ? c.protestos : [];

    if (protestosInner.length > 0) {
      protestosInner.forEach((p: any) => {
        todos.push({
          data: p.dataProtesto ?? p.data ?? "",
          valor: Number(p.valor ?? p.valorProtestado ?? 0),
          nomeCedente: p.nomeCedente ?? p.cedente ?? "",
          nomeApresentante: p.nomeApresentante ?? p.apresentante ?? "",
          temAnuencia: !!p.temAnuencia,
          cartorioNome,
          municipio,
          uf,
          regularizado: !!p.temAnuencia || !!p.regularizado,
        });
      });
    } else {
      // Fallback: cartório sem array de protestos interno
      todos.push({
        data: c.data ?? c.dataProtesto ?? "",
        valor: Number(c.valor ?? 0),
        nomeCedente: c.nomeCedente ?? c.cedente ?? "",
        nomeApresentante: c.nomeApresentante ?? c.apresentante ?? "",
        temAnuencia: false,
        cartorioNome,
        municipio,
        uf,
        regularizado: !!c.regularizado,
      });
    }
  });

  const vigentes = todos.filter(p => !p.regularizado);
  const regularizados = todos.filter(p => p.regularizado);

  const vigentesValor = vigentes.reduce((s, p) => s + p.valor, 0);
  const regularizadosValor = regularizados.reduce((s, p) => s + p.valor, 0);

  // Fallback para qtd se não encontrou itens individuais
  const vigentesQtd = vigentes.length > 0
    ? vigentes.length
    : Number(d?.protestos?.qtdProtestos ?? 0);

  const detalhes: ProtestosData["detalhes"] = todos.map((p) => {
    const credorDisplay = p.cartorioNome
      ? [p.cartorioNome, p.municipio, p.uf].filter(Boolean).join(" — ")
      : [p.municipio, p.uf].filter(Boolean).join(" / ") || "—";
    return {
      data: p.data,
      credor: credorDisplay,
      valor: fmtBRL(p.valor),
      regularizado: p.regularizado,
      apresentante: p.nomeCedente || p.nomeApresentante || "",
      municipio: p.municipio,
      uf: p.uf,
      especie: "",
      numero: "",
      dataVencimento: "",
    };
  });

  return {
    vigentesQtd: String(vigentesQtd),
    vigentesValor: fmtBRL(vigentesValor),
    regularizadosQtd: String(regularizados.length),
    regularizadosValor: fmtBRL(regularizadosValor),
    detalhes,
  };
}

// ─── Processos + Dívidas ────────────────────────────────────────────────────
function parseProcessos(d: any): ProcessosData {
  const processos: any[] = Array.isArray(d?.processos) ? d.processos : [];
  const dividas: any[] = Array.isArray(d?.dividas) ? d.dividas : [];

  // Valor dos processos judiciais
  const valorProcessos = processos.reduce(
    (s, p) => s + Number(p.valor ?? p.valorCausa ?? p.valorAcao ?? 0), 0
  );
  // Valor das dívidas (campo direto da API)
  const valorDividas = Number(d?.valor_total_dividas ?? 0);

  // Processos ativos (em andamento)
  const ativos = processos.filter(p =>
    !p.status || /ativo|andamento|distribuido|pendente/i.test(String(p.status))
  ).length;

  // Recuperação judicial
  const temRJ = processos.some(p =>
    /recupera[çc]|rj\b/i.test(String(p.tipo ?? p.natureza ?? p.assunto ?? ""))
  );

  // ── Distribuição por tipo ──
  const tipoMap = new Map<string, number>();
  processos.forEach(p => {
    const t = (p.tipo ?? p.natureza ?? p.classe ?? "OUTROS").toUpperCase().trim();
    tipoMap.set(t, (tipoMap.get(t) ?? 0) + 1);
  });
  // Remove "OUTROS" puro se todos forem OUTROS (API não retornou tipos) → substituir por distribuição por UF
  const distribuicaoRaw = Array.from(tipoMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, qtd]) => ({
      tipo,
      qtd: String(qtd),
      pct: processos.length > 0 ? ((qtd / processos.length) * 100).toFixed(0) : "0",
    }));
  // Se só há "OUTROS", tenta montar distribuição por UF como alternativa
  const ufMap = new Map<string, number>();
  processos.forEach(p => {
    const u = (p.uf ?? p.estado ?? "").toUpperCase().trim();
    if (u) ufMap.set(u, (ufMap.get(u) ?? 0) + 1);
  });
  const distribuicaoPorUF = Array.from(ufMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, qtd]) => ({
      tipo: `UF: ${tipo}`,
      qtd: String(qtd),
      pct: processos.length > 0 ? ((qtd / processos.length) * 100).toFixed(0) : "0",
    }));
  const apenasOutros = distribuicaoRaw.length === 1 && distribuicaoRaw[0].tipo === "OUTROS";
  const distribuicao = (apenasOutros && distribuicaoPorUF.length > 0) ? distribuicaoPorUF : distribuicaoRaw;

  // ── Normaliza todos os itens (processos + dívidas) ──
  // Extrai partes por tipo de envolvimento
  const extractEnvolvidos = (p: any) => {
    const envs: any[] = p.envolvidos_ultima_movimentacao ?? [];
    const ativos = envs.filter((e: any) => /ativo|autor|exequente|requerente/i.test(e.envolvido_tipo ?? "")).map((e: any) => e.nome).filter(Boolean);
    const passivos = envs.filter((e: any) => /passivo|reu|executado|requerido/i.test(e.envolvido_tipo ?? "")).map((e: any) => e.nome).filter(Boolean);
    return { ativos: ativos.join(", "), passivos: passivos.join(", ") };
  };

  const normItem = (p: any): ProcessoItem => {
    const { ativos, passivos } = extractEnvolvidos(p);
    // Número: preferir numero_novo (CNJ), fallback numero_antigo, fallback id
    const numero = p.numero_novo ?? p.numero ?? p.nrProcesso ?? p.id ?? "";
    // Tipo/classe
    const tipo = (p.classe_processual ?? p.tipo ?? p.natureza ?? p.classe ?? "—").toUpperCase();
    // Assunto
    const assunto = p.assuntos ?? p.assunto ?? p.assuntoPrincipal ?? "";
    // Data: updated_at (última movimentação), fallback created_at ou data
    const data = p.updated_at ?? p.data_movimentacoes ?? p.data ?? p.dataDistribuicao ?? p.created_at ?? "";
    // Tribunal
    const tribunal = p.diario_sigla ?? p.diario_nome ?? p.tribunal ?? p.vara ?? "";
    // UF
    const uf = p.estado ?? p.uf ?? p.ufTribunal ?? "";

    return {
      numero,
      tipo,
      assunto: String(assunto),
      data: data ? data.substring(0, 10) : "", // só a data, sem hora
      valor: fmtBRL(Number(p.valor ?? p.valorCausa ?? p.valorAcao ?? 0)),
      valorNum: Number(p.valor ?? p.valorCausa ?? p.valorAcao ?? 0),
      status: p.status ?? p.situacao ?? "—",
      partes: ativos || (p.polo_ativo ?? p.parteAtiva ?? p.autor ?? ""),
      tribunal,
      polo_passivo: passivos || (p.polo_passivo ?? p.partePassiva ?? p.reu ?? ""),
      fase: p.classe_processual ?? p.fase ?? "",
      uf,
      comarca: p.comarca ?? p.municipioTribunal ?? "",
      dataUltimoAndamento: p.updated_at ? p.updated_at.substring(0, 10) : "",
    };
  };

  const divNorm = (dv: any): ProcessoItem => ({
    numero: dv.numero ?? dv.contrato ?? "",
    tipo: "DÍVIDA",
    assunto: dv.descricao ?? dv.produto ?? dv.modalidade ?? "",
    data: dv.dataVencimento ?? dv.data ?? dv.dataAbertura ?? "",
    valor: fmtBRL(Number(dv.valor ?? dv.valorDivida ?? 0)),
    valorNum: Number(dv.valor ?? dv.valorDivida ?? 0),
    status: dv.status ?? "VENCIDA",
    partes: dv.credor ?? dv.instituicao ?? "",
    tribunal: "",
  });

  const todosNorm: ProcessoItem[] = [
    ...processos.map(normItem),
    ...dividas.map(divNorm),
  ];

  // ── Distribuição temporal ──
  const temporalOrdem = ["< 1 ano", "1-3 anos", "3-5 anos", "> 5 anos"];
  const temporalMap = new Map<string, { qtd: number; valor: number }>(
    temporalOrdem.map(k => [k, { qtd: 0, valor: 0 }])
  );
  todosNorm.forEach(p => {
    const dt = parseDate(p.data);
    if (!dt) return;
    const label = ageLabel(dt);
    const cur = temporalMap.get(label)!;
    temporalMap.set(label, { qtd: cur.qtd + 1, valor: cur.valor + p.valorNum });
  });
  const distribuicaoTemporal: DistribuicaoTemporal[] = Array.from(temporalMap.entries())
    .filter(([, v]) => v.qtd > 0)
    .map(([periodo, v]) => ({ periodo, qtd: String(v.qtd), valor: fmtBRL(v.valor) }));

  // ── Distribuição por faixa de valor ──
  const faixaOrdem = ["< R$10k", "R$10k-50k", "R$50k-200k", "R$200k-1M", "> R$1M"];
  const faixaMap = new Map<string, { qtd: number; valor: number }>(
    faixaOrdem.map(k => [k, { qtd: 0, valor: 0 }])
  );
  todosNorm.forEach(p => {
    const label = faixaValorLabel(p.valorNum);
    const cur = faixaMap.get(label)!;
    faixaMap.set(label, { qtd: cur.qtd + 1, valor: cur.valor + p.valorNum });
  });
  const distribuicaoPorFaixa: DistribuicaoPorFaixa[] = Array.from(faixaMap.entries())
    .filter(([, v]) => v.qtd > 0)
    .map(([faixa, v]) => ({
      faixa,
      qtd: String(v.qtd),
      valor: fmtBRL(v.valor),
      pct: todosNorm.length > 0 ? ((v.qtd / todosNorm.length) * 100).toFixed(0) : "0",
    }));

  // ── Top 10 por valor e mais recentes ──
  const top10Valor = [...todosNorm]
    .sort((a, b) => b.valorNum - a.valorNum)
    .slice(0, 10);

  const top10Recentes = [...todosNorm]
    .sort((a, b) => {
      const da = parseDate(a.data)?.getTime() ?? 0;
      const db = parseDate(b.data)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, 10);

  return {
    passivosTotal: String(processos.length + dividas.length),
    ativosTotal: String(ativos),
    valorTotalEstimado: fmtBRL(valorProcessos + valorDividas),
    temRJ,
    distribuicao,
    bancarios: [],
    fiscais: [],
    fornecedores: [],
    outros: [],
    dividasQtd: String(d?.quantidade_dividas ?? dividas.length),
    dividasValor: fmtBRL(valorDividas),
    distribuicaoTemporal,
    distribuicaoPorFaixa,
    top10Valor,
    top10Recentes,
  };
}

// ─── Mapa de códigos ISPB/BCB para nomes de bancos ──────────────────────────
const BANCO_NOMES: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "041": "Banrisul",
  "047": "Banese",
  "069": "Crefisa",
  "077": "Banco Inter",
  "085": "Ailos / CECRED",
  "097": "Credisis",
  "104": "Caixa Econômica Federal",
  "133": "Cresol",
  "136": "Unicred",
  "189": "HS Financeira",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "213": "Banco Arbi",
  "218": "Banco BS2",
  "237": "Bradesco",
  "241": "Banco Clássico",
  "260": "Nubank",
  "318": "Banco BMG",
  "336": "C6 Bank",
  "341": "Itaú Unibanco",
  "364": "Gerencianet",
  "380": "PicPay",
  "389": "Banco Mercantil do Brasil",
  "394": "Banco Bradesco Financiamentos",
  "422": "Banco Safra",
  "505": "Credit Suisse",
  "604": "Banco Industrial",
  "612": "Banco Guanabara",
  "623": "Banco Pan",
  "633": "Banco Rendimento",
  "643": "Banco Pine",
  "655": "Votorantim / Neon",
  "707": "Banco Daycoval",
  "735": "Banco Neon",
  "741": "Banco Ribeirão Preto",
  "745": "Citibank",
  "748": "Sicredi",
  "752": "BNB (Banco do Nordeste)",
  "756": "Sicoob / Bancoob",
  "757": "Banco Keb Hana",
};

function resolveBancoNome(raw: string): string {
  if (!raw) return "—";
  const code = String(raw).trim().replace(/^0+/, ""); // remove leading zeros
  const paddedCode = String(raw).trim().padStart(3, "0");
  return BANCO_NOMES[paddedCode] || BANCO_NOMES[code] || `Banco ${raw}`;
}

// ─── CCF ────────────────────────────────────────────────────────────────────
function parseCCF(d: any): CCFData {
  const ccf = d?.ccf ?? {};
  const bancos: CCFData["bancos"] = (ccf.bancos ?? []).map((b: any) => {
    const rawNome = b.banco ?? b.nome ?? b.instituicao ?? b.codigoBanco ?? "";
    const nomeResolvido = /^\d+$/.test(String(rawNome).trim())
      ? resolveBancoNome(rawNome)
      : (rawNome || "—");
    return {
      banco: nomeResolvido,
      agencia: b.agencia ?? b.ag ?? "",
      quantidade: Number(b.qteOcorrencias ?? b.quantidade ?? b.qtd ?? 1),
      dataUltimo: b.ultimo ?? b.data ?? b.dataUltimo ?? b.ultimaData ?? "",
      motivo: b.motivo ?? "",
    };
  });
  const historico: CCFData["historico"] = (ccf.historico ?? []).map((h: any) => ({
    quantidade: Number(h.quantidade ?? 0),
    dataConsulta: h.dataConsulta ?? "",
  }));
  // Tendência: compara mais recente vs ~6 meses atrás
  let tendenciaVariacao: number | undefined;
  let tendenciaLabel: string | undefined;
  if (historico.length >= 2) {
    const mais_recente = historico[0].quantidade;
    const referencia = historico.find((h, i) => i > 0 && h.quantidade !== mais_recente)?.quantidade ?? historico[historico.length - 1].quantidade;
    if (referencia > 0) {
      tendenciaVariacao = Math.round(((mais_recente - referencia) / referencia) * 100);
      tendenciaLabel = tendenciaVariacao > 10 ? "crescimento" : tendenciaVariacao < -10 ? "queda" : "estavel";
    }
  }

  return {
    qtdRegistros: Number(ccf.qtdRegistros ?? bancos.length),
    bancos,
    historico,
    tendenciaVariacao,
    tendenciaLabel,
  };
}

// ─── Histórico de Consultas ──────────────────────────────────────────────────
function parseHistoricoConsultas(d: any): HistoricoConsultaItem[] {
  const hist: any[] = d?.historico_consultas ?? [];
  return hist
    .filter((h: any) => h.usuario && h.ultimaConsulta)
    .map((h: any) => ({
      usuario: String(h.usuario).trim(),
      ultimaConsulta: String(h.ultimaConsulta),
    }))
    .sort((a, b) => new Date(b.ultimaConsulta).getTime() - new Date(a.ultimaConsulta).getTime());
}

// ─── Enrichment CNPJ / QSA ──────────────────────────────────────────────────
function fmtEndereco(e: any): string {
  return [
    e.tipoLogradouro, e.logradouro, e.numero,
    e.complemento, e.bairro, e.cidade, e.uf,
    e.cep ? `CEP ${String(e.cep).replace(/(\d{5})(\d{3})/, "$1-$2")}` : ""
  ].filter(Boolean).join(", ");
}

function parseCNPJEnrichment(d: any): CreditHubEnrichment {
  const tel = (d?.telefones ?? [])
    .filter(Boolean)
    .map((t: string) => {
      const n = String(t).replace(/\D/g, "");
      if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
      if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
      return t;
    })
    .join(" / ");
  const em = (d?.emails ?? []).filter((e: string) => e && e.trim()).join(", ");

  // Endereços — deduplicados pela combinação rua+numero+cep
  const endArr: any[] = d?.enderecos ?? [];
  const seen = new Set<string>();
  const enderecosFmt: string[] = [];
  endArr.forEach((e: any) => {
    const key = `${e.logradouro}|${e.numero}|${e.cep}`;
    if (!seen.has(key)) { seen.add(key); enderecosFmt.push(fmtEndereco(e)); }
  });

  const funcionarios = d?.quantidadeFuncionarios
    ? String(d.quantidadeFuncionarios)
    : (d?.faixaFuncionarios ? String(d.faixaFuncionarios) : undefined);

  return {
    capitalSocialCNPJ: d?.capitalSocial != null
      ? Number(d.capitalSocial).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : undefined,
    porte: d?.porteEmpresa ?? undefined,
    naturezaJuridica: d?.naturezaJuridica ?? undefined,
    cnaePrincipal: d?.cnae ?? undefined,
    cnaeDescricao: d?.cnaeDescricao ?? undefined,
    telefone: tel || undefined,
    email: em || undefined,
    endereco: enderecosFmt[0] || undefined,
    enderecos: enderecosFmt.length > 1 ? enderecosFmt : undefined,
    tipoEmpresa: d?.tipoEmpresa ?? undefined,
    funcionarios: funcionarios || undefined,
    regimeTributario: d?.regimeTributario || undefined,
    nire: d?.nire || undefined,
    site: d?.site || undefined,
  };
}

function parseQSAEnrichment(d: any): QSAData {
  // Prefere quadroSocietario (tem CPF/CNPJ e dataEntrada), fallback rfb.socios
  const qs: any[] = d?.quadroSocietario?.length ? d.quadroSocietario : (d?.rfb?.socios ?? []);
  return {
    capitalSocial: d?.capitalSocial != null
      ? Number(d.capitalSocial).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : "",
    quadroSocietario: qs.map((s: any) => ({
      nome: s.nome ?? "—",
      cpfCnpj: s.documento ?? s.cpf ?? s.cnpj ?? "",
      qualificacao: s.qualificacaoSocio ?? s.qualificacao ?? "",
      participacao: s.valorParticipacao
        ? Number(s.valorParticipacao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : (s.participacao ?? ""),
      dataEntrada: s.dataEntrada ?? "",
      dataSaida: s.dataSaida ?? "",
    })),
  };
}

// ─── Grupo Econômico via CPF ─────────────────────────────────────────────────

function extrairSobrenomes(nomeCompleto: string): string[] {
  // Palavras a ignorar (preposições e artigos comuns em nomes brasileiros)
  const ignorar = new Set(["de", "da", "do", "das", "dos", "e", "di", "del"]);
  const partes = nomeCompleto.trim().toUpperCase().split(/\s+/).filter(p => !ignorar.has(p.toLowerCase()));
  // Retorna as últimas 2 palavras como possíveis sobrenomes
  return partes.slice(Math.max(1, partes.length - 2));
}

export function detectarParentesco(
  socios: { nome: string; cpfCnpj: string }[]
): { alertaParentesco: boolean; parentescosDetectados: ParentescoDetectado[] } {
  const parentescosDetectados: ParentescoDetectado[] = [];

  // Apenas sócios PF (CPF = 11 dígitos)
  const sociosPF = socios.filter(s => s.cpfCnpj.replace(/\D/g, "").length === 11);
  if (sociosPF.length < 2) return { alertaParentesco: false, parentescosDetectados: [] };

  // Mapa: sobrenome → lista de sócios que o têm
  const sobrenomeMap = new Map<string, string[]>();
  sociosPF.forEach(s => {
    extrairSobrenomes(s.nome).forEach(sob => {
      if (sob.length < 3) return; // ignora partículas curtas
      const lista = sobrenomeMap.get(sob) ?? [];
      lista.push(s.nome);
      sobrenomeMap.set(sob, lista);
    });
  });

  // Detecta sobrenomes compartilhados entre 2+ sócios distintos
  sobrenomeMap.forEach((nomes, sobrenome) => {
    const distintos = Array.from(new Set(nomes));
    if (distintos.length >= 2) {
      for (let i = 0; i < distintos.length - 1; i++) {
        for (let j = i + 1; j < distintos.length; j++) {
          parentescosDetectados.push({
            socio1: distintos[i],
            socio2: distintos[j],
            sobrenomeComum: sobrenome,
          });
        }
      }
    }
  });

  return {
    alertaParentesco: parentescosDetectados.length > 0,
    parentescosDetectados,
  };
}

function parseEmpresasVinculadas(d: any, cpfSocio: string, nomeSocio: string): GrupoEconomicoData["empresas"] {
  // A API CreditHub pode retornar participações em diferentes campos
  const participacoes: any[] = [
    ...(d?.participacoes ?? []),
    ...(d?.empresasVinculadas ?? []),
    ...(d?.empresas ?? []),
    ...(d?.socios ?? []),       // algumas APIs retornam no campo socios
  ];

  return participacoes
    .filter((p: any) => p?.cnpj || p?.documento)
    .map((p: any) => ({
      razaoSocial: p.razaoSocial ?? p.nome ?? p.nomeEmpresa ?? "—",
      cnpj: (p.cnpj ?? p.documento ?? "").replace(/\D/g, ""),
      relacao: p.qualificacao ?? p.relacao ?? p.tipo ?? "via Sócio",
      scrTotal: "—",
      protestos: "—",
      processos: "—",
      socioOrigem: nomeSocio,
      cpfSocio,
      participacao: p.participacao ?? p.percentual ?? "",
      situacao: (p.situacaoCadastral ?? p.situacao ?? "ATIVA").toUpperCase(),
    }));
}

// Consulta CreditHub por CPF de sócio para obter empresas vinculadas
async function consultarCreditHubPorCPF(cpf: string, nomeSocio: string): Promise<GrupoEconomicoData["empresas"]> {
  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) return [];
  const cpfNum = cpf.replace(/\D/g, "");
  if (cpfNum.length !== 11) return [];

  try {
    const url = `${CREDITHUB_API_URL}/simples/${CREDITHUB_API_KEY}/${cpfNum}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const d = raw?.data ?? raw;
    return parseEmpresasVinculadas(d, cpfNum, nomeSocio);
  } catch {
    return [];
  }
}

// Função pública: consulta grupo econômico de todos os sócios PF em paralelo + detecta parentesco
export async function consultarGrupoEconomicoSocios(
  socios: { nome: string; cpfCnpj: string }[]
): Promise<GrupoEconomicoData> {
  const sociosPF = socios.filter(s => s.cpfCnpj.replace(/\D/g, "").length === 11);

  // Parentesco determinístico (não depende de API)
  const { alertaParentesco, parentescosDetectados } = detectarParentesco(socios);

  if (sociosPF.length === 0) {
    return { empresas: [], alertaParentesco, parentescosDetectados };
  }

  // Consultas paralelas por CPF
  const resultados = await Promise.allSettled(
    sociosPF.map(s => consultarCreditHubPorCPF(s.cpfCnpj, s.nome))
  );

  // Agrega e deduplica por CNPJ
  const cnpjVisto = new Set<string>();
  const empresas: GrupoEconomicoData["empresas"] = [];
  resultados.forEach(r => {
    if (r.status !== "fulfilled") return;
    r.value.forEach(emp => {
      if (!cnpjVisto.has(emp.cnpj)) {
        cnpjVisto.add(emp.cnpj);
        empresas.push(emp);
      }
    });
  });

  return { empresas, alertaParentesco, parentescosDetectados };
}

// ─── Consulta principal ─────────────────────────────────────────────────────
export async function consultarCreditHub(cnpj: string): Promise<CreditHubResult> {
  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) {
    return { success: false, mock: true, error: "Credit Hub não configurado" };
  }

  const cnpjNum = cnpj.replace(/\D/g, "");
  const url = `${CREDITHUB_API_URL}/simples/${CREDITHUB_API_KEY}/${cnpjNum}`;

  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, mock: false, error: `Credit Hub ${res.status}: ${err}` };
    }

    const raw = await res.json();
    const d = raw?.data ?? raw; // dados aninhados sob raw.data

    // DEBUG — remover após diagnóstico
    console.log("[credithub] top-level keys:", Object.keys(d ?? {}));
    console.log("[credithub] d.ccf:", JSON.stringify(d?.ccf ?? null));
    const ccfCandidates = ["ccf", "cheque_sem_fundo", "cheques", "cce", "chequesSemFundo", "cheque"];
    ccfCandidates.forEach(k => { if ((d as any)?.[k]) console.log(`[credithub] FOUND CCF under key "${k}":`, JSON.stringify((d as any)[k]).slice(0, 200)); });

    return {
      success: true,
      mock: false,
      protestos: parseProtestos(d),
      processos: parseProcessos(d),
      ccf: parseCCF(d),
      historicoConsultas: parseHistoricoConsultas(d),
      cnpjEnrichment: parseCNPJEnrichment(d),
      qsaEnrichment: parseQSAEnrichment(d),
      score: {
        consultadoEm: new Date().toISOString(),
        protestosIntegrados: true,
        processosIntegrados: true,
      },
    };
  } catch (err: any) {
    return { success: false, mock: false, error: String(err?.message ?? err) };
  }
}
