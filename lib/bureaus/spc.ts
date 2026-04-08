/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BureauScore } from "@/types";

const SPC_API_URL = process.env.SPC_API_URL || "";
const SPC_API_KEY = process.env.SPC_API_KEY || "";

export interface SPCResult {
  success: boolean;
  mock: boolean;
  score?: BureauScore["spc"];
  error?: string;
}

export async function consultarSPC(cnpj: string): Promise<SPCResult> {
  if (!SPC_API_URL || !SPC_API_KEY) {
    return {
      success: false,
      mock: true,
      error: "SPC_API_URL ou SPC_API_KEY não configurados",
    };
  }

  const cnpjNum = cnpj.replace(/\D/g, "");

  try {
    const res = await fetch(`${SPC_API_URL}/consulta/${cnpjNum}`, {
      headers: {
        Authorization: `Bearer ${SPC_API_KEY}`,
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
        pendencias: Number(raw.pendencias || raw.ocorrencias || 0),
        inadimplente: Boolean(raw.inadimplente || raw.negativado || false),
        consultadoEm: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return { success: false, mock: false, error: String(err?.message || err) };
  }
}
