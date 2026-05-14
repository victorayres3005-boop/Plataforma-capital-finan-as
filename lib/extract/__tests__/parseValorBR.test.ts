import { describe, it, expect } from "vitest";
import { parseValorBR } from "@/lib/extract/parseValorBR";

describe("parseValorBR", () => {
  describe("formato BR clássico (vírgula como decimal)", () => {
    it("1.234.567,89 → 1234567.89", () => {
      expect(parseValorBR("1.234.567,89")).toBeCloseTo(1234567.89);
    });
    it("1.234,56 → 1234.56", () => {
      expect(parseValorBR("1.234,56")).toBeCloseTo(1234.56);
    });
    it("0,00 → 0", () => {
      expect(parseValorBR("0,00")).toBe(0);
    });
    it("29.499.805,06 → 29499805.06 (caso PRANDOPEL com formato BR correto)", () => {
      expect(parseValorBR("29.499.805,06")).toBeCloseTo(29499805.06);
    });
  });

  describe("formato EN (ponto como decimal) — CASO PRANDOPEL", () => {
    it("1234.56 → 1234.56 (NÃO 123456!)", () => {
      expect(parseValorBR("1234.56")).toBeCloseTo(1234.56);
    });
    it("29499805.06 → 29499805.06 (NÃO 2949980506!)", () => {
      expect(parseValorBR("29499805.06")).toBeCloseTo(29499805.06);
    });
    it("0.5 → 0.5", () => {
      expect(parseValorBR("0.5")).toBe(0.5);
    });
    it("1,234.56 → 1234.56 (EN com milhares)", () => {
      expect(parseValorBR("1,234.56")).toBeCloseTo(1234.56);
    });
  });

  describe("formato sem decimal", () => {
    it("1234567 → 1234567", () => {
      expect(parseValorBR("1234567")).toBe(1234567);
    });
    it("1.234.567 (BR milhares sem decimal) → 1234567", () => {
      expect(parseValorBR("1.234.567")).toBe(1234567);
    });
    it("1.234 → 1234 (BR milhar simples)", () => {
      expect(parseValorBR("1.234")).toBe(1234);
    });
  });

  describe("prefixos e ruído", () => {
    it('"R$ 1.234,56" → 1234.56', () => {
      expect(parseValorBR("R$ 1.234,56")).toBeCloseTo(1234.56);
    });
    it('"R$1234.56" → 1234.56', () => {
      expect(parseValorBR("R$1234.56")).toBeCloseTo(1234.56);
    });
    it('"  1.234,56  " → 1234.56 (trim)', () => {
      expect(parseValorBR("  1.234,56  ")).toBeCloseTo(1234.56);
    });
  });

  describe("entradas inválidas/vazias", () => {
    it("string vazia → 0", () => {
      expect(parseValorBR("")).toBe(0);
    });
    it("null → 0", () => {
      expect(parseValorBR(null)).toBe(0);
    });
    it("undefined → 0", () => {
      expect(parseValorBR(undefined)).toBe(0);
    });
    it('"-" → 0 (só sinal, sem dígito)', () => {
      expect(parseValorBR("-")).toBe(0);
    });
    it('"abc" → 0', () => {
      expect(parseValorBR("abc")).toBe(0);
    });
  });

  describe("entrada já numérica (passthrough)", () => {
    it("1234.56 (number) → 1234.56", () => {
      expect(parseValorBR(1234.56)).toBe(1234.56);
    });
    it("0 (number) → 0", () => {
      expect(parseValorBR(0)).toBe(0);
    });
    it("NaN → 0 (não propaga NaN)", () => {
      expect(parseValorBR(NaN)).toBe(0);
    });
    it("Infinity → 0", () => {
      expect(parseValorBR(Infinity)).toBe(0);
    });
  });

  describe("valores negativos", () => {
    it("-1.234,56 → -1234.56", () => {
      expect(parseValorBR("-1.234,56")).toBeCloseTo(-1234.56);
    });
    it("-1234.56 → -1234.56", () => {
      expect(parseValorBR("-1234.56")).toBeCloseTo(-1234.56);
    });
  });
});
