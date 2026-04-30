export const maxDuration = 60;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/debug-bureaus?cnpj=XX&bureau=assertiva|bdc&cpf=YY
// Faz chamada real e retorna JSON bruto — usado para confirmar endpoints e campos
export async function GET(req: NextRequest) {
  // Auth — chamadas reais geram custo em $
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const cnpj   = req.nextUrl.searchParams.get("cnpj")?.replace(/\D/g, "") || "00000000000191";
  const bureau = req.nextUrl.searchParams.get("bureau") || "assertiva";
  const cpf    = req.nextUrl.searchParams.get("cpf")?.replace(/\D/g, "") || "";

  if (bureau === "assertiva") {
    return debugAssertiva(cnpj, cpf);
  }
  if (bureau === "bdc") {
    return debugBDC(cnpj, cpf);
  }
  return NextResponse.json({ error: "bureau deve ser 'assertiva' ou 'bdc'" }, { status: 400 });
}

async function debugAssertiva(cnpj: string, cpf: string) {
  const clientId     = process.env.ASSERTIVA_CLIENT_ID;
  const clientSecret = process.env.ASSERTIVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "ASSERTIVA_CLIENT_ID/SECRET não configurados" }, { status: 400 });
  }

  const BASE = "https://api.assertivasolucoes.com.br";
  const tokenResults: Record<string, unknown> = {};
  let token: string | null = null;
  let workingTokenUrl = "";

  // Abordagem 1: OAuth2 Basic Auth (padrão RFC 6749 — credenciais no header)
  // Muitas implementações AWS API Gateway exigem Basic Auth em vez de body
  const basicCred = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const oauthUrls = [
    `${BASE}/oauth2/v3/token`,
    `${BASE}/oauth/token`,
    `${BASE}/oauth2/token`,
    `${BASE}/token`,
  ];
  for (const url of oauthUrls) {
    try {
      const r = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicCred}`,
        },
        body:   new URLSearchParams({ grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(6000),
      });
      const body = await r.text();
      tokenResults[`basic:${url}`] = { status: r.status, body: body.slice(0, 600) };
      if (r.ok) { const j = JSON.parse(body); token = j.access_token; workingTokenUrl = `basic:${url}`; break; }
    } catch (e) { tokenResults[`basic:${url}`] = { error: String(e).slice(0, 80) }; }
  }

  // Abordagem 2: OAuth2 form body (client_id/secret no body)
  if (!token) {
    for (const url of oauthUrls) {
      try {
        const r = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body:    new URLSearchParams({
            grant_type:    "client_credentials",
            client_id:     clientId,
            client_secret: clientSecret,
          }),
          signal: AbortSignal.timeout(6000),
        });
        const body = await r.text();
        tokenResults[`form:${url}`] = { status: r.status, body: body.slice(0, 600) };
        if (r.ok) { const j = JSON.parse(body); token = j.access_token; workingTokenUrl = `form:${url}`; break; }
      } catch (e) { tokenResults[`form:${url}`] = { error: String(e).slice(0, 80) }; }
    }
  }

  // Abordagem 3: JSON body
  if (!token) {
    for (const url of oauthUrls) {
      try {
        const r = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
          signal: AbortSignal.timeout(6000),
        });
        const body = await r.text();
        tokenResults[`json:${url}`] = { status: r.status, body: body.slice(0, 600) };
        if (r.ok) { const j = JSON.parse(body); token = j.access_token; workingTokenUrl = `json:${url}`; break; }
      } catch (e) { tokenResults[`json:${url}`] = { error: String(e).slice(0, 80) }; }
    }
  }

  // Abordagem 3: talvez o client_id seja direto um API key (sem troca de token)
  // Tenta chamar a API diretamente com o client_id como Bearer
  const directResults: Record<string, unknown> = {};
  const endpointsDirect = ["/v3/credito/pj", "/v3/score/pj", "/v3/consulta/pj", "/v3/pj"];
  for (const ep of endpointsDirect) {
    try {
      const r = await fetch(`${BASE}${ep}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${clientId}`,
          "x-api-key":     clientId,
        },
        body:    JSON.stringify({ documento: cnpj }),
        signal:  AbortSignal.timeout(6000),
      });
      const body = await r.text();
      directResults[`direct:${ep}`] = { status: r.status, body: body.slice(0, 600) };
    } catch (e) { directResults[`direct:${ep}`] = { error: String(e).slice(0, 80) }; }
  }

  if (!token) {
    return NextResponse.json({ step: "token_failed", tokenResults, directResults });
  }

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };

  // Chamada empresa PJ com token
  const endpointsEmpresa = [
    "/v3/credito/pj", "/v3/score/pj", "/v3/consulta/pj",
    "/v3/empresa", "/v3/pj", "/v3/cadastral/pj",
  ];
  const empresaResults: Record<string, unknown> = {};
  for (const ep of endpointsEmpresa) {
    try {
      const r = await fetch(`${BASE}${ep}`, {
        method: "POST", headers,
        body:   JSON.stringify({ documento: cnpj }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.text();
      empresaResults[ep] = { status: r.status, body: body.slice(0, 1000) };
    } catch (e) { empresaResults[ep] = { error: String(e).slice(0, 80) }; }
  }

  return NextResponse.json({ token_ok: true, workingTokenUrl, tokenResults, empresa: empresaResults });
}

async function debugBDC(cnpj: string, cpf: string) {
  const token   = process.env.BDC_TOKEN;
  const tokenId = process.env.BDC_TOKEN_ID;

  if (!token || !tokenId) {
    return NextResponse.json({ error: "BDC_TOKEN/BDC_TOKEN_ID não configurados" }, { status: 400 });
  }

  const headers = {
    "accept":       "application/json",
    "content-type": "application/json",
    "AccessToken":  token,
    "TokenId":      tokenId,
  };

  // Empresa — com novos datasets
  const empresaRes = await fetch("https://plataforma.bigdatacorp.com.br/empresas", {
    method:  "POST",
    headers,
    body: JSON.stringify({
      q: `doc{${cnpj}}`,
      Datasets: "owners_kyc,owners_lawsuits_distribution_data,interests_and_behaviors",
      Tags: { host: "pendente_capital", process: "debug" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const empresaBody = await empresaRes.json().catch(() => null);

  // Pessoa (se CPF fornecido)
  let pessoaBody = null;
  if (cpf.length === 11) {
    const pessoaRes = await fetch("https://plataforma.bigdatacorp.com.br/pessoas", {
      method:  "POST",
      headers,
      body: JSON.stringify({
        q: `doc{${cpf}}`,
        Datasets: "financial_risk,collections,government_debtors",
        Tags: { host: "pendente_capital", process: "debug" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    pessoaBody = await pessoaRes.json().catch(() => null);
  }

  return NextResponse.json({
    empresa: { status: empresaRes.status, body: empresaBody },
    pessoa:  pessoaBody ? { body: pessoaBody } : null,
  });
}
