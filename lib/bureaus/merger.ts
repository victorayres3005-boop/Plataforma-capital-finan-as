import type { ExtractedData, BureauScore, ProtestosData, ProcessosData } from "@/types";
import type { CreditHubResult } from "./credithub";
import type { SerasaResult } from "./serasa";
import type { SPCResult } from "./spc";
import type { QuodResult } from "./quod";

export interface BureauResults {
  credithub?: CreditHubResult;
  serasa?: SerasaResult;
  spc?: SPCResult;
  quod?: QuodResult;
}

export function mergeBureauResults(
  data: ExtractedData,
  results: BureauResults
): Partial<ExtractedData> {
  const score: BureauScore = {};
  const bureausConsultados: string[] = [];
  let protestos: ProtestosData | undefined;
  let processos: ProcessosData | undefined;

  const merged: Partial<ExtractedData> = {};

  if (results.credithub?.success && !results.credithub.mock) {
    bureausConsultados.push("Credit Hub");
    if (results.credithub.score) score.credithub = results.credithub.score;
    // Protestos: passa sempre que o CH consultou (mesmo empresa limpa = zero protestos)
    // Só descarta se o objeto for undefined (API não retornou nada)
    const chp = results.credithub.protestos;
    if (chp) {
      protestos = chp;
    }
    // Processos: passa sempre que o CH consultou; evita apagar dados vindos de documento
    // só descarta se passivosTotal também for 0 E já existir dado de documento
    const chProc = results.credithub.processos;
    if (chProc) {
      const temDadoDocumento = Number(data.processos?.passivosTotal ?? 0) > 0;
      const temDadoCH = Number(chProc.passivosTotal ?? 0) > 0 || (chProc.top10Valor?.length ?? 0) > 0;
      if (temDadoCH || !temDadoDocumento) {
        processos = chProc;
      }
    }

    // CCF — passa sempre que o CH consultou (empresa com CCF limpo deve aparecer como consultado)
    const chCCF = results.credithub.ccf;
    if (chCCF) {
      merged.ccf = chCCF;
    }

    // Histórico de consultas ao mercado
    if (results.credithub.historicoConsultas?.length) {
      merged.historicoConsultas = results.credithub.historicoConsultas;
    }

    // Grupo econômico via CPF dos sócios + parentesco
    if (results.credithub.grupoEconomicoEnrichment) {
      const ge = results.credithub.grupoEconomicoEnrichment;
      const empresasExistentes = data.grupoEconomico?.empresas ?? [];
      const cnpjsExistentes = new Set(empresasExistentes.map(e => e.cnpj.replace(/\D/g, "")));
      const novasEmpresas = ge.empresas.filter(e => !cnpjsExistentes.has(e.cnpj.replace(/\D/g, "")));
      merged.grupoEconomico = {
        empresas: [...empresasExistentes, ...novasEmpresas],
        alertaParentesco: ge.alertaParentesco,
        parentescosDetectados: ge.parentescosDetectados,
      };
    }

    // Enriquecer CNPJ com dados do Credit Hub (apenas campos vazios)
    if (results.credithub.cnpjEnrichment) {
      const e = results.credithub.cnpjEnrichment;
      merged.cnpj = {
        ...data.cnpj,
        capitalSocialCNPJ: data.cnpj.capitalSocialCNPJ || e.capitalSocialCNPJ || "",
        porte: data.cnpj.porte || e.porte || "",
        naturezaJuridica: data.cnpj.naturezaJuridica || e.naturezaJuridica || "",
        cnaePrincipal: data.cnpj.cnaePrincipal || (e.cnaePrincipal ? `${e.cnaePrincipal} — ${e.cnaeDescricao || ""}` : "") || "",
        telefone: data.cnpj.telefone || e.telefone || "",
        email: data.cnpj.email || e.email || "",
        endereco: data.cnpj.endereco || e.endereco || "",
        // Novos campos do Credit Hub
        tipoEmpresa: data.cnpj.tipoEmpresa || e.tipoEmpresa || "",
        funcionarios: data.cnpj.funcionarios || e.funcionarios || "",
        regimeTributario: data.cnpj.regimeTributario || e.regimeTributario || "",
        site: data.cnpj.site || e.site || "",
        enderecos: e.enderecos || [],
      };
    }

    // Enriquecer QSA com dados do Credit Hub
    if (results.credithub.qsaEnrichment) {
      const q = results.credithub.qsaEnrichment;
      // QSA é considerada vazia se não tem sócios OU se todos os sócios são entradas vazias
      const sociosReais = (data.qsa?.quadroSocietario || []).filter(s => s.nome || s.cpfCnpj);
      const qsaVazia = sociosReais.length === 0;
      if (qsaVazia && q.quadroSocietario.length > 0) {
        merged.qsa = {
          capitalSocial: data.qsa?.capitalSocial || q.capitalSocial,
          quadroSocietario: q.quadroSocietario,
        };
      } else if (q.quadroSocietario.length > 0) {
        // Mesmo quando QSA existe, enriquece com dataEntrada/dataSaida do Credit Hub
        const docMap = new Map(q.quadroSocietario.map(s => [s.cpfCnpj, s]));
        const enriched = (data.qsa?.quadroSocietario || []).map(s => {
          const ch = docMap.get(s.cpfCnpj);
          return ch ? { ...s, dataEntrada: s.dataEntrada || ch.dataEntrada, dataSaida: s.dataSaida || ch.dataSaida } : s;
        });
        merged.qsa = {
          capitalSocial: data.qsa?.capitalSocial || q.capitalSocial,
          quadroSocietario: enriched,
        };
      } else if (!data.qsa?.capitalSocial && q.capitalSocial) {
        merged.qsa = {
          capitalSocial: q.capitalSocial,
          quadroSocietario: data.qsa?.quadroSocietario || [],
        };
      }
    }
  }

  if (results.serasa?.success && !results.serasa.mock) {
    bureausConsultados.push("Serasa");
    if (results.serasa.score) score.serasa = results.serasa.score;
  }

  if (results.spc?.success && !results.spc.mock) {
    bureausConsultados.push("SPC Brasil");
    if (results.spc.score) score.spc = results.spc.score;
  }

  if (results.quod?.success && !results.quod.mock) {
    bureausConsultados.push("Quod");
    if (results.quod.score) score.quod = results.quod.score;
  }

  merged.score = Object.keys(score).length > 0 ? score : data.score;
  merged.bureausConsultados = bureausConsultados.length > 0 ? bureausConsultados : data.bureausConsultados;

  // Só sobrescreve protestos/processos se vieram dos birôs
  if (protestos) merged.protestos = protestos;
  if (processos) merged.processos = processos;

  return merged;
}
