/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ProtestosData, ProcessosData, BureauScore,
  ProcessoItem, DistribuicaoTemporal, DistribuicaoPorFaixa,
  CCFData, HistoricoConsultaItem, QSAData,
  GrupoEconomicoData, ParentescoDetectado, PefinReginData, SocioKycCreditHub,
} from "@/types";
import { protestosSave, protestosLoad, processosSave, processosLoad, ccfSave, ccfLoad } from "@/lib/bureaus/cache";

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
  pefin?: PefinReginData;
  refin?: PefinReginData;
  error?: string;
}

function fmtBRL(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parse robusto de valores monetários que podem vir em formatos variados do CreditHub:
 * - number: 622 ou 622.5 (direto)
 * - string BR: "622,00" ou "1.234,56"
 * - string US: "622.00" ou "1,234.56"
 * - string sem separador: "622"
 * Retorna número seguro (não NaN, não Infinity) + sanity check.
 */
function parseMoneyRobust(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") {
    if (!isFinite(v) || isNaN(v)) return 0;
    return v;
  }
  const s = String(v).trim();
  if (!s) return 0;
  // Remove tudo que não é dígito, ponto, vírgula ou menos
  const cleaned = s.replace(/[^\d.,\-]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let num: number;
  if (hasComma && hasDot) {
    // Ambos separadores: o que aparece por último é o decimal
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // BR: 1.234.567,89
      num = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      // US: 1,234,567.89
      num = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (hasComma) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // BR decimal: 123456,78
      num = parseFloat(cleaned.replace(",", "."));
    } else {
      // US thousands: 1,234,567
      num = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (hasDot) {
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal: 123.45
      num = parseFloat(cleaned);
    } else {
      // BR thousands: 1.234.567
      num = parseFloat(cleaned.replace(/\./g, ""));
    }
  } else {
    num = parseFloat(cleaned);
  }
  if (!isFinite(num) || isNaN(num)) return 0;
  // Sanity: valor individual de protesto/processo > R$ 10 bilhões é absurdo
  if (Math.abs(num) > 10_000_000_000) {
    console.warn(`[credithub] parseMoneyRobust: valor absurdo detectado=${num} input="${s}" — zerando`);
    return 0;
  }
  return num;
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
// A API CreditHub pode retornar protestos em múltiplas estruturas possíveis.
// Esta função tenta todas antes de desistir.
function parseProtestos(d: any): ProtestosData {

  type ProtestoFlat = {
    data: string; valor: number; nomeCedente: string;
    nomeApresentante: string; cartorioNome: string;
    municipio: string; uf: string; regularizado: boolean;
  };

  const todos: ProtestoFlat[] = [];

  // ── Resolve onde estão os cartórios ──────────────────────────────────────
  // A API pode retornar em: d.protestos.cartorios, d.protestos (array),
  // d.cartorios, d.registros_protestos, etc.
  const protestosRaiz = d?.protestos ?? d?.registros_protestos ?? d?.protestoData ?? {};
  const cartorios: any[] = Array.isArray(protestosRaiz)
    ? protestosRaiz                                               // d.protestos = [...]
    : Array.isArray(protestosRaiz?.cartorios)
      ? protestosRaiz.cartorios                                   // d.protestos.cartorios = [...]
      : Array.isArray(protestosRaiz?.registros)
        ? protestosRaiz.registros                                 // d.protestos.registros = [...]
        : Array.isArray(d?.cartorios)
          ? d.cartorios                                           // d.cartorios = [...]
          : [];

  console.log(`[credithub][protestos] cartorios encontrados: ${cartorios.length} | chaves raiz: ${Object.keys(d ?? {}).join(",")}`);

  cartorios.forEach((c: any) => {
    const cartorioNome = c.nome ?? c.nomeCartorio ?? c.cartorio ?? c.nomeCartorios ?? "";
    const municipio    = c.cidade ?? c.municipio ?? c.localidade ?? "";
    const uf           = c.uf ?? c.estado ?? c.siglaUF ?? "";

    // Nível interno: cada cartório pode ter um array de protestos individuais
    const protestosInner: any[] = Array.isArray(c.protestos)
      ? c.protestos
      : Array.isArray(c.titulos)
        ? c.titulos
        : Array.isArray(c.registros)
          ? c.registros
          : [];

    // Regularizado SÓ quando houver evidência explícita — flag boolean true, status textual
    // de regularização, OU string não-vazia em anuencia (ex: "SIM", "DEFERIDA"). Objeto em
    // anuencia (ex: {tipo:"parcial"}) NÃO conta, pois o CreditHub pode retornar estrutura
    // de detalhes sem o protesto estar de fato regularizado.
    const isRegularizado = (x: any): boolean => {
      if (x.regularizado === true || x.temAnuencia === true) return true;
      const statusStr = String(x.status ?? x.situacao ?? "").toUpperCase();
      if (/PAGO|CANCELADO|BAIXADO|QUITADO|SUSTADO|RETIRADO|REGULARIZADO/.test(statusStr)) return true;
      // anuencia: só conta se for string positiva — objeto/array NÃO
      if (typeof x.anuencia === "string") {
        return /SIM|TRUE|DEFERIDA|CONCEDIDA|REGULARIZADO/i.test(x.anuencia);
      }
      return false;
    };

    if (protestosInner.length > 0) {
      protestosInner.forEach((p: any, idx: number) => {
        if (idx === 0) console.log(`[credithub][protestos] keys do 1º título: ${Object.keys(p ?? {}).join(",")}`);
        const rawValor = p.valor ?? p.valorProtestado ?? p.valorTitulo ?? 0;
        const valor = parseMoneyRobust(rawValor);
        if (valor > 1_000_000) {
          console.log(`[credithub][protestos] valor alto: raw="${rawValor}" parsed=${valor} data=${p.data ?? p.dataProtesto}`);
        }
        todos.push({
          data:             p.dataProtesto ?? p.data ?? p.dataOcorrencia ?? p.dataEmissao ?? p.dataRegistro ?? p.dtOcorrencia ?? p.dt ?? "",
          valor,
          nomeCedente:      p.nomeCedente ?? p.cedente ?? p.credor ?? "",
          nomeApresentante: p.nomeApresentante ?? p.apresentante ?? "",
          cartorioNome, municipio, uf,
          regularizado: isRegularizado(p),
        });
      });
    } else {
      // Cartório sem array interno — o próprio objeto do cartório é o protesto
      console.log(`[credithub][protestos] keys do cartório-protesto: ${Object.keys(c ?? {}).join(",")}`);
      const rawValor = c.valor ?? c.valorProtestado ?? 0;
      todos.push({
        data:             c.data ?? c.dataProtesto ?? c.dataOcorrencia ?? c.dataEmissao ?? c.dataRegistro ?? c.dtOcorrencia ?? c.dt ?? "",
        valor:            parseMoneyRobust(rawValor),
        nomeCedente:      c.nomeCedente ?? c.cedente ?? c.credor ?? "",
        nomeApresentante: c.nomeApresentante ?? c.apresentante ?? "",
        cartorioNome, municipio, uf,
        regularizado: isRegularizado(c),
      });
    }
  });

  // ── Deduplicação: inclui cartório na chave para não eliminar protestos
  //    legítimos em cartórios diferentes com mesmo valor/data/cedente ────────
  const vistos = new Set<string>();
  let dedupDropped = 0;
  const todosUniq = todos.filter(p => {
    const cedente = (p.nomeCedente || p.nomeApresentante || "").toLowerCase().trim();
    const key = `${p.data}|${p.valor}|${cedente}|${p.cartorioNome.toLowerCase().trim()}`;
    if (vistos.has(key)) { dedupDropped++; return false; }
    vistos.add(key);
    return true;
  });
  if (dedupDropped > 0) {
    console.log(`[credithub][protestos] dedup descartou ${dedupDropped} de ${todos.length}`);
  }

  const vigentes     = todosUniq.filter(p => !p.regularizado);
  const regularizados = todosUniq.filter(p => p.regularizado);
  console.log(`[credithub][protestos] total=${todos.length} uniq=${todosUniq.length} vigentes=${vigentes.length} regularizados=${regularizados.length}`);

  const vigentesValor     = vigentes.reduce((s, p) => s + p.valor, 0);
  const regularizadosValor = regularizados.reduce((s, p) => s + p.valor, 0);

  // Qtd: usa detalhes encontrados; fallback para campo numérico da API apenas
  // quando NENHUM cartório foi encontrado (evita mismatch qtd≠detalhes)
  const vigentesQtd = todosUniq.length > 0
    ? vigentes.length
    : Number(protestosRaiz?.qtdProtestos ?? protestosRaiz?.total ?? protestosRaiz?.quantidade ?? 0);

  console.log(`[credithub][protestos] vigentes=${vigentesQtd} regularizados=${regularizados.length} detalhes=${todosUniq.length}`);

  // Detecta protestos de natureza fiscal (impostos, governo, autarquias)
  const FISCAL_RE = /receita\s*federal|inss|pgfn|pgm|pgm|prefeitura|municipio|secretaria\s*da?\s*fazenda|secretaria\s*estadual|sefaz|sefin|estado\s*de|governo\s*do|tribunal\s*de\s*contas|dívida\s*ativa|cda\b|fisco|tribut|imposto|iss\b|iptu\b|ipva\b|irpj\b|csll\b|cofins|pis\b|simples\s*nacional|das\b|carf\b|antt\b|anatel\b|ibama\b|anvisa\b|autarqu/i;

  const detalhes: ProtestosData["detalhes"] = todosUniq.map((p) => {
    const credorDisplay = p.cartorioNome
      ? [p.cartorioNome, p.municipio, p.uf].filter(Boolean).join(" — ")
      : [p.municipio, p.uf].filter(Boolean).join(" / ") || "—";
    const credorParaDeteccao = `${p.nomeCedente} ${p.nomeApresentante} ${p.cartorioNome}`;
    const tipoCredor: "fiscal" | "cartorio" = FISCAL_RE.test(credorParaDeteccao) ? "fiscal" : "cartorio";
    return {
      data:         p.data,
      credor:       credorDisplay,
      valor:        fmtBRL(p.valor),
      regularizado: p.regularizado,
      apresentante: p.nomeCedente || p.nomeApresentante || "",
      municipio:    p.municipio,
      uf:           p.uf,
      especie:      "",
      numero:       "",
      dataVencimento: "",
      tipoCredor,
    };
  });

  // Totais fiscais
  const vigFiscais = vigentes.filter(p => {
    const c = `${p.nomeCedente} ${p.nomeApresentante} ${p.cartorioNome}`;
    return FISCAL_RE.test(c);
  });
  const fiscaisValorTotal = vigFiscais.reduce((s, p) => s + p.valor, 0);
  if (vigFiscais.length > 0) {
    console.log(`[credithub][protestos] fiscais: ${vigFiscais.length} protestos R$ ${fmtBRL(fiscaisValorTotal)}`);
  }

  return {
    vigentesQtd:        String(vigentesQtd),
    vigentesValor:      fmtBRL(vigentesValor),
    regularizadosQtd:   String(regularizados.length),
    regularizadosValor: fmtBRL(regularizadosValor),
    detalhes,
    fiscaisQtd:   vigFiscais.length > 0 ? String(vigFiscais.length) : undefined,
    fiscaisValor: vigFiscais.length > 0 ? fmtBRL(fiscaisValorTotal) : undefined,
  };
}

// ─── Processos + Dívidas ────────────────────────────────────────────────────
function parseProcessos(d: any): ProcessosData {
  // Tenta todas as variações de nome que diferentes versões da API CreditHub usam
  const processos: any[] = (
    Array.isArray(d?.processos)               ? d.processos               :
    Array.isArray(d?.processosJudiciais)      ? d.processosJudiciais      :
    Array.isArray(d?.processos_judiciais)     ? d.processos_judiciais     :
    Array.isArray(d?.acoesJudiciais)          ? d.acoesJudiciais          :
    Array.isArray(d?.acoes_judiciais)         ? d.acoes_judiciais         :
    Array.isArray(d?.acoesjudiciais)          ? d.acoesjudiciais          :
    Array.isArray(d?.litigios)                ? d.litigios                :
    Array.isArray(d?.judicial)                ? d.judicial                :
    Array.isArray(d?.acoes)                   ? d.acoes                   :
    Array.isArray(d?.demandasJudiciais)       ? d.demandasJudiciais       :
    Array.isArray(d?.demandas_judiciais)      ? d.demandas_judiciais      :
    []
  );
  const dividas: any[] = (
    Array.isArray(d?.dividas)    ? d.dividas    :
    Array.isArray(d?.debitos)    ? d.debitos    :
    Array.isArray(d?.negativacoes) ? d.negativacoes :
    []
  );
  console.log(`[credithub][processos] field usado: processos=${processos.length} | dividas=${dividas.length} | topKeys: ${Object.keys(d ?? {}).join(",")}`);

  // Valor dos processos judiciais
  const valorProcessos = processos.reduce(
    (s, p) => s + Number(p.valor ?? p.valorCausa ?? p.valorAcao ?? 0), 0
  );
  // Valor das dívidas (campo direto da API)
  const valorDividas = Number(d?.valor_total_dividas ?? 0);

  // Processos ativos (em andamento) — verifica status, situacao e fase
  const ativos = processos.filter(p => {
    const s = String(p.status ?? p.situacao ?? p.situacao_processo ?? p.situacaoProcesso ?? "");
    const f = String(p.fase_processual ?? p.faseProcessual ?? p.fase ?? "");
    return !s || /ativo|andamento|distribuido|pendente|em curso|conhecimento|execu[çc]/i.test(s + " " + f);
  }).length;

  const arquivados = processos.filter(p => {
    const s = String(p.status ?? p.situacao ?? p.situacao_processo ?? p.situacaoProcesso ?? "").toLowerCase();
    const f = String(p.fase_processual ?? p.faseProcessual ?? p.fase ?? "").toLowerCase();
    return /arquivado|encerrado|extinto|baixado/i.test(s + " " + f);
  }).length;

  const interrompidos = processos.filter(p => {
    const s = String(p.status ?? p.situacao ?? p.situacao_processo ?? p.situacaoProcesso ?? "").toLowerCase();
    const f = String(p.fase_processual ?? p.faseProcessual ?? p.fase ?? "").toLowerCase();
    return /interrompido|suspenso|sobrestado|paralisado/i.test(s + " " + f);
  }).length;

  // ── Polo processual: identifica se a empresa é autora (polo ativo) ou ré (polo passivo) ──
  // Usa o nome da empresa (razaoSocial) para encontrar o envolvido correto
  const razaoSocial = String(d?.razaoSocial ?? d?.razao_social ?? "").toUpperCase().trim();
  // Palavras distintivas do nome (>4 chars, ignora termos genéricos)
  const stopWords = new Set(["LTDA", "EIRELI", "INDUSTRIA", "COMERCIO", "SERVICOS", "EMPRESA", "BRASIL", "NACIONAL", "SOLUCOES", "ALIMENTOS", "S/A", "S.A", "ME", "EPP"]);
  const palavrasDistintivas = razaoSocial
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w))
    .slice(0, 3); // usa até 3 palavras para match

  function nomeMatchEmpresa(nome: string): boolean {
    const nomeUp = nome.toUpperCase().replace(/[^A-Z0-9\s]/g, "");
    return palavrasDistintivas.some(w => nomeUp.includes(w));
  }

  let poloAtivoQtd = 0;
  let poloPassivoQtd = 0;
  let temFalencia = false;

  processos.forEach(p => {
    // Detecta pedido de falência
    if (/fal[eê]ncia/i.test(String(p.classe_processual ?? p.tipo ?? p.natureza ?? ""))) {
      temFalencia = true;
    }

    const envs: any[] = p.envolvidos_ultima_movimentacao ?? [];
    // Tenta primeiro tipo_envolvido do próprio processo
    const tipoDir = String(p.tipo_envolvido ?? "").toLowerCase();
    if (tipoDir === "ativo") { poloAtivoQtd++; return; }
    if (tipoDir === "passivo") { poloPassivoQtd++; return; }

    // Fallback: busca o envolvido que corresponde à empresa consultada
    const envEmpresa = envs.find(e =>
      /^(ativo|passivo)$/i.test(String(e.envolvido_tipo ?? "")) &&
      nomeMatchEmpresa(String(e.nome ?? ""))
    );
    if (envEmpresa) {
      if (/ativo/i.test(envEmpresa.envolvido_tipo)) poloAtivoQtd++;
      else poloPassivoQtd++;
    }
  });

  // Recuperação judicial
  const temRJ = processos.some(p =>
    /recupera[çc]|rj\b/i.test(String(p.tipo ?? p.natureza ?? p.assunto ?? ""))
  );

  // ── Distribuição por tipo ──
  const tipoMap = new Map<string, number>();
  processos.forEach(p => {
    // Credit Hub usa classe_processual; fallback para outros campos comuns
    const t = (p.classe_processual ?? p.tipo ?? p.natureza ?? p.classe ?? "OUTROS").toUpperCase().trim();
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
    const numero = p.numero_novo ?? p.numero ?? p.nrProcesso ?? p.numeroProcesso ?? p.id ?? "";
    // Tipo/classe
    const tipo = (p.classe_processual ?? p.tipo ?? p.natureza ?? p.classe ?? p.tipoAcao ?? "—").toUpperCase();
    // Assunto
    const assunto = p.assuntos ?? p.assunto ?? p.assuntoPrincipal ?? p.descricaoAssunto ?? "";
    // Data de distribuição: preferir data de distribuição, fallback created_at
    const data = p.dataDistribuicao ?? p.data_distribuicao ?? p.data ?? p.created_at ?? p.updated_at ?? "";
    // Data última movimentação
    const dataUltimoAndamento = p.updated_at ?? p.data_ultima_movimentacao ?? p.dataUltimaMovimentacao ?? p.data_movimentacoes ?? "";
    // Tribunal
    const tribunal = p.diario_sigla ?? p.diario_nome ?? p.tribunal ?? p.vara ?? p.orgaoJulgador ?? "";
    // UF
    const uf = p.estado ?? p.uf ?? p.ufTribunal ?? p.siglaUF ?? "";
    // Status: tenta todas as variações possíveis da API e monta label composto se necessário
    const statusRaw = p.status ?? p.situacao ?? p.situacao_processo ?? p.situacaoProcesso
      ?? p.status_processual ?? p.statusProcessual ?? "";
    const faseRaw = p.fase_processual ?? p.faseProcessual ?? p.fase ?? p.instancia ?? "";
    // Compõe status final: "STATUS — Fase" se ambos disponíveis, senão o que tiver
    const status = statusRaw && faseRaw
      ? `${statusRaw} — ${faseRaw}`
      : statusRaw || faseRaw || "—";

    const valorNum = parseMoneyRobust(p.valor ?? p.valorCausa ?? p.valorAcao ?? p.valorDaCausa ?? 0);
    return {
      numero,
      tipo,
      assunto: String(assunto),
      data: data ? data.substring(0, 10) : "",
      valor: fmtBRL(valorNum),
      valorNum,
      status,
      partes: ativos || (p.polo_ativo ?? p.parteAtiva ?? p.autor ?? p.requerente ?? ""),
      tribunal,
      polo_passivo: passivos || (p.polo_passivo ?? p.partePassiva ?? p.reu ?? p.requerido ?? p.executado ?? ""),
      fase: faseRaw,
      uf,
      comarca: p.comarca ?? p.municipioTribunal ?? p.municipio ?? "",
      dataUltimoAndamento: dataUltimoAndamento ? dataUltimoAndamento.substring(0, 10) : "",
    };
  };

  const divNorm = (dv: any): ProcessoItem => {
    const valorNum = parseMoneyRobust(dv.valor ?? dv.valorDivida ?? 0);
    return {
      numero: dv.numero ?? dv.contrato ?? "",
      tipo: "DÍVIDA",
      assunto: dv.descricao ?? dv.produto ?? dv.modalidade ?? "",
      data: dv.dataVencimento ?? dv.data ?? dv.dataAbertura ?? "",
      valor: fmtBRL(valorNum),
      valorNum,
      status: dv.status ?? "VENCIDA",
      partes: dv.credor ?? dv.instituicao ?? "",
      tribunal: "",
    };
  };

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

  console.log(`[credithub] processos polo ativo=${poloAtivoQtd} polo passivo=${poloPassivoQtd} arquivados=${arquivados} interrompidos=${interrompidos} falência=${temFalencia}`);

  return {
    passivosTotal: String(processos.length + dividas.length),
    ativosTotal: String(ativos),
    valorTotalEstimado: fmtBRL(valorProcessos + valorDividas),
    temRJ,
    temFalencia,
    poloAtivoQtd: String(poloAtivoQtd),
    poloPassivoQtd: String(poloPassivoQtd),
    arquivadosQtd: arquivados > 0 ? String(arquivados) : undefined,
    interrompidosQtd: interrompidos > 0 ? String(interrompidos) : undefined,
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
  // Tenta múltiplas chaves possíveis da API Credit Hub
  const ccf = d?.ccf ?? d?.chequesSemFundo ?? d?.cheque_sem_fundo ?? d?.ccfData ?? d?.CCF
    ?? d?.cheques ?? d?.ocorrencias_ccf ?? d?.chequesSemCobertura
    ?? d?.restricoes?.ccf ?? d?.negativacoes?.ccf ?? d?.retorno?.ccf
    ?? d?.chequeSemFundo ?? d?.Cheques_Sem_Fundo ?? d?.cheque
    ?? {};

  // Log diagnóstico — ajuda a identificar key real da API
  const ccfKeys = Object.keys(ccf ?? {}).join(", ");
  console.log(`[parseCCF] keys encontradas no objeto CCF: "${ccfKeys}" | qtdRegistros_raw=${ccf?.qtdRegistros ?? ccf?.quantidade ?? ccf?.total ?? "N/A"} | bancos_raw=${JSON.stringify(ccf?.bancos ?? ccf?.instituicoes ?? ccf?.registros ?? ccf?.ocorrencias ?? []).substring(0, 300)}`);

  const bancos: CCFData["bancos"] = (ccf.bancos ?? ccf.instituicoes ?? ccf.registros ?? ccf.ocorrencias ?? []).map((b: any) => {
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

  const qtdRegistros = Number(ccf.qtdRegistros ?? ccf.quantidade ?? ccf.total ?? bancos.length);
  return {
    qtdRegistros,
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
  // A API CreditHub pode retornar participações em diferentes campos — cobrimos todos os conhecidos
  const participacoes: any[] = [
    ...(d?.participacoes              ?? []),
    ...(d?.participacoesEmpresas      ?? []),  // campo real retornado pela API
    ...(d?.empresasVinculadas         ?? []),
    ...(d?.empresas                   ?? []),
    ...(d?.socios                     ?? []),
    ...(d?.participacoesSocietarias   ?? []),
    ...(d?.vinculos                   ?? []),
    ...(d?.quadroSocietario           ?? []),
    ...(d?.empresasParticipadas       ?? []),
    ...(d?.societario                 ?? []),
    ...(d?.sociedades                 ?? []),
    ...(d?.relacionamentos            ?? []),
  ];

  // Log para diagnóstico
  if (d && typeof d === "object") {
    const arrayKeys = Object.keys(d).filter(k => Array.isArray((d as Record<string,unknown>)[k]));
    if (participacoes.length === 0) {
      console.warn(`[credithub][grupo-economico] CPF ${cpfSocio.slice(0,3)}*** sem empresas nos campos mapeados. Arrays disponíveis: ${arrayKeys.join(", ")}`);
    } else {
      console.log(`[credithub][grupo-economico] CPF ${cpfSocio.slice(0,3)}*** ${participacoes.length} participações encontradas. Arrays disponíveis: ${arrayKeys.join(", ")}`);
      if (participacoes[0]) {
        console.log(`[credithub][grupo-economico] CPF ${cpfSocio.slice(0,3)}*** keys do 1º item: ${Object.keys(participacoes[0]).join(", ")}`);
      }
    }
  }

  return participacoes
    .filter((p: any) => p?.cnpj || p?.documento || p?.cnpjEmpresa || p?.cnpj_empresa || p?.cpf_cnpj)
    .map((p: any) => {
      const cnpjRaw = (p.cnpj ?? p.cnpjEmpresa ?? p.cnpj_empresa ?? p.documento ?? p.cpf_cnpj ?? "").replace(/\D/g, "");
      const razao = p.razaoSocial ?? p.nomeEmpresa ?? p.nome ?? p.empresa ?? p.razao_social ?? p.nome_empresa ?? "—";
      const relacao = p.qualificacao ?? p.tipoParticipacao ?? p.cargo ?? p.funcao ?? p.relacao ?? p.tipo ?? p.tipoVinculo ?? p.tipo_vinculo ?? "via Sócio";
      const participacao = p.participacao ?? p.percentual ?? p.percentualParticipacao ?? p.percentual_participacao ?? p.quota ?? "";
      const situacaoRaw = p.situacaoCadastral ?? p.situacao ?? p.situacaoEmpresa ?? p.status ?? p.situacao_cadastral ?? "ATIVA";
      return {
        razaoSocial: razao,
        cnpj: cnpjRaw.length === 14 ? cnpjRaw : "",
        relacao,
        scrTotal: "—",
        protestos: "—",
        processos: "—",
        socioOrigem: nomeSocio,
        cpfSocio,
        participacao: String(participacao),
        situacao: String(situacaoRaw).toUpperCase(),
      };
    });
}

// ── Endpoint dedicado: GET /v1/grupo-economico/{documento} ──────────────────
// Endpoint oficial da CreditHub para grupo econômico — retorna empresas
// vinculadas diretamente para o CPF/CNPJ consultado.
async function consultarGrupoEconomicoDedicado(
  documento: string,
  nomeSocio: string,
): Promise<GrupoEconomicoData["empresas"]> {
  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) return [];
  const docNum = documento.replace(/\D/g, "");
  if (!docNum) return [];

  const url = `${CREDITHUB_API_URL}/v1/grupo-economico/${docNum}`;
  const MAX_ATTEMPTS = 5;
  const DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CREDITHUB_API_KEY}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();

      if (text.includes(`push="true"`) || text.includes("push='true'")) {
        console.log(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** tentativa ${attempt}: push=true, aguardando...`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }
        console.warn(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** timeout após ${MAX_ATTEMPTS} tentativas`);
        return [];
      }

      if (!res.ok) {
        console.warn(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** status ${res.status}: ${text.slice(0, 100)}`);
        return [];
      }

      let raw: any;
      try {
        raw = JSON.parse(text);
      } catch {
        console.warn(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** resposta não é JSON`);
        return [];
      }

      const d = raw?.data ?? raw;
      console.log(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** keys: ${Object.keys(d ?? {}).join(", ")}`);

      const empresas = parseEmpresasVinculadas(d, docNum, nomeSocio);
      console.log(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** empresas encontradas: ${empresas.length}`);
      return empresas;

    } catch (err: unknown) {
      console.warn(`[credithub][grupo-economico] ${docNum.slice(0,4)}*** tentativa ${attempt} exception:`, String(err instanceof Error ? err.message : err));
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return [];
}

// Consulta CreditHub por CPF de sócio para obter empresas vinculadas + kyc (processos/protestos)
// Usa o mesmo endpoint /simples/{key}/{cpf} com retry para lidar com push=true
async function consultarCreditHubPorCPF(cpf: string, nomeSocio: string): Promise<{ empresas: GrupoEconomicoData["empresas"]; kyc: SocioKycCreditHub }> {
  const emptyKyc: SocioKycCreditHub = { cpf };
  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) return { empresas: [], kyc: emptyKyc };
  const cpfNum = cpf.replace(/\D/g, "");
  if (cpfNum.length !== 11) return { empresas: [], kyc: emptyKyc };

  const url = `${CREDITHUB_API_URL}/simples/${CREDITHUB_API_KEY}/${cpfNum}`;
  const MAX_ATTEMPTS = 5;
  const DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();

      // API retorna 500 + XML com push="true" enquanto processa — aguarda e tenta novamente
      if (text.includes(`push="true"`) || text.includes("push='true'")) {
        console.log(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** tentativa ${attempt}: push=true, aguardando...`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }
        console.warn(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** timeout após ${MAX_ATTEMPTS} tentativas`);
        return { empresas: [], kyc: emptyKyc };
      }

      if (!res.ok) {
        // 500 sem push="true" = erro real, não transiente — não adianta retry
        console.warn(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** status ${res.status}: ${text.slice(0,100)}`);
        return { empresas: [], kyc: emptyKyc };
      }

      let raw: any;
      try {
        raw = JSON.parse(text);
      } catch {
        console.warn(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** resposta não é JSON: ${text.slice(0,100)}`);
        return { empresas: [], kyc: emptyKyc };
      }

      const d = raw?.data ?? raw;
      const arrKeys = Object.keys(d ?? {}).filter(k => Array.isArray((d as Record<string,unknown>)[k]));
      console.log(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** OK — keys: ${Object.keys(d ?? {}).join(", ")}`);
      console.log(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** array keys: ${arrKeys.join(", ") || "(nenhum)"}`);

      // Fonte 1: campos diretos de participações
      const empresasDirectas = parseEmpresasVinculadas(d, cpfNum, nomeSocio);

      // Fonte 2 (Opção B): empresa própria do sócio via rfb.cnpj → publica.cnpj.ws
      const empresaRFB = await buscarEmpresaPropriaRFB(d, cpfNum, nomeSocio);

      // Combina e deduplica (prioridade: diretas > rfb)
      const vistos = new Set<string>();
      const todas: GrupoEconomicoData["empresas"] = [];
      for (const emp of [...empresasDirectas, ...empresaRFB]) {
        const key = emp.cnpj || emp.razaoSocial.toLowerCase().trim();
        if (!vistos.has(key)) { vistos.add(key); todas.push(emp); }
      }

      // Extrai processos e protestos do sócio para KYC
      const proc = parseProcessos(d);
      const prot = parseProtestos(d);

      // Data mais recente: top10Recentes já está ordenado do mais novo ao mais antigo
      const ultimoProcessoData = proc.top10Recentes?.find(p => p.data)?.data || undefined;
      // Protestos: ordena por data descrescente e pega o mais recente
      const ultimoProtestoData = prot.detalhes.length > 0
        ? [...prot.detalhes].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")).find(p => p.data)?.data
        : undefined;

      const kyc: SocioKycCreditHub = {
        cpf: cpfNum,
        processosTotal:     Number(proc.passivosTotal) || undefined,
        processosAtivo:     Number(proc.poloAtivoQtd)  || undefined,
        processosPassivo:   Number(proc.poloPassivoQtd) || undefined,
        processosValorTotal: proc.valorTotalEstimado || undefined,
        ultimoProcessoData,
        protestosQtd:       Number(prot.vigentesQtd) || undefined,
        ultimoProtestoData,
      };

      console.log(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** total empresas: diretas=${empresasDirectas.length} rfb=${empresaRFB.length} | processos=${kyc.processosTotal ?? 0} protestos=${kyc.protestosQtd ?? 0}`);
      return { empresas: todas, kyc };

    } catch (err: unknown) {
      console.warn(`[credithub][cpf] CPF=${cpfNum.slice(0,3)}*** tentativa ${attempt} exception:`, String(err instanceof Error ? err.message : err));
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return { empresas: [], kyc: emptyKyc };
}

// ── Opção D: extrai empresas dos processos judiciais do sócio ────────────────
// Identifica empresas que aparecem como parte em processos junto com o sócio.
// Sufixos jurídicos — identifica nomes com forma jurídica explícita
const COMPANY_SUFFIX_RE = /\b(LTDA\.?|S\.A\.?|S\/A|EIRELI|S\.?S\.?|EPP|M\.?E\.?\b|HOLDINGS?|PARTICIPA[CÇ]|FOMENTO|SECURITIZADORA)/i;
// Palavras-chave de setor — identifica empresas pelo tipo de negócio (sem sufixo jurídico)
const COMPANY_SECTOR_RE = /\b(INDUSTRI[AÀ]|COMERC[IÍ]|SERVI[CÇ]|CONSTRU[TÇ]|DISTRIBU[IÍ]|FINANC|INVEST|EMPREEND|STUDIO|ESTUDIO|BELEZA|ESTETICA|ESTET[IÍ]|SAL[AÃ]O|BARBEARIA|ACADEMIA|CL[IÍ]NICA|BOUTIQUE|FARMAC[IÍ]|DROGARIA|LABORAT[OÓ]|RESTAURANTE|PIZZARIA|LANCHONETE|PADARIA|MERCEARIA|MERCADO|SUPERMERC|IMOBILI[AÀ]|INCORPOR|LOGIST[IÍ]|TECNOLOGIA|CONSULTORIA|ENGENHARIA|CONTABILIDADE|ADVOCACIA|CORRETORA|TRANSPORTADORA|TRANSPORTES?\b|VIAGENS?\b|TURISMO|AGROPEC|AGRO\b|PECUAR)/i;
const COMPANY_RE = new RegExp(COMPANY_SUFFIX_RE.source + "|" + COMPANY_SECTOR_RE.source, "i");

function extrairEmpresasDeProcessos(
  d: Record<string, unknown>,
  cpfSocio: string,
  nomeSocio: string,
): GrupoEconomicoData["empresas"] {
  const processos = d?.processos as Array<Record<string, unknown>> ?? [];
  const resultado: GrupoEconomicoData["empresas"] = [];
  const vistos = new Set<string>();
  const nomeSocioNorm = nomeSocio.toUpperCase().trim();

  for (const proc of processos) {
    const envolvidos = proc?.envolvidos_ultima_movimentacao as Array<Record<string, unknown>> ?? [];
    for (const env of envolvidos) {
      const tipo = String(env?.envolvido_tipo ?? "").toLowerCase();
      // Pula advogados — só interessam partes (Ativo/Passivo/null) que sejam empresas
      if (tipo === "advogado") continue;

      const nome = String(env?.nome ?? "").trim().toUpperCase();
      if (!nome || nome === nomeSocioNorm) continue;
      if (!COMPANY_RE.test(nome)) continue;
      if (vistos.has(nome)) continue;
      vistos.add(nome);

      // Tenta extrair CNPJ do envolvido — CreditHub inclui cpf_cnpj/documento em muitos casos
      const cnpjRaw = String(
        env?.cnpj ?? env?.cpf_cnpj ?? env?.documento ?? env?.cpfCnpj ?? ""
      ).replace(/\D/g, "");
      const cnpj = cnpjRaw.length === 14 ? cnpjRaw : "";

      const relacao = tipo === "ativo" ? "Polo Ativo (Processo)" : tipo === "passivo" ? "Polo Passivo (Processo)" : "Via Processo";

      resultado.push({
        razaoSocial: nome,
        cnpj,
        relacao,
        scrTotal: "—",
        protestos: "—",
        processos: "—",
        socioOrigem: nomeSocio,
        cpfSocio,
        participacao: "",
        situacao: cnpj ? "VERIFICAR" : "VERIFICAR",
      });
    }
  }

  console.log(`[credithub][cpf] CPF=${cpfSocio.slice(0,3)}*** empresas de processos: ${resultado.length} (${resultado.filter(e => e.cnpj).length} com CNPJ)`);
  return resultado;
}

// ── Busca CNPJ por nome via publica.cnpj.ws ──────────────────────────────────
async function buscarCNPJPorNome(nomeEmpresa: string): Promise<string> {
  const q = encodeURIComponent(nomeEmpresa.slice(0, 60));
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj?q=${q}&quantidade=3`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json() as unknown;
    // Retorno é array de estabelecimentos
    const arr = Array.isArray(data) ? data : (data as Record<string,unknown>)?.estabelecimentos ?? [];
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const first = arr[0] as Record<string, unknown>;
    // Normaliza nome para comparação
    const nomeNorm = nomeEmpresa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const found = (arr as Record<string,unknown>[]).find(e => {
      const r = String(e?.razao_social ?? e?.nome_fantasia ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      return r.includes(nomeNorm.slice(0, 10)) || nomeNorm.includes(r.slice(0, 10));
    }) ?? first;
    const cnpj = String(found?.cnpj ?? found?.cnpj_basico ?? "").replace(/\D/g, "");
    return cnpj.length === 14 ? cnpj : "";
  } catch {
    return "";
  }
}

// ── Enriquece empresas do grupo econômico com dados do CreditHub ─────────────
// Para cada empresa com CNPJ: busca protestos e processos no CreditHub.
// Para empresas sem CNPJ: tenta encontrar via nome antes de enriquecer.
// Máximo de MAX_ENRICH enriquecimentos para não estourar timeout da requisição.
async function enriquecerEmpresasGrupoEconomico(
  empresas: GrupoEconomicoData["empresas"],
): Promise<GrupoEconomicoData["empresas"]> {
  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) return empresas;

  const MAX_ENRICH = 5;
  const RETRY_DELAY = 2000;
  const MAX_ATTEMPTS = 4;

  // Primeiro, tenta preencher CNPJs ausentes via nome (apenas empresas sem CNPJ)
  const semCnpj = empresas.filter(e => !e.cnpj && e.situacao === "VERIFICAR").slice(0, 3);
  await Promise.allSettled(semCnpj.map(async emp => {
    const cnpj = await buscarCNPJPorNome(emp.razaoSocial);
    if (cnpj) {
      emp.cnpj = cnpj;
      console.log(`[credithub][enrich] CNPJ encontrado para "${emp.razaoSocial.slice(0,30)}": ${cnpj.slice(0,4)}***`);
    }
  }));

  // Enriquece empresas com CNPJ (agora inclui as que acabaram de ter CNPJ preenchido)
  const paraEnriquecer = empresas.filter(e => e.cnpj && e.cnpj.length === 14).slice(0, MAX_ENRICH);

  await Promise.allSettled(paraEnriquecer.map(async emp => {
    const cnpj = emp.cnpj;
    const url = `${CREDITHUB_API_URL}/simples/${CREDITHUB_API_KEY}/${cnpj}`;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        const text = await res.text();

        if (text.includes(`push="true"`) || text.includes("push='true'")) {
          if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, RETRY_DELAY)); continue; }
          break;
        }
        if (!res.ok) break;

        let raw: any;
        try { raw = JSON.parse(text); } catch { break; }
        const d = raw?.data ?? raw;

        // Protestos
        const prot = parseProtestos(d);
        const protQtd = Number(prot.vigentesQtd ?? 0);
        emp.protestos = protQtd > 0
          ? `${protQtd} (R$ ${prot.vigentesValor})`
          : "0";

        // Processos
        const proc = parseProcessos(d);
        const procQtd = Number(proc.passivosTotal ?? 0);
        emp.processos = procQtd > 0 ? String(procQtd) : "0";
        if (proc.valorTotalEstimado && proc.valorTotalEstimado !== "R$ 0,00") {
          emp.valorProcessos = proc.valorTotalEstimado;
        }

        // Situação via Receita Federal (se vier no retorno)
        const sit = String(d?.situacaoCadastral ?? d?.situacao ?? "").toUpperCase();
        if (sit && emp.situacao === "VERIFICAR") {
          emp.situacao = sit.includes("ATIVA") ? "ATIVA" : sit || "VERIFICAR";
        }

        console.log(`[credithub][enrich] ${cnpj.slice(0,4)}*** protestos=${protQtd} processos=${procQtd}`);
        break;
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, RETRY_DELAY));
        else console.warn(`[credithub][enrich] ${cnpj.slice(0,4)}*** falhou:`, String(err instanceof Error ? err.message : err));
      }
    }
  }));

  return empresas;
}

