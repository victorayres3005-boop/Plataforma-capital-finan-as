import { describe, it, expect } from "vitest";
import {
  sanitizeDescricaoDebitos,
  sanitizeMoney,
  sanitizeEnum,
  sanitizeStr,
  sanitizeArray,
} from "@/lib/extract/sanitize";

describe("sanitizeDescricaoDebitos", () => {
  it("retorna string vazia para undefined/null/vazio", () => {
    expect(sanitizeDescricaoDebitos(undefined)).toBe("");
    expect(sanitizeDescricaoDebitos("")).toBe("");
    expect(sanitizeDescricaoDebitos("   ")).toBe("");
  });

  it("descarta boilerplate da Receita Federal", () => {
    expect(
      sanitizeDescricaoDebitos(
        "Em 12/03/2024, constavam débitos em aberto no âmbito da Secretaria...",
      ),
    ).toBe("");
    expect(
      sanitizeDescricaoDebitos("Procuradoria-Geral da Fazenda Nacional"),
    ).toBe("");
    expect(
      sanitizeDescricaoDebitos("SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL"),
    ).toBe("");
  });

  it("descarta placeholders de IA", () => {
    expect(sanitizeDescricaoDebitos("N/A")).toBe("");
    expect(sanitizeDescricaoDebitos("não disponível")).toBe("");
    expect(sanitizeDescricaoDebitos("Não Informado")).toBe("");
    expect(sanitizeDescricaoDebitos("sem dados")).toBe("");
  });

  it("preserva texto legítimo curto", () => {
    expect(sanitizeDescricaoDebitos("Débito IRPJ R$ 12.000")).toBe(
      "Débito IRPJ R$ 12.000",
    );
  });

  it("trunca texto longo (>200 chars) com elipse", () => {
    const longo = "x".repeat(250);
    const out = sanitizeDescricaoDebitos(longo);
    expect(out).toHaveLength(200);
    expect(out.endsWith("...")).toBe(true);
  });
});

describe("sanitizeMoney", () => {
  it("retorna 0,00 para entradas vazias", () => {
    expect(sanitizeMoney(undefined)).toBe("0,00");
    expect(sanitizeMoney(null)).toBe("0,00");
    expect(sanitizeMoney("")).toBe("0,00");
    expect(sanitizeMoney("abc")).toBe("0,00");
  });

  it("formata BR canônico (1.234.567,89)", () => {
    expect(sanitizeMoney("1.234.567,89")).toBe("1.234.567,89");
    expect(sanitizeMoney("R$ 1.234,56")).toBe("1.234,56");
  });

  it("converte formato americano (1,234,567.89) para BR", () => {
    expect(sanitizeMoney("1,234,567.89")).toBe("1.234.567,89");
    expect(sanitizeMoney("1234567.89")).toBe("1.234.567,89");
  });

  it("vírgula única é decimal BR quando seguida por <=2 dígitos", () => {
    expect(sanitizeMoney("123,45")).toBe("123,45");
    expect(sanitizeMoney("0,5")).toBe("0,50");
  });

  it("ponto único como decimal americano (123.45)", () => {
    expect(sanitizeMoney("123.45")).toBe("123,45");
  });

  it("ponto único como milhar quando tem >2 dígitos depois (1.234)", () => {
    expect(sanitizeMoney("1.234")).toBe("1.234,00");
  });

  it("vírgulas múltiplas como milhar americano", () => {
    expect(sanitizeMoney("1,234,567")).toBe("1.234.567,00");
  });

  it("aceita number sem prefixo R$", () => {
    expect(sanitizeMoney("9498394")).toBe("9.498.394,00");
  });
});

describe("sanitizeEnum", () => {
  const valid = ["recibo", "declaracao", "extrato"] as const;

  it("retorna fallback para vazio/null", () => {
    expect(sanitizeEnum(undefined, valid, "recibo")).toBe("recibo");
    expect(sanitizeEnum(null, valid, "recibo")).toBe("recibo");
    expect(sanitizeEnum("", valid, "recibo")).toBe("recibo");
  });

  it("é case-insensitive", () => {
    expect(sanitizeEnum("DECLARACAO", valid, "recibo")).toBe("declaracao");
    expect(sanitizeEnum("Extrato", valid, "recibo")).toBe("extrato");
  });

  it("retorna fallback para valor inválido", () => {
    expect(sanitizeEnum("xpto", valid, "recibo")).toBe("recibo");
  });

  it("preserva valor exato quando já está no enum", () => {
    expect(sanitizeEnum("recibo", valid, "declaracao")).toBe("recibo");
  });
});

describe("sanitizeStr", () => {
  it("retorna vazio para null/undefined/vazio", () => {
    expect(sanitizeStr(undefined)).toBe("");
    expect(sanitizeStr(null)).toBe("");
    expect(sanitizeStr("   ")).toBe("");
  });

  it("colapsa espaços múltiplos", () => {
    expect(sanitizeStr("foo   bar\n\tbaz")).toBe("foo bar baz");
  });

  it("descarta boilerplate", () => {
    expect(sanitizeStr("N/A")).toBe("");
    expect(sanitizeStr("Procuradoria-Geral da Fazenda Nacional")).toBe("");
  });

  it("trunca para maxLen com elipse", () => {
    const out = sanitizeStr("x".repeat(20), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("...")).toBe(true);
  });

  it("usa default maxLen=500", () => {
    const out = sanitizeStr("x".repeat(600));
    expect(out).toHaveLength(500);
  });
});

describe("sanitizeArray", () => {
  it("retorna [] para não-array", () => {
    expect(sanitizeArray(null, x => x)).toEqual([]);
    expect(sanitizeArray("foo", x => x)).toEqual([]);
    expect(sanitizeArray({ 0: "a" }, x => x)).toEqual([]);
  });

  it("aplica itemFn a cada elemento", () => {
    expect(sanitizeArray([1, 2, 3], (x: unknown) => Number(x) * 2)).toEqual([
      2, 4, 6,
    ]);
  });

  it("preserva array vazio", () => {
    expect(sanitizeArray([], x => x)).toEqual([]);
  });
});
