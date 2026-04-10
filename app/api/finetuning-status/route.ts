// Consulta o status do job de fine-tuning
// GET /api/finetuning-status?model=tunedModels/capital-financas-rating-v123

export const runtime = "nodejs";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  const url = new URL(request.url);
  const modelName = url.searchParams.get("model");
  if (!modelName) return Response.json({ error: "Informe ?model=tunedModels/..." }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY || (process.env.GEMINI_API_KEYS || "").split(",")[0]?.trim();
  if (!apiKey) return Response.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelName}?key=${apiKey}`,
    );
    if (!res.ok) {
      return Response.json({ error: `Google API: ${res.status}`, detail: await res.text() }, { status: 502 });
    }

    const data = await res.json();
    const state = data.state as string;  // CREATING | ACTIVE | FAILED

    const instructions = state === "ACTIVE"
      ? `Fine-tuning concluído! Adicione nas env vars do Vercel:\nGEMINI_FINETUNED_MODEL=${modelName}\nDepois faça redeploy para ativar.`
      : state === "FAILED"
      ? "Fine-tuning falhou. Verifique os logs no Google AI Studio e tente novamente."
      : `Ainda em andamento (${state}). Verifique novamente em alguns minutos.`;

    return Response.json({
      model: modelName,
      state,
      display_name: data.display_name,
      create_time: data.create_time,
      update_time: data.update_time,
      tuning_task: data.tuning_task?.snapshots?.at(-1) ?? null,
      instructions,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
