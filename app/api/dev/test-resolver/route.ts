// Endpoint de teste isolado pro resolver de CNPJ por razão social.
// Recebe lista de nomes, devolve resultado do resolver para cada um.
// Útil pra calibrar matcher / threshold sem reprocessar análise inteira.
//
// Exemplo:
//   curl -X POST https://<dominio>/api/dev/test-resolver \
//     -H 'Content-Type: application/json' \
//     -H 'Cookie: ...sessão...' \
//     -d '{"nomes":["SENDAS DISTRIBUIDORA S/A","ROCHA ATACADO LTDA"],"ufCedente":"RJ"}'

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveCnpjPorNome } from "@/lib/sacados/resolveCnpjPorNome";
import {
  cleanSacadoName,
  looksLikePF,
  isLinhaTotalCurvaABC,
} from "@/lib/sacados/extractTopSacados";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth — só usuário logado pode bater no endpoint
  const supabase = createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { nomes?: unknown; ufCedente?: unknown; skipCache?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const nomes = Array.isArray(body.nomes) ? body.nomes : [];
  if (nomes.length === 0 || nomes.length > 20) {
    return NextResponse.json(
      { error: "passe 1-20 nomes em `nomes`" },
      { status: 400 }
    );
  }
  const ufCedente = typeof body.ufCedente === "string" ? body.ufCedente : undefined;
  const skipCache = body.skipCache === true;

  // Roda sequencial pra respeitar rate limit do publica.cnpj.ws
  const results: Array<Record<string, unknown>> = [];
  for (const raw of nomes) {
    const original = String(raw ?? "");
    const cleaned = cleanSacadoName(original);

    // Pré-filtros: linha de totalizador ou PF nunca vão resolver
    if (isLinhaTotalCurvaABC(cleaned)) {
      results.push({
        nome: original,
        cleaned,
        skipped: "linha-de-totalizador",
      });
      continue;
    }
    if (looksLikePF(cleaned)) {
      results.push({
        nome: original,
        cleaned,
        skipped: "parece-pf",
      });
      continue;
    }

    const r = await resolveCnpjPorNome(cleaned, { ufCedente, skipCache });
    results.push({
      nome: original,
      cleaned,
      cnpj: r.cnpj || null,
      status: r.status,
      source: r.source,
      score: r.score,
      candidates: r.candidates,
      resolvedName: r.resolvedName,
    });
  }

  const resolved = results.filter((r) => r.cnpj).length;
  const total = results.length;

  return NextResponse.json({
    summary: {
      total,
      resolved,
      hitRate: total > 0 ? `${((resolved / total) * 100).toFixed(1)}%` : "—",
    },
    results,
  });
}
