import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData, Socio } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

async function extractText(buffer: Buffer, ext: string): Promise<{ text: string; isScanned: boolean }> {
  try {
    // PDF
    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(buffer);
      return { text: data.text ?? "", isScanned: false };
    }

    // DOCX (Word)
    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value ?? "", isScanned: false };
    }

    // Imagens (JPG, PNG) — OCR com Tesseract.js (com timeout de 50s)
    if (["jpg", "jpeg", "png"].includes(ext)) {
      const { createWorker } = await import("tesseract.js");
      let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
      try {
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timeout — imagem muito grande ou servidor ocupado")), 50000));
        worker = await createWorker("por");
        const result = await Promise.race([worker.recognize(buffer), timeout]);
        return { text: (result as { data: { text: string } }).data.text ?? "", isScanned: true };
      } finally {
        if (worker) await worker.terminate().catch(() => {});
      }
    }

    return { text: "", isScanned: false };
  } catch (err) {
    console.error(`Extraction failed for .${ext}:`, err);
    return { text: "", isScanned: false };
  }
}

// Limpa espaços extras e caracteres de controle
function clean(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

// Busca valor após um rótulo, tolerando espaços/quebras de linha entre eles
function after(text: string, ...labels: string[]): string {
  for (const label of labels) {
    const regex = new RegExp(
      label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s\\S]{0,10}") +
        "[:\\s]*([^\\n\\r]{1,120})",
      "i"
    );
    const m = text.match(regex);
    if (m?.[1]) {
      const val = clean(m[1]);
      if (val.length > 1) return val;
    }
  }
  return "";
}

// Normaliza texto: remove acentos para comparações alternativas
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