// ── Opção B: empresa própria do sócio via rfb.cnpj → publica.cnpj.ws ─────────
async function buscarEmpresaPropriaRFB(
  d: Record<string, unknown>,
  cpfSocio: string,
  nomeSocio: string,
): Promise<GrupoEconomicoData["empresas"]> {
  const rfb = d?.rfb as Record<string, unknown> ?? {};
  const cnpjRaw = String(rfb?.cnpj ?? "").replace(/\D/g, "");
  if (cnpjRaw.length !== 14) return [];

  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjRaw}`, {
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[credithub][cpf][rfb] publica.cnpj.ws status ${res.status} para CNPJ ${cnpjRaw.slice(0,4)}***`);
      return [];
    }
    const data = await res.json() as Record<string, unknown>;
    const razao = String(data?.razao_social ?? data?.nome_fantasia ?? "—").toUpperCase();
    const sit   = String(data?.descricao_situacao_cadastral ?? "ATIVA").toUpperCase();
    console.log(`[credithub][cpf][rfb] CPF=${cpfSocio.slice(0,3)}*** empresa própria: ${razao} — ${sit}`);
    return [{
      razaoSocial: razao,
      cnpj: cnpjRaw,
      relacao: "Empresa Própria (RFB)",
      scrTotal: "—",
      protestos: "—",
      processos: "—",
      socioOrigem: nomeSocio,
      cpfSocio,
      participacao: "",
      situacao: sit.includes("ATIVA") ? "ATIVA" : sit,
    }];
  } catch (err: unknown) {
    console.warn(`[credithub][cpf][rfb] erro ao consultar publica.cnpj.ws:`, String(err instanceof Error ? err.message : err));
    return [];
  }
}

