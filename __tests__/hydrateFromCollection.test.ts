import { describe, it, expect } from "vitest";
import { hydrateFromCollection, defaultData } from "@/lib/hydrateFromCollection";

describe("hydrateFromCollection", () => {
  it("retorna defaultData quando docs vazio", () => {
    const result = hydrateFromCollection([]);
    expect(result.cnpj.razaoSocial).toBe("");
    expect(result.faturamento.somatoriaAno).toBe("0,00");
    expect(result.scrAnterior).toBeNull();
  });

  it("hidrata cnpj corretamente", () => {
    const docs = [
      { type: "cnpj", extracted_data: { razaoSocial: "Empresa Teste LTDA", cnpj: "12345678000190", situacaoCadastral: "ATIVA" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.cnpj.razaoSocial).toBe("Empresa Teste LTDA");
    expect(result.cnpj.cnpj).toBe("12345678000190");
    expect(result.cnpj.situacaoCadastral).toBe("ATIVA");
  });

  it("hidrata faturamento com meses", () => {
    const docs = [
      { type: "faturamento", extracted_data: { meses: [{ mes: "01/2025", valor: "100.000,00" }], somatoriaAno: "1.200.000,00", mediaAno: "100.000,00" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.faturamento.somatoriaAno).toBe("1.200.000,00");
    expect(result.faturamento.meses).toHaveLength(1);
  });

  it("hidrata SCR empresa com 1 documento", () => {
    const docs = [
      { type: "scr_bacen", extracted_data: { tipoPessoa: "PJ", totalDividasAtivas: "500.000,00", periodoReferencia: "02/2025" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.scr.totalDividasAtivas).toBe("500.000,00");
    expect(result.scrAnterior).toBeNull();
  });

  it("hidrata SCR empresa com 2 documentos (atual + anterior)", () => {
    const docs = [
      { type: "scr_bacen", extracted_data: { tipoPessoa: "PJ", totalDividasAtivas: "500.000,00", periodoReferencia: "02/2025" } },
      { type: "scr_bacen", extracted_data: { tipoPessoa: "PJ", totalDividasAtivas: "400.000,00", periodoReferencia: "12/2024" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.scr.totalDividasAtivas).toBe("500.000,00");
    expect(result.scr.periodoReferencia).toBe("02/2025");
    expect(result.scrAnterior).not.toBeNull();
    expect(result.scrAnterior!.totalDividasAtivas).toBe("400.000,00");
  });

  it("separa SCR PJ de SCR PF (socios)", () => {
    const docs = [
      { type: "scr_bacen", extracted_data: { tipoPessoa: "PJ", totalDividasAtivas: "500.000,00", periodoReferencia: "02/2025" } },
      { type: "scr_bacen", extracted_data: { tipoPessoa: "PF", cpfSCR: "111.222.333-44", nomeCliente: "Joao", totalDividasAtivas: "50.000,00", periodoReferencia: "02/2025" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.scr.totalDividasAtivas).toBe("500.000,00");
    expect(result.scrSocios).toHaveLength(1);
    expect(result.scrSocios![0].nomeSocio).toBe("Joao");
  });

  it("hidrata irSocios como array", () => {
    const docs = [
      { type: "ir_socio", extracted_data: { nomeSocio: "Socio 1", cpfSocio: "111.222.333-44" } },
      { type: "ir_socio", extracted_data: { nomeSocio: "Socio 2", cpfSocio: "555.666.777-88" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.irSocios).toHaveLength(2);
    expect((result.irSocios as Record<string, unknown>[])[0].nomeSocio).toBe("Socio 1");
    expect((result.irSocios as Record<string, unknown>[])[1].nomeSocio).toBe("Socio 2");
  });

  it("hidrata relatorio de visita", () => {
    const docs = [
      { type: "relatorio_visita", extracted_data: { dataVisita: "10/04/2025", responsavelVisita: "Ana", referenciasFornecedores: "Fornecedor A, Fornecedor B" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.relatorioVisita?.dataVisita).toBe("10/04/2025");
    expect(result.relatorioVisita?.referenciasFornecedores).toBe("Fornecedor A, Fornecedor B");
  });

  it("remove _editedManually dos dados", () => {
    const docs = [
      { type: "cnpj", extracted_data: { razaoSocial: "Teste", _editedManually: true } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.cnpj.razaoSocial).toBe("Teste");
    expect((result.cnpj as Record<string, unknown>)._editedManually).toBeUndefined();
  });

  it("ignora tipos desconhecidos sem erro", () => {
    const docs = [
      { type: "tipo_desconhecido", extracted_data: { campo: "valor" } },
    ];
    const result = hydrateFromCollection(docs);
    expect(result.cnpj.razaoSocial).toBe("");
  });
});