// ─────────────────────────────────────────
// CARTÃO CNPJ
// ─────────────────────────────────────────
function extractCNPJData(raw: string): CNPJData {
  const text = raw;
  const norm = normalize(raw);

  // CNPJ — padrão XX.XXX.XXX/XXXX-XX
  const cnpjMatch = text.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s]?\/[\s]?\d{4}[\s]?-[\s]?\d{2}/);
  const cnpj = cnpjMatch ? cnpjMatch[0].replace(/\s/g, "") : "";

  // Razão Social — múltiplos rótulos possíveis
  const razaoSocial =
    after(text, "RAZÃO SOCIAL", "RAZAO SOCIAL", "NOME EMPRESARIAL", "NOME EMPRESARIAL:") ||
    after(norm, "RAZAO SOCIAL", "NOME EMPRESARIAL") ||
    "";

  // Nome Fantasia
  const nomeFantasia =
    after(text, "NOME FANTASIA", "TÍTULO DO ESTABELECIMENTO", "TITULO DO ESTABELECIMENTO", "NOME DE FANTASIA") ||
    after(norm, "NOME FANTASIA", "TITULO DO ESTABELECIMENTO") ||
    "";

  // Data de Abertura
  const dataAbertura =
    after(text, "DATA DE ABERTURA", "DATA ABERTURA", "ABERTURA") ||
    after(norm, "DATA DE ABERTURA", "DATA ABERTURA") ||
    (() => {
      const m = text.match(/ABERTURA[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
      return m ? m[1] : "";
    })();

  // Situação Cadastral
  const situacaoCadastral = (() => {
    const patterns = [
      /SITUA[CÇ][AÃ]O\s+CADASTRAL[:\s]+(ATIVA|BAIXADA|INAPTA|SUSPENSA|NULA|ATIVO)/i,
      /CADASTRAL[:\s]+(ATIVA|BAIXADA|INAPTA|SUSPENSA|NULA)/i,
      /(ATIVA|BAIXADA|INAPTA|SUSPENSA|NULA)\s+DATA\s+DA\s+SITUA/i,
    ];
    for (const p of patterns) {
      const m = text.match(p) || norm.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return after(text, "SITUAÇÃO CADASTRAL", "SITUACAO CADASTRAL");
  })();

  // CNAE Principal
  const cnaePrincipal = (() => {
    const patterns = [
      /CNAE\s+FISCAL\s*[:\-]?\s*(\d[\d\-\/\.]{3,12}[^\n]{0,80})/i,
      /ATIVIDADE\s+ECON[OÔ]MICA\s+PRINCIPAL[:\s]+([^\n]{5,100})/i,
      /C[OÓ]DIGO\s+E\s+DESCRI[CÇ][AÃ]O\s+DA\s+ATIVIDADE[^\n]*\n([^\n]{5,100})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return after(text, "CNAE FISCAL", "CNAE:", "ATIVIDADE ECONÔMICA PRINCIPAL");
  })();

  // Porte
  const porte = (() => {
    const m =
      text.match(/PORTE\s*[:\-]?\s*(MICROEMPRESA|MICRO\s+EMPRESA|EMPRESA\s+DE\s+PEQUENO\s+PORTE|GRANDE\s+EMPRESA|MEI|EPP|ME|DEMAIS|MÉDIO)/i) ||
      norm.match(/PORTE\s*[:\-]?\s*(MICROEMPRESA|MICRO\s+EMPRESA|EMPRESA\s+DE\s+PEQUENO\s+PORTE|GRANDE\s+EMPRESA|MEI|EPP|ME|DEMAIS|MEDIO)/i);
    if (m?.[1]) return clean(m[1]);
    return after(text, "PORTE DA EMPRESA", "PORTE:");
  })();

  // Endereço — montar por partes, parando no próximo rótulo
  const afterClean = (t: string, ...labels: string[]) => {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s\\S]{0,10}");
      const regex = new RegExp(escaped + "[:\\s]*([^\\n\\r]{1,80}?)(?=\\s+(?:NÚMERO|NUMERO|NRO|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|COMPLEMENTO)\\b|$)", "i");
      const m = t.match(regex);
      if (m?.[1]) { const v = clean(m[1]); if (v.length > 1) return v; }
    }
    return after(t, ...labels);
  };
  const logradouro = afterClean(text, "LOGRADOURO", "ENDEREÇO", "ENDERECO");
  const numero = after(text, "NÚMERO", "NUMERO", "NRO", "N°");
  const complemento = after(text, "COMPLEMENTO");
  const bairro = afterClean(text, "BAIRRO", "DISTRICT");
  const municipio = afterClean(text, "MUNICÍPIO", "MUNICIPIO", "CIDADE");
  const uf = (() => {
    const m = text.match(/\bUF[:\s]+([A-Z]{2})\b/i);
    return m ? clean(m[1]) : "";
  })();
  const cep = (() => {
    const m = text.match(/CEP[:\s]*(\d{5}-?\d{3})/i) || text.match(/\b(\d{5}-\d{3})\b/);
    return m ? clean(m[1]) : "";
  })();

  const endParts = [logradouro, numero, complemento, bairro, municipio, uf, cep].filter(Boolean);
  const endereco = endParts.length > 0 ? endParts.join(", ") : after(text, "ENDEREÇO COMPLETO", "ENDERECO");

  // ── Novos campos FIDC ──

  // Data da Situação Cadastral
  const dataSituacaoCadastral =
    after(text, "DATA DA SITUAÇÃO CADASTRAL", "DATA DA SITUACAO CADASTRAL") ||
    after(norm, "DATA DA SITUACAO CADASTRAL") || "";

  // Motivo da Situação
  const motivoSituacao =
    after(text, "MOTIVO DE SITUAÇÃO CADASTRAL", "MOTIVO DA SITUAÇÃO", "MOTIVO SITUAÇÃO") ||
    after(norm, "MOTIVO DE SITUACAO CADASTRAL", "MOTIVO DA SITUACAO") || "";

  // Natureza Jurídica
  const naturezaJuridica =
    after(text, "NATUREZA JURÍDICA", "NATUREZA JURIDICA") ||
    after(norm, "NATUREZA JURIDICA") || "";

  // CNAEs Secundários
  const cnaeSecundarios = (() => {
    const m = text.match(/(?:CNAE[S]?\s+SECUND[AÁ]RI[AO]S?|ATIVIDADES?\s+SECUND[AÁ]RI[AO]S?)[:\s]+([\s\S]{5,300}?)(?=\n{2}|NATUREZA|PORTE|LOGRADOURO)/i);
    return m?.[1] ? clean(m[1]).substring(0, 300) : "";
  })();

  // Capital Social (do CNPJ)
  const capitalSocialCNPJ =
    after(text, "CAPITAL SOCIAL DA EMPRESA", "CAPITAL SOCIAL") ||
    after(norm, "CAPITAL SOCIAL") || "";

  // Telefone
  const telefone = (() => {
    const m = text.match(/(?:TELEFONE|TEL|FONE)[:\s]*(\(?\d{2}\)?\s*\d{4,5}[\s\-]?\d{4})/i);
    return m ? clean(m[1]) : "";
  })();

  // E-mail
  const email = (() => {
    const m = text.match(/(?:E[\-\s]?MAIL|CORREIO\s+ELETR[OÔ]NICO)[:\s]*([^\s@]+@[^\s,;]{3,60})/i) ||
              text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]{2,60}\.[a-zA-Z]{2,6})\b/);
    return m ? clean(m[1]).substring(0, 100) : "";
  })();

  return { razaoSocial, nomeFantasia, cnpj, dataAbertura, situacaoCadastral, dataSituacaoCadastral, motivoSituacao, naturezaJuridica, cnaePrincipal, cnaeSecundarios, porte, capitalSocialCNPJ, endereco, telefone, email };
}

