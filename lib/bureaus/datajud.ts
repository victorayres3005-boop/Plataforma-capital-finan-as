/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ProcessoItem, EmpresaGrupo } from "@/types";

const DATAJUD_BASE = process.env.DATAJUD_BASE_URL || "https://api-publica.datajud.cnj.jus.br";
// Chave pública padrão do DataJud CNJ (gratuita, sem cadastro)
const DATAJUD_KEY  = process.env.DATAJUD_API_KEY || "cDZHYzlZa0JadVREZDJCendFbXNBN3NTRnRCa1Yhbzc=";

// ─── Mapeamento tribunal → índice DataJud ───────────────────────────────────
const TRIBUNAL_INDEX: Record<string, string> = {
  // Tribunais de Justiça Estaduais
  TJAC: "api_publica_tjac", TJAL: "api_publica_tjal", TJAM: "api_publica_tjam",
  TJAP: "api_publica_tjap", TJBA: "api_publica_tjba", TJCE: "api_publica_tjce",
  TJDFT: "api_publica_tjdft", TJES: "api_publica_tjes", TJGO: "api_publica_tjgo",
  TJMA: "api_publica_tjma", TJMG: "api_publica_tjmg", TJMS: "api_publica_tjms",
  TJMT: "api_publica_tjmt", TJPA: "api_publica_tjpa", TJPB: "api_publica_tjpb",
  TJPE: "api_publica_tjpe", TJPI: "api_publica_tjpi", TJPR: "api_publica_tjpr",
  TJRJ: "api_publica_tjrj", TJRN: "api_publica_tjrn", TJRO: "api_publica_tjro",
  TJRR: "api_publica_tjrr", TJRS: "api_publica_tjrs", TJSC: "api_publica_tjsc",
  TJSE: "api_publica_tjse", TJSP: "api_publica_tjsp", TJTO: "api_publica_tjto",
  // Tribunais Regionais Federais
  TRF1: "api_publica_trf1", TRF2: "api_publica_trf2", TRF3: "api_publica_trf3",
  TRF4: "api_publica_trf4", TRF5: "api_publica_trf5", TRF6: "api_publica_trf6",
  // Tribunais Regionais do Trabalho
  TRT1: "api_publica_trt1",   TRT2: "api_publica_trt2",   TRT3: "api_publica_trt3",
  TRT4: "api_publica_trt4",   TRT5: "api_publica_trt5",   TRT6: "api_publica_trt6",
  TRT7: "api_publica_trt7",   TRT8: "api_publica_trt8",   TRT9: "api_publica_trt9",
  TRT10: "api_publica_trt10", TRT11: "api_publica_trt11", TRT12: "api_publica_trt12",
  TRT13: "api_publica_trt13", TRT14: "api_publica_trt14", TRT15: "api_publica_trt15",
  TRT16: "api_publica_trt16", TRT17: "api_publica_trt17", TRT18: "api_publica_trt18",
  TRT19: "api_publica_trt19", TRT20: "api_publica_trt20", TRT21: "api_publica_trt21",
  TRT22: "api_publica_trt22", TRT23: "api_publica_trt23", TRT24: "api_publica_trt24",
  // Superiores
  STJ: "api_publica_stj", STF: "api_publica_stf",
  TST: "api_publica_tst", TSE: "api_publica_tse", STM: "api_publica_stm",
};

// Remove tudo que não é dígito do número CNJ
function toNumeroDigits(numero: string): string {
  return numero.replace(/\D/g, "");
}

// Extrai o tribunal do número CNJ (posições 14-16 = código do tribunal)
// Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
function inferTribunalFromNumero(numero: string): string | null {
  const digits = toNumeroDigits(numero);
  if (digits.length !== 20) return null;
  const j = digits[13];      // segmento de justiça (1=STF, 2=CNJ, 3=STJ, 4=JF, 5=TJ, 6=TRT, 7=TRE, 8=TJM)
  const tt = digits.slice(14, 16); // tribunal (2 dígitos)
  const oooo = digits.slice(16, 20); // vara/comarca (4 dígitos)

  if (j === "8") {
    // Justiça Estadual: tt = código do estado
    const ufMap: Record<string, string> = {
      "01": "TJAC", "02": "TJAL", "03": "TJAM", "04": "TJAP", "05": "TJBA",
      "06": "TJCE", "07": "TJES", "08": "TJGO", "09": "TJMA", "10": "TJMG",
      "11": "TJMS", "12": "TJMT", "13": "TJPA", "14": "TJPB", "15": "TJPE",
      "16": "TJPI", "17": "TJPR", "18": "TJRJ", "19": "TJRN", "20": "TJRO",
      "21": "TJRR", "22": "TJRS", "23": "TJSC", "24": "TJSE", "25": "TJSP",
      "26": "TJTO", "27": "TJDFT",
    };
    return ufMap[tt] ?? null;
  }
  if (j === "4") {
    // Justiça Federal: tt = número do TRF (01-06)
    const n = parseInt(tt, 10);
    return n >= 1 && n <= 6 ? `TRF${n}` : null;
  }
  if (j === "5") {
    // Trabalho: tt = número do TRT
    const n = parseInt(tt, 10);
    return n >= 1 && n <= 24 ? `TRT${n}` : null;
  }
  void oooo;
  return null;
}

