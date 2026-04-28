import type { ExtractedData, BureauScore, ProtestosData, ProcessosData, SancoesData, SCRSocioData } from "@/types";
import type { CreditHubResult } from "./credithub";
import type { SerasaResult } from "./serasa";
import type { SPCResult } from "./spc";
import type { QuodResult } from "./quod";
import type { BrasilApiResult } from "./brasilapi";
import type { SancoesResult } from "./transparencia";
import type { BigDataCorpResult } from "./bigdatacorp";
import type { AssertivaResult } from "./assertiva";
import type { DataBox360EmpresaResult, DataBox360SocioResult } from "./databox360";
import { mapearEmpresaParaExtractedData } from "./assertiva";

// Detecta resposta de sandbox: DataBox360 sandbox retorna o mesmo SCR para qualquer
// período solicitado, então valores 100% idênticos = ambiente de teste sem histórico real.
function isScrIdenticoSandbox(
  a: { carteiraAVencer?: string; vencidos?: string; prejuizos?: string; qtdeOperacoes?: string; qtdeInstituicoes?: string },
  b: { carteiraAVencer?: string; vencidos?: string; prejuizos?: string; qtdeOperacoes?: string; qtdeInstituicoes?: string },
): boolean {
  return (
    a.carteiraAVencer   === b.carteiraAVencer   &&
    a.vencidos          === b.vencidos          &&
    a.prejuizos         === b.prejuizos         &&
    a.qtdeOperacoes     === b.qtdeOperacoes     &&
    a.qtdeInstituicoes  === b.qtdeInstituicoes
  );
}

export interface BureauResults {
  credithub?: CreditHubResult;
  serasa?: SerasaResult;
  spc?: SPCResult;
  quod?: QuodResult;
  brasilapi?: BrasilApiResult;
  sancoes?: SancoesResult;
  bigdatacorp?: BigDataCorpResult;
  assertiva?: AssertivaResult;
  databox360?: { empresa?: DataBox360EmpresaResult; socios?: DataBox360SocioResult[] };
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

