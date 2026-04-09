export const maxDuration = 60;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { consultarCreditHub, consultarGrupoEconomicoSocios } from "@/lib/bureaus/credithub";
import { consultarSerasa } from "@/lib/bureaus/serasa";
import { consultarSPC } from "@/lib/bureaus/spc";
import { consultarQuod } from "@/lib/bureaus/quod";
import { mergeBureauResults } from "@/lib/bureaus/merger";
import type { ExtractedData } from "@/types";
import type { CreditHubResult } from "@/lib/bureaus/credithub";

// ── Cache em memória 24h (persiste em instâncias warm da Vercel) ──
const bureauCache = new Map<string, { result: CreditHubResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

async function consultarCreditHubComCache(cnpj: string): Promise<CreditHubResult> {
  const cnpjNum = cnpj.replace(/\D/g, "");
  const cached = bureauCache.get(cnpjNum);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[bureaus] Credit Hub cache HIT para ${cnpjNum}`);
    return cached.result;
  }
  const result = await consultarCreditHub(cnpj);
  if (result.success && !result.mock) {
    bureauCache.set(cnpjNum, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    console.log(`[bureaus] Credit Hub cache MISS — consultado e armazenado para ${cnpjNum}`);
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cnpj, data } = body as { cnpj: string; data: ExtractedData };

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
      consultarCreditHubComCache(cnpj),
      consultarSerasa(cnpj),
      consultarSPC(cnpj),
      consultarQuod(cnpj),
      consultarGrupoEconomicoSocios(sociosParaGrupo),
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

// Permite invalidar cache via GET /api/bureaus?cnpj=XX&action=clear
export async function GET(req: NextRequest) {
  const cnpj = req.nextUrl.searchParams.get("cnpj")?.replace(/\D/g, "") || "";
  const action = req.nextUrl.searchParams.get("action");
  if (action === "clear" && cnpj) {
    bureauCache.delete(cnpj);
    return NextResponse.json({ success: true, message: `Cache limpo para ${cnpj}` });
  }
  return NextResponse.json({ cacheSize: bureauCache.size });
}