// Função pública: consulta grupo econômico de todos os sócios PF em paralelo + detecta parentesco
export async function consultarGrupoEconomicoSocios(
  socios: { nome: string; cpfCnpj: string }[],
  cnpjEmpresaPrincipal?: string,   // CNPJ da empresa analisada — para excluir do grupo
): Promise<GrupoEconomicoData> {
  const sociosPF = socios.filter(s => s.cpfCnpj.replace(/\D/g, "").length === 11);

  // Parentesco determinístico (não depende de API)
  const { alertaParentesco, parentescosDetectados } = detectarParentesco(socios);

  if (sociosPF.length === 0) {
    return { empresas: [], alertaParentesco, parentescosDetectados };
  }

  const cnpjPrincipalNorm = (cnpjEmpresaPrincipal ?? "").replace(/\D/g, "");

  // Consultas paralelas por CPF:
  // - endpoint dedicado /v1/grupo-economico para empresas (prioritário)
  // - /simples/{cpf} para empresas (fallback) + kyc (processos/protestos) sempre
  const resultados = await Promise.allSettled(
    sociosPF.map(async s => {
      const [dedicado, cpfResult] = await Promise.all([
        consultarGrupoEconomicoDedicado(s.cpfCnpj, s.nome),
        consultarCreditHubPorCPF(s.cpfCnpj, s.nome),
      ]);
      // Empresas: dedicado tem prioridade; fallback para cpfResult
      const empresas = dedicado.length > 0 ? dedicado : cpfResult.empresas;
      return { empresas, kyc: cpfResult.kyc };
    })
  );

  // Agrega e deduplica — apenas empresas com vínculo societário real (QSA/participação)
  // Exclui empresa principal e empresas com situação confirmada como inativa
  const SITUACOES_INATIVAS = ["BAIXADA", "INAPTA", "SUSPENSA", "CANCELADA", "NULA"];
  const chaveVista = new Set<string>();
  const empresas: GrupoEconomicoData["empresas"] = [];
  const sociosKyc: SocioKycCreditHub[] = [];

  resultados.forEach(r => {
    if (r.status !== "fulfilled") return;
    const { empresas: emps, kyc } = r.value;

    // Coleta kyc se teve dados relevantes
    if (kyc && (kyc.processosTotal || kyc.protestosQtd)) {
      sociosKyc.push(kyc);
    }

    emps.forEach(emp => {
      if (cnpjPrincipalNorm && emp.cnpj && emp.cnpj === cnpjPrincipalNorm) return;

      // Exclui somente quando a situação é confirmada como inativa
      const sit = (emp.situacao ?? "").toUpperCase();
      if (SITUACOES_INATIVAS.some(s => sit.includes(s))) return;

      const chave = emp.cnpj ? emp.cnpj : emp.razaoSocial.toLowerCase().trim();
      if (!chaveVista.has(chave)) {
        chaveVista.add(chave);
        empresas.push(emp);
      }
    });
  });

  // ── Enriquecimento: busca CNPJ (quando ausente) + protestos/processos via CreditHub ──
  // Muta os objetos da lista in-place (protestos, processos, cnpj, situação).
  // Não bloqueia o retorno em caso de falha — erros são silenciados por Promise.allSettled.
  const empresasEnriquecidas = await enriquecerEmpresasGrupoEconomico(empresas);

  return { empresas: empresasEnriquecidas, alertaParentesco, parentescosDetectados, sociosKyc: sociosKyc.length > 0 ? sociosKyc : undefined };
}

