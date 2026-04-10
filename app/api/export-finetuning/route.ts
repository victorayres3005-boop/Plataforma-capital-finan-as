// Exporta dataset de fine-tuning em formato JSONL (Google Gemini)
// GET /api/export-finetuning          → JSON com stats + preview
// GET /api/export-finetuning?format=jsonl → download do arquivo JSONL

export const runtime = "nodejs";
export const maxDuration = 30;

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type ExportRow = {
  id: string;
  cnpj: string;
  company_name: string;
  input_snapshot: Record<string, unknown>;
  target_output: {
    rating_esperado: number;
    decisao_esperada: string;
    delta: number;
    justificativa: string;
  };
  abs_delta: number;
  model_used: string;
  created_at: string;
};

function buildTrainingPair(row: ExportRow): object {
  const snap = row.input_snapshot;
  const parecer = snap.parecer as Record<string, unknown> | undefined;
  const ind = snap.indicadores as Record<string, string> | undefined;
  const alertas = snap.alertas as Array<{ severidade: string; codigo: string; descricao: string }> | undefined;

  // Input: resumo estruturado da análise
  const inputParts: string[] = [];
  if (ind) {
    inputParts.push(`Indicadores financeiros:
- Idade da empresa: ${ind.idadeEmpresa ?? "—"}
- Alavancagem: ${ind.alavancagem ?? "—"}
- FMM 12M: ${ind.fmm ?? "—"}
- Liquidez corrente: ${ind.liquidezCorrente ?? "—"}
- Endividamento: ${ind.endividamento ?? "—"}
- Margem líquida: ${ind.margemLiquida ?? "—"}`);
  }

  if (alertas?.length) {
    const alertaStr = alertas.map(a => `[${a.severidade}] ${a.codigo}: ${a.descricao}`).join("\n");
    inputParts.push(`Alertas identificados:\n${alertaStr}`);
  }

  if (parecer?.resumoExecutivo) {
    inputParts.push(`Resumo da análise:\n${String(parecer.resumoExecutivo).slice(0, 800)}`);
  }

  if (parecer?.pontosFortes && Array.isArray(parecer.pontosFortes)) {
    inputParts.push(`Pontos fortes: ${(parecer.pontosFortes as string[]).join("; ")}`);
  }

  if (parecer?.pontosNegativosOuFracos && Array.isArray(parecer.pontosNegativosOuFracos)) {
    inputParts.push(`Riscos: ${(parecer.pontosNegativosOuFracos as string[]).join("; ")}`);
  }

  inputParts.push(`\nCom base nos dados acima, qual o rating de crédito (0-10) e a decisão recomendada para esta empresa?`);

  // Output: o que o comitê decidiu
  const { rating_esperado, decisao_esperada, justificativa } = row.target_output;
  const outputText = `Rating: ${rating_esperado}/10\nDecisão: ${decisao_esperada}${justificativa ? `\nJustificativa: ${justificativa}` : ""}`;

  return {
    messages: [
      { role: "user",  content: inputParts.join("\n\n") },
      { role: "model", content: outputText },
    ],
  };
}

export async function GET(request: Request) {
  // Auth
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);

  const { data: rows, error } = await supabase
    .from("vw_fine_tuning_export")
    .select("*")
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  if (format === "jsonl") {
    // Download do arquivo JSONL
    const lines = (rows as ExportRow[])
      .map(row => JSON.stringify(buildTrainingPair(row)))
      .join("\n");

    return new Response(lines, {
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Disposition": `attachment; filename="capital-financas-finetuning-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      },
    });
  }

  // JSON com stats + preview dos primeiros 3
  const pairs = (rows as ExportRow[]).map(r => buildTrainingPair(r));
  return Response.json({
    total: pairs.length,
    pronto_para_finetuning: pairs.length >= 10,
    minimo_recomendado: 50,
    preview: pairs.slice(0, 3),
    download_url: "/api/export-finetuning?format=jsonl",
  });
}
