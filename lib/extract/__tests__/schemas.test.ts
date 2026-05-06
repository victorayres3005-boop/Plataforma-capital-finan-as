import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CNPJDataSchema,
  QSADataSchema,
  ContratoSocialDataSchema,
  FaturamentoDataSchema,
  SCRDataSchema,
  safeParseExtracted,
  auditBusinessRules,
} from "@/lib/extract/schemas";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CNPJDataSchema", () => {
  it("preenche defaults quando campos faltam", () => {
    const r = CNPJDataSchema.parse({});
    expect(r.razaoSocial).toBe("");
    expect(r.cnpj).toBe("");
    expect(r.endereco).toBe("");
  });

  it("coerciona null/undefined para string vazia", () => {
    const r = CNPJDataSchema.parse({ razaoSocial: null, cnpj: undefined });
    expect(r.razaoSocial).toBe("");
    expect(r.cnpj).toBe("");
  });

  it("coerciona number para string", () => {
    const r = CNPJDataSchema.parse({ telefone: 1140044000 });
    expect(r.telefone).toBe("1140044000");
  });

  it("preserva campos extras (passthrough — tipoEmpresa)", () => {
    const r = CNPJDataSchema.parse({ razaoSocial: "X", tipoEmpresa: "LTDA" }) as Record<string, unknown>;
    expect(r.tipoEmpresa).toBe("LTDA");
  });
});

describe("QSADataSchema", () => {
  it("default array vazio para quadroSocietario", () => {
    const r = QSADataSchema.parse({});
    expect(r.quadroSocietario).toEqual([]);
  });

  it("aceita sócios com campos parciais", () => {
    const r = QSADataSchema.parse({
      quadroSocietario: [{ nome: "João" }, { cpfCnpj: "123" }],
    });
    expect(r.quadroSocietario).toHaveLength(2);
    expect(r.quadroSocietario[0].nome).toBe("João");
    expect(r.quadroSocietario[0].cpfCnpj).toBe("");
  });
});

describe("ContratoSocialDataSchema", () => {
  it("temAlteracoes coerciona 'true' string para boolean", () => {
    const r = ContratoSocialDataSchema.parse({ temAlteracoes: "true" });
    expect(r.temAlteracoes).toBe(true);
  });

  it("temAlteracoes default false", () => {
    const r = ContratoSocialDataSchema.parse({});
    expect(r.temAlteracoes).toBe(false);
  });
});

describe("FaturamentoDataSchema", () => {
  it("aceita meses com mes+valor", () => {
    const r = FaturamentoDataSchema.parse({
      meses: [{ mes: "01/2024", valor: "100,00" }],
    });
    expect(r.meses).toHaveLength(1);
    expect(r.meses[0].mes).toBe("01/2024");
  });
});

describe("SCRDataSchema — faixaSchema", () => {
  it("permite faixasAVencer ausente (optional)", () => {
    const r = SCRDataSchema.parse({});
    expect(r.faixasAVencer).toBeUndefined();
  });

  it("preenche defaults nas faixas quando objeto vazio", () => {
    const r = SCRDataSchema.parse({ faixasAVencer: {} });
    expect(r.faixasAVencer?.ate30d).toBe("0,00");
    expect(r.faixasAVencer?.total).toBe("0,00");
  });
});

describe("safeParseExtracted", () => {
  it("retorna data + warnings vazio em sucesso", () => {
    const r = safeParseExtracted(CNPJDataSchema, { razaoSocial: "X" }, "cnpj");
    expect(r.warnings).toEqual([]);
    expect(r.data.razaoSocial).toBe("X");
  });

  it("nunca lança — retorna input cru se schema falha hard", () => {
    // schemas atuais são leniencientes — força falha com tipo errado
    const r = safeParseExtracted(SCRDataSchema, "string-invalida", "scr");
    expect(r).toHaveProperty("data");
  });
});

describe("auditBusinessRules — CNPJ", () => {
  it("avisa quando CNPJ tem !=14 dígitos", () => {
    const w = auditBusinessRules("cnpj", { cnpj: "12345" });
    expect(w).toHaveLength(1);
    expect(w[0].field).toBe("cnpj");
    expect(w[0].message).toMatch(/5 digitos/);
  });

  it("não avisa para CNPJ válido (14 dígitos)", () => {
    const w = auditBusinessRules("cnpj", { cnpj: "12345678000190" });
    expect(w).toHaveLength(0);
  });

  it("não avisa para CNPJ vazio", () => {
    expect(auditBusinessRules("cnpj", { cnpj: "" })).toEqual([]);
  });
});

describe("auditBusinessRules — QSA participação", () => {
  it("avisa soma de participação > 101%", () => {
    const w = auditBusinessRules("qsa", {
      quadroSocietario: [{ participacao: "60" }, { participacao: "60" }],
    });
    expect(w.find(x => x.field === "participacao")).toBeDefined();
  });

  it("avisa soma muito menor que 100% com >=2 sócios", () => {
    const w = auditBusinessRules("qsa", {
      quadroSocietario: [{ participacao: "30" }, { participacao: "30" }],
    });
    expect(w.find(x => x.field === "participacao")).toBeDefined();
  });

  it("não avisa quando soma ~100%", () => {
    const w = auditBusinessRules("qsa", {
      quadroSocietario: [{ participacao: "50" }, { participacao: "50" }],
    });
    expect(w.find(x => x.field === "participacao")).toBeUndefined();
  });

  it("aceita formato com vírgula decimal (50,5%)", () => {
    const w = auditBusinessRules("qsa", {
      quadroSocietario: [{ participacao: "50,5" }, { participacao: "49,5" }],
    });
    expect(w.find(x => x.field === "participacao")).toBeUndefined();
  });
});

describe("auditBusinessRules — SCR", () => {
  it("avisa contradição semHistorico=true + totalDividasAtivas>0", () => {
    const w = auditBusinessRules("scr", {
      semHistorico: true,
      totalDividasAtivas: "1000,00",
      periodoReferencia: "01/2024",
    });
    expect(w.find(x => x.field === "semHistorico")).toBeDefined();
  });

  it("avisa periodoReferencia ausente", () => {
    const w = auditBusinessRules("scr", { periodoReferencia: "" });
    expect(w.find(x => x.field === "periodoReferencia")).toBeDefined();
  });
});

describe("auditBusinessRules — Faturamento", () => {
  it("avisa meses com valor zero", () => {
    const w = auditBusinessRules("faturamento", {
      meses: [
        { mes: "01/2024", valor: "100" },
        { mes: "02/2024", valor: "0" },
      ],
    });
    expect(w.find(x => x.field === "meses")).toBeDefined();
  });

  it("não avisa quando todos meses têm valor", () => {
    const w = auditBusinessRules("faturamento", {
      meses: [{ mes: "01/2024", valor: "100" }],
    });
    expect(w).toEqual([]);
  });
});

describe("auditBusinessRules — entradas inválidas", () => {
  it("retorna [] para null/string", () => {
    expect(auditBusinessRules("cnpj", null)).toEqual([]);
    expect(auditBusinessRules("cnpj", "x")).toEqual([]);
  });
});
