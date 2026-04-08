/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BureauScore } from "@/types";

const SERASA_API_URL = process.env.SERASA_API_URL || "";
const SERASA_API_KEY = process.env.SERASA_API_KEY || "";

export interface SerasaResult {
  success: boolean;
  mock: boolean;
  score?: BureauScore["serasa"];
  error?: string;
}

export async function consultarSerasa(cnpj: string): Promise<SerasaResult> {
  if (!SERASA_API_URL || !SERASA_API_KEY) {
    return {
      success: false,
      mock: true,
      error: "SERASA_API_URL ou SERASA_API_KEY não configurados",
    };
  }

  const cnpjNum = cnpj.replace(/\D/g, "");

  try {
    const res = await fetch(`${SERASA_API_URL}/score/${cnpjNum}`, {
      headers: {
        Authorization: `Bearer ${SERASA_API_KEY}`,
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
        inadimplente: Boolean(raw.inadimplente || raw.negativado || false),
        consultadoEm: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return { success: false, mock: false, error: String(err?.message || err) };
  }
}
