/**
 * GET /api/bureaus/debug-cpf?cpf=12345678901&mode=simples (padrão)
 * GET /api/bureaus/debug-cpf?cpf=12345678901&mode=completo
 * GET /api/bureaus/debug-cpf?cpf=12345678901&mode=scan  ← testa vários endpoints de uma vez
 *
 * Endpoint de diagnóstico — retorna o payload bruto do CreditHub para um CPF.
 * REMOVER em produção quando não for mais necessário.
 */
import { NextRequest, NextResponse } from "next/server";

const CREDITHUB_API_URL = process.env.CREDITHUB_API_URL || "";
const CREDITHUB_API_KEY = process.env.CREDITHUB_API_KEY || "";

const MAX = 6;
const DELAY = 3000;

async function fetchCreditHub(url: string): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  for (let i = 1; i <= MAX; i++) {
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, cache: "no-store" });
      const text = await res.text();

      if (text.includes(`push="true"`) || text.includes("push='true'")) {
        if (i < MAX) { await new Promise(r => setTimeout(r, DELAY)); continue; }
        return { ok: false, status: 0, data: null, text: `timeout push=true após ${MAX} tentativas` };
      }

      let data: unknown = null;
      try { data = JSON.parse(text); } catch { /* not json */ }

      return { ok: res.ok, status: res.status, data, text: text.slice(0, 500) };
    } catch (err: unknown) {
      if (i < MAX) { await new Promise(r => setTimeout(r, DELAY)); continue; }
      return { ok: false, status: 0, data: null, text: String(err instanceof Error ? err.message : err) };
    }
  }
  return { ok: false, status: 0, data: null, text: "falha após retries" };
}

export async function GET(req: NextRequest) {
  const cpf = req.nextUrl.searchParams.get("cpf") ?? "";
  const mode = req.nextUrl.searchParams.get("mode") ?? "simples";
  const cpfNum = cpf.replace(/\D/g, "");

  if (cpfNum.length !== 11) {
    return NextResponse.json({ error: "CPF inválido — informe 11 dígitos via ?cpf=XXXXXXXXXXX" }, { status: 400 });
  }

  if (!CREDITHUB_API_URL || !CREDITHUB_API_KEY) {
    return NextResponse.json({ error: "CREDITHUB não configurado" }, { status: 500 });
  }

  // Modo scan: testa vários endpoints e reporta quais retornam dados e quais campos extras têm
  if (mode === "scan") {
    const endpoints = [
      "simples",
      "completo",
      "pf",
      "pessoa-fisica",
      "cpf",
      "socio",
      "grupo-economico",
      "vinculo",
      "participacoes",
    ];

    const results: Record<string, unknown> = {};

    for (const ep of endpoints) {
      const url = `${CREDITHUB_API_URL}/${ep}/${CREDITHUB_API_KEY}/${cpfNum}`;
      const r = await fetchCreditHub(url);
      const d = (r.data as Record<string, unknown>)?.data ?? r.data;
      const topKeys = d && typeof d === "object" ? Object.keys(d) : [];
      results[ep] = {
        status: r.status,
        ok: r.ok,
        topKeys,
        preview: r.ok ? undefined : r.text,
      };
    }

    return NextResponse.json({ cpf: cpfNum.slice(0, 3) + "***", mode: "scan", results });
  }

  // Modo simples ou completo: retorna payload completo
  const url = `${CREDITHUB_API_URL}/${mode}/${CREDITHUB_API_KEY}/${cpfNum}`;
  const r = await fetchCreditHub(url);

  if (!r.ok) {
    return NextResponse.json({ error: `HTTP ${r.status}`, preview: r.text });
  }

  const d = (r.data as Record<string, unknown>)?.data ?? r.data;
  const topKeys = d && typeof d === "object" ? Object.keys(d as object) : [];
  const arrayFields = topKeys.filter(k => Array.isArray((d as Record<string, unknown>)[k]));
  const preview: Record<string, unknown> = {};
  arrayFields.forEach(k => {
    const arr = (d as Record<string, unknown[]>)[k];
    preview[k] = arr.slice(0, 2);
  });

  return NextResponse.json({
    ok: true,
    cpf: cpfNum.slice(0, 3) + "***",
    mode,
    topKeys,
    arrayFields,
    arrayPreviews: preview,
    rawData: d,
  });
}