// ─────────────────────────────────────────
// CONTRATO SOCIAL
// ─────────────────────────────────────────
function extractContratoData(raw: string): ContratoSocialData {
  const text = raw;
  const socios: Socio[] = [];

  // Extrair todos os CPFs do documento
  const cpfRegex = /(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\s]?[-–][\s]?\d{2})/g;
  const allCpfs: string[] = [];
  let cpfMatch;
  while ((cpfMatch = cpfRegex.exec(text)) !== null) {
    const cpf = cpfMatch[1].replace(/\s/g, "");
    if (!allCpfs.includes(cpf)) allCpfs.push(cpf);
  }

  // Extrair percentuais de participação
  const percentRegex = /(\d{1,3}(?:[,\.]\d{1,4})?)\s*(?:%|por\s+cento)/gi;
  const percents: string[] = [];
  let pMatch;
  while ((pMatch = percentRegex.exec(text)) !== null) {
    percents.push(pMatch[1].replace(".", ",") + "%");
  }

  // Para cada CPF, buscar nome no trecho imediatamente antes
  const usedNames = new Set<string>();
  allCpfs.forEach((cpf, i) => {
    const idx = text.indexOf(cpf);
    if (idx === -1) return;

    // Janela curta (150 chars) para evitar pegar nomes de outro sócio
    const prevCpfEnd = i > 0 ? text.indexOf(allCpfs[i - 1]) + allCpfs[i - 1].length : 0;
    const windowStart = Math.max(prevCpfEnd, idx - 150);
    const window = text.substring(windowStart, idx);

    // Padrões de nome: NOME COMPLETO EM MAIÚSCULAS ou capitalizado
    const namePatterns = [
      /([A-ZÁÉÍÓÚÂÊÔÀÃÕÜ][A-ZÁÉÍÓÚÂÊÔÀÃÕÜa-záéíóúâêôàãõü]+(?:\s+(?:da|de|do|dos|das|e|[A-ZÁÉÍÓÚÂÊÔÀÃÕÜ][A-ZÁÉÍÓÚÂÊÔÀÃÕÜa-záéíóúâêôàãõü]+)){1,6})\s*$/,
      /SÓCIO[^:]*:\s*([A-ZÁÉÍÓÚÂÊÔÀÃÕÜ][^\n,;]{5,60})/i,
      /NOME[:\s]+([A-ZÁÉÍÓÚÂÊÔÀÃÕÜ][^\n,;]{5,60})/i,
    ];

    let nome = "";
    for (const p of namePatterns) {
      const m = window.match(p);
      if (m?.[1]) {
        const candidate = clean(m[1]);
        if (!usedNames.has(candidate)) { nome = candidate; break; }
      }
    }
    if (nome) usedNames.add(nome);

    // Qualificação: busca "administrador", "sócio", "procurador" na janela
    const qualWindow = text.substring(Math.max(0, idx - 200), Math.min(text.length, idx + 200));
    const qualMatch = qualWindow.match(/(?:S[OÓ]CIO[\s\-]*ADMINISTRADOR|ADMINISTRADOR|S[OÓ]CIO[\s\-]*GERENTE|PROCURADOR|DIRETOR|PRESIDENTE|S[OÓ]CIO|TITULAR|ACIONISTA)/i);
    const qualificacao = qualMatch ? clean(qualMatch[0]) : "";

    socios.push({
      nome: nome || `Sócio ${i + 1}`,
      cpf,
      participacao: percents[i] || "",
      qualificacao,
    });
  });

  // Se não encontrou CPFs, tenta blocos de SÓCIO / ACIONISTA
  if (socios.length === 0) {
    const socioPattern = /(?:SÓ[CG]IO|ACIONISTA|TITULAR)[:\s]+([^\n,;]{5,80})/gi;
    let sm;
    let idx = 0;
    while ((sm = socioPattern.exec(text)) !== null) {
      socios.push({ nome: clean(sm[1]), cpf: "", participacao: percents[idx++] || "", qualificacao: "" });
    }
  }

  // Capital Social
  const capitalSocial = (() => {
    const patterns = [
      /CAPITAL\s+SOCIAL[:\s]+(?:DE\s+)?R\$?\s*([\d.,]+(?:\s*\([^)]+\))?)/i,
      /CAPITAL\s+SOCIAL[:\s]+([^\n]{5,80})/i,
      /R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*\(([^)]{5,60})\)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return "";
  })();

  // Data de Constituição
  const dataConstituicao = (() => {
    const patterns = [
      /(?:DATA\s+DE\s+CONSTITUI[CÇ][AÃ]O|CONSTITUI[CÇ][AÃ]O)[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /constitu[ií]d[ao](?:s)?\s+(?:em|a\s+partir\s+de)\s+(\d{2}\/\d{2}\/\d{4})/i,
      /constitu[ií]d[ao](?:s)?\s+(?:em|a\s+partir\s+de)\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i,
      /em\s+(\d{2}\s+de\s+\w+\s+de\s+\d{4})/i,
      /(\d{2}\/\d{2}\/\d{4})/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return "";
  })();

  // Objeto Social
  const objetoSocial = (() => {
    const patterns = [
      /OBJETO\s+SOCIAL[:\s]+([\s\S]{20,600}?)(?=CAPITAL|CL[AÁ]USULA\s+[IVX\d]|SEDE|§|\n{3})/i,
      /OBJETO[:\s]+([\s\S]{20,400}?)(?=CAPITAL|CL[AÁ]USULA|SEDE|\n{2})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return clean(m[1]).substring(0, 500);
    }
    return "";
  })();

  // Alterações recentes
  const temAlteracoes = /ALTERA[CÇ][AÃ]O\s+(?:CONTRATUAL|ESTATUT|SOCIAL)|ADITAMENTO|CONSOLIDADO|QUARTA|QUINTA|SEXTA|SÉTIMA|OITAVA|\d+[ªº]\s+ALTERA/i.test(text);

  // ── Novos campos FIDC ──

  // Prazo de duração
  const prazoDuracao = (() => {
    if (/PRAZO\s+INDETERMINADO|DURA[CÇ][AÃ]O\s+INDETERMINAD/i.test(text)) return "Indeterminado";
    const m = text.match(/(?:PRAZO|DURA[CÇ][AÃ]O)[:\s]+(?:DE\s+)?(\d+\s+(?:ANOS?|MESES?))/i) ||
              text.match(/PRAZO\s+(?:DE\s+)?DURA[CÇ][AÃ]O[:\s]+([^\n]{5,60})/i);
    return m ? clean(m[1]) : "";
  })();

  // Administração e poderes
  const administracao = (() => {
    const patterns = [
      /(?:ADMINISTRA[CÇ][AÃ]O|GERÊNCIA|GEST[AÃ]O)[:\s]+([\s\S]{10,400}?)(?=CL[AÁ]USULA|§|\n{3}|DO\s+CAPITAL)/i,
      /(?:PODERES?\s+(?:DE\s+)?REPRESENTA[CÇ][AÃ]O|REPRESENTAR\s+A\s+SOCIEDADE)[:\s]*([\s\S]{10,300}?)(?=CL[AÁ]USULA|§|\n{3})/i,
    ];
    for (const p of patterns) { const m = text.match(p); if (m?.[1]) return clean(m[1]).substring(0, 400); }
    return "";
  })();

  // Foro
  const foro = (() => {
    const m = text.match(/(?:FORO|COMARCA)[:\s]+(?:DA\s+|DE\s+)?([^\n,.;]{3,60})/i);
    return m ? clean(m[1]) : "";
  })();

  return {
    socios: socios.length > 0 ? socios : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }],
    capitalSocial,
    objetoSocial,
    dataConstituicao,
    temAlteracoes,
    prazoDuracao,
    administracao,
    foro,
  };
}

