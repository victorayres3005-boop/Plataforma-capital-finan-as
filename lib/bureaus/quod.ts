/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BureauScore } from "@/types";

const QUOD_API_URL = process.env.QUOD_API_URL || "";
const QUOD_API_KEY = process.env.QUOD_API_KEY || "";

export interface QuodResult {
  success: boolean;
  mock: boolean;
  score?: BureauScore["quod"];
  error?: string;
}

export async function consultarQuod(cnpj: string): Promise<QuodResult> {
  if (!QUOD_API_URL || !QUOD_API_KEY) {
    return {
      success: false,
      mock: true,
      error: "QUOD_API_URL ou QUOD_API_KEY não configurados",
    };
  }

  const cnpjNum = cnpj.replace(/\D/g, "");

  try {
    const res = await fetch(`${QUOD_API_URL}/score-pj/${cnpjNum}`, {
      headers: {
        Authorization: `Bearer ${QUOD_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, mock: false, error: err };
    }

    const raw: any = await res.json();

    return {
      success: true,
      mock: false,
      score: {
        score: Number(raw.score || raw.pontuacao || 0),
        faixa: String(raw.faixa || raw.classificacao || ""),
        consultadoEm: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return { success: false, mock: false, error: String(err?.message || err) };
  }
}
