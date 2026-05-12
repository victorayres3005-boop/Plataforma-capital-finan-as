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
  if (data.faturamento.meses.length > 0 || (data.faturamento.somatoriaAno && data.faturamento.somatoriaAno !== "0,00")) {
    docs.push({ type: "faturamento", filename: "faturamento.pdf", extracted_data: asRec(data.faturamento), uploaded_at: ts() });
  }
  if (data.scr.periodoReferencia || data.scr.carteiraAVencer || data.scr.totalDividasAtivas ||
      data.scr.qtdeInstituicoes || data.scr.vencidos || data.scr.operacoesEmAtraso ||
      data.scr.carteiraCurtoPrazo || (data.scr.modalidades && data.scr.modalidades.length > 0)) {
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
  // Salva protestos se o documento foi extraído — mesmo com zero protestos (vigentesQtd="0")
  // A string vazia "" indica estado padrão nunca preenchido; "0" indica extração confirmando ausência
  if (data.protestos && (data.protestos.vigentesQtd !== "" || data.protestos.regularizadosQtd !== "" || data.protestos.detalhes.length > 0)) {
    docs.push({ type: "protestos", filename: "protestos.pdf", extracted_data: asRec(data.protestos), uploaded_at: ts() });
  }
  // Mesma lógica para processos: passivosTotal="0" indica extração confirmando ausência
  if (data.processos && (data.processos.passivosTotal !== "" || data.processos.ativosTotal !== "" || data.processos.valorTotalEstimado !== "" || data.processos.distribuicao.length > 0 || data.processos.temRJ)) {
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
  if (data.curvaABC && (data.curvaABC.clientes?.length > 0 || data.curvaABC.maiorCliente || data.curvaABC.periodoReferencia || data.curvaABC.totalClientesNaBase || data.curvaABC.concentracaoTop3 || data.curvaABC.concentracaoTop5)) {
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
  // Serialização robusta (auditoria M7 2026-05-12): antes só persistia se
  // dataVisita/responsavelVisita/descricaoEstrutura/observacoesLivres estavam
  // preenchidos. RelatorioVisita tem ~50 campos opcionais (parâmetros
  // operacionais, sugestaoAnalista, contatos). Se user só preenche limite/taxa
  // sem visita formal, tudo se perdia. Agora checa se QUALQUER campo string
  // não-vazio existe.
  if (data.relatorioVisita) {
    const rv = data.relatorioVisita as Record<string, unknown>;
    const hasAnyField = Object.values(rv).some(v => {
      if (typeof v === "string") return v.trim().length > 0;
      if (typeof v === "boolean") return v === true;
      if (typeof v === "number") return Number.isFinite(v) && v !== 0;
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === "object") return Object.keys(v).length > 0;
      return false;
    });
    if (hasAnyField) {
      docs.push({ type: "relatorio_visita" as CollectionDocument["type"], filename: "relatorio-visita.pdf", extracted_data: asRec(data.relatorioVisita), uploaded_at: ts() });
    }
  }
  if (data.ccf && (data.ccf.qtdRegistros > 0 || (data.ccf.bancos && data.ccf.bancos.length > 0))) {
    docs.push({ type: "ccf" as CollectionDocument["type"], filename: "ccf.pdf", extracted_data: asRec(data.ccf), uploaded_at: ts() });
  }
  if (data.dividaAtiva && (data.dividaAtiva.qtdRegistros > 0 || data.dividaAtiva.certidaoNegativa)) {
    docs.push({ type: "divida_ativa" as CollectionDocument["type"], filename: "divida-ativa.pdf", extracted_data: asRec(data.dividaAtiva), uploaded_at: ts() });
  }
  if (data.cenprot && (data.cenprot.qtdRegistros > 0 || data.cenprot.certidaoNegativa)) {
    docs.push({ type: "cenprot" as CollectionDocument["type"], filename: "cenprot.pdf", extracted_data: asRec(data.cenprot), uploaded_at: ts() });
  }
  if (data.gefip && ((data.gefip.competencias?.length ?? 0) > 0 || data.gefip.competenciaInicio)) {
    docs.push({ type: "gefip" as CollectionDocument["type"], filename: "gefip.pdf", extracted_data: asRec(data.gefip), uploaded_at: ts() });
  }
  const temSacadosAnalisados = (data.sacadosAnalisados?.length ?? 0) > 0;
  const temAnaliseContabil = !!(data.analiseContabil && data.analiseContabil.trim());
  if (data.score || (data.bureausConsultados && data.bureausConsultados.length > 0) || temSacadosAnalisados || temAnaliseContabil) {
    docs.push({
      type: "bureau_meta" as CollectionDocument["type"],
      filename: "bureau-meta.json",
      extracted_data: asRec({
        score: data.score ?? null,
        bureausConsultados: data.bureausConsultados ?? [],
        sacadosAnalisados: data.sacadosAnalisados ?? [],
        analiseContabil: data.analiseContabil ?? "",
      }),
      uploaded_at: ts(),
    });
  }
  return docs;
}