// ─────────────────────────────────────────
// SCR / BACEN
// ─────────────────────────────────────────
function extractSCRData(raw: string): SCRData {
  const text = raw;
  const norm = normalize(raw);

  // Total de dívidas
  const totalDividasAtivas = (() => {
    const patterns = [
      /TOTAL\s+(?:DE\s+)?(?:D[ÍI]VIDAS?|RESPONSABILIDADES?)[:\s]+R?\$?\s*([\d.,]+)/i,
      /SALDO\s+(?:DEVEDOR\s+)?TOTAL[:\s]+R?\$?\s*([\d.,]+)/i,
      /VOLUME\s+TOTAL[:\s]+R?\$?\s*([\d.,]+)/i,
      /TOTAL\s+GERAL[:\s]+R?\$?\s*([\d.,]+)/i,
      /(?:TOTAL|SALDO)[:\s]+R\$\s*([\d.,]+)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p) || norm.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return "";
  })();

  // Operações em atraso
  const operacoesEmAtraso = (() => {
    const patterns = [
      /OPERA[CÇ][OÕ]ES? +(?:EM +)?ATRASO[:\s]+(\d+)/i,
      /(\d+) *(?:OPERA[CÇ][OÕ]ES?|CONTRATOS?|PARCELAS?) +(?:EM +)?ATRASO/i,
      /INADIMPL[EÊ]NCIA[:\s]+(\d+)\s*OPERA/i,
      /ATRASOS?[:\s]+(\d+)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p) || norm.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return "";
  })();

  // Tempo de atraso
  const tempoAtraso = (() => {
    const patterns = [
      /ATRASO[:\s]+(?:DE\s+|MÉDIO\s+)?(?:ATÉ\s+)?(\d+\s+DIAS?)/i,
      /(\d+)\s+DIAS?\s+(?:DE\s+)?ATRASO/i,
      /PRAZO\s+(?:DE\s+)?ATRASO[:\s]+(\d+\s+(?:DIAS?|MESES?))/i,
      /(?:FAIXA|PERÍODO)\s+DE\s+ATRASO[:\s]+([^\n]{3,40})/i,
      /MAIOR\s+ATRASO[:\s]+(\d+\s+DIAS?)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p) || norm.match(p);
      if (m?.[1]) return clean(m[1]);
    }
    return "";
  })();

  // Modalidades de crédito
  const modalidades: string[] = [];
  const modalMap: [string, string][] = [
    ["CAPITAL DE GIRO", "Capital de Giro"],
    ["CHEQUE ESPECIAL", "Cheque Especial"],
    ["CONTA GARANTIDA", "Conta Garantida"],
    ["CDC|CRÉDITO DIRETO AO CONSUMIDOR", "CDC"],
    ["FINANCIAMENTO", "Financiamento"],
    ["LEASING", "Leasing"],
    ["ANTECIPA[CÇ][AÃ]O", "Antecipação de Recebíveis"],
    ["DESCONTO DE T[IÍ]TULOS?", "Desconto de Títulos"],
    ["CART[AÃ]O DE CR[EÉ]DITO", "Cartão de Crédito"],
    ["EMPRÉSTIMO PESSOAL|CREDITO PESSOAL", "Empréstimo Pessoal"],
    ["COMPROR", "Compror"],
    ["VENDOR", "Vendor"],
    ["LIMITE DE CR[EÉ]DITO", "Limite de Crédito"],
    ["FINAME", "Finame"],
    ["BNDES", "BNDES"],
  ];
  modalMap.forEach(([p, label]) => {
    if (new RegExp(p, "i").test(text)) modalidades.push(label);
  });

  // Instituições credoras
  const instituicoes: string[] = [];
  const bankMap: [string, string][] = [
    ["BANCO DO BRASIL|BB\\b", "Banco do Brasil"],
    ["BRADESCO", "Bradesco"],
    ["ITA[ÚU]\\b|ITAÚ\\s+UNIBANCO", "Itaú"],
    ["CAIXA ECON[OÔ]MICA|CEF\\b", "Caixa Econômica Federal"],
    ["SANTANDER", "Santander"],
    ["BTG PACTUAL|BTG\\b", "BTG Pactual"],
    ["NUBANK|NU\\s+BANK", "Nubank"],
    ["SICOOB", "Sicoob"],
    ["SICREDI", "Sicredi"],
    ["INTER\\b|BANCO INTER", "Banco Inter"],
    ["C6\\s*BANK|C6\\b", "C6 Bank"],
    ["SAFRA", "Safra"],
    ["VOTORANTIM|BV\\b", "Votorantim/BV"],
    ["BANCO ORIGINAL", "Banco Original"],
    ["MERCANTIL", "Mercantil"],
    ["ABC\\s+BRASIL", "ABC Brasil"],
    ["PINE\\b", "Banco Pine"],
    ["DAYCOVAL", "Daycoval"],
  ];
  bankMap.forEach(([p, label]) => {
    if (new RegExp(p, "i").test(text)) instituicoes.push(label);
  });

  // Histórico de inadimplência
  const historicoInadimplencia = (() => {
    const patterns = [
      /(?:HIST[OÓ]RICO|OCORR[EÊ]NCIAS?)[:\s]+([\s\S]{10,400}?)(?=\n{2}|TOTAL|SALDO|$)/i,
      /INADIMPL[EÊ]NCIA[:\s]+([\s\S]{10,300}?)(?=\n{2}|TOTAL|$)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return clean(m[1]).substring(0, 400);
    }
    return "";
  })();

  // ── Novos campos FIDC ──

  // Operações a vencer (adimplentes)
  const operacoesAVencer = (() => {
    const patterns = [
      /(?:A\s+VENCER|VINCENDAS?|ADIMPLENTES?)[:\s]+R?\$?\s*([\d.,]+)/i,
      /(?:CARTEIRA\s+)?(?:NORMAL|ATIVA|ADIMPLENTE)[:\s]+R?\$?\s*([\d.,]+)/i,
    ];
    for (const p of patterns) { const m = text.match(p) || norm.match(p); if (m?.[1]) return clean(m[1]); }
    return "";
  })();

  // Operações vencidas (mais de 15 dias)
  const operacoesVencidas = (() => {
    const patterns = [
      /(?:VENCID[AO]S?|VENCIMENTO)[:\s]+R?\$?\s*([\d.,]+)/i,
      /(?:OPERA[CÇ][OÕ]ES?\s+)?VENCID[AO]S?[:\s]+R?\$?\s*([\d.,]+)/i,
    ];
    for (const p of patterns) { const m = text.match(p) || norm.match(p); if (m?.[1]) return clean(m[1]); }
    return "";
  })();

  // Créditos baixados como prejuízo
  const prejuizo = (() => {
    const patterns = [
      /PREJU[IÍ]ZO[:\s]+R?\$?\s*([\d.,]+)/i,
      /BAIXAD[AO]S?\s+(?:COMO\s+)?PREJU[IÍ]ZO[:\s]+R?\$?\s*([\d.,]+)/i,
      /PERDA[:\s]+R?\$?\s*([\d.,]+)/i,
    ];
    for (const p of patterns) { const m = text.match(p) || norm.match(p); if (m?.[1]) return clean(m[1]); }
    return "";
  })();

  // Coobrigações / garantias
  const coobrigacoes = (() => {
    const patterns = [
      /COOBRIGA[CÇ][OÕ]ES?[:\s]+R?\$?\s*([\d.,]+)/i,
      /GARANTIAS?\s+(?:PRESTADAS?)?[:\s]+R?\$?\s*([\d.,]+)/i,
      /AVAL(?:ES)?[:\s]+R?\$?\s*([\d.,]+)/i,
    ];
    for (const p of patterns) { const m = text.match(p) || norm.match(p); if (m?.[1]) return clean(m[1]); }
    return "";
  })();

  // Classificação de risco (A-H do Bacen)
  const classificacaoRisco = (() => {
    const m = text.match(/(?:CLASSIFICA[CÇ][AÃ]O|RATING|N[IÍ]VEL\s+DE\s+RISCO|RISCO)[:\s]+([A-H](?:[\s\/\-]+[A-H])?)/i) ||
              text.match(/\b(AA|[A-H]{1,2})\b\s*(?:[\-–]\s*(?:RISCO|RATING))/i);
    return m ? clean(m[1]).toUpperCase() : "";
  })();

  // Concentração de crédito (% do maior credor)
  const concentracaoCredito = (() => {
    const m = text.match(/CONCENTRA[CÇ][AÃ]O[:\s]+(\d{1,3}[,.]?\d{0,2}\s*%)/i) ||
              text.match(/MAIOR\s+(?:CREDOR|EXPOSI[CÇ][AÃ]O)[:\s]+(\d{1,3}[,.]?\d{0,2}\s*%)/i);
    return m ? clean(m[1]) : "";
  })();

  return {
    totalDividasAtivas,
    operacoesAVencer,
    operacoesEmAtraso,
    operacoesVencidas,
    tempoAtraso,
    prejuizo,
    coobrigacoes,
    classificacaoRisco,
    modalidadesCredito: modalidades.join(", "),
    instituicoesCredoras: instituicoes.join(", "),
    concentracaoCredito,
    historicoInadimplencia,
  };
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    // Limite de 20MB (compatível com memória serverless Vercel)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 20MB." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const supportedExts = ["pdf", "docx", "jpg", "jpeg", "png"];
    if (!supportedExts.includes(ext)) {
      return NextResponse.json({ error: `Formato .${ext} não suportado. Use PDF, DOCX, JPG ou PNG.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { text, isScanned } = await extractText(buffer, ext);

    if (!text || text.trim().length < 10) {
      return NextResponse.json({
        error: "Não foi possível extrair texto do documento. Verifique se o arquivo contém texto legível ou preencha os campos manualmente.",
      }, { status: 422 });
    }

    let data: CNPJData | ContratoSocialData | SCRData;

    switch (docType) {
      case "cnpj":     data = extractCNPJData(text); break;
      case "contrato": data = extractContratoData(text); break;
      case "scr":      data = extractSCRData(text); break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // Sanitizar: limitar tamanho de strings e remover HTML
    const sanitize = (val: unknown): unknown => {
      if (typeof val === "string") return val.replace(/<[^>]*>/g, "").substring(0, 1000);
      if (Array.isArray(val)) return val.map(sanitize);
      if (val && typeof val === "object") {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) obj[k] = sanitize(v);
        return obj;
      }
      return val;
    };
    data = sanitize(data) as typeof data;

    // Contar campos preenchidos para informar o frontend
    const filled = Object.values(data).filter(v =>
      typeof v === "string" ? v.length > 0 :
      Array.isArray(v) ? v.some((s: Socio) => s.nome) :
      typeof v === "boolean" ? true : false
    ).length;

    return NextResponse.json({
      success: true,
      data,
      meta: {
        rawTextLength: text.length,
        filledFields: filled,
        isScanned,
      },
    });
  } catch (err) {
    console.error("Extraction error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