// ─── Consulta principal ─────────────────────────────────────────────────────
export async function consultarCreditHub(cnpj: string, rawDataFromClient?: unknown): Promise<CreditHubResult> {
  const cnpjNum = cnpj.replace(/\D/g, "");

  // Se o cliente já fez fetch (client-side bypass do 402), usa esses dados
  let d: any = null;
  if (rawDataFromClient) {
    const raw = rawDataFromClient as any;
    const candidate = raw?.data ?? raw;
    // Valida que o CNPJ dos dados crus bate com o CNPJ do request — evita
    // contaminacao cruzada entre empresas quando o frontend manda raw stale.
    const rawCnpjCandidates: unknown[] = [
      candidate?.cnpj, candidate?.documento, candidate?.cnpjCpf, candidate?.cnpj_cpf,
      raw?.cnpj, raw?.documento,
    ];
    const rawCnpj = rawCnpjCandidates
      .map(v => (v == null ? "" : String(v).replace(/\D/g, "")))
      .find(v => v.length === 14);
    if (rawCnpj && rawCnpj !== cnpjNum) {
      console.warn(`[credithub] REJEITANDO rawDataFromClient — CNPJ nos dados (${rawCnpj}) nao bate com o request (${cnpjNum}). Fazendo fetch fresco.`);
      // Fall through para o fetch server-side
    } else {
      d = candidate;
      console.log(`[credithub] Using client-side fetched data for CNPJ=${cnpjNum} (raw CNPJ=${rawCnpj || "nao encontrado"})`);
    }
  }
  if (!d) {
    if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) {
      return { success: false, mock: true, error: "Credit Hub não configurado" };
    }
    const url = `${CREDITHUB_API_URL}/simples/${CREDITHUB_API_KEY}/${cnpjNum}`;
    // A API CreditHub é assíncrona: pode retornar 500 + XML push="true" enquanto processa.
    // Fazemos retry até 8 vezes com 3s de intervalo (24s total).
    const MAX_SERVER_ATTEMPTS = 8;
    const DELAY_MS = 3000;
    let lastError = "";
    for (let attempt = 1; attempt <= MAX_SERVER_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
        const text = await res.text();
        // API retorna 500 + XML com push="true" enquanto processa — aguarda e tenta novamente
        if (text.includes(`push="true"`) || text.includes("push='true'")) {
          if (attempt < MAX_SERVER_ATTEMPTS) {
            console.log(`[credithub] server tentativa ${attempt}/${MAX_SERVER_ATTEMPTS}: push=true, aguardando ${DELAY_MS}ms...`);
            await new Promise(r => setTimeout(r, DELAY_MS));
            continue;
          }
          return { success: false, mock: false, error: `Credit Hub: timeout após ${MAX_SERVER_ATTEMPTS} tentativas (push=true)` };
        }
        if (!res.ok) {
          lastError = `Credit Hub ${res.status}: ${text.substring(0, 200)}`;
          console.warn(`[credithub] server tentativa ${attempt}: status ${res.status}`);
          if (attempt < MAX_SERVER_ATTEMPTS) {
            await new Promise(r => setTimeout(r, DELAY_MS));
            continue;
          }
          return { success: false, mock: false, error: lastError };
        }
        try {
          const raw = JSON.parse(text);
          d = raw?.data ?? raw;
          console.log(`[credithub] server tentativa ${attempt}: JSON recebido`);
          break;
        } catch {
          lastError = "Credit Hub: resposta não é JSON válido";
          if (attempt < MAX_SERVER_ATTEMPTS) {
            await new Promise(r => setTimeout(r, DELAY_MS));
            continue;
          }
          return { success: false, mock: false, error: lastError };
        }
      } catch (err: any) {
        lastError = String(err?.message ?? err);
        console.warn(`[credithub] server tentativa ${attempt} exception:`, lastError);
        if (attempt < MAX_SERVER_ATTEMPTS) await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
    if (!d) return { success: false, mock: false, error: lastError || "Credit Hub: sem dados após retries" };
  }

  // Logging (works both for client-side and server-side data)
  if (d) {
    const temProtestos = !!d?.protestos;
    const temProcessos = Array.isArray(d?.processos) ? d.processos.length : 0;
    const topKeys = Object.keys(d ?? {}).join(", ");
    const temCCFKey = !!(d?.ccf ?? d?.chequesSemFundo ?? d?.cheque_sem_fundo ?? d?.ccfData ?? d?.CCF ?? d?.cheques ?? d?.ocorrencias_ccf ?? d?.chequesSemCobertura ?? d?.chequeSemFundo ?? d?.restricoes?.ccf ?? d?.negativacoes?.ccf);
    console.log(`[credithub] CNPJ=${cnpjNum} protestos=${temProtestos} processos=${temProcessos} ccf=${temCCFKey}`);
    console.log(`[credithub] API top-level keys: ${topKeys}`);
  }

  if (!d) {
    return { success: false, mock: false, error: "Sem resposta da API" };
  }

  // Protestos: usa API se retornou dados, senão busca Supabase como fallback
  let protestos: ProtestosData | undefined;
  if (d?.protestos) {
    protestos = parseProtestos(d);
    // Salva no Supabase para uso futuro quando a API não retornar
    if (Number(protestos.vigentesQtd) > 0 || Number(protestos.regularizadosQtd) > 0 || (protestos.detalhes?.length ?? 0) > 0) {
      protestosSave(cnpjNum, protestos).catch(() => {});
      console.log(`[credithub] protestos salvos no Supabase CNPJ=${cnpjNum}`);
    }
  } else {
    // API não retornou protestos — tenta Supabase
    const cached = await protestosLoad(cnpjNum);
    if (cached) {
      protestos = cached;
      console.log(`[credithub] protestos recuperados do Supabase CNPJ=${cnpjNum}`);
    }
  }

  // CCF: salva no cache e usa fallback Supabase se não vier da API
  const ccfParsed = parseCCF(d);
  const ccfTemDados = ccfParsed.qtdRegistros > 0 || ccfParsed.bancos.length > 0;
  if (ccfTemDados) {
    ccfSave(cnpjNum, ccfParsed).catch(() => {});
    console.log(`[credithub] CCF salvo no cache CNPJ=${cnpjNum}`);
  }
  const ccfFinal = ccfTemDados ? ccfParsed : (await ccfLoad(cnpjNum)) ?? ccfParsed;

  // Processos: usa API; salva no Supabase quando tem dados; fallback do Supabase quando API não retornou
  let processos: ProcessosData | undefined;
  const parsedProcessos = parseProcessos(d);
  const temProcessosAPI = Number(parsedProcessos.passivosTotal ?? 0) > 0 ||
    (parsedProcessos.top10Valor?.length ?? 0) > 0 ||
    (parsedProcessos.top10Recentes?.length ?? 0) > 0;
  if (temProcessosAPI) {
    processos = parsedProcessos;
    processosSave(cnpjNum, processos).catch(() => {});
    console.log(`[credithub] processos salvos no Supabase CNPJ=${cnpjNum}`);
  } else if (parsedProcessos.passivosTotal !== "") {
    // API retornou "0" explicitamente → consultado, sem processos
    processos = parsedProcessos;
  } else {
    // API não retornou processos → tenta Supabase
    const cachedProc = await processosLoad(cnpjNum);
    if (cachedProc) {
      processos = cachedProc;
      console.log(`[credithub] processos recuperados do Supabase CNPJ=${cnpjNum}`);
    } else {
      processos = parsedProcessos; // zero explícito (campo chegou vazio)
    }
  }

  // PEFIN / REFIN — consulta paralela ao IRQL (best-effort, não bloqueia)
  const pefinRefinResult = await consultarPefinRefin(cnpjNum).catch(() => ({ pefin: undefined, refin: undefined }));
  const pefin = pefinRefinResult.pefin;
  const refin = pefinRefinResult.refin;
  if (pefin) console.log(`[credithub] PEFIN: ${pefin.qtd} registros R$ ${pefin.valor.toLocaleString("pt-BR")}`);
  if (refin) console.log(`[credithub] REFIN: ${refin.qtd} registros R$ ${refin.valor.toLocaleString("pt-BR")}`);

  return {
    success: true,
    mock: false,
    protestos,
    processos,
    ccf: ccfFinal,
    historicoConsultas: parseHistoricoConsultas(d),
    cnpjEnrichment: parseCNPJEnrichment(d),
    qsaEnrichment: parseQSAEnrichment(d),
    pefin,
    refin,
    score: {
      consultadoEm: new Date().toISOString(),
      protestosIntegrados: true,
      processosIntegrados: true,
    },
  };
}

