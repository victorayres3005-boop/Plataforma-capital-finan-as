import { describe, it, expect } from "vitest";
import { formatFewShotBlock } from "@/lib/analyze/fewShot";

type Row = Parameters<typeof formatFewShotBlock>[0][number];

const baseRow: Row = {
  company_name: "Acme",
  rating_ia: 6.5,
  rating_comite: 7.0,
  delta_rating: 0.5,
  decisao_ia: "APROVADO",
  decisao_comite: "APROVADO",
  justificativa_comite: null,
  resumo_ia: null,
};

describe("formatFewShotBlock", () => {
  it("retorna string vazia quando não há rows", () => {
    expect(formatFewShotBlock([], "vetorial")).toBe("");
    expect(formatFewShotBlock([], "divergencia")).toBe("");
  });

  it("usa header 'CASOS SIMILARES' no modo vetorial", () => {
    const out = formatFewShotBlock([baseRow], "vetorial");
    expect(out).toContain("CASOS SIMILARES DO COMITÊ");
    expect(out).not.toContain("CALIBRAÇÃO DO COMITÊ");
  });

  it("usa header 'CALIBRAÇÃO' no modo divergencia", () => {
    const out = formatFewShotBlock([baseRow], "divergencia");
    expect(out).toContain("CALIBRAÇÃO DO COMITÊ");
    expect(out).not.toContain("CASOS SIMILARES");
  });

  it("formata correção positiva como 'comitê elevou X → Y'", () => {
    const out = formatFewShotBlock(
      [{ ...baseRow, rating_ia: 5, rating_comite: 7, delta_rating: 2 }],
      "vetorial",
    );
    expect(out).toContain("comitê elevou 5 → 7 (+2.0)");
  });

  it("formata correção negativa como 'comitê reduziu X → Y' com sinal", () => {
    const out = formatFewShotBlock(
      [{ ...baseRow, rating_ia: 8, rating_comite: 6, delta_rating: -2 }],
      "vetorial",
    );
    expect(out).toContain("comitê reduziu 8 → 6 (-2.0)");
  });

  it("formata sem correção como 'comitê confirmou X (sem correção)'", () => {
    const out = formatFewShotBlock(
      [{ ...baseRow, rating_ia: 7, rating_comite: 7, delta_rating: 0 }],
      "vetorial",
    );
    expect(out).toContain("comitê confirmou 7 (sem correção)");
  });

  it("inclui sufixo de mudança de decisão quando IA != comitê", () => {
    const out = formatFewShotBlock(
      [{ ...baseRow, decisao_ia: "APROVADO", decisao_comite: "REPROVADO" }],
      "vetorial",
    );
    expect(out).toContain("Decisão: IA=APROVADO → Comitê=REPROVADO");
  });

  it("omite sufixo de decisão quando IA == comitê", () => {
    const out = formatFewShotBlock([baseRow], "vetorial");
    expect(out).not.toContain("Decisão:");
  });

  it("inclui linha de motivo quando justificativa presente", () => {
    const out = formatFewShotBlock(
      [{ ...baseRow, justificativa_comite: "Concentração excessiva" }],
      "vetorial",
    );
    expect(out).toContain('Motivo: "Concentração excessiva"');
  });

  it("usa fallback 'Empresa' quando company_name vazio", () => {
    const out = formatFewShotBlock([{ ...baseRow, company_name: "" }], "vetorial");
    expect(out).toContain("Caso 1 — Empresa:");
  });

  it("numera casos sequencialmente", () => {
    const out = formatFewShotBlock(
      [baseRow, { ...baseRow, company_name: "Beta" }, { ...baseRow, company_name: "Gamma" }],
      "divergencia",
    );
    expect(out).toContain("Caso 1 — Acme");
    expect(out).toContain("Caso 2 — Beta");
    expect(out).toContain("Caso 3 — Gamma");
  });
});
