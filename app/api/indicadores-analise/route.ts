// POST /api/indicadores-analise
// Recebe { balanco, dre, contexto? } e retorna { texto } com parágrafo
// gerado por Gemini interpretando os indicadores. Cache 24h por hash dos
// indicadores. Falha silenciosa: retorna { texto: "" } em qualquer erro.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { calcularIndicadores } from "@/lib/analyze/indicadoresFinanceiros";
import { interpretarIndicadoresFinanceiros } from "@/lib/analyze/interpretarIndicadores";
import type { BalancoData, DREData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Payload {
  balanco?: BalancoData | null;
  dre?: DREData | null;
  contexto?: {
    razaoSocialCedente?: string;
    ramoCedente?: string;
  };
  skipCache?: boolean;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const indicadores = calcularIndicadores(body.balanco, body.dre);
  if (indicadores.anos.length === 0) {
    return NextResponse.json({ texto: "" });
  }

  const texto = await interpretarIndicadoresFinanceiros(
    indicadores,
    body.contexto ?? {},
    { skipCache: body.skipCache === true },
  );

  return NextResponse.json({ texto });
}
