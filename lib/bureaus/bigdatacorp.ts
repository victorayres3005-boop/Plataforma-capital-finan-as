import type { CNPJData, QSASocio, ProcessosData, ParentescoDetectado } from "@/types";

const BDC_BASE = "https://plataforma.bigdatacorp.com.br";

function bdcHeaders() {
  return {
    "accept": "application/json",
    "content-type": "application/json",
    "AccessToken": process.env.BDC_TOKEN ?? "",
    "TokenId": process.env.BDC_TOKEN_ID ?? "",
  };
}

function hasCredentials(): boolean {
  return !!(process.env.BDC_TOKEN && process.env.BDC_TOKEN_ID);
}

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface BigDataCorpSocioData {
  cpf: string;
  nome: string;
  taxIdStatus: string;
  birthDate: string;
  motherName: string;
  hasObitIndication: boolean;
  empresas: { cnpj: string; nome: string; relacao: string }[];
  // financial_risk
  financialRiskScore?:          number;   // 0-1000
  financialRiskLevel?:          string;   // A-H
  totalAssetsRange?:            string;   // "ABAIXO DE 100K" | "DE 100K A 500K" | ... | "ACIMA DE 5MM"
  estimatedIncomeRange?:        string;   // "0 A 1 SM" | ... | "ACIMA DE 20 SM"
  isCurrentlyEmployed?:         boolean;
  isCurrentlyOnCollection?:     boolean;
  last365DaysCollections?:      number;
  // collections
  last30DaysCollections?:       number;
  last90DaysCollections?:       number;
  last180DaysCollections?:      number;
  totalCollectionMonths?:       number;
  maxConsecutiveCollectionMonths?: number;
  // government_debtors (PGFN/União)
  pgfnDebtTotal?:               string;   // formatted BRL
  pgfnTotalDebts?:              number;
  pgfnDebts?:                   Array<{ origin: string; value: string; situation: string; filed: boolean }>;
  // processos individuais do sócio (dataset lawsuits / processes)
  processosTotal?:              number;
  processosPassivo?:            number;
  processosAtivo?:              number;
  processosValorTotal?:         string;
}

export interface OwnerKycData {
  nome: string;
  cpf: string;
  isActive: boolean;
  isPEP: boolean;
  isSanctioned: boolean;
  wasPreviouslySanctioned: boolean;
  hasSanctionsHistory: boolean;    // fuzzy matches — revisar manualmente
  sanctionsHistoryCount: number;
  sanctionSources: string[];       // fontes das sanções ativas
}

// Agregado para todos os sócios ativos — não é por sócio individualmente
export interface OwnerLawsuitsDistribution {
  totalOwners: number;
  totalLawsuits: number;
  totalAsAuthor: number;
  totalAsDefendant: number;
  typeDistribution: Record<string, number>;
  courtTypeDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  subjectDistribution: Record<string, number>;
}

export interface InterestsAndBehaviors {
  creditSeeker: string;        // A-H
  onlineInvestor: boolean;
  paymentServicesUser: string; // A-H
  creditCardScore: string;     // A-H
  appUser: string;             // A-H
  onlineBankingUser: string;   // A-H
}

export interface BigDataCorpSociosResult {
  socios: BigDataCorpSocioData[];
  sociosFalecidos: string[];
  alertaParentesco: boolean;
  parentescosDetectados: ParentescoDetectado[];
}

export interface EmpresaGrupoProcessos {
  cnpj: string;
  nome: string;
  via: string;
  processosTotal: number;
  valorTotalEstimado: string;
}

