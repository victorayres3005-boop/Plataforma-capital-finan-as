// Endpoint de teste isolado pro dataset government_debtors do BDC.
// Recebe um CNPJ de empresa, dispara só esse dataset em /empresas, retorna
// o JSON cru + parse simplificado pra você inspecionar se a conta BDC tem
// PGFN habilitado e qual a qualidade do dado antes de integrar de vez.
//
// Uso (já logado no app):
//   /api/dev/test-pgfn?cnpj=12345678000190

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { BDC_BASE, bdcHeaders, hasCredentials } from "@/lib/bureaus/bigdatacorp";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cnpjRaw = req.nextUrl.searchParams.get("cnpj") ?? "";
  const cnpj = cnpjRaw.replace(/\D/g, "");
  if (cnpj.length !== 14) {
    return NextResponse.json(
      { error: "passe ?cnpj=XXXXXXXXXXXXXX (14 dígitos)" },
      { status: 400 }
    );
  }
  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "BDC_TOKEN/BDC_TOKEN_ID não configurados" },
      { status: 500 }
    );
  }

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(`${BDC_BASE}/empresas`, {
      method: "POST",
      headers: bdcHeaders(),
      body: JSON.stringify({
        q: `doc{${cnpj}}`,
        Datasets: ["government_debtors"].join(","),
        Tags: { host: "pendente_capital", process: "test_pgfn_isolado" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    const status = res.status;
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = { error: "resposta não-JSON do BDC" };
    }

    // Parse rápido pra ver se tem PGFN
    const result = json as Record<string, unknown>;
    const items = Array.isArray(result?.Result) ? result.Result : [];
    const first = items[0] as Record<string, unknown> | undefined;
    const gd = first?.GovernmentDebtors as Record<string, unknown> | undefined;

    return NextResponse.json({
      cnpj,
      httpStatus: status,
      bdcStatus: result?.Status,
      bdcQueryId: result?.QueryId,
      hasGovernmentDebtorsSection: !!gd,
      summary: gd
        ? {
            pgfnDebtsArrayLength: Array.isArray(gd.PGFNDebts)
              ? (gd.PGFNDebts as unknown[]).length
              : null,
            pgfnDebtTotal: gd.PGFNDebtTotal,
            keys: Object.keys(gd),
          }
        : null,
      raw: json,
    });
  } catch (err) {
    clearTimeout(tid);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        hint: "BDC pode ter timeout ou conta sem dataset habilitado",
      },
      { status: 500 }
    );
  }
}
