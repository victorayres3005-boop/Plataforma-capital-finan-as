// Versão HTML do parecer "Decisão do Comitê" — abre direto no navegador
// (preview antes do PDF, ou impressão via Ctrl+P).

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildParecerHtml, SharedReportRow } from "@/lib/parecer/buildHtml";

export const dynamic = "force-dynamic";

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" ||
          /could not find the .* column/i.test(e.message ?? "") ||
          /column .* does not exist/i.test(e.message ?? ""));

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id || !/^[a-z0-9]{8,16}$/.test(id)) {
    return new Response("Link inválido.", { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response("Supabase não configurado.", { status: 500 });
  }

  const supabase = createClient(url, key);
  const baseQ = await supabase
    .from("shared_reports")
    .select("html, expires_at, company")
    .eq("id", id)
    .single<Pick<SharedReportRow, "html" | "expires_at" | "company">>();
  if (baseQ.error || !baseQ.data) {
    return new Response("Relatório não encontrado.", { status: 404 });
  }
  if (baseQ.data.expires_at && new Date(baseQ.data.expires_at) < new Date()) {
    return new Response("Link expirado.", { status: 410 });
  }

  let data: SharedReportRow = {
    ...baseQ.data,
    pontos_fortes: null, pontos_fracos: null, alertas: null,
    percepcao: null, percepcao_dre: null, percepcao_faturamento: null, percepcao_balanco: null,
    pleito_comite: null,
  };

  const editQ = await supabase.from("shared_reports")
    .select("pontos_fortes, pontos_fracos, alertas, percepcao").eq("id", id).single();
  if (editQ.data && !editQ.error) data = { ...data, ...editQ.data };
  else if (editQ.error && !isMissing(editQ.error)) console.warn("[parecer-html] etapa 2:", editQ.error.message);

  const pcQ = await supabase.from("shared_reports")
    .select("pleito_comite").eq("id", id).single();
  if (pcQ.data && !pcQ.error) data = { ...data, ...pcQ.data };
  else if (pcQ.error && !isMissing(pcQ.error)) console.warn("[parecer-html] etapa 3:", pcQ.error.message);

  const psQ = await supabase.from("shared_reports")
    .select("percepcao_dre, percepcao_faturamento, percepcao_balanco").eq("id", id).single();
  if (psQ.data && !psQ.error) data = { ...data, ...psQ.data };
  else if (psQ.error && !isMissing(psQ.error)) console.warn("[parecer-html] etapa 4:", psQ.error.message);

  return new Response(buildParecerHtml(data), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
