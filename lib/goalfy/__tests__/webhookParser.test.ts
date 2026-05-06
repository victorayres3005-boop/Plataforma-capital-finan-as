import { describe, it, expect } from "vitest";
import {
  extractDocuments,
  extractMeta,
  mapDocType,
  isUrl,
  safeFilenameFromUrl,
  toCollectionType,
} from "@/lib/goalfy/webhookParser";

describe("isUrl", () => {
  it("aceita http e https", () => {
    expect(isUrl("https://x.com/a.pdf")).toBe(true);
    expect(isUrl("http://x.com")).toBe(true);
  });
  it("rejeita strings sem protocolo (caminho interno Goalfy)", () => {
    expect(isUrl("uuid/file.pdf")).toBe(false);
    expect(isUrl("/api/x")).toBe(false);
    expect(isUrl("")).toBe(false);
    expect(isUrl(null)).toBe(false);
    expect(isUrl(undefined)).toBe(false);
    expect(isUrl(42)).toBe(false);
  });
});

describe("mapDocType", () => {
  it("match exato em label canônico (lowercase + acentos)", () => {
    expect(mapDocType("Contrato Social")).toBe("contrato_social");
    expect(mapDocType("DRE")).toBe("dre");
    expect(mapDocType("Balanço")).toBe("balanco");
  });

  it("aceita label sem acentos (resilência)", () => {
    expect(mapDocType("Balanco")).toBe("balanco");
    expect(mapDocType("Relatorio de visitas")).toBe("relatorio_visita");
    expect(mapDocType("Última alteração contratual")).toBe("contrato_social");
    expect(mapDocType("Ultima alteracao contratual")).toBe("contrato_social");
  });

  it("retorna 'outro' quando label não reconhecido", () => {
    expect(mapDocType("Documento Aleatório")).toBe("outro");
    expect(mapDocType("")).toBe("outro");
  });

  it("é case-insensitive", () => {
    expect(mapDocType("SCR")).toBe("scr");
    expect(mapDocType("scr")).toBe("scr");
    expect(mapDocType("CrEdItHuB")).toBe("scr");
  });
});

