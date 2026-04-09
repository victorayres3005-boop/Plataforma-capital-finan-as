// Excel report generator
import type { ExtractedData, AIAnalysis, FundValidationResult } from "@/types";

type AlertSeverity = "ALTA" | "MODERADA" | "INFO";
interface Alert { message: string; severity: AlertSeverity; impacto?: string; }

export interface ExcelReportParams {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  alerts: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  companyAge: string;
  protestosVigentes: number;
  fundValidation?: FundValidationResult;
}

function parseMoneyToNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
}

export async function buildExcelReport(p: ExcelReportParams): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data, decision, finalRating, alerts, pontosFortes, pontosFracos, companyAge, protestosVigentes, fundValidation } = p;

      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Capital Financas";
      wb.created = new Date();

      const NAVY = "FF203B88"; const GREEN = "FF73B815"; const WARNING = "FFD97706";
      const SURFACE = "FFF5F7FB"; const STRIPE = "FFEDF2FB";
      const BORDER_C = "FFD1DCF0"; const TEXT = "FF111827"; const MUTED = "FF6B7280"; const WHITE = "FFFFFFFF";
      const DANGER = "FFDC2626";

      const F = (c: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: c } });
      const B = { style: "thin" as const, color: { argb: BORDER_C } };
      const BD = { top: B, bottom: B, left: B, right: B };
      const genDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const footerDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const ws = wb.addWorksheet("Relatorio Capital Financas");
      ws.columns = [{ width: 2.5 }, { width: 28 }, { width: 28 }, { width: 20 }, { width: 14 }, { width: 2.5 }];
      ws.views = [{ showGridLines: false }];

      let r = 1;

      // -- HEADER BRANDED --
      ws.mergeCells(r, 1, r, 6);
      ws.getRow(r).height = 48;
      const h = ws.getRow(r).getCell(1);
      h.value = "     capital financas"; h.font = { bold: true, size: 20, color: { argb: WHITE }, name: "Arial" };
      h.fill = F(NAVY); h.alignment = { vertical: "middle" };
      r++;

      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 5; ws.getRow(r).getCell(1).fill = F(GREEN); r++;

      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 24;
      const sub = ws.getRow(r).getCell(1);
      sub.value = "     RELATORIO CONSOLIDADO  —  Consolidador de Documentos";
      sub.font = { size: 10, color: { argb: MUTED }, name: "Arial" }; sub.fill = F(SURFACE); sub.alignment = { vertical: "middle" };
      r++;

      ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 22;
      const info = ws.getRow(r).getCell(1);
      info.value = `     ${data.cnpj.razaoSocial || "Empresa"}  |  CNPJ: ${data.cnpj.cnpj || "—"}  |  Rating: ${finalRating}/10  |  ${decision}  |  ${genDate}`;
      info.font = { size: 10, bold: true, color: { argb: NAVY }, name: "Arial" }; info.fill = F(STRIPE); info.alignment = { vertical: "middle" };
      r++; r++;

      // -- HELPERS --
      const secTitle = (num: string, title: string, color: string) => {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).height = 30;
        const c = ws.getRow(r).getCell(2);
        c.value = `  ${num}    ${title}`;
        c.font = { bold: true, size: 13, color: { argb: color }, name: "Arial" };
        c.fill = F(SURFACE);
        c.border = { left: { style: "medium" as const, color: { argb: color.replace("FF", "") } }, bottom: B };
        c.alignment = { vertical: "middle" };
        r++; r++;
      };

      const field2 = (label: string, value: string, i: number) => {
        const bg = i % 2 === 0 ? STRIPE : WHITE;
        ws.mergeCells(r, 3, r, 5);
        ws.getRow(r).height = 24;
        const cl = ws.getRow(r).getCell(2);
        cl.value = label; cl.font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        cl.fill = F(bg); cl.border = BD; cl.alignment = { vertical: "middle" };
        const cv = ws.getRow(r).getCell(3);
        cv.value = value || "—"; cv.font = { size: 11, color: { argb: TEXT }, name: "Arial", bold: !!value };
        cv.fill = F(bg); cv.border = BD; cv.alignment = { vertical: "middle", wrapText: true };
        r++;
      };

      const xlSpacer = () => { ws.getRow(r).height = 10; r++; };

      const xlTable = (headers: string[], rows: string[][], headerColor: string) => {
        const hRow = ws.getRow(r);
        hRow.height = 26;
        headers.forEach((hdr, i) => {
          const c = hRow.getCell(i + 2);
          c.value = hdr; c.font = { bold: true, size: 9, color: { argb: WHITE }, name: "Arial" };
          c.fill = F(headerColor); c.border = BD; c.alignment = { vertical: "middle", horizontal: "center" };
        });
        r++;
        rows.forEach((row, i) => {
          const xlRow = ws.getRow(r);
          xlRow.height = 24;
          const bg = i % 2 === 0 ? STRIPE : WHITE;
          row.forEach((v, ci) => {
            const c = xlRow.getCell(ci + 2);
            c.value = v; c.font = { size: 10, color: { argb: TEXT }, name: "Arial" };
            c.fill = F(bg); c.border = BD; c.alignment = { vertical: "middle" };
          });
          r++;
        });
      };

      // ======= SECAO FS: PARAMETROS DO FUNDO =======
      if (fundValidation && fundValidation.criteria.length > 0) {
        const fv = fundValidation;
        const FS_OK = "FF166534"; const FS_WARN = "FF92400E"; const FS_ERR = "FF991B1B";
        const FS_OK_BG = "FFDCFCE7"; const FS_WARN_BG = "FFFEF3C7"; const FS_ERR_BG = "FFFEE2E2";

        const fsColor = fv.hasEliminatoria ? "FFDC2626" : fv.warnCount > 0 ? "FFD97706" : "FF166534";
        secTitle("FS", "CONFORMIDADE COM PARAMETROS DO FUNDO", fsColor);

        // Summary banner
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).height = 28;
        const fsBanner = ws.getRow(r).getCell(2);
        fsBanner.value = fv.hasEliminatoria
          ? `  ATENCAO: criterio eliminatorio nao atendido — ${fv.failCount} reprovado(s), ${fv.passCount} de ${fv.criteria.length} aprovados`
          : fv.warnCount > 0
            ? `  ${fv.passCount} criterios aprovados · ${fv.warnCount} atencao · ${fv.failCount} reprovado(s) de ${fv.criteria.length}`
            : `  Todos os ${fv.passCount} criterios atendidos — empresa elegivel`;
        fsBanner.font = { bold: true, size: 11, color: { argb: fv.hasEliminatoria ? FS_ERR : fv.warnCount > 0 ? FS_WARN : FS_OK }, name: "Arial" };
        fsBanner.fill = F(fv.hasEliminatoria ? FS_ERR_BG : fv.warnCount > 0 ? FS_WARN_BG : FS_OK_BG);
        fsBanner.border = BD;
        fsBanner.alignment = { vertical: "middle" };
        r++;

        xlSpacer();

        // Table header
        const fsHdr = ws.getRow(r);
        fsHdr.height = 26;
        ["CRITERIO", "LIMITE DO FUNDO", "APURADO", "STATUS"].forEach((hdr, i) => {
          const c = fsHdr.getCell(i + 2);
          c.value = hdr; c.font = { bold: true, size: 9, color: { argb: WHITE }, name: "Arial" };
          c.fill = F("FF1E3A7A"); c.border = BD; c.alignment = { vertical: "middle", horizontal: "center" };
        });
        r++;

        // Criterion rows
        fv.criteria.forEach((cr, i) => {
          const bg = cr.status === "ok" ? (i % 2 === 0 ? FS_OK_BG : "FFFFFFFF") : cr.status === "warning" ? (i % 2 === 0 ? FS_WARN_BG : "FFFFFFFF") : cr.status === "error" ? FS_ERR_BG : (i % 2 === 0 ? STRIPE : WHITE);
          const txtColor = cr.status === "ok" ? FS_OK : cr.status === "warning" ? FS_WARN : cr.status === "error" ? FS_ERR : MUTED;
          const icon = cr.status === "ok" ? "✓" : cr.status === "warning" ? "!" : cr.status === "error" ? "✕" : "?";
          const statusLabel = cr.status === "ok" ? "APROVADO" : cr.status === "warning" ? "ATENCAO" : cr.status === "error" ? "REPROVADO" : "S/DADO";

          const xlRow = ws.getRow(r);
          xlRow.height = 24;

          const c1 = xlRow.getCell(2);
          c1.value = `${icon}  ${cr.label}${cr.eliminatoria && cr.status === "error" ? " *" : ""}`;
          c1.font = { size: 10, bold: cr.status === "error", color: { argb: TEXT }, name: "Arial" };
          c1.fill = F(bg); c1.border = BD; c1.alignment = { vertical: "middle" };

          const c2 = xlRow.getCell(3);
          c2.value = cr.threshold;
          c2.font = { size: 10, color: { argb: MUTED }, name: "Arial" };
          c2.fill = F(bg); c2.border = BD; c2.alignment = { vertical: "middle" };

          const c3 = xlRow.getCell(4);
          c3.value = cr.actual;
          c3.font = { size: 10, bold: true, color: { argb: txtColor }, name: "Arial" };
          c3.fill = F(bg); c3.border = BD; c3.alignment = { vertical: "middle" };

          const c4 = xlRow.getCell(5);
          c4.value = statusLabel;
          c4.font = { size: 10, bold: true, color: { argb: txtColor }, name: "Arial" };
          c4.fill = F(bg); c4.border = BD; c4.alignment = { vertical: "middle", horizontal: "center" };

          r++;
        });

        // Footnote if eliminatorio failed
        if (fv.criteria.some(c => c.eliminatoria && c.status === "error")) {
          xlSpacer();
          ws.mergeCells(r, 2, r, 5);
          const fn = ws.getRow(r).getCell(2);
          fn.value = "* Criterio eliminatorio — impede aprovacao pelos parametros configurados do fundo";
          fn.font = { size: 9, italic: true, color: { argb: FS_ERR }, name: "Arial" };
          r++;
        }

        xlSpacer(); xlSpacer();
      }

      // ======= SECAO 01: IDENTIFICACAO =======
      secTitle("01", "IDENTIFICACAO DA EMPRESA", NAVY);
      [
        ["Razao Social", data.cnpj.razaoSocial], ["Nome Fantasia", data.cnpj.nomeFantasia],
        ["CNPJ", data.cnpj.cnpj], ["Data de Abertura", data.cnpj.dataAbertura],
        ["Situacao Cadastral", data.cnpj.situacaoCadastral], ["Data da Situacao", data.cnpj.dataSituacaoCadastral],
        ["Motivo da Situacao", data.cnpj.motivoSituacao], ["Natureza Juridica", data.cnpj.naturezaJuridica],
        ["CNAE Principal", data.cnpj.cnaePrincipal], ["CNAEs Secundarios", data.cnpj.cnaeSecundarios],
        ["Porte", data.cnpj.porte], ["Capital Social (CNPJ)", data.cnpj.capitalSocialCNPJ],
        ["Endereco Completo", data.cnpj.endereco],
        ["Telefone", data.cnpj.telefone], ["E-mail", data.cnpj.email],
        ...(data.cnpj.tipoEmpresa ? [["Tipo de Empresa", data.cnpj.tipoEmpresa]] : []),
        ...(data.cnpj.funcionarios ? [["Funcionários", data.cnpj.funcionarios]] : []),
        ...(data.cnpj.regimeTributario ? [["Regime Tributário", data.cnpj.regimeTributario]] : []),
        ...(data.cnpj.site ? [["Site", data.cnpj.site]] : []),
      ].forEach(([l, v], i) => field2(l, v as string, i));

      xlSpacer(); xlSpacer();

      // ======= SECAO 02: QSA =======
      secTitle("02", "QUADRO SOCIETARIO (QSA)", GREEN);
      if (data.qsa.capitalSocial) field2("Capital Social", data.qsa.capitalSocial, 0);
      xlSpacer();

      const validQSAXl = data.qsa.quadroSocietario.filter(s => s.nome);
      if (validQSAXl.length > 0) {
        xlTable(
          ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
          validQSAXl.map(s => [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", s.participacao || "—"]),
          GREEN,
        );
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhum socio encontrado no QSA";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 03: CONTRATO SOCIAL =======
      secTitle("03", "CONTRATO SOCIAL", NAVY);

      const validSociosXl = data.contrato.socios.filter(s => s.nome);
      if (validSociosXl.length > 0) {
        xlTable(
          ["NOME DO SOCIO", "CPF", "QUALIFICACAO", "PART."],
          validSociosXl.map(s => [s.nome, s.cpf || "—", s.qualificacao || "—", s.participacao || "—"]),
          NAVY,
        );
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhum socio encontrado";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }

      xlSpacer();
      [
        ["Capital Social", data.contrato.capitalSocial], ["Data de Constituicao", data.contrato.dataConstituicao],
        ["Prazo de Duracao", data.contrato.prazoDuracao], ["Foro", data.contrato.foro],
        ["Objeto Social", data.contrato.objetoSocial], ["Administracao e Poderes", data.contrato.administracao],
        ["Alteracoes Societarias", data.contrato.temAlteracoes ? "SIM — Alteracoes recentes" : "Nao identificadas"],
      ].forEach(([l, v], i) => field2(l, v as string, i));

      xlSpacer(); xlSpacer();

      // ======= SECAO 04: FATURAMENTO =======
      secTitle("04", "FATURAMENTO", GREEN);

      if (data.faturamento.faturamentoZerado) {
        field2("[ALTA] ALERTA", "Faturamento zerado no periodo", 0);
      }
      if (!data.faturamento.dadosAtualizados) {
        field2("[MODERADA] ATENCAO", `Dados desatualizados — ultimo mes: ${data.faturamento.ultimoMesComDados || "N/A"}`, 1);
      }

      [
        ["Somatoria Anual (R$)", data.faturamento.somatoriaAno],
        ["Media Mensal (R$)", data.faturamento.mediaAno],
        ["Ultimo Mes com Dados", data.faturamento.ultimoMesComDados],
      ].forEach(([l, v], i) => field2(l, v, i));

      xlSpacer();
      const validMesesXl = data.faturamento.meses.filter(m => m.mes);
      if (validMesesXl.length > 0) {
        xlTable(
          ["MES", "VALOR (R$)", "", ""],
          validMesesXl.map(m => [m.mes, m.valor || "0,00", "", ""]),
          GREEN,
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 05: SCR / BACEN =======
      secTitle("05", "PERFIL DE CREDITO — SCR / BACEN", WARNING);
      [
        ["Carteira a Vencer (R$)", data.scr.carteiraAVencer],
        ["Vencidos (R$)", data.scr.vencidos],
        ["Prejuizos (R$)", data.scr.prejuizos],
        ["Limite de Credito (R$)", data.scr.limiteCredito],
        ["Qtde Instituicoes", data.scr.qtdeInstituicoes],
        ["Qtde Operacoes", data.scr.qtdeOperacoes],
        ["Total de Dividas Ativas (R$)", data.scr.totalDividasAtivas],
        ["Classificacao de Risco (A-H)", data.scr.classificacaoRisco],
        ["Operacoes a Vencer (R$)", data.scr.operacoesAVencer],
        ["Operacoes em Atraso", data.scr.operacoesEmAtraso],
        ["Operacoes Vencidas (R$)", data.scr.operacoesVencidas],
        ["Tempo Medio de Atraso", data.scr.tempoAtraso],
        ["Coobrigacoes / Garantias (R$)", data.scr.coobrigacoes],
        ["Carteira Curto Prazo (R$)", data.scr.carteiraCurtoPrazo],
        ["Carteira Longo Prazo (R$)", data.scr.carteiraLongoPrazo],
        ["Valores Moeda Estrangeira", data.scr.valoresMoedaEstrangeira],
        ["Historico de Inadimplencia", data.scr.historicoInadimplencia],
      ].forEach(([l, v], i) => field2(l, v, i));

      // SCR Comparison
      if (data.scrAnterior) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "COMPARATIVO SCR (ANTERIOR vs ATUAL)";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        const compMetrics = [
          { label: "Carteira a Vencer", ant: data.scrAnterior.carteiraAVencer, at: data.scr.carteiraAVencer },
          { label: "Vencidos", ant: data.scrAnterior.vencidos, at: data.scr.vencidos },
          { label: "Prejuizos", ant: data.scrAnterior.prejuizos, at: data.scr.prejuizos },
          { label: "Total Dividas", ant: data.scrAnterior.totalDividasAtivas, at: data.scr.totalDividasAtivas },
          { label: "Limite Credito", ant: data.scrAnterior.limiteCredito, at: data.scr.limiteCredito },
        ];
        xlTable(
          ["METRICA", "ANTERIOR", "ATUAL", "VARIACAO"],
          compMetrics.map(m => {
            const d1 = parseMoneyToNumber(m.ant); const d2 = parseMoneyToNumber(m.at);
            const diff = d2 - d1;
            return [m.label, m.ant || "—", m.at || "—", diff === 0 ? "=" : diff > 0 ? `+${diff.toLocaleString("pt-BR")}` : diff.toLocaleString("pt-BR")];
          }),
          WARNING,
        );
      }

      // Modalidades
      if (data.scr.modalidades.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "MODALIDADES DE CREDITO";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["MODALIDADE", "TOTAL", "A VENCER", "VENCIDO"],
          data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido]),
          WARNING,
        );
      }

      // Instituicoes
      if (data.scr.instituicoes.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "INSTITUICOES CREDORAS";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["INSTITUICAO", "VALOR (R$)", "", ""],
          data.scr.instituicoes.map(i => [i.nome, i.valor, "", ""]),
          WARNING,
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 06: PROTESTOS =======
      secTitle("06", "PROTESTOS", DANGER);
      [
        ["Vigentes (Qtd)", data.protestos?.vigentesQtd || "0"],
        ["Vigentes (R$)", data.protestos?.vigentesValor || "0,00"],
        ["Regularizados (Qtd)", data.protestos?.regularizadosQtd || "0"],
        ["Regularizados (R$)", data.protestos?.regularizadosValor || "0,00"],
      ].forEach(([l, v], i) => field2(l, v, i));

      const protestoDetXl = data.protestos?.detalhes || [];
      if (protestoDetXl.length > 0) {
        xlSpacer();
        ws.columns = [{ width: 2.5 }, { width: 14 }, { width: 22 }, { width: 20 }, { width: 12 }, { width: 10 }, { width: 2.5 }];
        xlTable(
          ["DATA PROT.", "CEDENTE/APRESENTANTE", "CARTÓRIO", "VALOR (R$)", "ESPÉCIE", "STATUS"],
          protestoDetXl.map(p => [
            p.data || "—",
            p.apresentante || p.credor || "—",
            p.municipio ? `${p.municipio}/${p.uf || ""}` : (p.credor || "—"),
            p.valor || "—",
            p.especie || "—",
            p.regularizado ? "Regularizado" : "Vigente",
          ]),
          DANGER,
        );
        ws.columns = [{ width: 2.5 }, { width: 28 }, { width: 28 }, { width: 20 }, { width: 14 }, { width: 2.5 }];
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 07: PROCESSOS =======
      secTitle("07", "PROCESSOS JUDICIAIS", WARNING);
      [
        ["Passivos (Total)", data.processos?.passivosTotal || "0"],
        ["Ativos (Total)", data.processos?.ativosTotal || "0"],
        ["Valor Estimado (R$)", data.processos?.valorTotalEstimado || "0,00"],
        ["Recuperacao Judicial", data.processos?.temRJ ? "SIM" : "NAO"],
      ].forEach(([l, v], i) => field2(l, v, i));

      const distXl = data.processos?.distribuicao || [];
      if (distXl.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "DISTRIBUICAO POR TIPO";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["TIPO", "QUANTIDADE", "PERCENTUAL", ""],
          distXl.map(d => [d.tipo, d.qtd, d.pct ? `${d.pct}%` : "—", ""]),
          WARNING,
        );
      }

      const bancXl = data.processos?.bancarios || [];
      if (bancXl.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "PROCESSOS BANCARIOS";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        xlTable(
          ["BANCO", "ASSUNTO", "STATUS", "DATA"],
          bancXl.map(b => [b.banco || "—", b.assunto || "—", b.status || "—", b.data || "—"]),
          WARNING,
        );
      }

      const top10ValXl = data.processos?.top10Valor || [];
      if (top10ValXl.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "TOP 10 — MAIOR VALOR (Bureau)";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        ws.columns = [{ width: 2.5 }, { width: 18 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 2.5 }];
        xlTable(
          ["TIPO", "POLO ATIVO", "POLO PASSIVO", "VALOR (R$)", "UF"],
          top10ValXl.map(p => [p.tipo || "—", p.partes || "—", p.polo_passivo || "—", p.valor || "—", p.uf || "—"]),
          WARNING,
        );
        ws.columns = [{ width: 2.5 }, { width: 28 }, { width: 28 }, { width: 20 }, { width: 14 }, { width: 2.5 }];
      }

      const top10RecXl = data.processos?.top10Recentes || [];
      if (top10RecXl.length > 0) {
        xlSpacer();
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "TOP 10 — MAIS RECENTES (Bureau)";
        ws.getRow(r).getCell(2).font = { bold: true, size: 10, color: { argb: MUTED }, name: "Arial" };
        r++;
        ws.columns = [{ width: 2.5 }, { width: 18 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 8 }, { width: 2.5 }];
        xlTable(
          ["TIPO", "POLO ATIVO", "POLO PASSIVO", "ASSUNTO", "VALOR (R$)", "DATA"],
          top10RecXl.map(p => [p.tipo || "—", p.partes || "—", p.polo_passivo || "—", p.assunto || "—", p.valor || "—", p.data || "—"]),
          WARNING,
        );
        ws.columns = [{ width: 2.5 }, { width: 28 }, { width: 28 }, { width: 20 }, { width: 14 }, { width: 2.5 }];
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 07B: CCF =======
      if (data.ccf) {
        secTitle("07B", "CCF — CHEQUES SEM FUNDO (Bureau)", DANGER);
        [
          ["Total de Ocorrências", String(data.ccf.qtdRegistros)],
          ["Bancos com Registro", String(data.ccf.bancos.length)],
          ["Tendência", data.ccf.tendenciaLabel ? `${data.ccf.tendenciaLabel}${(data.ccf.tendenciaVariacao ?? 0) !== 0 ? ` (${(data.ccf.tendenciaVariacao ?? 0) > 0 ? "+" : ""}${data.ccf.tendenciaVariacao}%)` : ""}` : "—"],
        ].forEach(([l, v], i) => field2(l, v, i));

        if (data.ccf.bancos.length > 0) {
          xlSpacer();
          xlTable(
            ["BANCO / INSTITUIÇÃO", "QTD", "ÚLTIMA OCORR.", "MOTIVO"],
            data.ccf.bancos.map(b => [b.banco || "—", String(b.quantidade || 0), b.dataUltimo || "—", b.motivo || "—"]),
            DANGER,
          );
        }
        xlSpacer(); xlSpacer();
      }

      // ======= SECAO 08: GRUPO ECONOMICO =======
      secTitle("08", "GRUPO ECONOMICO", NAVY);
      const geXl = data.grupoEconomico?.empresas || [];
      const geParentescosXl = data.grupoEconomico?.parentescosDetectados || [];
      if (geXl.length > 0) {
        xlTable(
          ["RAZAO SOCIAL", "CNPJ", "SITUACAO", "VIA SOCIO", "PARTICIPACAO", "RELACAO"],
          geXl.map(e => [e.razaoSocial, e.cnpj, e.situacao || "—", e.socioOrigem || "—", e.participacao || "—", e.relacao]),
          NAVY,
        );
      } else {
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "Nenhuma empresa identificada no grupo economico";
        ws.getRow(r).getCell(2).font = { size: 10, italic: true, color: { argb: MUTED }, name: "Arial" };
        r++;
      }
      if (geParentescosXl.length > 0) {
        r++;
        ws.mergeCells(r, 2, r, 5);
        ws.getRow(r).getCell(2).value = "⚠ Alerta: Possivel Parentesco entre Socios";
        ws.getRow(r).getCell(2).font = { size: 10, bold: true, color: { argb: "FF92400E" }, name: "Arial" };
        r++;
        xlTable(
          ["SOCIO 1", "SOCIO 2", "SOBRENOME COMUM"],
          geParentescosXl.map(p => [p.socio1, p.socio2, p.sobrenomeComum]),
          "D97706",
        );
      }

      xlSpacer(); xlSpacer();

      // ======= SECAO 09: PARECER =======
      secTitle("09", "PARECER FINAL", NAVY);
      field2("Decisao", decision, 0);
      field2("Rating", `${finalRating}/10`, 1);
      field2("Parecer", data.resumoRisco || "Parecer nao preenchido.", 2);

      xlSpacer(); xlSpacer();

      // -- Rodape de dados --
      field2("Data de Geracao", genDate, 0);
      field2("Empresa Analisada", data.cnpj.razaoSocial, 1);
      field2("CNPJ", data.cnpj.cnpj, 2);

      xlSpacer(); xlSpacer();

      // -- FOOTER --
      ws.mergeCells(r, 2, r, 5);
      ws.getRow(r).getCell(2).value = `Capital Financas — Consolidador | ${footerDate} | Confidencial`;
      ws.getRow(r).getCell(2).font = { size: 8, italic: true, color: { argb: "FF9CA3AF" }, name: "Arial" };
      ws.getRow(r).getCell(2).alignment = { horizontal: "center" };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  return blob;
}