    // Grupo econômico via CreditHub — somente PJ (CNPJ 14 dígitos)
    if (results.credithub.grupoEconomicoEnrichment) {
      const ge = results.credithub.grupoEconomicoEnrichment;
      const empresasExistentes = data.grupoEconomico?.empresas ?? [];
      const cnpjsExistentes = new Set(empresasExistentes.map(e => e.cnpj.replace(/\D/g, "")));
      const novasEmpresas = ge.empresas.filter(e => {
        const cnpjNum = e.cnpj.replace(/\D/g, "");
        return cnpjNum.length === 14 && !cnpjsExistentes.has(cnpjNum);
      });
      merged.grupoEconomico = {
        empresas: [...empresasExistentes, ...novasEmpresas],
        alertaParentesco: ge.alertaParentesco,
        parentescosDetectados: ge.parentescosDetectados,
      };

      // KYC dos sócios via Credit Hub: enriquece QSA com processos/protestos
      // Só preenche campos que o BDC não populou (BDC tem prioridade)
      if (ge.sociosKyc?.length) {
        const kycMap = new Map(ge.sociosKyc.map(k => [k.cpf.replace(/\D/g, ""), k]));
        const baseQSA = merged.qsa ?? data.qsa;
        if (baseQSA?.quadroSocietario.length) {
          merged.qsa = {
            ...baseQSA,
            quadroSocietario: baseQSA.quadroSocietario.map(s => {
              const cpfNum = (s.cpfCnpj ?? "").replace(/\D/g, "");
              if (cpfNum.length !== 11) return s;
              const kyc = kycMap.get(cpfNum);
              if (!kyc) return s;
              return {
                ...s,
                // BDC tem prioridade; Credit Hub preenche quando BDC não tem
                processosTotal:      s.processosTotal      ?? kyc.processosTotal,
                processosAtivo:      s.processosAtivo      ?? kyc.processosAtivo,
                processosPassivo:    s.processosPassivo     ?? kyc.processosPassivo,
                processosValorTotal: s.processosValorTotal  ?? kyc.processosValorTotal,
                ultimoProcessoData:  s.ultimoProcessoData   ?? kyc.ultimoProcessoData,
                protestosSocioQtd:   s.protestosSocioQtd   ?? kyc.protestosQtd,
                ultimoProtestoData:  s.ultimoProtestoData   ?? kyc.ultimoProtestoData,
              };
            }),
          };
        }
      }
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

  // ── BrasilAPI (Receita Federal oficial) ─────────────────────────────────
  if (results.brasilapi?.success && results.brasilapi.data) {
    const ba = results.brasilapi.data;
    const base = merged.cnpj ?? data.cnpj;
    merged.cnpj = {
      ...base,
      // Situação cadastral da Receita tem prioridade — fonte mais confiável
      situacaoCadastral: ba.situacaoCadastral || base.situacaoCadastral,
      dataSituacaoCadastral: ba.dataSituacaoCadastral || base.dataSituacaoCadastral,
      motivoSituacao: ba.motivoSituacaoCadastral || base.motivoSituacao,
      // Preenche campos vazios
      porte: base.porte || ba.porte,
      naturezaJuridica: base.naturezaJuridica || ba.descricaoNaturezaJuridica || ba.naturezaJuridica,
      cnaePrincipal: base.cnaePrincipal || ba.cnaePrincipal,
      endereco: base.endereco || ba.endereco,
      telefone: base.telefone || ba.telefones[0] || "",
      email: base.email || ba.emails[0] || "",
      dataAbertura: base.dataAbertura || ba.dataAbertura,
      capitalSocialCNPJ: base.capitalSocialCNPJ || (ba.capitalSocial > 0 ? `R$ ${ba.capitalSocial.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""),
    };
    // QSA: se vazia, popula com dados da BrasilAPI
    const sociosReais = (data.qsa?.quadroSocietario || []).filter(s => s.nome || s.cpfCnpj);
    if (sociosReais.length === 0 && ba.qsa.length > 0) {
      merged.qsa = {
        capitalSocial: data.qsa?.capitalSocial || "",
        quadroSocietario: ba.qsa.map(s => ({
          nome: s.nome,
          cpfCnpj: s.cpfCnpj,
          qualificacao: s.qualificacao,
          participacao: s.percentualCapital > 0 ? `${s.percentualCapital}%` : "",
          dataEntrada: s.dataEntrada,
        })),
      };
    }
    bureausConsultados.push("BrasilAPI (Receita Federal)");
  }

  // ── Sanções CEIS/CNEP (Portal da Transparência) ──────────────────────────
  if (results.sancoes?.success && !results.sancoes.mock) {
    const s = results.sancoes;
    const sancoesData: SancoesData = {
      consultado: true,
      cnpjLimpo: s.cnpjLimpo,
      sociosLimpos: s.sociosLimpos,
      totalSancoes: s.totalSancoes,
      sancoesCNPJ: s.sancoesCNPJ,
      sancoesSocios: s.sancoesSocios,
      dataConsulta: new Date().toISOString(),
    };
    merged.sancoes = sancoesData;
    bureausConsultados.push("Portal da Transparência (CEIS/CNEP)");
  }

  // ── BigDataCorp ─────────────────────────────────────────────────────────────
  if (results.bigdatacorp?.success && !results.bigdatacorp.mock) {
    bureausConsultados.push("BigDataCorp");
    const bdc = results.bigdatacorp;

    // CNPJ: preenche apenas campos vazios (CreditHub e BrasilAPI têm prioridade)
    if (bdc.cnpjEnrichment) {
      const base = merged.cnpj ?? data.cnpj;
      const e = bdc.cnpjEnrichment;
      merged.cnpj = {
        ...base,
        razaoSocial:       base.razaoSocial       || e.razaoSocial       || "",
        situacaoCadastral: base.situacaoCadastral  || e.situacaoCadastral || "",
        dataAbertura:      base.dataAbertura       || e.dataAbertura      || "",
        cnaePrincipal:     base.cnaePrincipal      || e.cnaePrincipal     || "",
        funcionarios:      base.funcionarios       || e.funcionarios      || "",
        naturezaJuridica:  base.naturezaJuridica   || e.naturezaJuridica  || "",
      };
    }

    // QSA: preenche se ainda vazio
    if (bdc.qsaEnrichment?.quadroSocietario.length) {
      const sociosReais = ((merged.qsa ?? data.qsa)?.quadroSocietario ?? []).filter(s => s.nome || s.cpfCnpj);
      if (sociosReais.length === 0) {
        merged.qsa = {
          capitalSocial: (merged.qsa ?? data.qsa)?.capitalSocial ?? "",
          quadroSocietario: bdc.qsaEnrichment.quadroSocietario,
        };
      }
    }

    // Processos: usa BDC se CreditHub não trouxe ou se CH veio vazio e BDC tem dados individuais
    if (!processos && bdc.processos) {
      processos = bdc.processos;
    } else if (processos && bdc.processos) {
      // CH trouxe resultado vazio (0 passivos, 0 top10) mas BDC tem entradas com datas — enriquece
      const chVazio = Number(processos.passivosTotal ?? 0) === 0 &&
        (processos.top10Valor?.length ?? 0) === 0 &&
        (processos.top10Recentes?.length ?? 0) === 0;
      const bdcTemDados = (bdc.processos.top10Valor?.length ?? 0) > 0 ||
        (bdc.processos.top10Recentes?.length ?? 0) > 0 ||
        Number(bdc.processos.passivosTotal ?? 0) > 0;
      if (chVazio && bdcTemDados) {
        processos = bdc.processos;
        console.log("[merger] processos: CH vazio → usando BDC com dados individuais");
      }
    }

    // Grupo econômico: fonte = CreditHub; BDC enriquece campos vazios (participação, relação)
    if (bdc.socios?.length && merged.grupoEconomico?.empresas?.length) {
      const bdcEmpMap = new Map<string, { participacao: string; relacao: string }>();
      for (const socio of bdc.socios) {
        for (const emp of socio.empresas ?? []) {
          const cnpjNum = emp.cnpj.replace(/\D/g, "");
          if (cnpjNum.length === 14 && !bdcEmpMap.has(cnpjNum)) {
            bdcEmpMap.set(cnpjNum, {
              participacao: emp.participacao || "",
              relacao:      emp.relacao      || "",
            });
          }
        }
      }
      if (bdcEmpMap.size > 0) {
        merged.grupoEconomico = {
          ...merged.grupoEconomico,
          empresas: merged.grupoEconomico.empresas.map(e => {
            const bdc = bdcEmpMap.get(e.cnpj.replace(/\D/g, ""));
            if (!bdc) return e;
            return {
              ...e,
              participacao: e.participacao || bdc.participacao,
              relacao:      e.relacao      || bdc.relacao,
            };
          }),
        };
      }
    }

    // Parentesco via MotherName (BDC KYC sócios)
    if (bdc.alertaParentesco && bdc.parentescosDetectados?.length) {
      const existingGE = merged.grupoEconomico ?? data.grupoEconomico;
      merged.grupoEconomico = {
        empresas: existingGE?.empresas ?? [],
        alertaParentesco: true,
        parentescosDetectados: [
          ...(existingGE?.parentescosDetectados ?? []),
          ...bdc.parentescosDetectados,
        ],
      };
    }

    // KYC sócios: enriquece QSA com hasObitIndication, taxIdStatus e dados PEP/sanções do BDC
    if (bdc.socios?.length || bdc.ownersKyc?.length) {
      const bdcSocioMap = new Map((bdc.socios ?? []).map(s => [s.cpf.replace(/\D/g, ""), s]));
      // owners_kyc por CPF — match por CPF ou por nome aproximado
      const kycByCpf  = new Map((bdc.ownersKyc ?? []).map(k => [k.cpf.replace(/\D/g, ""), k]));
      const baseQSA = merged.qsa ?? data.qsa;
      if (baseQSA?.quadroSocietario.length) {
        merged.qsa = {
          ...baseQSA,
          quadroSocietario: baseQSA.quadroSocietario.map(s => {
            const cpfNum = (s.cpfCnpj ?? "").replace(/\D/g, "");
            const bdcS   = bdcSocioMap.get(cpfNum);
            const kycS   = kycByCpf.get(cpfNum);
            return {
              ...s,
              hasObitIndication:       bdcS?.hasObitIndication || undefined,
              taxIdStatus:             bdcS?.taxIdStatus && bdcS.taxIdStatus !== "REGULAR" ? bdcS.taxIdStatus : undefined,
              isPEP:                   kycS?.isPEP || undefined,
              isSanctioned:            kycS?.isSanctioned || undefined,
              sanctionSources:         kycS?.sanctionSources?.length ? kycS.sanctionSources : undefined,
              // financial_risk do sócio
              financialRiskScore:      bdcS?.financialRiskScore,
              financialRiskLevel:      bdcS?.financialRiskLevel,
              totalAssetsRange:        bdcS?.totalAssetsRange,
              estimatedIncomeRange:    bdcS?.estimatedIncomeRange,
              isCurrentlyOnCollection: bdcS?.isCurrentlyOnCollection,
              last365DaysCollections:  bdcS?.last365DaysCollections,
              pgfnDebtTotal:           bdcS?.pgfnDebtTotal,
              pgfnTotalDebts:          bdcS?.pgfnTotalDebts,
              pgfnDebts:               bdcS?.pgfnDebts,
              processosTotal:          bdcS?.processosTotal,
              processosPassivo:        bdcS?.processosPassivo,
              processosAtivo:          bdcS?.processosAtivo,
              processosValorTotal:     bdcS?.processosValorTotal,
            };
          }),
        };
      }
      if (bdc.sociosFalecidos?.length) {
        merged.sociosFalecidos = bdc.sociosFalecidos;
      }

      // Alertas PEP/sanções
      const pepSocios  = (bdc.ownersKyc ?? []).filter(k => k.isPEP).map(k => k.nome).filter(Boolean);
      const sancSocios = (bdc.ownersKyc ?? []).filter(k => k.isSanctioned).map(k => k.nome).filter(Boolean);
      if (pepSocios.length > 0) console.warn(`[bureaus] BDC owners_kyc: PEP detectado: ${pepSocios.join(", ")}`);
      if (sancSocios.length > 0) console.warn(`[bureaus] BDC owners_kyc: sancionado: ${sancSocios.join(", ")}`);
    }

    // interests_and_behaviors → ExtractedData.bdcInterests
    if (bdc.interestsAndBehaviors) {
      merged.bdcInterests = bdc.interestsAndBehaviors;
    }

    // owners_lawsuits_distribution → ExtractedData.bdcLawsuitsDistribution
    if (bdc.ownersLawsuitsDistribution) {
      merged.bdcLawsuitsDistribution = bdc.ownersLawsuitsDistribution;
    }

  }

  // ── Assertiva ─────────────────────────────────────────────────────────────
  if (results.assertiva?.success && !results.assertiva.mock) {
    bureausConsultados.push("Assertiva");
    const ass = results.assertiva;

    if (ass.empresa) {
      const base = merged.cnpj ?? data.cnpj;
      const aFields = mapearEmpresaParaExtractedData(ass.empresa);
      merged.cnpj = {
        ...base,
        scoreAssertivaPJ:      base.scoreAssertivaPJ      || aFields.scoreAssertivaPJ,
        negativacoesAssertiva: base.negativacoesAssertiva  || aFields.negativacoesAssertiva,
        rendaPresumidaPJ:      base.rendaPresumidaPJ       || aFields.rendaPresumidaPJ,
      };
    }

    // Protestos Assertiva — armazena sempre; usa como fallback se Credit Hub não trouxe
    if (ass.empresa) {
      const ae = ass.empresa;
      merged.assertivaProtestos = {
        qtd:      ae.protestosQtd,
        valor:    ae.protestosValor,
        completo: ae.protestoCompleto,
        lista:    ae.protestosLista,
      };
      // Fallback: se Credit Hub não trouxe protestos, converte Assertiva para o formato padrão
      if (!protestos && ae.protestosQtd > 0) {
        protestos = {
          vigentesQtd:        String(ae.protestosQtd),
          vigentesValor:      ae.protestosValor > 0 ? `R$ ${ae.protestosValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00",
          regularizadosQtd:   "0",
          regularizadosValor: "R$ 0,00",
          detalhes: ae.protestosLista.map(p => ({
            data:         p.data,
            apresentante: p.cartorio,
            credor:       `${p.cidade}/${p.uf}`,
            valor:        `R$ ${p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            regularizado: false,
          })),
        };
      }
      // Últimas consultas ao mercado
      if (ae.consultasTotal > 0) {
        merged.assertivaConsultas = {
          total:    ae.consultasTotal,
          ultima:   ae.consultasUltima,
          recentes: ae.consultasRecentes,
        };
      }
    }

    // Protestos dos sócios (Assertiva PF) → QSASocio
    if (ass.socios?.length) {
      const assertivaSocioMap = new Map(ass.socios.map(s => [s.cpf.replace(/\D/g, ""), s]));
      const baseQSA2 = merged.qsa ?? data.qsa;
      if (baseQSA2?.quadroSocietario.length) {
        merged.qsa = {
          ...baseQSA2,
          quadroSocietario: baseQSA2.quadroSocietario.map(s => {
            const cpfN = (s.cpfCnpj ?? "").replace(/\D/g, "");
            const aS   = assertivaSocioMap.get(cpfN);
            if (!aS) return s;
            return {
              ...s,
              ...(aS.protestosQtd ? { protestosSocioQtd: aS.protestosQtd, protestosSocioValor: aS.protestosValor } : {}),
              ...(aS.rendaPresumida ? { rendaPresumida: aS.rendaPresumida } : {}),
            };
          }),
        };
      }
    }

    if (ass.socios?.length && data.scrSocios?.length) {
      const assertivaMap = new Map(ass.socios.map(s => [s.cpf.replace(/\D/g, ""), s]));
      merged.scrSocios = data.scrSocios.map(sc => {
        const cpfNum = ((sc as any).cpf ?? "").replace(/\D/g, "");
        const aS = assertivaMap.get(cpfNum);
        if (!aS) return sc;
        return {
          ...sc,
          scoreAssertivaPF:    aS.scoreAssertivaPF    || (sc as any).scoreAssertivaPF,
          rendaPresumida:      aS.rendaPresumida       || (sc as any).rendaPresumida,
          patrimonioEstimado:  aS.patrimonioEstimado   || (sc as any).patrimonioEstimado,
          validacaoIdentidade: aS.validacaoIdentidade  ?? (sc as any).validacaoIdentidade,
          bensVeiculos:        aS.bensVeiculos?.length ? aS.bensVeiculos : (sc as any).bensVeiculos,
          bensImoveis:         aS.bensImoveis?.length  ? aS.bensImoveis  : (sc as any).bensImoveis,
        };
      });
    }
  }

  // ── DataBox360 SCR ──────────────────────────────────────────────────────────
  if (results.databox360) {
    const db = results.databox360;
    bureausConsultados.push("DataBox360 (SCR)");

    // SCR da empresa
    if (db.empresa?.scr) {
      merged.scr = db.empresa.scr;
    }
    if (db.empresa?.scrAnterior) {
      merged.scrAnterior = db.empresa.scrAnterior;
    }

    // Sandbox DataBox360 retorna dados idênticos para qualquer período solicitado.
    // Se atual e anterior têm os mesmos valores financeiros, é sandbox — esconde comparativo.
    if (merged.scr && merged.scrAnterior && isScrIdenticoSandbox(merged.scr, merged.scrAnterior)) {
      console.log(`[merger] DataBox360 sandbox detectado (scr atual e anterior idênticos) — ocultando comparativo`);
      merged.scrAnterior = undefined;
      merged.scrSandboxSemHistorico = true;
    }

    // SCR dos sócios — converte para SCRSocioData e mescla com dados Assertiva já presentes
    if (db.socios?.length) {
      const assertivaMap = results.assertiva?.socios?.length
        ? new Map(results.assertiva.socios.map(s => [s.cpf.replace(/\D/g, ""), s]))
        : new Map();

      const scrSocios: SCRSocioData[] = db.socios
        .filter(s => s.periodoAtual !== null)
        .map(s => {
          const aS = assertivaMap.get(s.cpfSocio);
          // Mesma detecção de sandbox para cada sócio
          const periodoAnt = s.periodoAnterior && s.periodoAtual && isScrIdenticoSandbox(s.periodoAtual, s.periodoAnterior)
            ? undefined
            : (s.periodoAnterior ?? undefined);
          return {
            nomeSocio:           s.nomeSocio,
            cpfSocio:            s.cpfSocio,
            tipoPessoa:          "PF" as const,
            periodoAtual:        s.periodoAtual!,
            periodoAnterior:     periodoAnt,
            scoreAssertivaPF:    aS?.scoreAssertivaPF,
            rendaPresumida:      aS?.rendaPresumida,
            patrimonioEstimado:  aS?.patrimonioEstimado,
            validacaoIdentidade: aS?.validacaoIdentidade,
            bensVeiculos:        aS?.bensVeiculos,
            bensImoveis:         aS?.bensImoveis,
          };
        });

      if (scrSocios.length > 0) {
        merged.scrSocios = scrSocios;
        console.log(`[merger] DataBox360: ${scrSocios.length} sócio(s) com SCR`);
      }
    }
  }

  // BDC Protestos — enriquece datas ausentes do CreditHub ou serve como fallback adicional
  const bdcProtestos = results.bigdatacorp?.protestos;
  if (bdcProtestos?.detalhes.length) {
    if (protestos) {
      // CH tem protestos mas sem datas — substitui detalhes pelos do BDC (mesma fonte CRC, mais completo)
      const chSemDatas = protestos.detalhes.every(d => !d.data);
      if (chSemDatas) {
        protestos = { ...protestos, detalhes: bdcProtestos.detalhes };
        console.log("[merger] BDC protestos: datas enriquecidas (CH não tinha datas)");
      }
    } else {
      // Nenhuma outra fonte trouxe protestos — usa BDC como fallback
      protestos = bdcProtestos;
      console.log("[merger] BDC protestos: usado como fallback");
    }
  }

  merged.score = Object.keys(score).length > 0 ? score : data.score;
  merged.bureausConsultados = bureausConsultados.length > 0 ? bureausConsultados : data.bureausConsultados;

  // Só sobrescreve protestos/processos se vieram dos birôs
  if (protestos) merged.protestos = protestos;
  if (processos) merged.processos = processos;

  return merged;
}