// ─── PEFIN / REFIN via IRQL ─────────────────────────────────────────────────

function parseIRQLRows(xml: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const rowPat = /<ROW[^>]*>([\s\S]*?)<\/ROW>/gi;
  let rm;
  while ((rm = rowPat.exec(xml)) !== null) {
    const row: Record<string, string> = {};
    const fPat = /<([A-Z_0-9]+)[^>]*>([^<]*)<\/\1>/gi;
    let fm;
    while ((fm = fPat.exec(rm[1])) !== null) {
      row[fm[1]] = fm[2].trim();
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

function pickField(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) if (row[k]) return row[k];
  return undefined;
}

function rowsToPefinData(rows: Array<Record<string, string>>): PefinReginData {
  const lista = rows.map(r => ({
    data:      pickField(r, "DATA_OCORRENCIA", "DATA", "DT_INCLUSAO", "DT_OCORRENCIA", "DATA_ENTRADA"),
    valor:     parseMoneyRobust(pickField(r, "VALOR", "VL_TOTAL", "VALOR_TOTAL", "VL_OCORRENCIA", "VALOR_OCORRENCIA") ?? "0"),
    credor:    pickField(r, "NOME_CREDOR", "CREDOR", "NOME_EMPRESA", "INFORMANTE", "ORIGEM"),
    modalidade: pickField(r, "MODALIDADE", "TIPO", "NATUREZA", "TIPO_OCORRENCIA", "DESCRICAO"),
    contrato:  pickField(r, "CONTRATO", "NUMERO_CONTRATO", "NUM_CONTRATO", "REFERENCIA"),
  }));
  const total  = lista.reduce((s, r) => s + (r.valor ?? 0), 0);
  const sorted = [...lista].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  return {
    qtd:          lista.length,
    valor:        total,
    dataUltimo:   sorted[0]?.data,
    credorUltimo: sorted[0]?.credor,
    lista,
  };
}

export async function consultarPefinRefin(cnpj: string): Promise<{ pefin?: PefinReginData; refin?: PefinReginData }> {
  if (!CREDITHUB_API_KEY) return {};
  const cnpjNum = cnpj.replace(/\D/g, "");
  const IRQL = "https://irql.credithub.com.br";
  const qPefin = encodeURIComponent(`USING 'SCPCNET' SELECT FROM 'PROTESTOS'.'SCPCNET' WHERE 'DOCUMENTO' = ${cnpjNum}`);
  const qRefin = encodeURIComponent(`SELECT FROM 'PROTESTOS'.'SERASA' WHERE 'DOCUMENTO' = ${cnpjNum}`);

  const [pefinR, refinR] = await Promise.allSettled([
    fetch(`${IRQL}/?q=${qPefin}&apiKey=${CREDITHUB_API_KEY}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }),
    fetch(`${IRQL}/?q=${qRefin}&apiKey=${CREDITHUB_API_KEY}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }),
  ]);

  let pefin: PefinReginData | undefined;
  let refin:  PefinReginData | undefined;

  if (pefinR.status === "fulfilled") {
    try {
      const xml  = await pefinR.value.text();
      const rows = parseIRQLRows(xml);
      pefin = rowsToPefinData(rows);
    } catch { /* silencioso */ }
  }
  if (refinR.status === "fulfilled") {
    try {
      const xml  = await refinR.value.text();
      const rows = parseIRQLRows(xml);
      refin = rowsToPefinData(rows);
    } catch { /* silencioso */ }
  }

  return { pefin, refin };
}
