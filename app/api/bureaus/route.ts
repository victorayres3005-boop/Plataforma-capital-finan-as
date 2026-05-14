export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { consultarCreditHub, consultarGrupoEconomicoSocios, consultarPefinRefin, buscarCNPJPorNome } from "@/lib/bureaus/credithub";
// Onda 3: Serasa/SPC/Quod removidos do paralelismo (decisão 2026-05-14: nunca
// foram pra produção, eram stubs). Assertiva removida (desativada 2026-05-13).
// Os arquivos lib/bureaus/{serasa,spc,quod,assertiva}.ts ficam no repositório
// caso alguma volte um dia — basta restaurar o import + a entry do Promise.allSettled.
import { consultarBrasilApi } from "@/lib/bureaus/brasilapi";
import { consultarSancoes } from "@/lib/bureaus/transparencia";
import { consultarEmpresa as consultarBigDataCorp, consultarSocios as consultarBDCSocios, consultarDividaAtivaBDC } from "@/lib/bureaus/bigdatacorp";
import { mergeBureauResults } from "@/lib/bureaus/merger";
import { enrichProcessosWithDataJud } from "@/lib/bureaus/datajud";
import { cacheGet, cacheSet, cacheClear, cacheClearAll, cacheSize } from "@/lib/bureaus/cache";
import { consultarSCREmpresa, consultarSCRSocios, consultarSCRGrupoEconomico } from "@/lib/bureaus/databox360";
import { extractTopSacados } from "@/lib/sacados/extractTopSacados";
import { consultarSacadosAnalisados } from "@/lib/sacados/consultarSacados";
import { extractUFFromEndereco } from "@/lib/sacados/consultarSacados";
import type { SocioComMae } from "@/lib/sacados/matchVinculos";
import type { ExtractedData } from "@/types";
import type { CreditHubResult } from "@/lib/bureaus/credithub";
import { createClient } from "@supabase/supabase-js";

