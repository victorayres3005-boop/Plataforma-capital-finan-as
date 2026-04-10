// Inicia job de fine-tuning no Google AI Studio
// POST /api/start-finetuning
// Retorna: { jobName, status, modelName }

export const runtime = "nodejs";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type ExportRow = {
  input_snapshot: Record<string, unknown>;
  target_output: {
    rating_esperado: number;
    decisao_esperada: string;
    delta: number;
    justificativa: string;
  };
};

function buildTrainingText(row: ExportRow): { text_input: string; output: string } {
  const snap = row.input_snapshot;
  const parecer = snap.parecer as Record<string, unknown> | undefined;
  const ind = snap.indicadores as Record<string, string> | undefined;
  const alertas = snap.alertas as Array<{ severidade: string; codigo: string; descricao: string }> | undefined;

  const parts: string[] = [];

  if (ind) {
    parts.push(`Indicadores: idade=${ind.idadeEmpresa ?? "—"} alavancagem=${ind.alavancagem ?? "—"} fmm=${ind.fmm ?? "—"} liquidez=${ind.liquidezCorrente ?? "—"} endividamento=${ind.endividamento ?? "—"} margem=${ind.margemLiquida ?? "—"}`);
  }
  if (alertas?.length) {
    parts.push(`Alertas: ${alertas.map(a => `[${a.severidade}]${a.codigo}`).join(" ")}`);
  }
  if (parecer?.resumoExecutivo) {
    parts.push(String(parecer.resumoExecutivo).slice(0, 600));
  }
  if (parecer?.pontosNegativosOuFracos && Array.isArray(parecer.pontosNegativosOuFracos)) {
    parts.push(`Riscos: ${(parecer.pontosNegativosOuFracos as string[]).slice(0, 3).join("; ")}`);
  }

  parts.push("Qual o rating (0-10) e decisão recomendada?");

  const { rating_esperado, decisao_esperada, justificativa } = row.target_output;

  return {
    text_input: parts.join("\n"),
    output: `Rating: ${rating_esperado}/10\nDecisão: ${decisao_esperada}${justificativa ? `\nJustificativa: ${justificativa}` : ""}`,
  };
}

export async function POST() {
  // Auth
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY || (process.env.GEMINI_API_KEYS || "").split(",")[0]?.trim();
  if (!apiKey) return Response.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 });

  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);

  // Busca dataset
  const { data: rows, error } = await supabase
    .from("vw_fine_tuning_export")
    .select("input_snapshot, target_output")
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length < 10) {
    return Response.json({
      error: `Dataset insuficiente: ${rows?.length ?? 0} exemplos. Mínimo: 10 (recomendado: 50).`,
      total: rows?.length ?? 0,
    }, { status: 422 });
  }

  // Monta training data no formato Google Gemini
  const trainingData = (rows as ExportRow[]).map(buildTrainingText);

  const modelVersion = `capital-financas-rating-v${Date.now()}`;

  const body = {
    display_name: modelVersion,
    base_model: "models/gemini-1.5-flash-001-tuning",
    tuning_task: {
      training_data: {
        examples: {
          examples: trainingData,
        },
      },
      hyperparameters: {
        epoch_count: 5,
        batch_size: 4,
        learning_rate: 0.001,
      },
    },
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/tunedModels?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Google API: ${res.status}`, detail: err }, { status: 502 });
    }

    const result = await res.json();
    const jobName = result.metadata?.tunedModel || result.name || modelVersion;

    // Salva o nome do job no banco para consultar status depois
    await supabase.from("prompt_versions").insert({
      user_id: user.id,
      version: modelVersion,
      label: `Fine-tuning iniciado com ${trainingData.length} exemplos`,
      prompt_text: `finetuned:${jobName}`,
      content_hash: `ft-${Date.now()}`,
      model: jobName,
      is_active: false, // só ativa quando o treino terminar
    });

    return Response.json({
      success: true,
      job_name: jobName,
      training_examples: trainingData.length,
      status: "CREATING",
      message: `Fine-tuning iniciado. Quando concluir, adicione GEMINI_FINETUNED_MODEL=${jobName} nas env vars do Vercel.`,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