export interface BigDataCorpResult {
  success: boolean;
  mock: boolean;
  error?: string;
  rawData?: unknown;
  cnpjEnrichment?: Partial<CNPJData>;
  qsaEnrichment?: { quadroSocietario: QSASocio[] };
  processos?: ProcessosData;
  // Novos: datasets owners_kyc, owners_lawsuits_distribution_data, interests_and_behaviors
  ownersKyc?: OwnerKycData[];
  ownersLawsuitsDistribution?: OwnerLawsuitsDistribution;
  interestsAndBehaviors?: InterestsAndBehaviors;
  // Preenchido após consultarSocios e mesclado na route
  socios?: BigDataCorpSocioData[];
  sociosFalecidos?: string[];
  alertaParentesco?: boolean;
  parentescosDetectados?: ParentescoDetectado[];
  grupoEconomicoProcessos?: EmpresaGrupoProcessos[];
}

// ── consultarEmpresa ──────────────────────────────────────────────────────────
export async function consultarEmpresa(cnpj: string): Promise<BigDataCorpResult> {
  const cnpjNum = cnpj.replace(/\D/g, "");
  if (!cnpjNum) return { success: false, mock: false, error: "CNPJ inválido" };

  if (!hasCredentials()) {
    return { success: false, mock: true, error: "BDC_TOKEN/BDC_TOKEN_ID não configurados" };
  }

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10000);

  try {
    const res = await fetch(`${BDC_BASE}/empresas`, {
      method:  "POST",
      headers: bdcHeaders(),
      body: JSON.stringify({
        q: `doc{${cnpjNum}}`,
        Datasets: [
          "basic_data",
          "registration_data",
          "relationships",
          "processes",
          "economic_group_relationships",
          "owners_kyc",
          "owners_lawsuits_distribution_data",
          "interests_and_behaviors",
        ].join(","),
        Tags: { host: "pendente_capital", process: "analise_credito" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      console.warn(`[bigdatacorp] consultarEmpresa HTTP ${res.status}`);
      return { success: false, mock: false, error: `BDC HTTP ${res.status}` };
    }

    const json = await res.json();
    console.log("[bigdatacorp] raw empresa:", JSON.stringify(json, null, 2));
    return parseEmpresaResponse(json);

  } catch (err) {
    clearTimeout(tid);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bigdatacorp] consultarEmpresa erro:", msg);
    return { success: false, mock: false, error: msg };
  }
}

// ── consultarSocios ───────────────────────────────────────────────────────────
export async function consultarSocios(cpfs: string[]): Promise<BigDataCorpSociosResult> {
  const empty: BigDataCorpSociosResult = {
    socios: [], sociosFalecidos: [], alertaParentesco: false, parentescosDetectados: [],
  };

  const cpfsValidos = cpfs.map(c => c.replace(/\D/g, "")).filter(c => c.length === 11);
  if (cpfsValidos.length === 0) return empty;
  if (!hasCredentials()) return empty;

  const resultados = await Promise.allSettled(
    cpfsValidos.map(async (cpf) => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${BDC_BASE}/pessoas`, {
          method:  "POST",
          headers: bdcHeaders(),
          body: JSON.stringify({
            q: `doc{${cpf}}`,
            Datasets: [
              "basic_data{Name,TaxIdStatus,BirthDate,MotherName,HasObitIndication}",
              "business_relationships.limit(20)",
              "financial_risk",
              "financial_data",
              "collections",
              "government_debtors",
              "processes",
            ].join(","),
            Tags: { host: "pendente_capital", process: "kyc_socios" },
          }),
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) {
          console.warn(`[bigdatacorp] consultarSocios CPF ${cpf.slice(0,3)}*** HTTP ${res.status}`);
          return null;
        }
        const json = await res.json();
        console.log(`[bigdatacorp] raw sócio ${cpf.slice(0,3)}***:`, JSON.stringify(json, null, 2));
        return parsePessoaResponse(cpf, json);
      } catch (err) {
        clearTimeout(tid);
        console.warn(`[bigdatacorp] consultarSocios CPF ${cpf.slice(0,3)}*** erro:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );

  const socios = resultados
    .filter((r): r is PromiseFulfilledResult<BigDataCorpSocioData | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((s): s is BigDataCorpSocioData => s !== null);

  const sociosFalecidos = socios
    .filter(s => s.hasObitIndication)
    .map(s => s.nome || s.cpf);

  // Detecta parentesco por mãe comum
  const parentescosDetectados: ParentescoDetectado[] = [];
  const maes = new Map<string, string[]>();
  for (const s of socios) {
    const mae = s.motherName.trim().toLowerCase();
    if (mae.length < 5) continue;
    if (!maes.has(mae)) maes.set(mae, []);
    maes.get(mae)!.push(s.nome || s.cpf);
  }
  for (const [mae, nomes] of Array.from(maes.entries())) {
    for (let i = 0; i < nomes.length; i++) {
      for (let j = i + 1; j < nomes.length; j++) {
        parentescosDetectados.push({ socio1: nomes[i], socio2: nomes[j], sobrenomeComum: `mãe: ${mae}` });
      }
    }
  }

  return { socios, sociosFalecidos, alertaParentesco: parentescosDetectados.length > 0, parentescosDetectados };
}

// ── consultarProcessosGrupoEconomico ──────────────────────────────────────────
// Para cada empresa vinculada aos sócios (via BDC pessoas), consulta processos.
// Cap: 10 CNPJs por chamada para respeitar o timeout de 60s do Vercel.
export async function consultarProcessosGrupoEconomico(
  socios: BigDataCorpSocioData[],
  cnpjPrincipal: string,
): Promise<EmpresaGrupoProcessos[]> {
  if (!hasCredentials() || socios.length === 0) return [];

  const cnpjPrincipalNum = cnpjPrincipal.replace(/\D/g, "");
  const empresasMap = new Map<string, { nome: string; via: string }>();

  for (const socio of socios) {
    for (const emp of socio.empresas) {
      const cnpjNum = emp.cnpj.replace(/\D/g, "");
      if (cnpjNum.length === 14 && cnpjNum !== cnpjPrincipalNum && !empresasMap.has(cnpjNum)) {
        empresasMap.set(cnpjNum, { nome: emp.nome, via: socio.nome || socio.cpf });
      }
    }
  }

  const toConsult = Array.from(empresasMap.entries()).slice(0, 10);
  if (toConsult.length === 0) return [];

  console.log(`[bigdatacorp] grupo econômico: consultando processos de ${toConsult.length} empresa(s)`);

  const settled = await Promise.allSettled(
    toConsult.map(async ([cnpj, { nome, via }]) => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${BDC_BASE}/empresas`, {
          method:  "POST",
          headers: bdcHeaders(),
          body: JSON.stringify({
            q: `doc{${cnpj}}`,
            Datasets: "processes",
            Tags: { host: "pendente_capital", process: "grupo_economico" },
          }),
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) return null;

        const json = await res.json() as Record<string, unknown>;
        const results = Array.isArray(json.Result) ? json.Result as unknown[] : [];
        if (results.length === 0) return { cnpj, nome, via: `Via ${via}`, processosTotal: 0, valorTotalEstimado: "—" } as EmpresaGrupoProcessos;

        const r = results[0] as Record<string, unknown>;
        const lawsuitsSection = (r.Lawsuits ?? getSection(r, "processes")) as Record<string, unknown> | undefined;
        if (!lawsuitsSection) return { cnpj, nome, via: `Via ${via}`, processosTotal: 0, valorTotalEstimado: "—" } as EmpresaGrupoProcessos;

        const total = _num(lawsuitsSection.TotalLawsuitsAsDefendant ?? lawsuitsSection.TotalLawsuits);
        const lawsuitsArr = Array.isArray(lawsuitsSection.Lawsuits)
          ? (lawsuitsSection.Lawsuits as Record<string, unknown>[])
          : [];
        let totalValue = 0;
        for (const l of lawsuitsArr) totalValue += _num(l.Value);

        return {
          cnpj,
          nome,
          via: `Via ${via}`,
          processosTotal: total,
          valorTotalEstimado: totalValue > 0 ? _moeda(totalValue) : "—",
        } as EmpresaGrupoProcessos;
      } catch {
        clearTimeout(tid);
        return null;
      }
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<EmpresaGrupoProcessos | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((r): r is EmpresaGrupoProcessos => r !== null);
}

// ── parse helpers ─────────────────────────────────────────────────────────────

// BDC pode retornar chave com snake_case (ex: "basic_data") ou PascalCase ("BasicData")
function getSection(r: Record<string, unknown>, dataset: string): Record<string, unknown> | undefined {
  const pascal = dataset.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  const val = r[pascal] ?? r[dataset];
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : undefined;
}

function parseEmpresaResponse(json: unknown): BigDataCorpResult {
  try {
    const raw     = json as Record<string, unknown>;
    const results = Array.isArray(raw.Result) ? (raw.Result as unknown[]) : [];
    if (results.length === 0) return { success: true, mock: false, rawData: json };
    const r      = results[0] as Record<string, unknown>;
    // raw (body) também é passado pois owners_kyc e lawsuits_distribution ficam no nível raiz
    const mapped = mapearParaExtractedData(r, raw);
    return { success: true, mock: false, rawData: json, ...mapped };
  } catch (err) {
    console.warn("[bigdatacorp] parseEmpresaResponse erro:", err);
    return { success: false, mock: false, error: "parse error", rawData: json };
  }
}

function parsePessoaResponse(cpf: string, json: unknown): BigDataCorpSocioData | null {
  try {
    const raw     = json as Record<string, unknown>;
    const results = Array.isArray(raw.Result) ? (raw.Result as unknown[]) : [];
    if (results.length === 0) return null;

    const r     = results[0] as Record<string, unknown>;
    const basic = getSection(r, "basic_data");
    const biz   = getSection(r, "business_relationships");

    // BDC retorna BusinessRelationships.BusinessRelationships[] (não .Relationships[])
    const relList = biz && Array.isArray(biz.BusinessRelationships)
      ? (biz.BusinessRelationships as unknown[])
      : (biz && Array.isArray(biz.Relationships) ? (biz.Relationships as unknown[]) : []);

    const empresas = relList
      .map(rel => {
        const e = rel as Record<string, unknown>;
        return {
          cnpj:    _str(e.RelatedEntityTaxIdNumber ?? e.CompanyTaxIdNumber ?? e.CompanyTaxId),
          nome:    _str(e.RelatedEntityName ?? e.CompanyName),
          relacao: _str(e.RelationshipType),
        };
      })
      .filter(e => e.cnpj);

    // ── financial_risk ─────────────────────────────────────────────────────────
    const fr = getSection(r, "financial_risk");
    const financialRiskScore        = fr ? _num(fr.FinancialRiskScore ?? fr.Score) || undefined : undefined;
    const financialRiskLevel        = fr ? _str(fr.FinancialRiskLevel ?? fr.Level) || undefined : undefined;
    const totalAssetsRange          = fr ? _str(fr.TotalAssets ?? fr.TotalAssetsRange) || undefined : undefined;
    const estimatedIncomeRange      = fr ? _str(fr.EstimatedIncomeRange ?? fr.IncomeRange) || undefined : undefined;
    const isCurrentlyEmployed       = fr ? _bool(fr.IsCurrentlyEmployed) : undefined;
    const isCurrentlyOnCollectionFR = fr ? _bool(fr.IsCurrentlyOnCollection) : undefined;
    const last365FR                 = fr ? _num(fr.Last365DaysCollectionOccurrences) || undefined : undefined;

    // ── financial_data ─────────────────────────────────────────────────────────
    // (retido para log — campos úteis extraídos via financial_risk)
    const fd = getSection(r, "financial_data");
    void fd; // disponível no rawData para debug

    // ── collections ────────────────────────────────────────────────────────────
    const col = getSection(r, "collections");
    const isCurrentlyOnCollection       = col ? _bool(col.IsCurrentlyOnCollection) : isCurrentlyOnCollectionFR;
    const last30DaysCollections         = col ? _num(col.Last30DaysCollectionOccurrences)  || undefined : undefined;
    const last90DaysCollections         = col ? _num(col.Last90DaysCollectionOccurrences)  || undefined : undefined;
    const last180DaysCollections        = col ? _num(col.Last180DaysCollectionOccurrences) || undefined : undefined;
    const last365DaysCollections        = col ? _num(col.Last365DaysCollectionOccurrences) || last365FR : undefined;
    const totalCollectionMonths         = col ? _num(col.TotalCollectionMonths) || undefined : undefined;
    const maxConsecutiveCollectionMonths = col ? _num(col.MaxConsecutiveCollectionMonths) || undefined : undefined;

    // ── government_debtors (PGFN) ──────────────────────────────────────────────
    const gd = getSection(r, "government_debtors");
    let pgfnDebtTotal: string | undefined;
    let pgfnTotalDebts: number | undefined;
    let pgfnDebts: BigDataCorpSocioData["pgfnDebts"];

    if (gd) {
      const totalVal = _num(gd.TotalDebtValue ?? gd.TotalValue);
      pgfnTotalDebts = _num(gd.TotalDebts ?? gd.Count) || undefined;
      pgfnDebtTotal  = totalVal > 0 ? _moeda(totalVal) : undefined;

      const debtsArr = Array.isArray(gd.Debts) ? (gd.Debts as Record<string, unknown>[]) : [];
      if (debtsArr.length > 0) {
        pgfnDebts = debtsArr.map(d => ({
          origin:    _str(d.DebtOrigin ?? d.Origin ?? d.Orgao),
          value:     _moeda(_num(d.ConsolidatedValue ?? d.Value)),
          situation: _str(d.RegistrationSituation ?? d.Situation ?? d.Situacao),
          filed:     _bool(d.FiledIndicator ?? d.Filed),
        })).filter(d => d.origin || d.value);
      }
    }

    // ── processes (processos individuais do sócio PF) ─────────────────────────
    const procSec = (r.Lawsuits ?? getSection(r, "processes")) as Record<string, unknown> | undefined;
    let processosTotal: number | undefined;
    let processosPassivo: number | undefined;
    let processosAtivo: number | undefined;
    let processosValorTotal: string | undefined;
    if (procSec) {
      const passivo = _num(procSec.TotalLawsuitsAsDefendant ?? procSec.TotalLawsuits);
      const ativo   = _num(procSec.TotalLawsuitsAsAuthor);
      const total   = passivo + ativo || _num(procSec.TotalLawsuits);
      const lawArr  = Array.isArray(procSec.Lawsuits) ? (procSec.Lawsuits as Record<string, unknown>[]) : [];
      const valorT  = lawArr.reduce((s, l) => s + _num(l.Value), 0);
      if (total > 0) {
        processosTotal      = total;
        processosPassivo    = passivo || undefined;
        processosAtivo      = ativo   || undefined;
        processosValorTotal = valorT > 0 ? _moeda(valorT) : undefined;
      }
    }

    return {
      cpf,
      nome:              _str(basic?.Name ?? basic?.FullName),
      taxIdStatus:       _str(basic?.TaxIdStatus),
      birthDate:         _dateStr(basic?.BirthDate),
      motherName:        _str(basic?.MotherName),
      hasObitIndication: Boolean(basic?.HasObitIndication),
      empresas,
      // financial_risk
      financialRiskScore,
      financialRiskLevel,
      totalAssetsRange,
      estimatedIncomeRange,
      isCurrentlyEmployed,
      isCurrentlyOnCollection,
      last365DaysCollections,
      // collections
      last30DaysCollections,
      last90DaysCollections,
      last180DaysCollections,
      totalCollectionMonths,
      maxConsecutiveCollectionMonths,
      // government_debtors
      pgfnDebtTotal,
      pgfnTotalDebts,
      pgfnDebts,
      // processes
      processosTotal,
      processosPassivo,
      processosAtivo,
      processosValorTotal,
    };
  } catch (err) {
    console.warn(`[bigdatacorp] parsePessoaResponse CPF ${cpf.slice(0,3)}*** erro:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── mapearParaExtractedData ───────────────────────────────────────────────────
// r       = Result[0] (per-record data)
// rawBody = root body (owners_kyc e lawsuits_distribution ficam fora do Result[])
export function mapearParaExtractedData(r: Record<string, unknown>, rawBody?: Record<string, unknown>): {
  cnpjEnrichment?: Partial<CNPJData>;
  qsaEnrichment?: { quadroSocietario: QSASocio[] };
  processos?: ProcessosData;
  ownersKyc?: OwnerKycData[];
  ownersLawsuitsDistribution?: OwnerLawsuitsDistribution;
  interestsAndBehaviors?: InterestsAndBehaviors;
} {
  const out: ReturnType<typeof mapearParaExtractedData> = {};

  // ── basic_data → cnpj ──────────────────────────────────────────────────────
  // Campos confirmados pela resposta real da API (VISAOSOPRO 35959608000122)
  const basic = getSection(r, "basic_data");
  if (basic) {
    const legalNat = basic.LegalNature && typeof basic.LegalNature === "object"
      ? basic.LegalNature as Record<string, unknown>
      : undefined;

    // CNAE principal: Activities[] onde IsMain === true
    const activities = Array.isArray(basic.Activities) ? basic.Activities as Record<string, unknown>[] : [];
    const mainActivity = activities.find(a => a.IsMain === true) ?? activities[0];
    const cnaeCode = _str(mainActivity?.Code);
    const cnaeDesc = _str(mainActivity?.Activity);
    const cnaePrincipal = cnaeCode
      ? `${cnaeCode} — ${cnaeDesc}`.replace(/ — $/, "")
      : "";

    // Capital social: AdditionalOutputData.CapitalRS
    const addl = basic.AdditionalOutputData && typeof basic.AdditionalOutputData === "object"
      ? basic.AdditionalOutputData as Record<string, unknown>
      : undefined;
    const capitalNum = parseFloat(_str(addl?.CapitalRS).replace(",", ".") || "0");
    const capitalSocialCNPJ = capitalNum > 0
      ? `R$ ${capitalNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : "";

    out.cnpjEnrichment = {
      cnpj:              _str(basic.TaxIdNumber),
      razaoSocial:       _str(basic.OfficialName),
      situacaoCadastral: _str(basic.TaxIdStatus),
      dataAbertura:      _dateStr(basic.FoundedDate ?? basic.FoundingDate),
      cnaePrincipal,
      naturezaJuridica:  legalNat ? _str(legalNat.Activity ?? legalNat.Code) : _str(basic.LegalNature),
      porte:             _str(basic.CompanyType_ReceitaFederal),
      capitalSocialCNPJ,
    };
  }

  // ── relationships → qsa ────────────────────────────────────────────────────
  // Filtra apenas sócios (RelationshipType=QSA), exclui Employee/outros
  const QSA_TYPES = new Set(["QSA", "OWNERSHIP", "PARTNER", "SOCIO"]);
  const relsObj  = getSection(r, "relationships");
  const relsList = relsObj && Array.isArray(relsObj.Relationships) ? (relsObj.Relationships as unknown[]) : [];
  const socios   = relsList.filter(rel => {
    const s = rel as Record<string, unknown>;
    return QSA_TYPES.has(_str(s.RelationshipType).toUpperCase());
  });
  if (socios.length > 0) {
    out.qsaEnrichment = {
      quadroSocietario: socios
        .map(rel => {
          const s = rel as Record<string, unknown>;
          // RelationshipEndDate "9999-..." = sem saída
          const endDate = _str(s.RelationshipEndDate ?? s.EndDate);
          const dataSaida = endDate.startsWith("9999") ? "" : _dateStr(endDate);
          const socio: QSASocio = {
            nome:         _str(s.RelatedEntityName),
            cpfCnpj:      _str(s.RelatedEntityTaxIdNumber ?? s.RelatedEntityTaxId),
            qualificacao: _str(s.RelationshipName || s.RelationshipType),
            participacao: _str(s.Participation ?? s.EquityPercentage),
            dataEntrada:  _dateStr(s.RelationshipStartDate ?? s.StartDate),
            dataSaida,
          };
          return socio;
        })
        .filter(s => s.nome || s.cpfCnpj),
    };
  }

  // ── processes → processos ──────────────────────────────────────────────────
  // Dataset "processes" retorna com chave "Lawsuits" na resposta BDC
  const lawsuitsSection = (r.Lawsuits ?? getSection(r, "processes")) as Record<string, unknown> | undefined;
  if (lawsuitsSection !== undefined) {
    const passivos = _num(lawsuitsSection.TotalLawsuitsAsDefendant ?? lawsuitsSection.TotalLawsuits);
    const ativos   = _num(lawsuitsSection.TotalLawsuitsAsAuthor);

    // Soma valores e conta por CourtType dos processos individuais
    const lawsuitsArr = Array.isArray(lawsuitsSection.Lawsuits)
      ? (lawsuitsSection.Lawsuits as Record<string, unknown>[])
      : [];
    let totalValue = 0;
    const byType: Record<string, number> = {};
    for (const l of lawsuitsArr) {
      totalValue += _num(l.Value);
      const ct = _str(l.CourtType).toUpperCase();
      byType[ct] = (byType[ct] || 0) + 1;
    }

    out.processos = {
      passivosTotal:      String(passivos),
      ativosTotal:        String(ativos),
      valorTotalEstimado: _moeda(totalValue),
      temRJ:              false,
      distribuicao: ([
        { tipo: "TRABALHISTA", qtd: String(byType["TRABALHISTA"] || 0), pct: "" },
        { tipo: "FISCAL",      qtd: String(byType["TRIBUTARIA"]  || 0), pct: "" },
        { tipo: "BANCO",       qtd: String(byType["CIVEL"]        || 0), pct: "" },
        { tipo: "OUTROS",      qtd: String(byType["OUTROS"]       || 0), pct: "" },
      ] as { tipo: string; qtd: string; pct: string }[]).filter(d => Number(d.qtd) > 0),
      bancarios: [], fiscais: [], fornecedores: [], outros: [],
    };
  }

  // ── owners_kyc → ownersKyc ─────────────────────────────────────────────────
  // Estrutura real: rawBody.OwnersKycData = { "<CPF11>": {...}, "ActiveOwners": [...], ... }
  // Chaves CPF são strings de 11 dígitos; metadados são outras chaves
  const kycRoot = (rawBody?.OwnersKycData ?? r.OwnersKycData) as Record<string, unknown> | undefined;
  if (kycRoot && typeof kycRoot === "object") {
    const activeOwners  = new Set(Array.isArray(kycRoot.ActiveOwners)  ? (kycRoot.ActiveOwners  as string[]) : []);
    const inactiveOwners = new Set(Array.isArray(kycRoot.InactiveOwners) ? (kycRoot.InactiveOwners as string[]) : []);
    const cpfEntries = Object.entries(kycRoot).filter(([k]) => /^\d{11}$/.test(k));
    if (cpfEntries.length > 0) {
      out.ownersKyc = cpfEntries.map(([cpf, val]) => {
        const k = val as Record<string, unknown>;
        const history = Array.isArray(k.SanctionsHistory) ? (k.SanctionsHistory as Record<string, unknown>[]) : [];
        // Considera ativa apenas se IsCurrentlyPresentOnSource === true
        const activeSanctions = history.filter(s => _bool(s.IsCurrentlyPresentOnSource));
        const uniqueSources = activeSanctions.map(s => _str(s.Source)).filter(Boolean);
        const sanctionSources = uniqueSources.filter((src, i) => uniqueSources.indexOf(src) === i);
        const isActive = activeOwners.has(cpf) || (!inactiveOwners.has(cpf) && activeOwners.size === 0);
        return {
          nome:                    "",  // não disponível a nível de empresa — matched por CPF no merger
          cpf,
          isActive,
          isPEP:                   _bool(k.IsCurrentlyPEP ?? k.IsPEP),
          isSanctioned:            _bool(k.IsCurrentlySanctioned),
          wasPreviouslySanctioned: _bool(k.WasPreviouslySanctioned),
          hasSanctionsHistory:     history.length > 0,
          sanctionsHistoryCount:   history.length,
          sanctionSources,
        } as OwnerKycData;
      });
    }
  }

  // ── owners_lawsuits_distribution_data ─────────────────────────────────────
  // Estrutura real: rawBody.OwnersLawsuitsDistributionData = { TotalLawsuits, TypeDistribution, ... }
  // É agregado (não por sócio individualmente)
  const lawDist = (rawBody?.OwnersLawsuitsDistributionData ?? r.OwnersLawsuitsDistributionData) as Record<string, unknown> | undefined;
  if (lawDist && typeof lawDist === "object" && _num(lawDist.TotalLawsuits) > 0) {
    const mapDist = (obj: unknown): Record<string, number> => {
      if (!obj || typeof obj !== "object") return {};
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, _num(v)])
      );
    };
    out.ownersLawsuitsDistribution = {
      totalOwners:           _num(lawDist.TotalOwners),
      totalLawsuits:         _num(lawDist.TotalLawsuits),
      totalAsAuthor:         _num(lawDist.TotalLawsuitsAsAuthor),
      totalAsDefendant:      _num(lawDist.TotalLawsuitsAsDefendant),
      typeDistribution:      mapDist(lawDist.TypeDistribution),
      courtTypeDistribution: mapDist(lawDist.CourtTypeDistribution),
      statusDistribution:    mapDist(lawDist.StatusDistribution),
      subjectDistribution:   mapDist(lawDist.CnjSubjectDistribution ?? lawDist.SubjectDistribution),
    };
  }

  // ── interests_and_behaviors ────────────────────────────────────────────────
  // Estrutura real: Result[0].InterestsAndBehaviors.Behaviors.{ CreditSeeker, CreditCardScore, ... }
  const ibRaw = r.InterestsAndBehaviors as Record<string, unknown> | undefined;
  const behaviors = (ibRaw?.Behaviors ?? ibRaw) as Record<string, unknown> | undefined;
  if (behaviors) {
    const creditSeeker    = _str(behaviors.CreditSeeker    ?? behaviors.credit_seeker);
    const creditCardScore = _str(behaviors.CreditCardScore ?? behaviors.credit_card_score);
    if (creditSeeker || creditCardScore) {
      out.interestsAndBehaviors = {
        creditSeeker,
        onlineInvestor:      _bool(behaviors.OnlineInvestor ?? behaviors.online_investor),
        paymentServicesUser: _str(behaviors.PaymentServicesUser ?? behaviors.payment_services_user),
        creditCardScore,
        appUser:             _str(behaviors.AppUser ?? behaviors.app_user),
        onlineBankingUser:   _str(behaviors.OnlineBankingUser ?? behaviors.online_banking_user),
      };
    }
  }

  return out;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function _num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function _bool(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "sim";
}

function _moeda(v: unknown): string {
  const n = _num(v);
  if (n === 0) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function _dateStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split("T")[0].split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}
