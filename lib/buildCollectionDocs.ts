import { ExtractedData, CollectionDocument } from "@/types";

// Constroi o array de CollectionDocument que vai pro campo `documents`
// da tabela `document_collections`. Reaproveitado pelo auto-save em app/page.tsx
// e pelo save explicito no GenerateStep. Funcao pura — sem side effects.
export function buildCollectionDocs(data: ExtractedData): CollectionDocument[] {
  const docs: CollectionDocument[] = [];
  const asRec = (o: object) => o as unknown as Record<string, unknown>;
  const ts = () => new Date().toISOString();

  if (data.cnpj.cnpj || data.cnpj.razaoSocial) {
    docs.push({ type: "cnpj", filename: "cartao-cnpj.pdf", extracted_data: asRec(data.cnpj), uploaded_at: ts() });
  }
  if (data.qsa.quadroSocietario.some(s => s.nome)) {
    docs.push({ type: "qsa", filename: "qsa.pdf", extracted_data: asRec(data.qsa), uploaded_at: ts() });
  }
  const c = data.contrato;
  const contratoTemDados = !!(
    c.capitalSocial || c.objetoSocial || c.dataConstituicao ||
    c.administracao || c.foro || c.prazoDuracao || c.temAlteracoes ||
    (c.socios && c.socios.some(s => s.nome))
  );
  if (contratoTemDados) {
    docs.push({ type: "contrato_social", filename: "contrato-social.pdf", extracted_data: asRec(data.contrato), uploaded_at: ts() });
  }
  if (data.faturamento.meses.length > 0 || data.faturamento.somatoriaAno) {
    docs.push({ type: "faturamento", filename: "faturamento.pdf", extracted_data: asRec(data.faturamento), uploaded_at: ts() });
  }
  if (data.scr.totalDividasAtivas || data.scr.operacoesEmAtraso) {
    docs.push({ type: "scr_bacen", filename: "scr-bacen.pdf", extracted_data: asRec({ ...data.scr, tipoPessoa: "PJ" }), uploaded_at: ts() });
  }
  if (data.scrAnterior) {
    docs.push({ type: "scr_bacen", filename: "scr-anterior.pdf", extracted_data: asRec({ ...data.scrAnterior, tipoPessoa: "PJ" }), uploaded_at: ts() });
  }
  if (data.scrSocios && data.scrSocios.length > 0) {
    data.scrSocios.forEach((socio, i) => {
      if (socio.periodoAtual) {
        docs.push({
          type: "scr_bacen",
          filename: `scr-socio-${i + 1}.pdf`,
          extracted_data: asRec({
            ...socio.periodoAtual,
            tipoPessoa: "PF",
            nomeCliente: socio.periodoAtual.nomeCliente || socio.nomeSocio,
            cpfSCR: socio.periodoAtual.cpfSCR || socio.cpfSocio,
          }),
          uploaded_at: ts(),
        });
      }
      if (socio.periodoAnterior) {
        docs.push({
          type: "scr_bacen",
          filename: `scr-socio-${i + 1}-anterior.pdf`,
          extracted_data: asRec({
            ...socio.periodoAnterior,
            tipoPessoa: "PF",
            nomeCliente: socio.periodoAnterior.nomeCliente || socio.nomeSocio,
            cpfSCR: socio.periodoAnterior.cpfSCR || socio.cpfSocio,
          }),
          uploaded_at: ts(),
        });
      }
    });
  }
  if (data.protestos && (parseInt(data.protestos.vigentesQtd) > 0 || parseInt(data.protestos.regularizadosQtd) > 0 || data.protestos.detalhes.length > 0)) {
    docs.push({ type: "protestos", filename: "protestos.pdf", extracted_data: asRec(data.protestos), uploaded_at: ts() });
  }
  if (data.processos && (data.processos.passivosTotal || data.processos.ativosTotal || data.processos.distribuicao.length > 0)) {
    docs.push({ type: "processos", filename: "processos.pdf", extracted_data: asRec(data.processos), uploaded_at: ts() });
  }
  if (data.grupoEconomico && data.grupoEconomico.empresas.length > 0) {
    docs.push({ type: "grupo_economico", filename: "grupo-economico.pdf", extracted_data: asRec(data.grupoEconomico), uploaded_at: ts() });
  }
  if (data.dre && (data.dre.anos?.length > 0 || data.dre.crescimentoReceita || data.dre.observacoes)) {
    docs.push({ type: "dre" as CollectionDocument["type"], filename: "dre.pdf", extracted_data: asRec(data.dre), uploaded_at: ts() });
  }
  if (data.balanco && (data.balanco.anos?.length > 0 || data.balanco.observacoes || data.balanco.tendenciaPatrimonio)) {
    docs.push({ type: "balanco" as CollectionDocument["type"], filename: "balanco.pdf", extracted_data: asRec(data.balanco), uploaded_at: ts() });
  }
  if (data.curvaABC && (data.curvaABC.clientes?.length > 0 || data.curvaABC.maiorCliente || data.curvaABC.periodoReferencia)) {
    docs.push({ type: "curva_abc" as CollectionDocument["type"], filename: "curva-abc.pdf", extracted_data: asRec(data.curvaABC), uploaded_at: ts() });
  }
  if (data.irSocios && data.irSocios.length > 0) {
    data.irSocios.forEach((ir, i) => docs.push({
      type: "ir_socio" as CollectionDocument["type"],
      filename: `ir-socio-${i + 1}.pdf`,
      extracted_data: asRec(ir),
      uploaded_at: ts(),
    }));
  }
  if (data.relatorioVisita && (data.relatorioVisita.dataVisita || data.relatorioVisita.responsavelVisita || data.relatorioVisita.descricaoEstrutura || data.relatorioVisita.observacoesLivres)) {
    docs.push({ type: "relatorio_visita" as CollectionDocument["type"], filename: "relatorio-visita.pdf", extracted_data: asRec(data.relatorioVisita), uploaded_at: ts() });
  }
  return docs;
}