async function consultarCreditHubComCache(cnpj: string, rawDataFromClient?: unknown): Promise<CreditHubResult> {
  const cnpjNum = cnpj.replace(/\D/g, "");
  // Se o cliente forneceu dados, pula cache e usa direto
  if (rawDataFromClient) {
    const result = await consultarCreditHub(cnpj, rawDataFromClient);
    if (result.success && !result.mock) {
      await cacheSet(cnpjNum, result);
      console.log(`[bureaus] Credit Hub (client-side) — dados recebidos e cacheados para ${cnpjNum}`);
    }
    return result;
  }
  const cached = await cacheGet<CreditHubResult>(cnpjNum);
  if (cached) {
    console.log(`[bureaus] Credit Hub cache HIT (Supabase) para ${cnpjNum}`);
    return cached;
  }
  const result = await consultarCreditHub(cnpj);
  if (result.success && !result.mock) {
    await cacheSet(cnpjNum, result);
    console.log(`[bureaus] Credit Hub cache MISS — consultado e armazenado no Supabase para ${cnpjNum}`);
  }
  return result;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[bureaus] timeout: ${label} excedeu ${ms}ms`)), ms)
    ),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cnpj, data, creditHubRaw, collection_id } = body as { cnpj: string; data: ExtractedData; creditHubRaw?: unknown; collection_id?: string };

    if (!cnpj) {
      return NextResponse.json({ success: false, error: "CNPJ não informado" }, { status: 400 });
    }

    // ── Stub E2E ──────────────────────────────────────────────────────────────
    // Quando rodando E2E (Playwright), retorna fixture estática em vez de chamar
    // bureaus reais. Evita custo + flakiness por dependência externa.
    // Ativação: header `x-e2e-mode: true` na request OU env E2E_BUREAUS_STUB=true.
    // NÃO grava em api_usage_logs (não polui métricas de custo).
    const isE2eStub =
      req.headers.get("x-e2e-mode") === "true" ||
      process.env.E2E_BUREAUS_STUB === "true";
    if (isE2eStub) {
      console.log(`[bureaus][E2E_STUB] retornando fixture estática para CNPJ ${cnpj}`);
      const merged: Partial<ExtractedData> = {
        bureausConsultados: ["E2E_STUB"],
        score: { credithub: { consultadoEm: new Date().toISOString(), protestosIntegrados: true, processosIntegrados: true } },
      };
      return NextResponse.json({
        success: true,
        merged,
        bureaus: { e2e_stub: { success: true, mock: true } },
      });
    }

    // Socios PF para consulta de grupo econômico
    // Fonte 1: QSA (quadro societário extraído do cartão CNPJ)
    const sociosQSA = (data.qsa?.quadroSocietario ?? [])
      .filter(s => s.cpfCnpj && s.cpfCnpj.replace(/\D/g, "").length === 11)
      .map(s => ({ nome: s.nome, cpfCnpj: s.cpfCnpj }));

    // Fonte 2: IR dos Sócios (CPF extraído do imposto de renda — mais confiável)
    const sociosIR = (data.irSocios ?? [])
      .filter(ir => ir.cpf && ir.cpf.replace(/\D/g, "").length === 11 && ir.nomeSocio)
      .map(ir => ({ nome: ir.nomeSocio, cpfCnpj: ir.cpf }));

    // Mescla e deduplica por CPF (IR tem prioridade sobre QSA)
    const cpfsVistos = new Set<string>();
    const sociosParaGrupo: { nome: string; cpfCnpj: string }[] = [];
    [...sociosIR, ...sociosQSA].forEach(s => {
      const cpfNum = s.cpfCnpj.replace(/\D/g, "");
      if (!cpfsVistos.has(cpfNum)) {
        cpfsVistos.add(cpfNum);
        sociosParaGrupo.push(s);
      }
    });

    // Sócios via BDC serão adicionados após o bloco paralelo (não bloqueiam mais o início)
    console.log(`[bureaus] Grupo econômico: ${sociosParaGrupo.length} sócio(s) PF — ${sociosIR.length} via IR, ${sociosQSA.length} via QSA`);

    const cpfsParaBDC = sociosParaGrupo.map(s => s.cpfCnpj);
    const assertivaSociosInput = sociosParaGrupo.map(s => ({ cpf: s.cpfCnpj, nome: s.nome }));

    // FASE 1 — todas as APIs em paralelo, EXCETO BDC.
    // BDC é caro e renova token toda semana; entra apenas como fallback se CH vier vazio.
    // 90s cobre o pior caso: token DataBox360 (40s × 2 tentativas) + chamada SCR (15s)
    const BUREAU_TIMEOUT = 90_000;
    // BDC government_debtors só é consultado quando o analista NÃO subiu
    // certidão PGFN. Upload manual é fonte autoritativa — pular o BDC
    // economiza R$ 0,05 por análise e respeita a hierarquia de fontes
    // (decisão Débora 2026-05-13: "quando tiver upload nem precisa consultar
    // o BigDataCorp"). Critério de pular: existe dividaAtiva com dados
    // substantivos (qtdRegistros > 0) ou marcada como certidão negativa.
    const pgfnTemDado =
      !!data.dividaAtiva &&
      (data.dividaAtiva.qtdRegistros > 0 || data.dividaAtiva.certidaoNegativa);
    if (pgfnTemDado) {
      console.log(`[bureaus][divida-ativa] upload PGFN presente — BDC government_debtors NÃO será consultado (economia de custo)`);
    }

    // 2026-05-14: BDC sócios PF (consultarBDCSocios) entrou no allSettled principal
    // pra garantir cobertura dos campos exclusivos do BDC pessoa (financialRiskScore/Level,
    // estimatedIncomeRange, totalAssetsRange, isCurrentlyOnCollection, last365DaysCollections,
    // pgfn*, processos detalhados) MESMO quando CreditHub responde OK. Antes, o BDC sócios
    // só rodava como fallback (CH vazio) ou para extrair motherName (sacados cedente), e o
    // resto dos dados ricos era descartado. Custo: ~R$ 0,30 por sócio PF — aceito porque
    // os campos são determinantes pra avaliar capacidade financeira do avalista.
    const bdcSociosTask = cpfsParaBDC.length > 0
      ? withTimeout(consultarBDCSocios(cpfsParaBDC), BUREAU_TIMEOUT, "bigdatacorp-socios-pf")
      : Promise.resolve({ socios: [], sociosFalecidos: [], alertaParentesco: false, parentescosDetectados: [] } as Awaited<ReturnType<typeof consultarBDCSocios>>);

    const [credithub, grupoEconomico, brasilapi, sancoes, db360Empresa, db360Socios, pefinRefin, dividaAtivaBDC, bdcSociosPF] = await Promise.allSettled([
      withTimeout(consultarCreditHubComCache(cnpj, creditHubRaw), BUREAU_TIMEOUT, "credithub"),
      withTimeout(consultarGrupoEconomicoSocios(sociosParaGrupo, cnpj), BUREAU_TIMEOUT, "grupo-economico"),
      withTimeout(consultarBrasilApi(cnpj), BUREAU_TIMEOUT, "brasilapi"),
      withTimeout(consultarSancoes(cnpj, sociosParaGrupo), BUREAU_TIMEOUT, "sancoes"),
      withTimeout(consultarSCREmpresa(cnpj), BUREAU_TIMEOUT, "databox360-empresa"),
      withTimeout(consultarSCRSocios(sociosParaGrupo), BUREAU_TIMEOUT, "databox360-socios"),
      withTimeout(consultarPefinRefin(cnpj), BUREAU_TIMEOUT, "credithub-pefin-refin"),
      // BDC government_debtors: pular se upload PGFN já tem dados.
      pgfnTemDado
        ? Promise.resolve({ success: false, error: "skipped: upload PGFN presente" } as Awaited<ReturnType<typeof consultarDividaAtivaBDC>>)
        : withTimeout(consultarDividaAtivaBDC(cnpj), BUREAU_TIMEOUT, "bdc-divida-ativa"),
      bdcSociosTask,
    ]);

    const grupoEconomicoResult = grupoEconomico.status === "fulfilled" ? grupoEconomico.value : undefined;
    const brasilapiResult      = brasilapi.status      === "fulfilled" ? brasilapi.value      : undefined;
    const sancoesResult        = sancoes.status        === "fulfilled" ? sancoes.value        : undefined;
    const db360EmpresaResult   = db360Empresa.status   === "fulfilled" ? db360Empresa.value   : undefined;
    const db360SociosResult    = db360Socios.status    === "fulfilled" ? db360Socios.value    : undefined;
    const bdcSociosPFResult    = bdcSociosPF.status    === "fulfilled" ? bdcSociosPF.value    : undefined;

    // FASE 2 — BDC apenas como fallback total quando CreditHub não trouxe dados úteis.
    // Critério "vazio": CH falhou, está em mock, OU não trouxe nenhum dado substantivo
    // (sem CNAE e sem sócios = CNPJ não reconhecido pelo bureau).
    const credithubValue = credithub.status === "fulfilled" ? credithub.value : undefined;
    const chTemDado =
      !!credithubValue?.cnpjEnrichment?.cnaePrincipal ||
      (credithubValue?.qsaEnrichment?.quadroSocietario?.length ?? 0) > 0;
    const credithubVazio =
      !credithubValue ||
      credithubValue.mock ||
      !credithubValue.success ||
      !chTemDado;

    let bigdatacorpResult: Awaited<ReturnType<typeof consultarBigDataCorp>> | undefined;
    if (credithubVazio) {
      console.log(`[bureaus] CreditHub vazio (success=${credithubValue?.success ?? false}, mock=${credithubValue?.mock ?? "?"}, cnae=${credithubValue?.cnpjEnrichment?.cnaePrincipal ?? "—"}, qsa=${credithubValue?.qsaEnrichment?.quadroSocietario?.length ?? 0}) → fallback BDC ativado`);
      const [bdcEmp] = await Promise.allSettled([
        withTimeout(consultarBigDataCorp(cnpj), BUREAU_TIMEOUT, "bigdatacorp-empresa"),
      ]);
      bigdatacorpResult = bdcEmp.status === "fulfilled" ? bdcEmp.value : undefined;

      // BDC sócios já foi consultado no allSettled principal — reusar
      if (bigdatacorpResult && bdcSociosPFResult) {
        const s = bdcSociosPFResult;
        bigdatacorpResult = {
          ...bigdatacorpResult,
          socios:                s.socios,
          sociosFalecidos:       s.sociosFalecidos,
          alertaParentesco:      s.alertaParentesco,
          parentescosDetectados: s.parentescosDetectados,
        };
        if (s.sociosFalecidos.length > 0) {
          console.warn(`[bureaus] BigDataCorp: sócios com óbito: ${s.sociosFalecidos.join(", ")}`);
        }
        if (s.alertaParentesco) {
          console.warn(`[bureaus] BigDataCorp: parentesco detectado: ${s.parentescosDetectados.map(p => `${p.socio1} + ${p.socio2}`).join(" | ")}`);
        }
      }
    } else {
      console.log(`[bureaus] CreditHub respondeu (cnae="${credithubValue?.cnpjEnrichment?.cnaePrincipal ?? ""}", QSA=${credithubValue?.qsaEnrichment?.quadroSocietario?.length ?? 0}) — BDC empresa ignorado (economia de custo)`);

      // 2026-05-14: mesmo quando BDC empresa é pulado, propaga BDC sócios PF se houver
      // dados — assim os campos exclusivos do BDC pessoa (financialRiskScore, renda,
      // patrimônio, collections, processos detalhados, PGFN) chegam ao QSA via merger.
      if (bdcSociosPFResult && bdcSociosPFResult.socios.length > 0) {
        bigdatacorpResult = {
          success: true,
          mock: false,
          socios:                bdcSociosPFResult.socios,
          sociosFalecidos:       bdcSociosPFResult.sociosFalecidos,
          alertaParentesco:      bdcSociosPFResult.alertaParentesco,
          parentescosDetectados: bdcSociosPFResult.parentescosDetectados,
        };
        console.log(`[bureaus] BDC sócios PF: ${bdcSociosPFResult.socios.length} sócio(s) consultado(s) (cobertura financialRisk + collections + processos + PGFN)`);
        if (bdcSociosPFResult.sociosFalecidos.length > 0) {
          console.warn(`[bureaus] BDC sócios PF: óbito: ${bdcSociosPFResult.sociosFalecidos.join(", ")}`);
        }
        if (bdcSociosPFResult.alertaParentesco) {
          console.warn(`[bureaus] BDC sócios PF: parentesco detectado: ${bdcSociosPFResult.parentescosDetectados.map(p => `${p.socio1} + ${p.socio2}`).join(" | ")}`);
        }
      }
    }

    // Fallback: se QSA/IR vieram vazios mas BDC retornou sócios PF, faz 2ª rodada
    // para DataBox360 SCR sócios (não bloqueia o início — só roda no edge case).
    // Onda 3 (2026-05-14): Assertiva removida desse fallback também.
    let db360SociosFallback: typeof db360SociosResult = undefined;
    if (bigdatacorpResult?.qsaEnrichment?.quadroSocietario?.length) {
      const sociosBDC = bigdatacorpResult.qsaEnrichment.quadroSocietario
        .filter(s => s.cpfCnpj && s.cpfCnpj.replace(/\D/g, "").length === 11)
        .filter(s => !cpfsVistos.has(s.cpfCnpj.replace(/\D/g, "")))
        .map(s => ({ nome: s.nome, cpfCnpj: s.cpfCnpj }));

      if (sociosBDC.length > 0) {
        console.log(`[bureaus] Fallback BDC: ${sociosBDC.length} sócio(s) PF não estavam em QSA/IR — consultando SCR`);
        const [db360SociosBDC] = await Promise.allSettled([
          withTimeout(consultarSCRSocios(sociosBDC), BUREAU_TIMEOUT, "databox360-socios-fallback"),
        ]);

        if (db360SociosBDC.status === "fulfilled" && db360SociosBDC.value.length > 0) {
          db360SociosFallback = db360SociosBDC.value;
          console.log(`[bureaus] Fallback DataBox360: ${db360SociosFallback.length} sócio(s) com SCR`);
        }
      }
    }

    // Mescla SCR sócios primário + fallback
    const db360SociosMerged = [
      ...(db360SociosResult ?? []),
      ...(db360SociosFallback ?? []),
    ];

    console.log(`[bureaus] BrasilAPI: ${brasilapiResult?.success ? "ok" : brasilapiResult?.error || "erro"}`);
    console.log(`[bureaus] Sanções: ${sancoesResult?.mock ? "sem chave API" : sancoesResult?.success ? `${sancoesResult.totalSancoes} sanção(ões)` : sancoesResult?.error || "erro"}`);
    console.log(`[bureaus] BigDataCorp: ${bigdatacorpResult?.mock ? "sem credenciais" : bigdatacorpResult?.success ? "ok" : bigdatacorpResult?.error || "erro"}`);
    console.log(`[bureaus] DataBox360 SCR empresa: ${db360EmpresaResult?.mock ? "sem chave API" : db360EmpresaResult?.scr ? "ok" : "sem dados"}`);
    console.log(`[bureaus] DataBox360 SCR sócios: ${db360SociosMerged.length} sócio(s) consultado(s)`);

    const results = {
      credithub: credithub.status === "fulfilled"
        ? { ...credithub.value, grupoEconomicoEnrichment: grupoEconomicoResult }
        : undefined,
      brasilapi:   brasilapiResult,
      sancoes:     sancoesResult,
      bigdatacorp: bigdatacorpResult,
      databox360:  db360EmpresaResult?.mock ? undefined : { empresa: db360EmpresaResult, socios: db360SociosMerged },
    };

    // Marca como "consultado" só quando a Promise resolveu E o bureau não retornou em modo mock.
    const bureausConsultados = [
      results.credithub && !results.credithub.mock ? "credithub" : null,
    ].filter(Boolean);

    const merged = mergeBureauResults(data, results);

    // ── Dívida Ativa via BDC ──────────────────────────────────────────────────
    // Upload manual de certidão PGFN tem prioridade nos cálculos (PGFN é fonte
    // autoritativa). BDC government_debtors é populado em DOIS papéis:
    //  • Se NÃO houver upload PGFN → vira a fonte primária (data.dividaAtiva)
    //  • Se HOUVER upload PGFN → vira snapshot para comparação (data.dividaAtivaBDC),
    //    mantendo o upload do analista como fonte de verdade.
    //
    // Bug corrigido 2026-05-13: a condição antes checava `!dataConsulta`, mas
    // muitas certidões PGFN (prints, PDFs antigos, certidões estaduais/
    // municipais) não trazem a data de emissão em formato extraível pelo
    // Gemini. Resultado: PGFN cheio de inscrições era sobrescrito por BDC
    // só porque dataConsulta veio "". Agora a checagem é por dados
    // substantivos (qtdRegistros > 0 OU certidão negativa explícita).
    const bdcDA = dividaAtivaBDC.status === "fulfilled" ? dividaAtivaBDC.value : undefined;
    const pgfnUpload = data.dividaAtiva;
    if (!pgfnUpload || (pgfnUpload.qtdRegistros === 0 && !pgfnUpload.certidaoNegativa)) {
      if (bdcDA?.success && bdcDA.data) {
        merged.dividaAtiva = bdcDA.data;
        console.log(
          `[bureaus][divida-ativa] populado via BDC: qtd=${bdcDA.data.qtdRegistros} ${bdcDA.data.certidaoNegativa ? "(negativa)" : `total=${bdcDA.data.valorTotal}`}`
        );
      } else {
        console.log(`[bureaus][divida-ativa] BDC não retornou dado: ${bdcDA?.error ?? "indisponível"}`);
      }
    } else {
      console.log(`[bureaus][divida-ativa] preservando upload manual do analista (PGFN): qtd=${pgfnUpload.qtdRegistros} ${pgfnUpload.certidaoNegativa ? "(negativa)" : `total=${pgfnUpload.valorTotal}`} — BDC pulado`);
      // Não há mais snapshot BDC quando PGFN existe (BDC não foi consultado).
      // Se quiser comparativo BDC×PGFN no futuro, é só remover o skip acima.
    }

    // FASE 3 — Sacados da Curva ABC (top 5 PJ)
    // Consulta CH + BDC para os principais sacados e cruza sócios para detectar
    // partes relacionadas / vínculo familiar com o cedente. Ver lib/sacados/*.
    let sacadosCount = 0;
    try {
      // PRE-ENRICH: muitas Curvas ABC vêm sem CNPJ no JSON extraído (Gemini só
      // pegou nome). Antes de filtrar top 5, busca CNPJ via publica.cnpj.ws
      // pra cada cliente top 10 que ainda esteja sem CNPJ — destrava Fase 3.
      // Cap em top 10 (depois extractTopSacados pega top 5 efetivos).
      if (data?.curvaABC?.clientes?.length) {
        const PRE_ENRICH_CAP = 10;
        const candidates = data.curvaABC.clientes.slice(0, PRE_ENRICH_CAP).filter(c => {
          const cnpjNum = (c.cnpjCpf ?? "").replace(/\D/g, "");
          if (cnpjNum.length === 14) return false; // já tem CNPJ
          return !!(c.nome && c.nome.trim().length >= 5);
        });
        if (candidates.length > 0) {
          console.log(`[bureaus][sacados] ${candidates.length} cliente(s) Curva ABC sem CNPJ — buscando via publica.cnpj.ws`);
          const t0 = Date.now();
          let achados = 0;
          await Promise.allSettled(candidates.map(async c => {
            const cnpj = await buscarCNPJPorNome(c.nome);
            if (cnpj) {
              c.cnpjCpf = cnpj;
              achados++;
              console.log(`[bureaus][sacados] CNPJ por nome: "${c.nome.slice(0, 40)}" → ${cnpj.slice(0, 4)}***`);
            }
          }));
          console.log(`[bureaus][sacados] busca por nome: ${achados}/${candidates.length} CNPJs encontrados em ${Date.now() - t0}ms`);
        }
      }

      // POC: feature flag opt-in. Quando ENABLE_SACADO_NAME_RESOLVER=true,
      // sacados sem CNPJ passam pro pipeline e são resolvidos por razão social
      // antes da consulta ao bureau. Default: false (comportamento legado).
      const RESOLVE_BY_NAME = process.env.ENABLE_SACADO_NAME_RESOLVER === "true";
      const topSacados = extractTopSacados(data?.curvaABC, 5, {
        includeWithoutCnpj: RESOLVE_BY_NAME,
      });
      const totalClientesABC = data?.curvaABC?.clientes?.length ?? 0;
      console.log(`[bureaus][sacados] Curva ABC: ${totalClientesABC} cliente(s) na base, ${topSacados.length} top PJ extraído(s)`);
      if (topSacados.length === 0 && totalClientesABC > 0) {
        // Diagnóstico: nenhum CNPJ válido extraído. Geralmente cnpjCpf vazio
        // (CNPJ embutido no nome) ou só CPFs/lixo. Imprime amostra pra debug.
        const sample = data?.curvaABC?.clientes?.slice(0, 3).map(c => ({
          nome: (c.nome || "").slice(0, 50),
          cnpjCpf: c.cnpjCpf,
        }));
        console.warn(`[bureaus][sacados] nenhum top sacado PJ extraído — amostra:`, JSON.stringify(sample));
      }
      if (topSacados.length > 0) {
        console.log(`[bureaus][sacados] CNPJs: ${topSacados.map(s => s.cnpj).join(", ")}`);

        const sociosCedenteRaw = (data.qsa?.quadroSocietario ?? []).map((s) => ({
          nome: s.nome,
          cpfCnpj: s.cpfCnpj,
        }));
        const enderecoCedente = data.cnpj?.endereco;
        const ufCedente = extractUFFromEndereco(enderecoCedente);

        // Mães dos sócios cedente: reaproveita BDC sócios PF (já consultado no
        // allSettled principal desde 2026-05-14 — antes era chamada nova aqui).
        let sociosCedenteComMae: SocioComMae[] = [];
        const bdcSociosParaMae = bigdatacorpResult?.socios?.length
          ? bigdatacorpResult.socios
          : bdcSociosPFResult?.socios;
        if (bdcSociosParaMae?.length) {
          sociosCedenteComMae = bdcSociosParaMae.map((s) => ({
            nome: s.nome,
            cpf: s.cpf,
            motherName: s.motherName,
          }));
        }

        const sacados = await consultarSacadosAnalisados({
          topSacados,
          cedente: {
            sociosCedente: sociosCedenteRaw,
            ufCedente,
            enderecoCedente,
            sociosCedenteComMae,
            // Contexto extra usado pelo fallback Gemini do resolver de CNPJ
            razaoSocialCedente: data.cnpj?.razaoSocial,
            ramoCedente: data.cnpj?.cnaePrincipal,
            // cidade extraída do endereço quando disponível
            cidadeCedente: enderecoCedente
              ? (enderecoCedente.match(/[-,]\s*([A-Z][A-Za-zÀ-ÿ\s]+?)(?:\s*[-,]\s*[A-Z]{2})?$/)?.[1]?.trim())
              : undefined,
          },
          resolveCnpjFromName: RESOLVE_BY_NAME,
        });

        if (sacados.length > 0) {
          merged.sacadosAnalisados = sacados;
          sacadosCount = sacados.length;
          const comVinculo = sacados.filter((s) => s.vinculos.temVinculo).length;
          console.log(`[bureaus][sacados] ${sacados.length} sacado(s) analisado(s), ${comVinculo} com vínculo detectado`);
        }
      }
    } catch (err) {
      console.warn(`[bureaus][sacados] falha geral:`, err instanceof Error ? err.message : err);
    }

    // PEFIN + REFIN (CreditHub IRQL)
    if (pefinRefin.status === "fulfilled") {
      if (pefinRefin.value.pefin) merged.pefin = pefinRefin.value.pefin;
      if (pefinRefin.value.refin) merged.refin = pefinRefin.value.refin;
    }

    // Enriquece processos com status do DataJud (CNJ)
    if (merged.processos?.top10Valor?.length || merged.processos?.top10Recentes?.length) {
      const allProcs = [
        ...(merged.processos.top10Valor ?? []),
        ...(merged.processos.top10Recentes ?? []),
      ];
      // Deduplica por número antes de consultar
      const seen = new Set<string>();
      const unique = allProcs.filter(p => p.numero && !seen.has(p.numero) && seen.add(p.numero));
      const enriched = await enrichProcessosWithDataJud(unique);
      // Aplica enriquecimento de volta nos arrays originais
      const enrichMap = new Map(enriched.map(p => [p.numero, p]));
      if (merged.processos.top10Valor) {
        merged.processos.top10Valor = merged.processos.top10Valor.map(p => enrichMap.get(p.numero) ?? p);
      }
      if (merged.processos.top10Recentes) {
        merged.processos.top10Recentes = merged.processos.top10Recentes.map(p => enrichMap.get(p.numero) ?? p);
      }
    }

    // SCR para empresas do grupo econômico — busca total de dívidas via DataBox360
    // Sandbox detection: se múltiplas empresas retornam totais idênticos, esconde a coluna
    if (merged.grupoEconomico?.empresas?.length && !db360EmpresaResult?.mock) {
      const cnpjsGrupo = merged.grupoEconomico.empresas
        .map(e => (e.cnpj ?? "").replace(/\D/g, ""))
        .filter(c => c.length === 14);

      if (cnpjsGrupo.length > 0) {
        try {
          const scrGrupo = await withTimeout(
            consultarSCRGrupoEconomico(cnpjsGrupo),
            BUREAU_TIMEOUT,
            "databox360-grupo",
          );
          console.log(`[bureaus] DataBox360 SCR grupo econômico: ${scrGrupo.length}/${cnpjsGrupo.length} empresa(s) com SCR`);

          // Detecta sandbox: retorno vazio OU 2+ empresas com totalDividas idêntico = mock
          const totaisUnicos = new Set(scrGrupo.map(s => s.totalDividas));
          const isSandbox = scrGrupo.length === 0 || (scrGrupo.length >= 2 && totaisUnicos.size === 1);

          if (isSandbox) {
            console.log(`[bureaus] DataBox360 grupo econômico: sandbox detectado (totais idênticos) — coluna SCR oculta`);
            merged.grupoEconomicoScrSandbox = true;
          } else {
            // Popula scrTotal + vencidos + aVencer + prejuizos nos itens correspondentes
            const scrMap = new Map(scrGrupo.map(s => [s.cnpj, s]));
            merged.grupoEconomico.empresas = merged.grupoEconomico.empresas.map(emp => {
              const cnpjNum = (emp.cnpj ?? "").replace(/\D/g, "");
              const s = scrMap.get(cnpjNum);
              if (!s) return emp;
              return {
                ...emp,
                scrTotal:    s.totalDividas,
                scrVencidos: s.carteiraVencido !== "R$ 0,00" ? s.carteiraVencido : undefined,
                scrAVencer:  s.carteiraVencer  !== "R$ 0,00" ? s.carteiraVencer  : undefined,
                scrPrejuizos: s.prejuizos      !== "R$ 0,00" ? s.prejuizos       : undefined,
              };
            });
          }
        } catch (err) {
          console.warn(`[bureaus] DataBox360 grupo econômico falhou:`, err instanceof Error ? err.message : err);
        }
      }
    }

    console.log("[bureaus] Credit Hub:", results.credithub?.success ? "ok" : results.credithub?.error);
    console.log("[bureaus] Consultados:", bureausConsultados);

    // Fire-and-forget: registra chamadas de bureau para rastreio de custo
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        const numSociosPF = (data?.qsa?.quadroSocietario ?? [])
          .filter((s: { cpfCnpj?: string }) => s.cpfCnpj && s.cpfCnpj.replace(/\D/g, "").length === 11).length;
        // Sacados analisados — cada um dispara CH + BDC empresa, e BDC /pessoas
        // pra cada sócio PF do sacado. Conta para visibilidade de custo em /custos.
        const sacadosBdcPessoasCount = (merged.sacadosAnalisados ?? []).reduce(
          (sum, s) => sum + s.socios.filter((sc) => (sc.cpf ?? "").length === 11).length,
          0,
        );
        // bdc_government_debtors separado: chamada de Dívida Ativa via BDC é
        // 1 dataset (R$ 0,05) — antes era contabilizada como bdc_empresa
        // (R$ 0,51), inflando 10x o custo. Conta só quando o BDC respondeu
        // com sucesso (dividaAtivaBDC). Captura tanto a chamada que entra
        // em data.dividaAtiva (sem upload) quanto o snapshot pra comparação
        // (com upload PGFN) — em ambos os casos a request foi feita.
        const dividaAtivaSucesso = dividaAtivaBDC.status === "fulfilled" && dividaAtivaBDC.value?.success;
        // Onda 3: assertiva_pj/pf zerados (Assertiva desativada 2026-05-13).
        // sacado_assertiva_pj mantido em 0 mesmo após remoção do bureau pra
        // preservar histórico da coluna nas métricas de /custos.
        const bureau_calls = {
          credithub:            results.credithub?.success && !results.credithub?.mock ? 1 : 0,
          assertiva_pj:         0,
          assertiva_pf:         0,
          bdc_empresa:          results.bigdatacorp?.success && !results.bigdatacorp?.mock ? 1 : 0,
          bdc_socio:            results.bigdatacorp?.success && !results.bigdatacorp?.mock ? numSociosPF : 0,
          bdc_government_debtors: dividaAtivaSucesso ? 1 : 0,
          databox360_empresa:   !db360EmpresaResult?.mock && db360EmpresaResult?.scr ? 1 : 0,
          databox360_socio:     db360SociosMerged.length,
          sacado_credithub:     sacadosCount,
          sacado_bdc_empresa:   sacadosCount,
          sacado_bdc_pessoa:    sacadosBdcPessoasCount,
          sacado_assertiva_pj:  0,
        };
        await sb.from("api_usage_logs").insert({
          collection_id: collection_id ?? null,
          cnpj: cnpj ?? null,
          company_name: (data?.cnpj as unknown as Record<string, string>)?.razaoSocial ?? null,
          log_type: "bureau",
          bureau_calls,
        });
      }
    } catch { /* não bloqueia a resposta */ }

    return NextResponse.json({
      success: true,
      merged,
      bureaus: {
        credithub:   { success: results.credithub?.success,   mock: results.credithub?.mock,   error: results.credithub?.error   },
        brasilapi:   { success: results.brasilapi?.success,   mock: results.brasilapi?.mock,   error: results.brasilapi?.error,
                       situacaoCadastral: results.brasilapi?.data?.situacaoCadastral,
                       ativa: results.brasilapi?.data?.ativa },
        sancoes:     { success: results.sancoes?.success,     mock: results.sancoes?.mock,     error: results.sancoes?.error,
                       totalSancoes: results.sancoes?.totalSancoes, cnpjLimpo: results.sancoes?.cnpjLimpo },
        bigdatacorp: {
          success:               results.bigdatacorp?.success,
          mock:                  results.bigdatacorp?.mock,
          error:                 results.bigdatacorp?.error,
          sociosFalecidos:       results.bigdatacorp?.sociosFalecidos,
          alertaParentesco:      results.bigdatacorp?.alertaParentesco,
          parentescosDetectados: results.bigdatacorp?.parentescosDetectados,
        },
        databox360: {
          empresa: db360EmpresaResult?.mock ? null : !!db360EmpresaResult?.scr,
          socios: db360SociosMerged.length,
          mock: db360EmpresaResult?.mock ?? true,
        },
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// Permite invalidar cache via GET /api/bureaus?cnpj=XX&action=clear ou ?action=clear_all
export async function GET(req: NextRequest) {
  const cnpj = req.nextUrl.searchParams.get("cnpj")?.replace(/\D/g, "") || "";
  const action = req.nextUrl.searchParams.get("action");
  if (action === "clear_all") {
    const deleted = await cacheClearAll();
    return NextResponse.json({ success: true, message: `Cache totalmente limpo — ${deleted} registro(s) removidos` });
  }
  if (action === "clear" && cnpj) {
    await cacheClear(cnpj);
    return NextResponse.json({ success: true, message: `Cache limpo para ${cnpj}` });
  }
  const size = await cacheSize();
  return NextResponse.json({ cacheSize: size, backend: "supabase" });
}