// ─── Busca DataJud para um lote de processos do mesmo tribunal ──────────────
async function fetchTribunalBatch(
  index: string,
  numeros: string[]
): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (!numeros.length) return result;

  try {
    const res = await fetch(`${DATAJUD_BASE}/${index}/_search`, {
      method: "POST",
      headers: {
        "Authorization": `APIKey ${DATAJUD_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { terms: { numeroProcesso: numeros } },
        size: numeros.length,
        _source: ["numeroProcesso", "classe", "grau", "orgaoJulgador", "assuntos",
                  "dataAjuizamento", "dataHoraUltimaAtualizacao", "movimentos"],
      }),
    });

    if (!res.ok) return result;
    const data = await res.json();

    for (const hit of data.hits?.hits ?? []) {
      const src = hit._source;
      result.set(src.numeroProcesso, src);
    }
  } catch {
    // DataJud indisponível — retorna vazio silenciosamente
  }

  return result;
}

// ─── Enriquece ProcessoItem[] com dados do DataJud ──────────────────────────
export async function enrichProcessosWithDataJud(
  processos: ProcessoItem[]
): Promise<ProcessoItem[]> {
  if (!processos.length) return processos;

  // Agrupa por tribunal
  const byTribunal = new Map<string, { idx: number; numDigits: string }[]>();

  processos.forEach((p, idx) => {
    if (!p.numero) return;
    const numDigits = toNumeroDigits(p.numero);
    if (numDigits.length !== 20) return; // só CNJ

    // Tenta inferir tribunal pelo campo tribunal do processo, depois pelo número CNJ
    const sigla = (p.tribunal || "").toUpperCase().trim();
    const tribunalKey = TRIBUNAL_INDEX[sigla]
      ? sigla
      : inferTribunalFromNumero(p.numero);

    if (!tribunalKey || !TRIBUNAL_INDEX[tribunalKey]) return;

    if (!byTribunal.has(tribunalKey)) byTribunal.set(tribunalKey, []);
    byTribunal.get(tribunalKey)!.push({ idx, numDigits });
  });

  if (!byTribunal.size) return processos;

  // Consulta cada tribunal em paralelo
  const lookups = await Promise.all(
    Array.from(byTribunal.entries()).map(async ([tribunalKey, items]) => {
      const index = TRIBUNAL_INDEX[tribunalKey];
      const numeros = items.map(i => i.numDigits);
      const resultMap = await fetchTribunalBatch(index, numeros);
      return { items, resultMap };
    })
  );

  // Aplica enriquecimento
  const enriched = [...processos];

  for (const { items, resultMap } of lookups) {
    for (const { idx, numDigits } of items) {
      const dj = resultMap.get(numDigits);
      if (!dj) continue;

      const proc = { ...enriched[idx] };

      // Último movimento = status mais recente
      const movimentos: any[] = dj.movimentos ?? [];
      // movimentos vêm em ordem cronológica crescente — pega o último
      const ultimoMov = movimentos.length > 0 ? movimentos[movimentos.length - 1] : null;

      if (ultimoMov?.nome) {
        const faseAtual = proc.fase || "";
        proc.status = faseAtual
          ? `${ultimoMov.nome} — ${faseAtual}`
          : ultimoMov.nome;
        proc.dataUltimoAndamento = ultimoMov.dataHora
          ? ultimoMov.dataHora.substring(0, 10)
          : proc.dataUltimoAndamento;
      }

      // Classe processual do DataJud (mais precisa que Credit Hub)
      if (dj.classe?.nome && (!proc.tipo || proc.tipo === "—")) {
        proc.tipo = dj.classe.nome.toUpperCase();
      }

      // Órgão julgador (tribunal/vara)
      if (dj.orgaoJulgador?.nome) {
        proc.tribunal = dj.orgaoJulgador.nome;
      }

      // Grau (JE = Juizado Especial, G1 = 1º grau, G2 = 2º grau)
      if (dj.grau && !proc.fase) {
        const grauLabel: Record<string, string> = {
          JE: "Juizado Especial", G1: "1º Grau", G2: "2º Grau",
          SUP: "Superior", JT: "Justiça do Trabalho",
        };
        proc.fase = grauLabel[dj.grau] ?? dj.grau;
      }

      // Data de ajuizamento se não veio do Credit Hub
      if (dj.dataAjuizamento && !proc.data) {
        const raw = String(dj.dataAjuizamento);
        proc.data = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
      }

      enriched[idx] = proc;
    }
  }

  return enriched;
}

// ─── Busca de Grupo Econômico via CPF dos sócios ─────────────────────────────
// Consulta processos de cada sócio no DataJud e extrai empresas co-partes.
// Gratuito, sem dependência de plano CreditHub.

// Tribunais mais relevantes para relações empresariais (alto volume)
const TOP_TRIBUNAIS_GRUPO = [
  "api_publica_tjsp",
  "api_publica_tjrj",
  "api_publica_tjmg",
  "api_publica_tjrs",
  "api_publica_tjpr",
  "api_publica_trf3",
  "api_publica_trt2",
];

const COMPANY_RE_DJ = /\b(LTDA\.?|S\.A\.?|S\/A|EIRELI|S\.?S\.?|EPP|M\.?E\.?|HOLDINGS?|PARTICIPA|INDUSTRI[AÀ]|COMERC[IÍ]|SERVI[CÇ]|CONSTRU[TÇ]|DISTRIBUI|FINANC|INVEST|EMPREEND|STUDIO|ESTUDIO|BELEZA)\b/i;
const BANK_SKIP_RE = /\b(BANCO DO BRASIL|CAIXA ECONOM|BRADESCO|ITAU|SANTANDER|SICREDI|SICOOB|NUBANK|INTER|BB S\.?A|PREFEITURA|MUNICIPIO|ESTADO DE|FAZENDA|SPPREV|INSS|RECEITA FEDERAL|MINISTERIO|UNIAO FEDERAL)\b/i;

async function searchByPartyDoc(index: string, cpf: string): Promise<any[]> {
  try {
    const res = await fetch(`${DATAJUD_BASE}/${index}/_search`, {
      method: "POST",
      headers: {
        "Authorization": `APIKey ${DATAJUD_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          nested: {
            path: "partes",
            query: { term: { "partes.documento": cpf } },
          },
        },
        size: 30,
        _source: ["partes", "classe", "dataAjuizamento"],
        sort: [{ dataAjuizamento: { order: "desc" } }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits?.hits ?? [];
  } catch {
    return [];
  }
}

/**
 * Para cada CPF de sócio, consulta DataJud nos principais tribunais e retorna
 * as empresas que aparecem como co-partes nos processos — formando o grupo econômico indireto.
 */
export async function buscarEmpresasDataJud(
  socios: { cpf: string; nome: string }[],
  cnpjEmpresaPrincipal?: string,
): Promise<EmpresaGrupo[]> {
  if (!socios.length) return [];

  const cnpjPrincipalNorm = (cnpjEmpresaPrincipal ?? "").replace(/\D/g, "");
  const chaveVista = new Set<string>();
  const empresas: EmpresaGrupo[] = [];

  await Promise.allSettled(
    socios.map(async ({ cpf, nome: nomeSocio }) => {
      const cpfNum = cpf.replace(/\D/g, "");
      if (cpfNum.length !== 11) return;

      // Consulta todos os tribunais do conjunto em paralelo
      const hits = (
        await Promise.all(TOP_TRIBUNAIS_GRUPO.map(idx => searchByPartyDoc(idx, cpfNum)))
      ).flat();

      for (const hit of hits) {
        const partes: any[] = hit._source?.partes ?? [];
        for (const parte of partes) {
          const nomeRaw = String(parte.nome ?? "").trim();
          const docRaw  = String(parte.documento ?? "").replace(/\D/g, "");

          // Pula o próprio sócio e a empresa analisada
          if (docRaw === cpfNum) continue;
          if (cnpjPrincipalNorm && docRaw === cnpjPrincipalNorm) continue;

          // Precisa parecer empresa: tem CNPJ (14 dígitos) ou nome com sufixo empresarial
          const temCNPJ = docRaw.length === 14;
          if (!temCNPJ && !COMPANY_RE_DJ.test(nomeRaw)) continue;

          // Filtra bancos e órgãos públicos
          if (BANK_SKIP_RE.test(nomeRaw)) continue;

          // Nome muito curto = ruído
          if (nomeRaw.length < 5) continue;

          // Deduplica por CNPJ ou por nome normalizado
          const chave = temCNPJ ? docRaw : nomeRaw.toLowerCase().replace(/\s+/g, " ");
          if (chaveVista.has(chave)) continue;
          chaveVista.add(chave);

          empresas.push({
            razaoSocial: nomeRaw,
            cnpj: temCNPJ ? docRaw : "",
            relacao: "via Sócio (DataJud)",
            scrTotal: "—",
            protestos: "—",
            processos: "—",
            socioOrigem: nomeSocio,
            cpfSocio: cpfNum,
            situacao: "VERIFICAR",
          });
        }
      }
    }),
  );

  console.log(`[datajud] grupo econômico: ${empresas.length} empresa(s) encontrada(s) via partes de processo`);
  return empresas;
}
