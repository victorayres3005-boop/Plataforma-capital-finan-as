/**
 * GET /api/bureaus/debug-cpf?cpf=12345678901
 * Endpoint de diagnóstico — retorna o payload bruto do CreditHub para um CPF.
 * Útil para identificar quais campos a API retorna para consultas de pessoa física.
 * REMOVER em produção quando não for mais necessário.
 */
import { NextRequest, NextResponse } from "next/server";

const CREDITHUB_API_URL = process.env.CREDITHUB_API_URL || "";
const CREDITHUB_API_KEY = process.env.CREDITHUB_API_KEY || "";

export async function GET(req: NextRequest) {
  const cpf = req.nextUrl.searchParams.get("cpf") ?? "";
  const cpfNum = cpf.replace(/\D/g, "");

  if (cpfNum.length !== 11) {
    return NextResponse.json({ error: "CPF inválido — informe 11 dígitos via ?cpf=XXXXXXXXXXX" }, { status: 400 });
  }

  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) {
    return NextResponse.json({ error: "CREDITHUB não configurado" }, { status: 500 });
  }

  const url = `${CREDITHUB_API_URL}/simples/${CREDITHUB_API_KEY}/${cpfNum}`;
  const MAX = 6;
  const DELAY = 3000;

  for (let i = 1; i <= MAX; i++) {
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, cache: "no-store" });
      const text = await res.text();

      if (text.includes(`push="true"`) || text.includes("push='true'")) {
        if (i < MAX) { await new Promise(r => setTimeout(r, DELAY)); continue; }
        return NextResponse.json({ error: `timeout push=true após ${MAX} tentativas` });
      }

      if (!res.ok) {
        return NextResponse.json({ error: `HTTP ${res.status}`, body: text.slice(0, 300) });
      }

      let raw: unknown;
      try { raw = JSON.parse(text); } catch { return NextResponse.json({ error: "não é JSON", raw: text.slice(0, 500) }); }

      const d = (raw as any)?.data ?? raw;
      const topKeys     = Object.keys(d ?? {});
      const arrayFields = topKeys.filter(k => Array.isArray((d as Record<string,unknown>)[k]));
      const preview: Record<string, unknown> = {};
      arrayFields.forEach(k => {
        const arr = (d as Record<string, unknown[]>)[k];
        preview[k] = arr.slice(0, 2); // primeiros 2 itens de cada array
      });

      return NextResponse.json({
        ok: true,
        cpf: cpfNum.slice(0, 3) + "***",
        topKeys,
        arrayFields,
        arrayPreviews: preview,
        rawData: d,
      });
    } catch (err: any) {
      if (i < MAX) { await new Promise(r => setTimeout(r, DELAY)); continue; }
      return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "falha após retries" }, { status: 500 });
}
