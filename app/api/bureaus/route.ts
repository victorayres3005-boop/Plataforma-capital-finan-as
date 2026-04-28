export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { consultarCreditHub, consultarGrupoEconomicoSocios, consultarPefinRefin } from "@/lib/bureaus/credithub";
import { consultarSerasa } from "@/lib/bureaus/serasa";
import { consultarSPC } from "@/lib/bureaus/spc";
import { consultarQuod } from "@/lib/bureaus/quod";
import { consultarBrasilApi } from "@/lib/bureaus/brasilapi";
import { consultarSancoes } from "@/lib/bureaus/transparencia";
import { consultarEmpresa as consultarBigDataCorp, consultarSocios as consultarBDCSocios } from "@/lib/bureaus/bigdatacorp";
import { consultarEmpresa as consultarAssertiva, consultarSocios as consultarSociosAssertiva } from "@/lib/bureaus/assertiva";
import { mergeBureauResults } from "@/lib/bureaus/merger";
import { enrichProcessosWithDataJud } from "@/lib/bureaus/datajud";
import { cacheGet, cacheSet, cacheClear, cacheClearAll, cacheSize } from "@/lib/bureaus/cache";
import { consultarSCREmpresa, consultarSCRSocios, consultarSCRGrupoEconomico } from "@/lib/bureaus/databox360";
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

    // Todas as consultas em paralelo — BDC empresa agora participa do mesmo bloco
    // 90s cobre o pior caso: token DataBox360 (40s × 2 tentativas) + chamada SCR (15s)
    const BUREAU_TIMEOUT = 90_000;
    const [credithub, serasa, spc, quod, grupoEconomico, brasilapi, sancoes, bigdatacorp, bdcSocios, assertivaEmpresa, assertivaSocios, db360Empresa, db360Socios, pefinRefin] = await Promise.allSettled([
      withTimeout(consultarCreditHubComCache(cnpj, creditHubRaw), BUREAU_TIMEOUT, "credithub"),
      withTimeout(consultarSerasa(cnpj), BUREAU_TIMEOUT, "serasa"),
      withTimeout(consultarSPC(cnpj), BUREAU_TIMEOUT, "spc"),
      withTimeout(consultarQuod(cnpj), BUREAU_TIMEOUT, "quod"),
      withTimeout(consultarGrupoEconomicoSocios(sociosParaGrupo, cnpj), BUREAU_TIMEOUT, "grupo-economico"),
      withTimeout(consultarBrasilApi(cnpj), BUREAU_TIMEOUT, "brasilapi"),
      withTimeout(consultarSancoes(cnpj, sociosParaGrupo), BUREAU_TIMEOUT, "sancoes"),
      withTimeout(consultarBigDataCorp(cnpj), BUREAU_TIMEOUT, "bigdatacorp-empresa"),
      withTimeout(consultarBDCSocios(cpfsParaBDC), BUREAU_TIMEOUT, "bigdatacorp-socios"),
      withTimeout(consultarAssertiva(cnpj), BUREAU_TIMEOUT, "assertiva-empresa"),
      withTimeout(consultarSociosAssertiva(assertivaSociosInput), BUREAU_TIMEOUT, "assertiva-socios"),
      withTimeout(consultarSCREmpresa(cnpj), BUREAU_TIMEOUT, "databox360-empresa"),
      withTimeout(consultarSCRSocios(sociosParaGrupo), BUREAU_TIMEOUT, "databox360-socios"),
      withTimeout(consultarPefinRefin(cnpj), BUREAU_TIMEOUT, "credithub-pefin-refin"),
    ]);

    const grupoEconomicoResult = grupoEconomico.status === "fulfilled" ? grupoEconomico.value : undefined;
    const brasilapiResult      = brasilapi.status      === "fulfilled" ? brasilapi.value      : undefined;
    const sancoesResult        = sancoes.status        === "fulfilled" ? sancoes.value        : undefined;
    let bigdatacorpResult      = bigdatacorp.status    === "fulfilled" ? bigdatacorp.value    : undefined;
    const db360EmpresaResult   = db360Empresa.status   === "fulfilled" ? db360Empresa.value   : undefined;
    const db360SociosResult    = db360Socios.status    === "fulfilled" ? db360Socios.value    : undefined;

    // Mescla dados de KYC dos sócios no resultado da empresa
    if (bigdatacorpResult && bdcSocios.status === "fulfilled") {
      const s = bdcSocios.value;
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

    // Mescla socios Assertiva no resultado da empresa
    let assertivaResult = assertivaEmpresa.status === "fulfilled" ? assertivaEmpresa.value : undefined;
    if (assertivaResult && assertivaSocios.status === "fulfilled" && assertivaSocios.value.length > 0) {
      assertivaResult = { ...assertivaResult, socios: assertivaSocios.value };
    }

    // Fallback: se QSA/IR vieram vazios mas BDC retornou sócios PF, faz 2ª rodada
    // para Assertiva PF e DataBox360 SCR sócios (não bloqueia o início — só roda no edge case)
    let db360SociosFallback: typeof db360SociosResult = undefined;
    if (bigdatacorpResult?.qsaEnrichment?.quadroSocietario?.length) {
      const sociosBDC = bigdatacorpResult.qsaEnrichment.quadroSocietario
        .filter(s => s.cpfCnpj && s.cpfCnpj.replace(/\D/g, "").length === 11)
        .filter(s => !cpfsVistos.has(s.cpfCnpj.replace(/\D/g, "")))
        .map(s => ({ nome: s.nome, cpfCnpj: s.cpfCnpj }));

      if (sociosBDC.length > 0) {
        console.log(`[bureaus] Fallback BDC: ${sociosBDC.length} sócio(s) PF não estavam em QSA/IR — consultando Assertiva PF + SCR`);
        const [assertivaSociosBDC, db360SociosBDC] = await Promise.allSettled([
          withTimeout(consultarSociosAssertiva(sociosBDC.map(s => ({ cpf: s.cpfCnpj, nome: s.nome }))), BUREAU_TIMEOUT, "assertiva-socios-fallback"),
          withTimeout(consultarSCRSocios(sociosBDC), BUREAU_TIMEOUT, "databox360-socios-fallback"),
        ]);

        if (assertivaSociosBDC.status === "fulfilled" && assertivaSociosBDC.value.length > 0) {
          const novos = assertivaSociosBDC.value;
          const existentes = assertivaResult?.socios ?? [];
          assertivaResult = { ...(assertivaResult ?? { success: true, mock: false }), socios: [...existentes, ...novos] };
          console.log(`[bureaus] Fallback Assertiva: ${novos.length} sócio(s) adicionados`);
        }
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
    console.log(`[bureaus] Assertiva: ${assertivaResult?.mock ? "sem credenciais" : assertivaResult?.success ? "ok" : assertivaResult?.error || "erro"}`);
    console.log(`[bureaus] DataBox360 SCR empresa: ${db360EmpresaResult?.mock ? "sem chave API" : db360EmpresaResult?.scr ? "ok" : "sem dados"}`);
    console.log(`[bureaus] DataBox360 SCR sócios: ${db360SociosMerged.length} sócio(s) consultado(s)`);

    const results = {
      credithub: credithub.status === "fulfilled"
        ? { ...credithub.value, grupoEconomicoEnrichment: grupoEconomicoResult }
        : undefined,
      serasa: serasa.status === "fulfilled" ? serasa.value : undefined,
      spc:    spc.status    === "fulfilled" ? spc.value    : undefined,
      quod:   quod.status   === "fulfilled" ? quod.value   : undefined,
      brasilapi:   brasilapiResult,
      sancoes:     sancoesResult,
      bigdatacorp: bigdatacorpResult,
      assertiva:   assertivaResult,
      databox360:  db360EmpresaResult?.mock ? undefined : { empresa: db360EmpresaResult, socios: db360SociosMerged },
    };

    const bureausConsultados = [
      results.credithub?.mock ? null : "credithub",
      results.serasa?.mock    ? null : "serasa",
      results.spc?.mock       ? null : "spc",
      results.quod?.mock      ? null : "quod",
    ].filter(Boolean);

    const merged = mergeBureauResults(data, results);

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
            // Popula scrTotal nos itens correspondentes
            const scrMap = new Map(scrGrupo.map(s => [s.cnpj, s.totalDividas]));
            merged.grupoEconomico.empresas = merged.grupoEconomico.empresas.map(emp => {
              const cnpjNum = (emp.cnpj ?? "").replace(/\D/g, "");
              const total = scrMap.get(cnpjNum);
              return total ? { ...emp, scrTotal: total } : emp;
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
        const bureau_calls = {
          credithub:            results.credithub?.success && !results.credithub?.mock ? 1 : 0,
          assertiva_pj:         results.assertiva?.success && !results.assertiva?.mock  ? 1 : 0,
          assertiva_pf:         results.assertiva?.success && !results.assertiva?.mock  ? numSociosPF : 0,
          bdc_empresa:          results.bigdatacorp?.success && !results.bigdatacorp?.mock ? 1 : 0,
          bdc_socio:            results.bigdatacorp?.success && !results.bigdatacorp?.mock ? numSociosPF : 0,
          databox360_empresa:   !db360EmpresaResult?.mock && db360EmpresaResult?.scr ? 1 : 0,
          databox360_socio:     db360SociosMerged.length,
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
        serasa:      { success: results.serasa?.success,      mock: results.serasa?.mock,      error: results.serasa?.error      },
        spc:         { success: results.spc?.success,         mock: results.spc?.mock,         error: results.spc?.error         },
        quod:        { success: results.quod?.success,        mock: results.quod?.mock,        error: results.quod?.error        },
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
        assertiva: { success: results.assertiva?.success, mock: results.assertiva?.mock, error: results.assertiva?.error },
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
