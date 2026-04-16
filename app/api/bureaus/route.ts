export const maxDuration = 60;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { consultarCreditHub, consultarGrupoEconomicoSocios } from "@/lib/bureaus/credithub";
import { consultarSerasa } from "@/lib/bureaus/serasa";
import { consultarSPC } from "@/lib/bureaus/spc";
import { consultarQuod } from "@/lib/bureaus/quod";
import { mergeBureauResults } from "@/lib/bureaus/merger";
import { enrichProcessosWithDataJud } from "@/lib/bureaus/datajud";
import { cacheGet, cacheSet, cacheClear, cacheClearAll, cacheSize } from "@/lib/bureaus/cache";
import type { ExtractedData } from "@/types";
import type { CreditHubResult } from "@/lib/bureaus/credithub";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cnpj, data, creditHubRaw } = body as { cnpj: string; data: ExtractedData; creditHubRaw?: unknown };

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

    console.log(`[bureaus] Grupo econômico: ${sociosParaGrupo.length} sócio(s) PF — ${sociosIR.length} via IR, ${sociosQSA.length} via QSA`);

    const [credithub, serasa, spc, quod, grupoEconomico] = await Promise.allSettled([
      consultarCreditHubComCache(cnpj, creditHubRaw),
      consultarSerasa(cnpj),
      consultarSPC(cnpj),
      consultarQuod(cnpj),
      consultarGrupoEconomicoSocios(sociosParaGrupo, cnpj),
    ]);

    const grupoEconomicoResult = grupoEconomico.status === "fulfilled" ? grupoEconomico.value : undefined;

    const results = {
      credithub: credithub.status === "fulfilled"
        ? { ...credithub.value, grupoEconomicoEnrichment: grupoEconomicoResult }
        : undefined,
      serasa: serasa.status === "fulfilled" ? serasa.value : undefined,
      spc:    spc.status    === "fulfilled" ? spc.value    : undefined,
      quod:   quod.status   === "fulfilled" ? quod.value   : undefined,
    };

    const bureausConsultados = [
      results.credithub?.mock ? null : "credithub",
      results.serasa?.mock    ? null : "serasa",
      results.spc?.mock       ? null : "spc",
      results.quod?.mock      ? null : "quod",
    ].filter(Boolean);

    const merged = mergeBureauResults(data, results);

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

    console.log("[bureaus] Credit Hub:", results.credithub?.success ? "ok" : results.credithub?.error);
    console.log("[bureaus] Consultados:", bureausConsultados);

    return NextResponse.json({
      success: true,
      merged,
      bureaus: {
        credithub: { success: results.credithub?.success, mock: results.credithub?.mock, error: results.credithub?.error },
        serasa:    { success: results.serasa?.success,    mock: results.serasa?.mock,    error: results.serasa?.error    },
        spc:       { success: results.spc?.success,       mock: results.spc?.mock,       error: results.spc?.error       },
        quod:      { success: results.quod?.success,      mock: results.quod?.mock,      error: results.quod?.error      },
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
