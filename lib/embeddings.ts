// Geração de embeddings via Google gemini-embedding-001 (768 dims)
// Usado na Fase 2 do sistema de feedback de rating IA
// text-embedding-004 foi descontinuado (404 a partir de 2026)

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;

function embeddingUrl(apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
}

/**
 * Gera um vetor de 768 dimensões para o texto fornecido.
 * Tenta todas as chaves Gemini disponíveis antes de lançar erro.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(",").map(k => k.trim()).filter(Boolean);

  if (keys.length === 0) throw new Error("Nenhuma chave Gemini configurada");

  const body = JSON.stringify({
    content: { parts: [{ text: text.slice(0, 8000) }] }, // limite seguro
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: EMBEDDING_DIMS, // gemini-embedding-001 default é 3072; força 768 p/ Supabase
  });

  const failures: Array<{ key: string; reason: string }> = [];
  for (const key of keys) {
    const keyShort = key.substring(0, 8);
    try {
      const res = await fetch(embeddingUrl(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15_000), // 15s — Gemini outage não pode travar a função
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        const reason = res.status === 429 ? "quota" : res.status === 403 ? "forbidden" : `http_${res.status}`;
        console.warn(`[embedding] key=${keyShort}... ${reason} — ${bodyText.substring(0, 120)}`);
        failures.push({ key: keyShort, reason });
        continue;
      }
      const json = await res.json();
      const values = json?.embedding?.values as number[] | undefined;
      if (values && values.length === EMBEDDING_DIMS) return values;
      console.warn(`[embedding] key=${keyShort}... resposta invalida (sem values ou dim != ${EMBEDDING_DIMS}, got ${values?.length})`);
      failures.push({ key: keyShort, reason: "invalid_response" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding] key=${keyShort}... network/parse error: ${msg.substring(0, 120)}`);
      failures.push({ key: keyShort, reason: "network" });
    }
  }

  // Diagnostico estruturado no erro — facilita triagem quando a analyze loga
  const summary = failures.map(f => `${f.key}=${f.reason}`).join(", ");
  console.error(`[embedding] ESGOTADO — ${failures.length}/${keys.length} chaves falharam: ${summary}`);
  throw new Error(`Falha ao gerar embedding — ${failures.length} chaves esgotadas (${summary})`);
}

/**
 * Converte os dados extraídos + snapshot da análise IA em texto
 * normalizado para geração de embedding.
 * Foca nos campos mais discriminativos para similaridade semântica.
 */
export function buildEmbeddingText(snapshot: Record<string, unknown>): string {
  const parts: string[] = [];

  // Indicadores financeiros
  const ind = snapshot.indicadores as Record<string, string> | undefined;
  if (ind) {
    parts.push(`Indicadores: idade=${ind.idadeEmpresa ?? "—"} alavancagem=${ind.alavancagem ?? "—"} fmm=${ind.fmm ?? "—"} liquidez=${ind.liquidezCorrente ?? "—"} endividamento=${ind.endividamento ?? "—"} margem=${ind.margemLiquida ?? "—"}`);
  }

  // Decisão e rating da IA
  if (snapshot.rating != null) parts.push(`Rating IA: ${snapshot.rating}/10`);
  if (snapshot.decisao)        parts.push(`Decisão IA: ${snapshot.decisao}`);

  // Alertas (só severidade + código para não inflar demais)
  const alertas = snapshot.alertas as Array<{ severidade: string; codigo: string }> | undefined;
  if (alertas?.length) {
    const resumo = alertas.map(a => `${a.severidade}:${a.codigo}`).join(" ");
    parts.push(`Alertas: ${resumo}`);
  }

  // Pontos fortes e fracos
  const parecer = snapshot.parecer as Record<string, unknown> | undefined;
  if (parecer) {
    const fortes = (parecer.pontosFortes as string[])?.slice(0, 3).join("; ");
    const fracos = (parecer.pontosNegativosOuFracos as string[])?.slice(0, 3).join("; ");
    if (fortes) parts.push(`Pontos fortes: ${fortes}`);
    if (fracos) parts.push(`Riscos: ${fracos}`);

    // Resumo executivo (truncado)
    const resumo = parecer.resumoExecutivo as string | undefined;
    if (resumo) parts.push(`Resumo: ${resumo.slice(0, 500)}`);
  }

  // Parâmetros operacionais sugeridos
  const params = snapshot.parametrosOperacionais as Record<string, string> | undefined;
  if (params) {
    parts.push(`Limite sugerido: ${params.limiteAproximado ?? "—"} prazo: ${params.prazoMaximo ?? "—"} concentracao: ${params.concentracaoSacado ?? "—"}`);
  }

  return parts.join("\n");
}
