// instrumentation.ts — executado uma vez quando o servidor inicia (cold-start)
// Suprime console.log em produção para evitar vazamento de dados sensíveis
// (CNPJs, CPFs, valores SCR, respostas brutas de bureaus) nos logs do Vercel.
//
// Para depurar em produção: adicione DEBUG_LOGS=true nas env vars do Vercel
// e faça redeploy — todos os logs voltam ao normal.
//
// console.warn e console.error permanecem sempre ativos.

export async function register() {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_LOGS !== "true") {
    console.log = () => {};
  }
}