describe("extractDocuments", () => {
  it("Padrão 1 — campo direto com URL", () => {
    const docs = extractDocuments({ "contrato social": "https://s3.amazonaws.com/x.pdf" });
    expect(docs).toEqual([
      { title: "contrato social", url: "https://s3.amazonaws.com/x.pdf" },
    ]);
  });

  it("Padrão 2 — array de URLs", () => {
    const docs = extractDocuments({
      documentos: ["https://x.com/a.pdf", "https://x.com/b.pdf"],
    });
    expect(docs).toHaveLength(2);
    expect(docs[0].url).toContain("a.pdf");
  });

  it("Padrão 3 — array de objetos com url/link/download_url", () => {
    const docs = extractDocuments({
      anexos: [
        { nome: "doc.pdf", url: "https://x.com/doc.pdf" },
        { filename: "out.pdf", link: "https://x.com/out.pdf" },
        { title: "z.pdf", download_url: "https://x.com/z.pdf" },
      ],
    });
    expect(docs).toHaveLength(3);
    expect(docs[0].title).toBe("doc.pdf");
    expect(docs[1].title).toBe("out.pdf");
  });

  it("Padrão 4 — campo raiz 'link' ou 'url' único", () => {
    const docs = extractDocuments({ link: "https://x.com/single.pdf" });
    expect(docs).toEqual([{ title: "documento", url: "https://x.com/single.pdf" }]);
  });

  it("Padrão 5 — fields como array de pares name/value", () => {
    const docs = extractDocuments({
      fields: [
        { name: "DRE", value: "https://x.com/dre.pdf" },
        { nome: "Faturamento", valor: "https://x.com/fat.pdf" },
      ],
    });
    expect(docs).toHaveLength(2);
    expect(docs.find(d => d.title === "DRE")?.url).toContain("dre.pdf");
    expect(docs.find(d => d.title === "Faturamento")?.url).toContain("fat.pdf");
  });

  it("ignora campos textuais conhecidos (cnpj, gerente, telefone, etc.)", () => {
    const docs = extractDocuments({
      cnpj: "12.345.678/0001-90",
      gerente: "João Silva",
      telefone: "11999999999",
      "contrato social": "https://x.com/c.pdf",
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("contrato social");
  });

  it("não duplica URLs (Padrão 4 + outros)", () => {
    const docs = extractDocuments({
      "scr": "https://x.com/scr.pdf",
      link: "https://x.com/scr.pdf", // mesma URL
    });
    expect(docs).toHaveLength(1);
  });

  it("ignora caminhos internos sem http (regressão hipótese URL não-pública)", () => {
    const docs = extractDocuments({
      "contrato social": "uuid/internal-path.pdf",
      "dre": "https://x.com/dre.pdf",
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("dre");
  });

  it("retorna [] para payload sem URLs", () => {
    expect(extractDocuments({ cnpj: "123", gerente: "X" })).toEqual([]);
    expect(extractDocuments({})).toEqual([]);
  });
});

describe("extractMeta", () => {
  it("aceita razão social em múltiplos formatos", () => {
    expect(extractMeta({ razaoSocial: "Acme" }).razao).toBe("Acme");
    expect(extractMeta({ "Razão Social": "Acme" }).razao).toBe("Acme");
    expect(extractMeta({ company_name: "Acme" }).razao).toBe("Acme");
    expect(extractMeta({ empresa: "Acme" }).razao).toBe("Acme");
  });

  it("usa fallback quando razão social ausente", () => {
    expect(extractMeta({}).razao).toBe("Empresa não identificada");
  });

  it("strippa não-dígitos do CNPJ", () => {
    expect(extractMeta({ cnpj: "12.345.678/0001-90" }).cnpj).toBe("12345678000190");
    expect(extractMeta({ CNPJ: "12345678000190" }).cnpj).toBe("12345678000190");
  });

  it("aceita gerente em múltiplos formatos", () => {
    expect(extractMeta({ gerente: "X" }).gerente).toBe("X");
    expect(extractMeta({ "Gerente de Vendas": "Y" }).gerente).toBe("Y");
    expect(extractMeta({ manager: "Z" }).gerente).toBe("Z");
  });

  it("preserva phone, email e notes (campos receber-only)", () => {
    const m = extractMeta({
      telefone: "11999",
      email: "x@y.com",
      observacoes: "obs",
    });
    expect(m.phone).toBe("11999");
    expect(m.email).toBe("x@y.com");
    expect(m.notes).toBe("obs");
  });

  it("cardId vazio quando body não tem id (caller deve gerar UUID)", () => {
    expect(extractMeta({}).cardId).toBe("");
  });

  it("aceita id em múltiplos formatos", () => {
    expect(extractMeta({ cardId: "abc" }).cardId).toBe("abc");
    expect(extractMeta({ id: "def" }).cardId).toBe("def");
    expect(extractMeta({ card_id: "ghi" }).cardId).toBe("ghi");
  });
});

describe("toCollectionType", () => {
  it("mapeia scr para scr_bacen (CollectionDocument.type canônico)", () => {
    expect(toCollectionType("scr")).toBe("scr_bacen");
  });

  it("preserva tipos que já são canônicos", () => {
    expect(toCollectionType("contrato_social")).toBe("contrato_social");
    expect(toCollectionType("faturamento")).toBe("faturamento");
    expect(toCollectionType("dre")).toBe("dre");
    expect(toCollectionType("ir_socio")).toBe("ir_socio");
    expect(toCollectionType("relatorio_visita")).toBe("relatorio_visita");
    expect(toCollectionType("balanco")).toBe("balanco");
    expect(toCollectionType("curva_abc")).toBe("curva_abc");
    expect(toCollectionType("qsa")).toBe("qsa");
    expect(toCollectionType("outro")).toBe("outro");
  });

  it("retorna o tipo cru quando desconhecido (fallback)", () => {
    expect(toCollectionType("xpto")).toBe("xpto");
  });
});

describe("safeFilenameFromUrl", () => {
  it("extrai nome do arquivo da URL", () => {
    expect(safeFilenameFromUrl("https://x.com/folder/contrato.pdf", "fb")).toBe(
      "contrato.pdf",
    );
  });

  it("ignora query string", () => {
    expect(
      safeFilenameFromUrl(
        "https://s3.amazonaws.com/folder/doc.pdf?X-Amz-Signature=abc",
        "fb",
      ),
    ).toBe("doc.pdf");
  });

  it("decodifica caracteres URL-encoded", () => {
    expect(
      safeFilenameFromUrl("https://x.com/contrato%20social.pdf", "fb"),
    ).toBe("contrato_social.pdf"); // espaço vira _
  });

  it("usa fallback quando URL malformada", () => {
    expect(safeFilenameFromUrl("https://x.com/", "fallback.pdf")).toBe(
      "fallback.pdf",
    );
  });

  it("strippa caracteres especiais não permitidos", () => {
    expect(safeFilenameFromUrl("https://x.com/doc#weird&name.pdf", "fb")).toBe(
      "doc_weird_name.pdf",
    );
  });
});
