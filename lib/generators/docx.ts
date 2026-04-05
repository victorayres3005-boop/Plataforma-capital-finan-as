import type { ExtractedData, AIAnalysis } from "@/types";

type AlertSeverity = "ALTA" | "MODERADA" | "INFO";
interface Alert { message: string; severity: AlertSeverity; impacto?: string; }

export interface DOCXReportParams {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  alerts: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  resumoExecutivo: string;
  companyAge: string;
  protestosVigentes: number;
}

function parseMoneyToNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/./g, "").replace(",", ".")) || 0;
}

export async function buildDOCXReport(p: DOCXReportParams): Promise<Blob> {
  const { data, decision, finalRating, alerts, protestosVigentes } = p;

      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Header, Footer } = await import("docx");

      const navy = "203B88";
      const green = "73B815";
      const greenLight = "A8D96B";
      const warning = "D97706";
      const danger = "DC2626";
      const muted = "6B7280";
      const border1 = "D1DCF0";
      const surface = "EDF2FB";
      const surface2 = "F5F7FB";
      const textDark = "111827";
      const dateFmt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const footerDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const spacer = (pts = 200) => new Paragraph({ spacing: { before: pts } });

      const sectionTitle = (num: string, title: string, color: string) => new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 6, color }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: 100, type: WidthType.PERCENTAGE }, shading: { type: "clear" as const, fill: surface },
            children: [new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 120 }, children: [
              new TextRun({ text: num + "  ", size: 18, bold: true, color, font: "Arial" }),
              new TextRun({ text: title, size: 20, bold: true, color: textDark, font: "Arial" }),
            ] })],
          }),
        ] })],
      });

      const fieldTable = (fields: [string, string][]) => {
        const rows = fields.filter(([, v]) => v).map(([label, value]) =>
          new TableRow({ children: [
            new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: label.toUpperCase(), size: 15, color: muted, font: "Arial" })] })],
            }),
            new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: value || "—", size: 18, bold: true, font: "Arial" })] })],
            }),
          ] })
        );
        if (rows.length === 0) return spacer(0);
        return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: border1 }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows });
      };

      const makeDataTable = (headers: string[], rows: string[][], headerColor: string) => {
        if (rows.length === 0) return new Paragraph({ children: [new TextRun({ text: "Nenhum dado encontrado.", italics: true, color: muted, font: "Arial" })] });
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: headers.map(h =>
              new TableCell({ shading: { type: "clear" as const, fill: headerColor }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: 60 }, children: [new TextRun({ text: h, size: 15, bold: true, color: "FFFFFF", font: "Arial" })] })] })
            ) }),
            ...rows.map((row, i) => new TableRow({ children: row.map(v =>
              new TableCell({ shading: { type: "clear" as const, fill: i % 2 === 0 ? "FFFFFF" : surface2 }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: 60 }, children: [new TextRun({ text: v, size: 17, font: "Arial" })] })] })
            ) })),
          ],
        });
      };

      const alertParagraph = (text: string, sev: AlertSeverity) => new Paragraph({
        shading: { type: "clear" as const, fill: sev === "ALTA" ? "FEF2F2" : "FEF3C7" },
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: `  [${sev}] ${text}`, bold: true, color: sev === "ALTA" ? danger : warning, size: 18, font: "Arial" })],
      });

      // QSA table
      const validQSADoc = data.qsa.quadroSocietario.filter(s => s.nome);
      const qsaTable = makeDataTable(
        ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
        validQSADoc.map(s => [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", s.participacao || "—"]),
        navy,
      );

      // Socios table
      const validSociosDoc = data.contrato.socios.filter(s => s.nome);
      const sociosTable = makeDataTable(
        ["NOME DO SOCIO", "CPF", "PARTICIPACAO"],
        validSociosDoc.map(s => [s.nome, s.cpf || "—", s.participacao || "—"]),
        navy,
      );

      // Faturamento table
      const faturamentoTable = makeDataTable(
        ["MES", "VALOR (R$)"],
        data.faturamento.meses.filter(m => m.mes).map(m => [m.mes, m.valor || "0,00"]),
        green,
      );

      // Modalidades table
      const modalidadesTable = data.scr.modalidades.length > 0
        ? makeDataTable(
          ["MODALIDADE", "TOTAL", "A VENCER", "VENCIDO", "PART."],
          data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido, m.participacao]),
          warning,
        )
        : null;

      // Instituicoes table
      const instituicoesTable = data.scr.instituicoes.length > 0
        ? makeDataTable(
          ["INSTITUICAO", "VALOR (R$)"],
          data.scr.instituicoes.map(i => [i.nome, i.valor]),
          warning,
        )
        : null;

      // SCR comparison table
      const scrCompTable = data.scrAnterior ? makeDataTable(
        ["METRICA", "ANTERIOR", "ATUAL", "VARIACAO"],
        [
          { label: "Carteira a Vencer", ant: data.scrAnterior.carteiraAVencer, at: data.scr.carteiraAVencer },
          { label: "Vencidos", ant: data.scrAnterior.vencidos, at: data.scr.vencidos },
          { label: "Prejuizos", ant: data.scrAnterior.prejuizos, at: data.scr.prejuizos },
          { label: "Total Dividas", ant: data.scrAnterior.totalDividasAtivas, at: data.scr.totalDividasAtivas },
          { label: "Limite Credito", ant: data.scrAnterior.limiteCredito, at: data.scr.limiteCredito },
        ].map(m => {
          const d1 = parseMoneyToNumber(m.ant); const d2 = parseMoneyToNumber(m.at);
          const diff = d2 - d1;
          return [m.label, m.ant || "—", m.at || "—", diff === 0 ? "=" : diff > 0 ? `+${diff.toLocaleString("pt-BR")}` : diff.toLocaleString("pt-BR")];
        }),
        warning,
      ) : null;

      // Protestos table
      const protestosDetalhes = data.protestos?.detalhes || [];
      const protestosTable = protestosDetalhes.length > 0
        ? makeDataTable(
          ["DATA", "CREDOR", "VALOR (R$)", "STATUS"],
          protestosDetalhes.map(p => [p.data || "—", p.credor || "—", p.valor || "—", p.regularizado ? "Regularizado" : "Vigente"]),
          danger,
        )
        : null;

      // Processos tables
      const distTable = (data.processos?.distribuicao || []).length > 0
        ? makeDataTable(
          ["TIPO", "QUANTIDADE", "PERCENTUAL"],
          data.processos!.distribuicao.map(d => [d.tipo, d.qtd, d.pct ? `${d.pct}%` : "—"]),
          warning,
        )
        : null;

      const bancTable = (data.processos?.bancarios || []).length > 0
        ? makeDataTable(
          ["BANCO", "ASSUNTO", "STATUS", "DATA"],
          data.processos!.bancarios.map(b => [b.banco || "—", b.assunto || "—", b.status || "—", b.data || "—"]),
          warning,
        )
        : null;

      // Grupo economico table
      const geTable = (data.grupoEconomico?.empresas || []).length > 0
        ? makeDataTable(
          ["RAZAO SOCIAL", "CNPJ", "RELACAO", "SCR (R$)", "PROTESTOS", "PROCESSOS"],
          data.grupoEconomico!.empresas.map(e => [e.razaoSocial, e.cnpj, e.relacao, e.scrTotal || "—", e.protestos || "0", e.processos || "0"]),
          navy,
        )
        : null;

      const docx = new Document({
        sections: [
          // -- CAPA --
          {
            properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
            children: [
              spacer(4000),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "capital", size: 56, bold: true, color: navy, font: "Arial" }),
                new TextRun({ text: "financas", size: 56, bold: true, color: green, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [
                new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 20, color: greenLight }),
              ] }),
              spacer(400),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "RELATORIO DE DUE DILIGENCE", size: 36, bold: true, color: navy, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [
                new TextRun({ text: "Consolidador de Documentos", size: 22, color: muted, font: "Arial" }),
              ] }),
              spacer(600),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: data.cnpj.razaoSocial || "Empresa", size: 24, bold: true, color: textDark, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [
                new TextRun({ text: data.cnpj.cnpj || "", size: 20, color: muted, font: "Arial" }),
              ] }),
              spacer(400),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: `Rating: ${finalRating}/10  |  ${decision}`, size: 24, bold: true, color: decision === "APROVADO" ? green : decision === "PENDENTE" ? warning : danger, font: "Arial" }),
              ] }),
              spacer(800),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: `Gerado em ${dateFmt}`, size: 18, color: muted, font: "Arial" }),
              ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [
                new TextRun({ text: "Documento confidencial — uso restrito", size: 16, color: "9CA3AF", italics: true, font: "Arial" }),
              ] }),
            ],
          },
          // -- CONTEUDO --
          {
            properties: {
              page: { margin: { top: 1200, bottom: 1000, left: 1000, right: 1000 } },
            },
            headers: { default: new Header({ children: [
              new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: green } }, spacing: { after: 100 }, children: [
                new TextRun({ text: "capital", size: 16, bold: true, color: navy, font: "Arial" }),
                new TextRun({ text: "financas", size: 16, bold: true, color: green, font: "Arial" }),
                new TextRun({ text: "    Relatorio de Due Diligence", size: 14, color: muted, font: "Arial" }),
              ] }),
            ] }) },
            footers: { default: new Footer({ children: [
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 1, color: border1 } }, spacing: { before: 100 }, children: [
                new TextRun({ text: `Capital Financas — Consolidador | ${footerDate} | Confidencial`, size: 14, color: "9CA3AF", font: "Arial" }),
              ] }),
            ] }) },
            children: [
              // Alerts summary
              ...(alerts.length > 0 ? [
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `ALERTAS (${alerts.length})`, size: 18, bold: true, color: warning, font: "Arial" })] }),
                ...alerts.map(a => alertParagraph(a.message, a.severity)),
                spacer(200),
              ] : []),

              // Section 01
              sectionTitle("01", "IDENTIFICACAO DA EMPRESA", navy),
              spacer(100),
              fieldTable([
                ["Razao Social", data.cnpj.razaoSocial], ["Nome Fantasia", data.cnpj.nomeFantasia],
                ["CNPJ", data.cnpj.cnpj], ["Data de Abertura", data.cnpj.dataAbertura],
                ["Situacao Cadastral", data.cnpj.situacaoCadastral], ["Data da Situacao", data.cnpj.dataSituacaoCadastral],
                ["Motivo da Situacao", data.cnpj.motivoSituacao], ["Natureza Juridica", data.cnpj.naturezaJuridica],
                ["CNAE Principal", data.cnpj.cnaePrincipal], ["CNAEs Secundarios", data.cnpj.cnaeSecundarios],
                ["Porte", data.cnpj.porte], ["Capital Social (CNPJ)", data.cnpj.capitalSocialCNPJ],
                ["Endereco Completo", data.cnpj.endereco],
                ["Telefone", data.cnpj.telefone], ["E-mail", data.cnpj.email],
              ]),

              // Section 02 — QSA
              spacer(300),
              sectionTitle("02", "QUADRO SOCIETARIO (QSA)", green),
              spacer(100),
              ...(data.qsa.capitalSocial ? [new Paragraph({ spacing: { after: 100 }, children: [
                new TextRun({ text: "Capital Social: ", size: 17, bold: true, color: muted, font: "Arial" }),
                new TextRun({ text: data.qsa.capitalSocial, size: 18, bold: true, color: textDark, font: "Arial" }),
              ] })] : []),
              qsaTable,

              // Section 03 — Contrato Social
              spacer(300),
              sectionTitle("03", "CONTRATO SOCIAL", navy),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "QUADRO SOCIETARIO (CONTRATO)", size: 15, bold: true, color: muted, font: "Arial" })] }),
              sociosTable,
              spacer(100),
              fieldTable([
                ["Capital Social", data.contrato.capitalSocial], ["Data de Constituicao", data.contrato.dataConstituicao],
                ["Prazo de Duracao", data.contrato.prazoDuracao], ["Foro", data.contrato.foro],
                ["Objeto Social", data.contrato.objetoSocial], ["Administracao e Poderes", data.contrato.administracao],
              ]),
              ...(data.contrato.temAlteracoes ? [spacer(100), new Paragraph({
                shading: { type: "clear" as const, fill: "FEF3C7" }, spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: "  ATENCAO: Documento com alteracoes societarias recentes", bold: true, color: warning, size: 18, font: "Arial" })],
              })] : []),

              // Section 04 — Faturamento
              spacer(300),
              sectionTitle("04", "FATURAMENTO", green),
              spacer(100),
              ...(data.faturamento.faturamentoZerado ? [alertParagraph("Faturamento zerado no periodo", "ALTA")] : []),
              ...(!data.faturamento.dadosAtualizados ? [alertParagraph(`Dados desatualizados — ultimo mes: ${data.faturamento.ultimoMesComDados || "N/A"}`, "MODERADA")] : []),
              fieldTable([
                ["Somatoria Anual (R$)", data.faturamento.somatoriaAno],
                ["Media Mensal (R$)", data.faturamento.mediaAno],
                ["Ultimo Mes com Dados", data.faturamento.ultimoMesComDados],
              ]),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "FATURAMENTO MENSAL", size: 15, bold: true, color: muted, font: "Arial" })] }),
              faturamentoTable,

              // Section 05 — SCR
              spacer(300),
              sectionTitle("05", "PERFIL DE CREDITO — SCR / BACEN", warning),
              spacer(100),
              fieldTable([
                ["Carteira a Vencer (R$)", data.scr.carteiraAVencer],
                ["Vencidos (R$)", data.scr.vencidos],
                ["Prejuizos (R$)", data.scr.prejuizos],
                ["Limite de Credito (R$)", data.scr.limiteCredito],
                ["Qtde Instituicoes", data.scr.qtdeInstituicoes],
                ["Qtde Operacoes", data.scr.qtdeOperacoes],
                ["Total Dividas Ativas (R$)", data.scr.totalDividasAtivas],
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
              ]),
              ...(scrCompTable ? [
                spacer(200),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "COMPARATIVO SCR (ANTERIOR vs ATUAL)", size: 15, bold: true, color: muted, font: "Arial" })] }),
                scrCompTable,
              ] : []),
              ...(modalidadesTable ? [
                spacer(200),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "MODALIDADES DE CREDITO", size: 15, bold: true, color: muted, font: "Arial" })] }),
                modalidadesTable,
              ] : []),
              ...(instituicoesTable ? [
                spacer(200),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "INSTITUICOES CREDORAS", size: 15, bold: true, color: muted, font: "Arial" })] }),
                instituicoesTable,
              ] : []),

              // Section 06 — Protestos
              spacer(300),
              sectionTitle("06", "PROTESTOS", danger),
              spacer(100),
              fieldTable([
                ["Vigentes (Qtd)", data.protestos?.vigentesQtd || "0"],
                ["Vigentes (R$)", data.protestos?.vigentesValor || "0,00"],
                ["Regularizados (Qtd)", data.protestos?.regularizadosQtd || "0"],
                ["Regularizados (R$)", data.protestos?.regularizadosValor || "0,00"],
              ]),
              ...(protestosVigentes > 0 ? [alertParagraph(`${protestosVigentes} protesto(s) vigente(s)`, "ALTA")] : []),
              ...(protestosTable ? [
                spacer(100),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "DETALHES DOS PROTESTOS", size: 15, bold: true, color: muted, font: "Arial" })] }),
                protestosTable,
              ] : []),

              // Section 07 — Processos
              spacer(300),
              sectionTitle("07", "PROCESSOS JUDICIAIS", warning),
              spacer(100),
              fieldTable([
                ["Passivos (Total)", data.processos?.passivosTotal || "0"],
                ["Ativos (Total)", data.processos?.ativosTotal || "0"],
                ["Valor Estimado (R$)", data.processos?.valorTotalEstimado || "0,00"],
              ]),
              ...(data.processos?.temRJ ? [alertParagraph("RECUPERACAO JUDICIAL identificada", "ALTA")] : []),
              ...(distTable ? [
                spacer(100),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "DISTRIBUICAO POR TIPO", size: 15, bold: true, color: muted, font: "Arial" })] }),
                distTable,
              ] : []),
              ...(bancTable ? [
                spacer(100),
                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "PROCESSOS BANCARIOS", size: 15, bold: true, color: muted, font: "Arial" })] }),
                bancTable,
              ] : []),

              // Section 08 — Grupo Economico
              spacer(300),
              sectionTitle("08", "GRUPO ECONOMICO", navy),
              spacer(100),
              ...(geTable ? [geTable] : [new Paragraph({ children: [new TextRun({ text: "Nenhuma empresa identificada no grupo economico.", italics: true, color: muted, font: "Arial" })] })]),

              // Section 09 — Parecer
              spacer(300),
              sectionTitle("09", "PARECER FINAL", navy),
              spacer(100),
              new Paragraph({ spacing: { after: 100 }, children: [
                new TextRun({ text: `Decisao: ${decision}  |  Rating: ${finalRating}/10`, size: 22, bold: true, color: decision === "APROVADO" ? green : decision === "PENDENTE" ? warning : danger, font: "Arial" }),
              ] }),
              spacer(100),
              fieldTable([
                ["Parecer", data.resumoRisco || "Parecer nao preenchido."],
              ]),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(docx);

  return blob;
}
