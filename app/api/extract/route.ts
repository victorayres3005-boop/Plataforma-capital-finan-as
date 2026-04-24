export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, FaturamentoMensal, ProtestosData, ProcessosData, GrupoEconomicoData, CurvaABCData, DREData, BalancoData, IRSocioData, RelatorioVisitaData, SCRModalidade, Socio, Filial, SocioRetirante, DREAno, BalancoAno, ClienteCurvaABC, SociedadeIR } from "@/types";
import { sanitizeDescricaoDebitos, sanitizeStr, sanitizeEnum, sanitizeMoney } from "@/lib/extract/sanitize";
import {
  CNPJDataSchema, QSADataSchema, ContratoSocialDataSchema, FaturamentoDataSchema, SCRDataSchema,
  RelatorioVisitaSchema,
  safeParseExtracted, auditBusinessRules,
} from "@/lib/extract/schemas";

export const runtime = "nodejs";

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

// Flash 2.5 primário (mais rápido, cabe no timeout 52s do Hobby plan), Pro como fallback.
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS = ["google/gemini-2.5-flash-preview:free", "google/gemini-2.0-flash-exp:free", "meta-llama/llama-4-maverick:free"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}




// ─────────────────────────────────────────
// Extração de texto (PDF e DOCX)
// ─────────────────────────────────────────
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  try {
    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(buffer);
      return data.text ?? "";
    }
    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    }
    if (ext === "xlsx" || ext === "xls") {
      // Converte planilha em texto tabular para envio ao Gemini quando o
      // parser dedicado de faturamento não conseguiu extrair os dados.
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const lines: string[] = [];
      for (const sheet of workbook.worksheets.slice(0, 3)) {
        lines.push(`=== Planilha: ${sheet.name} ===`);
        sheet.eachRow(row => {
          const cells = (row.values as unknown[])
            .slice(1)
            .map(c => (c == null ? "" : String(c).trim()))
            .join("\t");
          if (cells.replace(/\t/g, "").trim()) lines.push(cells);
        });
      }
      return lines.join("\n");
    }
    return "";
  } catch (err) {
    console.error(`[extractText] Failed for .${ext}:`, err);
    return "";
  }
}

// ─────────────────────────────────────────
// Extração de Excel (Faturamento)
// ─────────────────────────────────────────
async function extractExcel(buffer: Buffer): Promise<FaturamentoData> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const meses: { mes: string; valor: string }[] = [];

  // Tentar encontrar dados de faturamento na primeira sheet
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia");

  // Estratégia: procurar colunas com meses e valores
  const monthNames: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // pular cabeçalho
    const cells = row.values as (string | number | null)[];
    if (!cells || cells.length < 2) return;

    // Procurar uma célula com mês e outra com valor numérico
    let mesStr = "";
    let valorNum = 0;

    for (const cell of cells) {
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim().toLowerCase();

      // Verificar se é um mês
      if (!mesStr) {
        for (const [name, num] of Object.entries(monthNames)) {
          if (str.includes(name)) {
            // Tentar pegar o ano do texto
            const yearMatch = str.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
            mesStr = `${num}/${year}`;
            break;
          }
        }
        // Verificar formato MM/YYYY ou MM/YY
        const dateMatch = str.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
        if (dateMatch && !mesStr) {
          const m = dateMatch[1].padStart(2, "0");
          const y = dateMatch[2].length === 2 ? `20${dateMatch[2]}` : dateMatch[2];
          mesStr = `${m}/${y}`;
        }
      }

      // Verificar se é valor numérico
      if (typeof cell === "number" && cell > 0) {
        valorNum = cell;
      } else if (typeof cell === "string") {
        const numStr = cell.replace(/[R$\s.]/g, "").replace(",", ".");
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed) && parsed > 0 && parsed > valorNum) {
          valorNum = parsed;
        }
      }
    }

    if (mesStr && valorNum > 0) {
      meses.push({
        mes: mesStr,
        valor: valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      });
    }
  });

  // Ordenar meses por data crescente (mais antigo primeiro)
  const mesesOrdenados = [...meses].sort((a, b) => {
    const [ma, ya] = a.mes.split("/").map(Number);
    const [mb, yb] = b.mes.split("/").map(Number);
    return (ya - yb) || (ma - mb);
  });
  // Últimos 12 meses (independente de valor)
  const mesesFMM = mesesOrdenados.slice(-12);

  const parseBRVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;

  // somatoriaAno = soma dos ÚLTIMOS 12 meses (valor anualizado)
  const valoresAll = meses.map(m => parseBRVal(m.valor));
  const valores12 = mesesFMM.map(m => parseBRVal(m.valor));
  const soma = valores12.reduce((a, b) => a + b, 0);

  // FMM = soma / quantidade real de meses (não fixo em 12)
  const valoresFMM = mesesFMM.map(m => parseBRVal(m.valor));
  const media = mesesFMM.length > 0 ? valoresFMM.reduce((a, b) => a + b, 0) / mesesFMM.length : 0;

  // Meses zerados nos últimos 12
  const mesesZeradosExcel = mesesFMM
    .filter((_, i) => valoresFMM[i] === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  // Verificar alertas
  const faturamentoZerado = valoresAll.length === 0 || valoresAll.every(v => v === 0);
  const ultimoMes = mesesOrdenados.length > 0 ? mesesOrdenados[mesesOrdenados.length - 1].mes : "";

  // Verificar se dados estão atualizados (últimos 60 dias)
  let dadosAtualizados = true;
  if (ultimoMes) {
    const [m, y] = ultimoMes.split("/").map(Number);
    const lastDataDate = new Date(y, m - 1, 28); // último dia do mês dos dados
    const now = new Date();
    const diffDays = (now.getTime() - lastDataDate.getTime()) / (1000 * 60 * 60 * 24);
    dadosAtualizados = diffDays <= 75; // ~60 dias + margem
  }

  return {
    meses,
    somatoriaAno: soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    mediaAno: media.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    faturamentoZerado,
    dadosAtualizados,
    ultimoMesComDados: ultimoMes,
    mesesZerados: mesesZeradosExcel,
    quantidadeMesesZerados: mesesZeradosExcel.length,
    temMesesZerados: mesesZeradosExcel.length > 0,
  };
}

// ─────────────────────────────────────────
// Layer 3 — Detecção de subformato (determinística, sem chamada IA)
// ─────────────────────────────────────────
type Subformat =
  | "SCR_BACEN_SEM_DADOS"
  | "SCR_BUREAU"
  | "FAT_DAS"
  | "FAT_BANCARIO"
  | "IR_RECIBO"
  | "DEFAULT";

function detectSubformat(docType: string, text: string): Subformat {
  const t = text.toUpperCase();

  if (docType === "scr") {
    if (
      t.includes("NAO POSSUI DADOS NO SCR") || t.includes("NÃO POSSUI DADOS NO SCR") ||
      t.includes("SEM OPERACOES REGISTRADAS") || t.includes("SEM OPERAÇÕES REGISTRADAS") ||
      (t.includes("CLIENTE") && t.includes("NAO POSSUI") && t.includes("SCR"))
    ) return "SCR_BACEN_SEM_DADOS";
    if (
      t.includes("CREDIT HUB") || t.includes("CONSULTA SIMPLES") ||
      t.includes("BOA VISTA SCPC") || t.includes("QUOD") ||
      (t.includes("PEFIN") && t.includes("REFIN")) ||
      (t.includes("NEGATIVAC") && !t.includes("CARTEIRA A VENCER"))
    ) return "SCR_BUREAU";
  }

  if (docType === "faturamento") {
    if (t.includes("PGDAS") || (t.includes("SIMPLES NACIONAL") && t.includes("RECEITA BRUTA"))) return "FAT_DAS";
    if (
      t.includes("SALDO ANTERIOR") &&
      (t.includes("CRÉDITO") || t.includes("CREDITO")) &&
      (t.includes("DÉBITO") || t.includes("DEBITO"))
    ) return "FAT_BANCARIO";
  }

  if (docType === "ir_socio") {
    if (
      (t.includes("RECIBO DE ENTREGA") || t.includes("RECIBO DA DECLARACAO")) &&
      !t.includes("BENS E DIREITOS") && !t.includes("RENDIMENTOS TRIBUTAVEIS")
    ) return "IR_RECIBO";
  }

  return "DEFAULT";
}

// ─────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────

const PROMPT_CNPJ = `Você receberá um PDF de Comprovante de Inscrição e Situação Cadastral (Cartão CNPJ) emitido pela Receita Federal do Brasil. Extraia todos os campos presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "tipo": "",
  "razao_social": "",
  "nome_fantasia": "",
  "porte": "",
  "data_abertura": "",
  "situacao_cadastral": "",
  "data_situacao_cadastral": "",
  "situacao_especial": "",
  "data_situacao_especial": "",
  "natureza_juridica_codigo": "",
  "natureza_juridica_descricao": "",
  "cnae_principal_codigo": "",
  "cnae_principal_descricao": "",
  "cnaes_secundarios": [
    { "codigo": "", "descricao": "" }
  ],
  "endereco": {
    "logradouro": "",
    "numero": "",
    "complemento": "",
    "bairro": "",
    "municipio": "",
    "uf": "",
    "cep": ""
  },
  "email": "",
  "telefone": "",
  "data_emissao_documento": ""
}

Regras:
- Campos com valor ******** ou em branco → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- data_abertura → extrair EXATAMENTE como aparece no documento. Formatos aceitos: DD/MM/AAAA, MM/AAAA, AAAA. NUNCA converter ou reformatar — retornar o valor original
- Outras datas → formato DD/MM/AAAA
- cnaes_secundarios sempre como array — vazio [] se não houver nenhum
- Nunca inventar dados ausentes — se o campo não existir no documento, retornar null`;

const PROMPT_QSA = `Você receberá um PDF de Consulta ao Quadro de Sócios e Administradores (QSA) emitido pela Receita Federal do Brasil. Extraia todos os campos presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "razao_social": "",
  "capital_social_valor": "",
  "capital_social_extenso": "",
  "data_emissao_documento": "",
  "socios": [
    {
      "nome": "",
      "cpf": "",
      "qualificacao_codigo": "",
      "qualificacao_descricao": "",
      "participacao": "",
      "data_entrada": ""
    }
  ]
}

Regras:
- Campos ausentes ou em branco → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- CPF pode vir MASCARADO no cartão CNPJ (ex: "***.456.789-**") — mantenha como está
- CPF do sócio pode NÃO constar no documento — retornar null se ausente, NUNCA inventar
- Datas sempre no formato DD/MM/AAAA
- capital_social_valor sempre como número float sem formatação — ex: 50000.00 (de "R$50.000,00")
- capital_social_extenso é o valor por extenso conforme consta no documento — ex: "Cinquenta mil reais"
- qualificacao_codigo é o número antes do hífen — ex: "49"
- qualificacao_descricao é o texto após o hífen — ex: "Sócio-Administrador" (retornar a descrição completa, não só o código)
- participacao como "XX,XX%" (com vírgula e símbolo %), calcule a partir das cotas quando necessário
- socios sempre como array — pode ter um ou vários sócios
- NUNCA retorne socios=[] se há qualquer menção a sócios no documento
- Excluir: testemunhas, advogados, contadores, procuradores sem cotas, cônjuges sem cotas
- Deduplicar: se o mesmo CPF aparece múltiplas vezes, manter 1x com a qualificação mais completa
- Nunca inventar dados ausentes`;

const PROMPT_CONTRATO = `Você receberá um PDF de Contrato Social, Alteração Contratual ou Consolidação registrado em Junta Comercial. O documento pode conter múltiplas seções: certidão de inteiro teor, requerimento capa, texto do contrato/alteração, protocolo de assinaturas e termo de autenticação. Extraia os dados abaixo e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "nire": "",
  "razao_social": "",
  "nome_fantasia": "",
  "tipo_juridico": "",
  "natureza_juridica_codigo": "",
  "porte": "",
  "foro": "",
  "data_constituicao": "",
  "data_inicio_atividades": "",
  "prazo_duracao": "",
  "objeto_social": "",
  "objeto_social_itens": [""],
  "capital_social_valor": null,
  "capital_social_extenso": "",
  "capital_integralizado": null,
  "quota_valor_unitario": null,
  "total_quotas": null,
  "endereco_atual": {
    "logradouro": "", "numero": "", "complemento": "",
    "bairro": "", "municipio": "", "uf": "", "cep": ""
  },
  "filiais": [
    {
      "cnpj": "", "nire": "",
      "logradouro": "", "numero": "", "bairro": "",
      "municipio": "", "uf": "", "cep": ""
    }
  ],
  "socios": [
    {
      "nome": "", "cpf": "", "rg": "", "orgao_emissor_rg": "",
      "nacionalidade": "", "estado_civil": "", "regime_bens": "",
      "profissao": "", "data_nascimento": "", "naturalidade": "",
      "endereco_residencial": "",
      "quotas": null, "valor_total_quotas": null,
      "percentual_participacao": null,
      "qualificacao": "", "administrador": null,
      "retirante": false
    }
  ],
  "socios_retirantes": [
    {
      "nome": "", "cpf": "",
      "quotas_cedidas": null, "valor_quotas_cedidas": null,
      "cessionario": "", "data_retirada": ""
    }
  ],
  "quadro_anterior": [
    {
      "nome": "", "cpf": "",
      "quotas": null, "valor_total_quotas": null, "percentual_participacao": null,
      "qualificacao": "", "administrador": null
    }
  ],
  "administracao": {
    "administradores": [{ "nome": "", "qualificacao": "" }],
    "forma_assinatura": ""
  },
  "registro_junta": {
    "orgao": "",
    "protocolo": "",
    "data_protocolo": "",
    "numero_registro": "",
    "data_registro": "",
    "data_efeitos": "",
    "codigo_controle": "",
    "data_expedicao_certidao": ""
  },
  "ultima_alteracao": {
    "tipo_ato": "",
    "numero_alteracao": "",
    "data_assinatura": "",
    "data_registro": ""
  }
}

Regras:
- Campos ausentes ou não mencionados → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- CPF sempre com máscara XXX.XXX.XXX-XX
- Datas sempre no formato DD/MM/AAAA — INCLUINDO datas por extenso: "20 de janeiro de 2025" → "20/01/2025"
- Valores monetários: retorne como float SEM formatação — ex: 500000.00
- IMPORTANTE — formato brasileiro: "500.000,00" = 500000.00 (ponto=milhar, vírgula=decimal)
- administrador → true se for administrador, false se não, null se não mencionado
- retirante → true APENAS para sócios que saíram neste ato ou estão explicitamente como retirantes
- socios → lista APENAS os sócios do quadro ATUAL (após a alteração ou na constituição)
- socios_retirantes → sócios que saíram da sociedade neste ato, com quantas quotas cederam, para quem e por quanto
- quadro_anterior → composição societária ANTES deste ato (se descrita no documento); campos mínimos: nome, cpf, quotas, percentual
- filiais → todas as filiais listadas na cláusula de sede ou no corpo do contrato; cada uma com seu CNPJ e NIRE próprios
- objeto_social_itens → cada atividade como item separado do array; não resumir
- registro_junta.protocolo → número de protocolo de entrada na Junta; data_protocolo → data de entrada; numero_registro → número do arquivamento/registro; data_registro → data em que foi registrado; data_efeitos → data de vigência (geralmente a data de assinatura do ato)
- administracao.forma_assinatura → ex: "assinatura isolada", "assinatura em conjunto"
- Pró-labore sem valor definido no documento → retornar null, nunca zero
- Ignorar páginas de protocolo de assinaturas digitais, declarações de licenciamento e termos de autenticação
- Nunca inventar dados ausentes`;

const PROMPT_FATURAMENTO = `Você receberá um documento de faturamento de uma empresa brasileira. Pode ser qualquer formato: relatório contábil assinado, DAS/PGDAS do Simples Nacional, extrato de sistema contábil (Omie, Totvs, Sankhya, Sieg, NFe.io, SPED, Domínio, Alterdata, etc.), planilha interna, resumo de Notas Fiscais, declaração de faturamento, ou qualquer documento que contenha receita mensal. Extraia todos os dados e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "razao_social": "",
  "inscricao_estadual": "",
  "endereco": "",
  "cidade": "",
  "cep": "",
  "data_emissao": "",
  "periodo_inicio": "",
  "periodo_fim": "",
  "meses": [
    {
      "mes": "",
      "ano": null,
      "saidas": null,
      "servicos": null,
      "outros": null,
      "total": null
    }
  ],
  "totais_por_ano": [
    { "ano": null, "total": null, "media_mensal": null }
  ],
  "totais": { "saidas": null, "servicos": null, "outros": null, "total": null },
  "media_mensal": { "saidas": null, "servicos": null, "outros": null, "total": null },
  "assinaturas": [ { "nome": "", "cpf": "", "papel": "" } ],
  "contador": { "nome": "", "cpf": "", "crc": "" }
}

Regras gerais:
- Campos ausentes → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- CPF sempre com máscara XXX.XXX.XXX-XX
- Datas sempre no formato DD/MM/AAAA
- Valores monetários: retorne como número inteiro ou float SEM formatação — ex: 10809058 ou 1470330.13
- IMPORTANTE — formato brasileiro: ponto (.) é separador de milhar, NÃO decimal. "10.809.058" = dez milhões = 10809058. "1.470.330,13" = 1470330.13. Remova pontos de milhar e troque vírgula decimal por ponto.

Regras para o array "meses" (mais importante):
- Extraia UMA entrada por mês com valor de faturamento/receita. Para tabelas com múltiplos anos, UMA entrada por combinação (mês + ano). Ex: Janeiro/2024 e Janeiro/2025 = duas entradas separadas.
- "mes" deve ser o nome do mês em português — ex: "Janeiro", "Fevereiro". NUNCA usar número.
- "ano" deve ser o ano como número inteiro — ex: 2024, 2025.
- "total" = valor total de receita do mês (saídas + serviços + outros, ou o único valor disponível).
- Se o documento não tiver colunas separadas de saidas/servicos/outros, preencha apenas "total" e deixe os outros null.
- Meses com valor R$ 0,00 EXPLÍCITO no documento → retornar 0 (zero), NUNCA null. Zeros são dados válidos (empresa pode não ter faturado naquele mês).
- Meses completamente ausentes do documento (linha não existe) → retornar null.
- CRÍTICO: inclua TODOS os meses com qualquer valor, incluindo os que têm zero — não pule meses zerados.
- Se o valor vier em formato "R$ 1.250.000,00" → total = 1250000.0.
- Ordem cronológica: mais antigo primeiro.

Adaptações por tipo de documento:
- DAS / PGDAS (Simples Nacional): o "total" de cada mês é a Receita Bruta Total declarada (RBT) ou o faturamento do período. Use o campo "Receita Bruta Total do Período de Apuração" ou equivalente.
- SPED Fiscal / ECD: usar coluna de receita bruta ou total de vendas por mês.
- Sistema contábil (Omie, Totvs, Sankhya, etc.): usar a coluna de total ou faturamento bruto; se houver linhas de devolução/desconto, use o valor BRUTO antes das deduções.
- Planilha interna: se houver coluna "Faturamento", "Receita", "Total" ou "Vendas" → usar essa coluna. Se houver várias colunas, somar para obter o total.
- Resumo de NF-e: usar o campo "Valor Total das NF-e emitidas" ou soma das notas do período.
- Se houver coluna de "Faturamento Bruto" e outra de "Faturamento Líquido" → usar Bruto.

- totais_por_ano: preencha uma entrada por ano presente no documento com o total anual e a média mensal daquele ano.
- assinaturas inclui todos os signatários listados (sócio, contador etc.) — cada um com papel identificado.
- Nunca inventar dados ausentes`;

const PROMPT_SCR = `CONTEXTO DO DOCUMENTO:
Este documento é um SCR de {{TIPO_ESPERADO}}.
- Se TIPO_ESPERADO = "PJ": o consultado é uma empresa. Retornar tipo_cliente: "PJ". CPF deve ser null.
- Se TIPO_ESPERADO = "PF": o consultado é uma pessoa física. Retornar tipo_cliente: "PF". CNPJ deve ser null. Empresas que aparecem nas modalidades são credoras, não o consultado.

Você receberá um PDF de Resultado de Consulta SCR emitido pelo Banco Central do Brasil. O documento pode ser de Pessoa Física ou Pessoa Jurídica. Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cpf_cnpj": "",
  "tipo_cliente": "",
  "periodo_referencia": "",
  "inicio_relacionamento": "",
  "classificacao_risco": null,
  "dados_operacao": {
    "coobrigacao_assumida": null,
    "coobrigacao_recebida": null,
    "percentual_doctos_processados": null,
    "percentual_volume_processado": null,
    "qtde_operacoes_discordancia": null,
    "valor_operacoes_discordancia": null,
    "qtde_operacoes_sub_judice": null,
    "valor_operacoes_sub_judice": null,
    "qtde_instituicoes": null,
    "qtde_operacoes": null,
    "risco_indireto_vendor": null
  },
  "carteira_a_vencer": {
    "de_14_a_30_dias": null,
    "de_31_a_60_dias": null,
    "de_61_a_90_dias": null,
    "de_91_a_180_dias": null,
    "de_181_a_360_dias": null,
    "acima_de_360_dias": null,
    "prazo_indeterminado": null,
    "total": null
  },
  "vencidos": {
    "de_15_a_30_dias": null,
    "de_31_a_60_dias": null,
    "de_61_a_90_dias": null,
    "de_91_a_180_dias": null,
    "de_181_a_360_dias": null,
    "acima_de_360_dias": null,
    "total": null
  },
  "prejuizos": {
    "ate_12_meses": null,
    "acima_12_meses": null,
    "total": null
  },
  "limite_credito": {
    "ate_360_dias": null,
    "acima_360_dias": null,
    "total": null
  },
  "outros_valores": {
    "carteira_credito": null,
    "repasses": null,
    "coobrigacoes": null,
    "responsabilidade_total": null,
    "creditos_a_liberar": null,
    "risco_indireto_vendor": null,
    "risco_total": null
  },
  "modalidades": [
    {
      "tipo": "",
      "codigo_modalidade": "",
      "dominio": "",
      "subdominio": "",
      "valor": null,
      "situacao": ""
    }
  ]
}

Regras:
- Campos ausentes → retornar null
- CPF com máscara XXX.XXX.XXX-XX, CNPJ com máscara XX.XXX.XXX/XXXX-XX
- periodo_referencia no formato MM/AAAA — ex: "01/2025"
- inicio_relacionamento no formato DD/MM/AAAA
- Todos os valores monetários como float sem formatação — ex: 112339.53
- tipo_cliente → "PF" ou "PJ"
- modalidades → capture TODAS as linhas de modalidades de TODAS as páginas do documento — não pare na primeira página. situacao = "A VENCER", "VENCIDO" ou "PREJUIZO" conforme consta no documento; codigo_modalidade = código numérico — ex: "0203"
- Valores R$ 0,00 são dados VÁLIDOS — retorne 0, nunca null para eles (vencidos zerados, prejuízos zerados etc.)
- Se o documento contiver dois períodos, retornar apenas o mais recente (o período anterior será enviado em um segundo upload)
- carteira_a_vencer: extrair TODAS as 7 faixas do BACEN — a faixa "De 14 a 30 dias" (a primeira/menor) deve ir em "de_14_a_30_dias". NUNCA deixe essa faixa como null se houver valor na seção "A Vencer". Confira que total = soma das 7 faixas.
- vencidos: a primeira faixa no BACEN chama "De 15 a 30 dias" (diferente de a_vencer) — vai em "de_15_a_30_dias". Confira que total = soma das 6 faixas. O "total" declarado no documento é o valor correto — não recalcule.
- prejuizos → seção "Prejuízo (B)" do documento BACEN. ATENÇÃO: esta seção é DIFERENTE de "Vencidos" — são créditos já lançados como perda pela instituição financeira. Extrair obrigatoriamente: ate_12_meses = linha "Prejuízo até 12 meses"; acima_12_meses = linha "Prejuízo acima de 12 meses" (pode aparecer como "acima de 12 a 48 meses" dependendo do banco); total = valor do campo "Prejuízo (B)" conforme declarado no documento, ou soma das duas faixas. NUNCA retornar null ou 0 se houver qualquer linha de prejuízo no documento. Exemplo real: "Prejuízo (B) R$ 5.304.569,54 82,39%" → prejuizos.total = 5304569.54
- classificacao_risco → campo "Classificação de risco" do cabeçalho do documento BACEN. Valores possíveis: AA, A, B, C, D, E, F, G, H, HH. Extrair exatamente como aparece no documento. IMPORTANTE: "HH" indica risco máximo (pior classificação — operações em prejuízo).
- Nunca inventar dados ausentes`;

// ── Subformato SCR: cliente sem operações no período ──────────────────────────
const PROMPT_SCR_SEM_DADOS = `Este documento SCR do Banco Central do Brasil indica que o cliente não possui operações registradas no SCR para o período consultado. Extraia apenas os dados de identificação presentes e retorne SOMENTE um JSON válido.

{
  "cpf_cnpj": "",
  "tipo_cliente": "",
  "periodo_referencia": "",
  "inicio_relacionamento": null,
  "sem_dados_scr": true,
  "dados_operacao": { "coobrigacao_assumida": 0, "coobrigacao_recebida": 0, "percentual_doctos_processados": null, "percentual_volume_processado": null, "qtde_operacoes_discordancia": 0, "valor_operacoes_discordancia": 0, "qtde_operacoes_sub_judice": 0, "valor_operacoes_sub_judice": 0, "qtde_instituicoes": 0, "qtde_operacoes": 0, "risco_indireto_vendor": 0 },
  "carteira_a_vencer": { "de_14_a_30_dias": 0, "de_31_a_60_dias": 0, "de_61_a_90_dias": 0, "de_91_a_180_dias": 0, "de_181_a_360_dias": 0, "acima_de_360_dias": 0, "prazo_indeterminado": 0, "total": 0 },
  "vencidos": { "de_15_a_30_dias": 0, "de_31_a_60_dias": 0, "de_61_a_90_dias": 0, "de_91_a_180_dias": 0, "de_181_a_360_dias": 0, "acima_de_360_dias": 0, "total": 0 },
  "prejuizos": { "ate_12_meses": 0, "acima_12_meses": 0, "total": 0 },
  "limite_credito": { "ate_360_dias": null, "acima_360_dias": null, "total": null },
  "outros_valores": { "carteira_credito": 0, "repasses": 0, "coobrigacoes": 0, "responsabilidade_total": 0, "creditos_a_liberar": null, "risco_indireto_vendor": 0, "risco_total": 0 },
  "modalidades": []
}

Regras:
- cpf_cnpj: extraia o CPF ou CNPJ do cabeçalho — CPF com máscara XXX.XXX.XXX-XX, CNPJ com XX.XXX.XXX/XXXX-XX. Se aparecer como "Raiz do documento: 59061963000148" complete com zeros: "59.061.963/0001-48" (atenção: alguns têm apenas a raiz sem filial, assumir /0001-XX se 8 dígitos)
- tipo_cliente: "PF" ou "PJ"
- periodo_referencia: formato MM/AAAA — ex: "Mar/25" → "03/2025"; "02/2026" → "02/2026"
- sem_dados_scr deve ser sempre true
- Todos os valores de operações e carteiras = 0 (zero), NÃO null — significa sem dívidas no sistema
- modalidades = [] (array vazio)
- Nunca inventar dados`;

// ── Subformato SCR: bureau (Credit Hub, Quod, Boa Vista, Serasa) ──────────────
const PROMPT_SCR_BUREAU = `Você receberá um relatório de bureau de crédito (Credit Hub, Quod, Boa Vista SCPC, Serasa Experian ou similar). Este documento tem formato diferente do SCR BACEN — não possui faixas de vencimento, mas contém resumo de negativações e pendências. Extraia os dados disponíveis e retorne SOMENTE um JSON válido.

{
  "cpf_cnpj": "",
  "tipo_cliente": "",
  "periodo_referencia": "",
  "inicio_relacionamento": null,
  "fonte_bureau": "",
  "dados_operacao": { "coobrigacao_assumida": null, "coobrigacao_recebida": null, "percentual_doctos_processados": null, "percentual_volume_processado": null, "qtde_operacoes_discordancia": null, "valor_operacoes_discordancia": null, "qtde_operacoes_sub_judice": null, "valor_operacoes_sub_judice": null, "qtde_instituicoes": null, "qtde_operacoes": null, "risco_indireto_vendor": null },
  "carteira_a_vencer": { "de_14_a_30_dias": null, "de_31_a_60_dias": null, "de_61_a_90_dias": null, "de_91_a_180_dias": null, "de_181_a_360_dias": null, "acima_de_360_dias": null, "prazo_indeterminado": null, "total": null },
  "vencidos": { "de_15_a_30_dias": null, "de_31_a_60_dias": null, "de_61_a_90_dias": null, "de_91_a_180_dias": null, "de_181_a_360_dias": null, "acima_de_360_dias": null, "total": null },
  "prejuizos": { "ate_12_meses": null, "acima_12_meses": null, "total": null },
  "limite_credito": { "ate_360_dias": null, "acima_360_dias": null, "total": null },
  "outros_valores": { "carteira_credito": null, "repasses": null, "coobrigacoes": null, "responsabilidade_total": null, "creditos_a_liberar": null, "risco_indireto_vendor": null, "risco_total": null },
  "modalidades": [
    { "tipo": "", "codigo_modalidade": "", "dominio": "", "subdominio": "", "valor": null, "situacao": "" }
  ]
}

Mapeamento de campos de bureau para o schema:
- vencidos.total → soma de Pefin + Refin + negativações ativas em valor (R$). Se zero = 0.
- prejuizos.total → perdas/write-offs mencionados. Se ausente = null.
- outros_valores.responsabilidade_total → total de dívidas ativas (todas as pendências financeiras somadas)
- modalidades → liste cada negativação/pendência individual como um item:
  * tipo = "VENCIDO" se negativação ativa, "A VENCER" se compromisso futuro, "PREJUIZO" se write-off
  * dominio = nome do credor/banco/fonte
  * subdominio = categoria (ex: "Pefin Serasa", "Cheque sem fundos", "Protesto")
  * valor = valor da ocorrência como float
  * situacao = "VENCIDO", "A VENCER" ou "PREJUIZO"
  * codigo_modalidade = "" (bureau não tem código BACEN)
- fonte_bureau → "CREDIT HUB", "QUOD", "BOA VISTA", "SERASA" ou nome identificado no documento
- periodo_referencia → data de geração do relatório no formato MM/AAAA
- tipo_cliente → "PF" ou "PJ"
- Valores R$ 0,00 = retornar 0, não null
- Nunca inventar dados`;

// ── Subformato Faturamento: DAS/PGDAS Simples Nacional ────────────────────────
const PROMPT_FAT_DAS = `Você receberá um documento DAS/PGDAS do Simples Nacional emitido pela Receita Federal. Extraia todos os dados e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown.

{
  "cnpj": "",
  "razao_social": "",
  "inscricao_estadual": null,
  "endereco": null,
  "cidade": null,
  "cep": null,
  "data_emissao": "",
  "periodo_inicio": "",
  "periodo_fim": "",
  "meses": [
    { "mes": "", "ano": null, "saidas": null, "servicos": null, "outros": null, "total": null }
  ],
  "totais_por_ano": [
    { "ano": null, "total": null, "media_mensal": null }
  ],
  "totais": { "saidas": null, "servicos": null, "outros": null, "total": null },
  "media_mensal": { "saidas": null, "servicos": null, "outros": null, "total": null },
  "assinaturas": [],
  "contador": { "nome": null, "cpf": null, "crc": null }
}

Regras DAS/PGDAS específicas:
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- Para cada período de apuração (mês/ano), o "total" = campo "Receita Bruta Total do Período de Apuração" ou "RBT" ou "Receita Bruta Total". Este é o faturamento declarado ao Simples.
- "mes" = nome do mês em português — ex: "Janeiro", "Fevereiro". NUNCA número.
- "ano" = ano como inteiro — ex: 2024, 2025.
- Inclua um registro para CADA mês de apuração presente no documento.
- Meses com RBT = R$ 0,00 → retornar total = 0 (zero), NÃO null.
- Meses ausentes do documento → não incluir no array (não forçar null).
- Valores monetários: retorne como float sem formatação. "R$ 1.250.000,00" → 1250000.0. Ponto é milhar, vírgula é decimal.
- totais_por_ano: uma entrada por ano com total anual = soma dos meses do ano, media_mensal = total / 12.
- Ordem cronológica: mais antigo primeiro.
- Nunca inventar dados ausentes`;

// ── Subformato Faturamento: extrato bancário ──────────────────────────────────
const PROMPT_FAT_BANCARIO = `Você receberá um extrato bancário de conta corrente ou conta PJ. Extraia o faturamento mensal (entradas/créditos) e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown.

{
  "cnpj": "",
  "razao_social": "",
  "inscricao_estadual": null,
  "endereco": null,
  "cidade": null,
  "cep": null,
  "data_emissao": "",
  "periodo_inicio": "",
  "periodo_fim": "",
  "meses": [
    { "mes": "", "ano": null, "saidas": null, "servicos": null, "outros": null, "total": null }
  ],
  "totais_por_ano": [
    { "ano": null, "total": null, "media_mensal": null }
  ],
  "totais": { "saidas": null, "servicos": null, "outros": null, "total": null },
  "media_mensal": { "saidas": null, "servicos": null, "outros": null, "total": null },
  "assinaturas": [],
  "contador": { "nome": null, "cpf": null, "crc": null }
}

Regras extrato bancário:
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- "total" de cada mês = SOMA de todas as entradas/créditos do mês (coluna C, Crédito, Entrada ou similar). NÃO incluir débitos/saídas — queremos receita, não despesa.
- Se o extrato mostrar apenas saldo final sem discriminar créditos/débitos por mês, calcule: saldo_final - saldo_inicial + débitos_do_mês = créditos_do_mês.
- Meses com crédito zero → retornar 0 (zero), NÃO null.
- "mes" = nome do mês em português. "ano" = inteiro.
- Valores: float sem formatação. Ponto é milhar, vírgula é decimal.
- Ordem cronológica: mais antigo primeiro.
- Nunca inventar dados ausentes`;

// ── Subformato IR: apenas recibo de entrega ────────────────────────────────────
const PROMPT_IR_RECIBO = `Você receberá um Recibo de Entrega da DIRPF — apenas o comprovante de que a declaração foi enviada à Receita Federal. Este documento NÃO contém dados financeiros completos. Extraia apenas os dados de identificação presentes e retorne SOMENTE um JSON válido.

{
  "nome": "",
  "cpf": "",
  "exercicio": null,
  "ano_calendario": null,
  "tipo_declaracao": "Recibo de Entrega",
  "numero_recibo_ultima_declaracao": "",
  "identificacao": { "data_nascimento": null, "possui_conjuge": null, "cpf_conjuge": null, "natureza_ocupacao_codigo": null, "natureza_ocupacao_descricao": null, "ocupacao_principal_codigo": null, "ocupacao_principal_descricao": null, "endereco": { "logradouro": null, "numero": null, "complemento": null, "bairro": null, "municipio": null, "uf": null, "cep": null }, "email": null, "telefone": null, "celular": null },
  "dependentes": [],
  "alimentandos": [],
  "rendimentos_tributaveis_pj_titular": [],
  "rendimentos_isentos_nao_tributaveis": [],
  "rendimentos_tributacao_exclusiva": [],
  "imposto_pago_retido": { "imposto_complementar": null, "imposto_pago_exterior": null, "imposto_retido_fonte_titular": null, "imposto_retido_fonte_dependentes": null, "carne_leao_titular": null, "carne_leao_dependentes": null, "total_imposto_pago": null },
  "pagamentos_efetuados": [],
  "bens_e_direitos": [],
  "dividas_onus_reais": [],
  "resumo": { "total_rendimentos_tributaveis": null, "total_deducoes": null, "base_calculo_imposto": null, "aliquota_efetiva_percent": null, "imposto_devido": null, "imposto_a_restituir": null, "saldo_imposto_a_pagar": null, "pensao_alimenticia_judicial": null, "rendimentos_isentos_nao_tributaveis": null, "rendimentos_tributacao_exclusiva": null },
  "evolucao_patrimonial": { "bens_direitos_ano_anterior": null, "bens_direitos_ano_atual": null, "dividas_ano_anterior": null, "dividas_ano_atual": null }
}

Regras:
- nome e cpf → do cabeçalho do recibo. CPF com máscara XXX.XXX.XXX-XX.
- exercicio → ano do exercício (ex: 2025). ano_calendario → ano-calendário (ex: 2024).
- numero_recibo_ultima_declaracao → número do recibo de entrega se presente.
- Todos os demais campos financeiros = null ou [] — este documento não os contém.
- Nunca inventar dados`;

const PROMPT_PROTESTOS = `Você receberá uma certidão de protestos (SERASA, cartório, CRC, IEPTB ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"vigentesQtd":"","vigentesValor":"","regularizadosQtd":"","regularizadosValor":"","detalhes":[{"data":"","credor":"","valor":"","numero":"","cartorio":"","cidade":"","regularizado":false}]}

CLASSIFICAÇÃO — ATENÇÃO aos status:
- VIGENTES (ativos): protestos que ainda constam registrados e NÃO foram pagos nem cancelados
- REGULARIZADOS: status "PAGO", "CANCELADO", "BAIXADO", "QUITADO", "SUSTADO", "RETIRADO" ou similar
- Um protesto "CANCELADO" por ordem judicial continua sendo regularizado (não vigente)

Regras:
- vigentesQtd: número de protestos com status ativo como string (ex: "3")
- vigentesValor: soma dos valores vigentes em formato brasileiro (ex: "15.432,00"). SEM prefixo "R$".
- regularizadosQtd: número de protestos regularizados como string
- regularizadosValor: soma dos valores regularizados em formato brasileiro

Array detalhes — liste TODOS os protestos individualmente (vigentes E regularizados):
- data: DD/MM/AAAA — data de registro do protesto
- credor: nome do credor/apresentante/portador exatamente como consta
- valor: em reais formato brasileiro (ex: "2.340,00") — SEM "R$"
- numero: número do título, protocolo ou cártula — senão ""
- cartorio: nome ou número do cartório (ex: "1º Tabelionato de Protesto de Títulos") — senão ""
- cidade: cidade do cartório no formato "Cidade/UF" (ex: "São Paulo/SP") — senão ""
- regularizado: true SE status indica pagamento, cancelamento, baixa ou quitação; false se vigente/ativo

Documentos negativos:
- Se certidão indicar "SEM RESTRIÇÕES", "NADA CONSTA", "NÃO CONSTAM PROTESTOS" ou similar:
  * vigentesQtd = "0"
  * vigentesValor = "0,00"
  * regularizadosQtd = "0"
  * regularizadosValor = "0,00"
  * detalhes = []

NÃO invente dados. Valores/campos ausentes = "".`;

const PROMPT_PROCESSOS = `Você receberá um relatório de processos judiciais (Credit Bureau, SERASA, Jusbrasil, Escavador, relatório de advogado ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"passivosTotal":"","ativosTotal":"","valorTotalEstimado":"","temRJ":false,"temRecuperacaoExtrajudicial":false,"distribuicao":[{"tipo":"","qtd":"","pct":""}],"bancarios":[{"banco":"","assunto":"","status":"","data":"","valor":"","numero":"","tribunal":""}],"fiscais":[{"contraparte":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"fornecedores":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"outros":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}]}

Totais:
- passivosTotal: processos onde a empresa é RÉ / EXECUTADA / REQUERIDA / PACIENTE — string numérica (ex: "12")
- ativosTotal: processos onde a empresa é AUTORA / EXEQUENTE / REQUERENTE / IMPETRANTE — string numérica
- valorTotalEstimado: valor total em reais com prefixo "R$" (ex: "R$ 450.000,00")

Flags críticos:
- temRJ: true se houver menção a "Recuperação Judicial", "RJ", "Deferimento de Processamento de RJ"
- temRecuperacaoExtrajudicial: true se "Recuperação Extrajudicial" ou "Homologação de Plano Extrajudicial"
- recuperacaoJudicial: se temRJ=true, preencha {"status":"DEFERIDA|EM_PROCESSAMENTO|CONCEDIDA|ENCERRADA|CONVERTIDA_EM_FALENCIA","dataDistribuicao":"DD/MM/YYYY","numeroProcesso":"CNJ se disponivel","tribunal":"sigla","administradorJudicial":"nome se disponivel"}. Se algum campo nao aparecer, deixe "".
- Se temRJ=false, recuperacaoJudicial pode ser omitido ou {} vazio.

Categorias (distribuicao — use EXATAMENTE estes tipos):
- "TRABALHISTA": reclamações trabalhistas, ações sindicais, execuções trabalhistas
- "BANCÁRIO": ações com bancos, financeiras, cooperativas de crédito como contraparte
- "FISCAL": execuções fiscais, dívida ativa, PGFN, Receita Federal, Fazenda Estadual/Municipal, INSS
- "FORNECEDOR": ações de cobrança movidas por fornecedores ou prestadores
- "CÍVEL": ações cíveis gerais (indenização, danos morais, contratos, responsabilidade civil, consumidor)
- "OUTROS": o que não se encaixa — criminais, ambientais, regulatórios, especiais

Detalhamento por array — NÃO duplique um processo entre arrays:
- bancarios[]: processos BANCÁRIOS individualizados
- fiscais[]: processos FISCAIS individualizados
- fornecedores[]: processos de FORNECEDOR individualizados
- outros[]: processos CÍVEIS + OUTROS individualizados
- TRABALHISTAS: NÃO liste individualmente por sigilo — apenas conte em distribuicao

Campos dos processos individuais:
- contraparte / banco: nome da parte adversa
- assunto: resumo em uma linha (ex: "Cobrança de duplicata", "Dano moral", "Execução de título")
- status: "EM ANDAMENTO" | "ARQUIVADO" | "JULGADO" | "EM RECURSO" | "SUSPENSO" | "DISTRIBUÍDO" | "TRANSITADO EM JULGADO"
- data: DD/MM/YYYY — data de distribuição
- valor: em reais formato brasileiro com "R$" (ex: "R$ 50.000,00") ou "" se indefinido
- numero: número CNJ completo (ex: "0000000-00.0000.0.00.0000") se disponível
- tribunal: sigla (ex: "TJSP", "TRT2", "TRF3", "STJ") se disponível

Documentos negativos:
- "NADA CONSTA" / "NÃO FORAM ENCONTRADOS PROCESSOS": passivosTotal="0", ativosTotal="0", distribuicao=[], arrays vazios

NÃO invente dados.`;

const PROMPT_GRUPO_ECONOMICO = `Você receberá um relatório de grupo econômico (Credit Bureau, SERASA, Escavador, relatório próprio ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"empresas":[{"razaoSocial":"","cnpj":"","relacao":"","participacaoSocio":"","scrTotal":"","protestos":"","processos":"","situacaoCadastral":""}]}

Regras:
- Liste TODAS as empresas vinculadas ao grupo econômico — EXCETO a empresa principal que está sendo analisada
- INCLUA empresas com status "BAIXADA", "INAPTA" ou "SUSPENSA" — elas são importantes para análise de histórico do grupo (sinalize no campo situacaoCadastral)
- razaoSocial: nome completo exatamente como consta, preservando acentos
- cnpj: formato XX.XXX.XXX/XXXX-XX
- relacao: tipo de vínculo — use UM dos valores:
  * "Controladora" — empresa que controla a analisada
  * "Controlada" — empresa controlada pela analisada
  * "Coligada" — participação relevante sem controle
  * "via Sócio" — mesmo sócio PF em ambas
  * "via QSA" — sócio PJ em comum
  * "Participação" — outra forma de vínculo societário
- participacaoSocio: percentual % do sócio comum na empresa vinculada (ex: "50%") — senão ""
- scrTotal: exposição SCR total se constar, formato "R$ 1.200.000,00" — senão ""
- protestos: quantidade de protestos da empresa vinculada (ex: "2") — senão ""
- processos: quantidade de processos (ex: "5") — senão ""
- situacaoCadastral: "ATIVA" | "BAIXADA" | "INAPTA" | "SUSPENSA" | "NULA" — senão ""

Ordenação: coloque empresas ATIVAS primeiro, depois as baixadas/inaptas/suspensas.

Se não houver grupo econômico: retorne {"empresas":[]}.

NÃO invente dados.`;

const PROMPT_CURVA_ABC = `Você receberá um PDF de Curva ABC ou relatório de faturamento por cliente, que pode conter gráficos, tabelas e mapas. Extraia todos os dados tabulares e numéricos presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "razao_social": "",
  "periodo_referencia": "",
  "anos_filtro": [],
  "total_faturado": null,
  "faturamento_por_mes": [
    { "mes": "", "ano": null, "valor": null }
  ],
  "faturamento_por_vendedor": [
    { "vendedor": "", "valor": null }
  ],
  "faturamento_por_empresa_grupo": [
    { "empresa": "", "valor": null, "percentual": null }
  ],
  "faturamento_por_regiao": [
    { "regiao": "", "valor": null }
  ],
  "curva_abc_clientes": [
    {
      "posicao": null,
      "cliente": "",
      "valor": null,
      "percentual": null,
      "classificacao": ""
    }
  ],
  "assinatura": {
    "nome": "",
    "data": ""
  }
}

Regras:
- Campos ausentes ou não visíveis no documento → retornar null
- Datas sempre no formato DD/MM/AAAA
- Valores monetários como float sem formatação — ex: 817336.00
- Percentuais como float — ex: 15.02
- faturamento_por_mes → extrair todos os meses visíveis com seus valores
- curva_abc_clientes → extrair TODOS os clientes da tabela. ATENÇÃO — leia linha a linha com máxima precisão: cada linha tem um cliente e um valor; NÃO misture clientes com valores de linhas diferentes. Se o documento tiver posição numérica (1, 2, 3…) ao lado de cada cliente, use-a como referência para conferir a ordem. Após extrair, ordene do maior para o menor valor (decrescente); posicao sequencial a partir de 1.
- classificacao → classificar cada cliente como "A", "B" ou "C" com base no percentual acumulado: A = até 80%, B = 80–95%, C = acima de 95%. Se o próprio documento já trouxer a classificação, use-a para validar.
- CRÍTICO — TOP 5: os 5 primeiros clientes por valor são os mais importantes. Confira duas vezes: o cliente com o MAIOR valor monetário (R$) deve aparecer em posicao=1. Se o valor do 1º for menor que o do 2º, você errou — revise.
- Se o documento mostrar apenas percentuais sem valor absoluto e o total_faturado estiver disponível, calcule: valor = (percentual/100) * total_faturado.
- faturamento_por_empresa_grupo → extrair a divisão de faturamento entre empresas do grupo quando disponível
- anos_filtro → array com os anos selecionados no filtro do dashboard — ex: [2023, 2024, 2025]
- Nomes de clientes devem ser transcritos exatamente como aparecem no documento, mesmo que truncados
- Nunca inventar dados ausentes
- Se a lista de clientes for muito extensa (acima de 300 clientes), priorize extrair:
  1. Os top 20 clientes por valor (classe A)
  2. Os totalizadores: total_faturado, e calcule internamente concentracaoTop3/Top5/Top10, maiorCliente, maiorClientePct
  3. Os demais clientes de classe B e C em ordem decrescente até o limite de tokens disponível
  NUNCA deixar os totalizadores vazios mesmo que a lista de clientes seja truncada — os totalizadores são mais importantes que a lista completa`;

const PROMPT_DRE = `Você receberá um PDF de Demonstração do Resultado do Exercício (DRE). O documento pode conter colunas para dois anos (ano atual e ano anterior). Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "razao_social": "",
  "data_referencia": "",
  "data_assinatura": "",
  "anos": [
    {
      "ano": null,
      "receita_bruta": null,
      "receita_bruta_vendas_mercadorias": null,
      "receita_prestacao_servicos": null,
      "deducoes_receita_bruta": null,
      "cancelamentos_devolucoes": null,
      "impostos_sobre_vendas": null,
      "custos_total": null,
      "custos_detalhes": {},
      "receita_liquida": null,
      "lucro_bruto": null,
      "despesas_operacionais_total": null,
      "despesas_vendas": null,
      "despesas_entrega": null,
      "despesas_viagens_representacoes": null,
      "despesas_administrativas": null,
      "despesas_pessoal": null,
      "impostos_taxas_contribuicoes": null,
      "despesas_gerais": null,
      "despesas_financeiras": null,
      "receitas_financeiras": null,
      "juros_descontos": null,
      "resultado_operacional": null,
      "resultado_antes_ir_csl": null,
      "provisao_irpj_csll": null,
      "lucro_liquido_exercicio": null,
      "margem_bruta_percent": null,
      "margem_liquida_percent": null,
      "margem_operacional_percent": null
    }
  ],
  "assinaturas": [
    { "nome": "", "cpf": "", "papel": "" }
  ]
}

Regras:
- Campos ausentes → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- CPF sempre com máscara XXX.XXX.XXX-XX
- Datas sempre no formato DD/MM/AAAA
- Valores monetários como float sem formatação — ex: 3395034.70
- Valores negativos (despesas, deduções) devem ser retornados como negativos — ex: -420977.38
- anos sempre como array — se o documento tiver duas colunas (ano atual + ano anterior), retornar dois objetos no array, ordenados do mais antigo para o mais recente
- custos_detalhes → objeto livre com todas as linhas de custo discriminadas no documento — ex: {"material_aplicado": -14180.00, "custos_mercadorias_vendidas": -2634994.52}
- Margens calculadas pelo modelo: margem_bruta = lucro_bruto / receita_bruta, margem_liquida = lucro_liquido / receita_bruta, margem_operacional = resultado_operacional / receita_bruta — sempre como percentual float — ex: 45.2
- assinaturas inclui todos os signatários (sócio, contador etc.)
- Nunca inventar dados ausentes`;

const PROMPT_BALANCO = `Você receberá um PDF de Balanço Patrimonial. O documento pode conter colunas para dois anos. Extraia todos os dados e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "razao_social": "",
  "data_encerramento": "",
  "data_assinatura": "",
  "anos": [
    {
      "ano": null,
      "ativo_total": null,
      "ativo_circulante": {
        "total": null,
        "disponivel": null,
        "clientes": null,
        "estoques": null,
        "outros_creditos": null,
        "detalhes": {}
      },
      "ativo_nao_circulante": {
        "total": null,
        "realizavel_longo_prazo": null,
        "outros_creditos": null,
        "imobilizado_bruto": null,
        "depreciacoes_acumuladas": null,
        "imobilizado_liquido": null,
        "detalhes": {}
      },
      "passivo_total": null,
      "passivo_circulante": {
        "total": null,
        "emprestimos_financiamentos": null,
        "fornecedores": null,
        "obrigacoes_tributarias": null,
        "obrigacoes_trabalhistas_previdenciarias": null,
        "outras_obrigacoes": null,
        "detalhes": {}
      },
      "passivo_nao_circulante": {
        "total": null,
        "detalhes": {}
      },
      "patrimonio_liquido": {
        "total": null,
        "capital_social": null,
        "lucros_prejuizos_acumulados": null,
        "distribuicao_lucros": null,
        "detalhes": {}
      },
      "indicadores": {
        "liquidez_corrente": null,
        "liquidez_geral": null,
        "endividamento_total_percent": null,
        "capital_de_giro": null,
        "imobilizacao_pl_percent": null
      }
    }
  ],
  "assinaturas": [
    { "nome": "", "cpf": "", "papel": "" }
  ]
}

Regras:
- Campos ausentes → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- CPF sempre com máscara XXX.XXX.XXX-XX
- Datas sempre no formato DD/MM/AAAA
- Valores monetários como float sem formatação
- anos sempre como array ordenado do mais antigo para o mais recente
- detalhes → objeto livre com todas as subcontas discriminadas no documento para aquele grupo
- Indicadores calculados pelo modelo:
  - liquidez_corrente = ativo_circulante / passivo_circulante
  - liquidez_geral = (ativo_circulante + realizavel_longo_prazo) / (passivo_circulante + passivo_nao_circulante)
  - endividamento_total_percent = (passivo_circulante + passivo_nao_circulante) / ativo_total × 100
  - capital_de_giro = ativo_circulante - passivo_circulante
  - imobilizacao_pl_percent = imobilizado_liquido / patrimonio_liquido × 100
- Todos os indicadores como float arredondado com 2 casas decimais
- Nunca inventar dados ausentes`;

const PROMPT_IR_SOCIOS = `Você receberá um PDF de Declaração de Ajuste Anual do Imposto de Renda Pessoa Física (DIRPF). Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "nome": "",
  "cpf": "",
  "exercicio": null,
  "ano_calendario": null,
  "tipo_declaracao": "",
  "numero_recibo_ultima_declaracao": "",
  "situacao_declaracao": "",
  "debitos_receita_federal": null,
  "identificacao": {
    "data_nascimento": "",
    "possui_conjuge": null,
    "cpf_conjuge": "",
    "natureza_ocupacao_codigo": "",
    "natureza_ocupacao_descricao": "",
    "ocupacao_principal_codigo": "",
    "ocupacao_principal_descricao": "",
    "endereco": {
      "logradouro": "", "numero": "", "complemento": "", "bairro": "",
      "municipio": "", "uf": "", "cep": ""
    },
    "email": "", "telefone": "", "celular": ""
  },
  "dependentes": [
    { "nome": "", "cpf": "", "data_nascimento": "", "residente": "" }
  ],
  "alimentandos": [
    { "nome": "", "cpf": "", "data_nascimento": "", "data_decisao_judicial": "" }
  ],
  "rendimentos_tributaveis_pj_titular": [
    {
      "fonte_pagadora": "", "cnpj": "", "rendimentos_recebidos": null,
      "contribuicao_previdencia_oficial": null, "imposto_retido_fonte": null,
      "decimo_terceiro": null, "irrf_decimo_terceiro": null
    }
  ],
  "rendimentos_isentos_nao_tributaveis": [
    {
      "codigo": "", "descricao": "", "beneficiario": "", "cpf_beneficiario": "",
      "cnpj_fonte": "", "nome_fonte": "", "valor": null
    }
  ],
  "rendimentos_tributacao_exclusiva": [
    {
      "codigo": "", "descricao": "", "beneficiario": "", "cpf_beneficiario": "",
      "cnpj_fonte": "", "nome_fonte": "", "valor": null
    }
  ],
  "imposto_pago_retido": {
    "imposto_complementar": null, "imposto_pago_exterior": null,
    "imposto_retido_fonte_titular": null, "imposto_retido_fonte_dependentes": null,
    "carne_leao_titular": null, "carne_leao_dependentes": null,
    "total_imposto_pago": null
  },
  "pagamentos_efetuados": [
    {
      "codigo": "", "nome_beneficiario": "", "cpf_cnpj_beneficiario": "",
      "valor_pago": null, "parcela_nao_dedutivel": null, "descricao": ""
    }
  ],
  "bens_e_direitos": [
    {
      "grupo": "", "codigo": "", "discriminacao": "",
      "cnpj_empresa": "",
      "valor_anterior": null, "valor_atual": null,
      "renavam": "", "matricula": "", "logradouro": "",
      "municipio": "", "uf": "", "cep": "", "area_m2": null
    }
  ],
  "dividas_onus_reais": [
    {
      "codigo": "", "discriminacao": "",
      "situacao_anterior": null, "situacao_atual": null, "valor_pago": null
    }
  ],
  "resumo": {
    "total_rendimentos_tributaveis": null, "total_deducoes": null,
    "base_calculo_imposto": null, "aliquota_efetiva_percent": null,
    "imposto_devido": null, "imposto_a_restituir": null,
    "saldo_imposto_a_pagar": null, "pensao_alimenticia_judicial": null,
    "rendimentos_isentos_nao_tributaveis": null,
    "rendimentos_tributacao_exclusiva": null
  },
  "evolucao_patrimonial": {
    "bens_direitos_ano_anterior": null, "bens_direitos_ano_atual": null,
    "dividas_ano_anterior": null, "dividas_ano_atual": null
  }
}

Regras:
- Campos ausentes ou "Sem Informações" → retornar null (nunca string vazia para campos numéricos)
- CPF sempre com máscara XXX.XXX.XXX-XX
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- Datas sempre no formato DD/MM/AAAA
- Valores monetários: retorne como número float SEM formatação — ex: 93432.24 ou 25324.06
- IMPORTANTE — formato brasileiro: ponto (.) é separador de milhar, vírgula (,) é decimal. "25.324,06" = 25324.06. Remova pontos de milhar e troque vírgula por ponto antes de retornar.
- exercicio e ano_calendario como inteiros — ex: 2025, 2024 (são campos DISTINTOS: exercicio é o ano de entrega, ano_calendario é o ano dos rendimentos)
- possui_conjuge → true ou false; cpf_conjuge → CPF do cônjuge com máscara se declaração conjunta, senão null
- dependentes e alimentandos → arrays vazios [] se não houver
- bens_e_direitos → um objeto por bem. ATENÇÃO: a tabela de bens tem DUAS colunas de valor com datas diferentes — ex: "31/12/2023" e "31/12/2024". valor_anterior = coluna do ano mais antigo (ex: 31/12/2023); valor_atual = coluna do ano mais recente (ex: 31/12/2024). Nunca inverta as colunas.
- bens_e_direitos.cnpj_empresa → CNPJ da empresa para participações societárias (grupo 03), banco para depósitos (grupo 06), fundo para fundos (grupo 07); null para imóveis e veículos
- grupo → mapear por GRUPO (01=imóveis, 02=bens móveis, 03=participações societárias, 04=aplicações/investimentos, 05=créditos, 06=depósitos, 07=fundos), não por código 2-dígitos
- evolucao_patrimonial → bens_direitos_ano_anterior e bens_direitos_ano_atual são os TOTAIS de bens em 31/12 de cada ano (coluna esquerda e coluna direita na tabela de bens); dividas são os totais de dívidas nos mesmos dois anos
- Seções marcadas como "Sem Informações" → retornar array vazio [] ou null conforme o campo
- situacao_declaracao → situação da declaração exatamente como consta no documento; ex: "Processada sem pendências", "Em malha fiscal", "Em processamento"; buscar no cabeçalho ou rodapé do DIRPF
- debitos_receita_federal → true se há débitos em aberto, pendências ou malha fiscal; false se "Processada sem pendências" ou sem pendências; null se não informado
- Nunca inventar dados`;

const PROMPT_RELATORIO_VISITA = `Você receberá um PDF de Relatório de Visita elaborado por um analista/gerente de uma instituição financeira. Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

{
  "cnpj": "",
  "razao_social": "",
  "data_visita": "",
  "gerente_responsavel": "",
  "endereco_visitado": {
    "logradouro": "", "numero": "", "complemento": "", "bairro": "",
    "municipio": "", "uf": "", "cep": ""
  },
  "contatos": {
    "telefone_empresa": "",
    "tomadores_decisao": [ { "nome": "", "celular": "", "telefone": "", "email": "" } ],
    "responsavel_financeiro": { "nome": "", "telefone": "", "email": "" },
    "responsavel_operacoes": "",
    "email_tomador_decisao": "",
    "email_financeiro": "",
    "email_responsavel_operacoes": ""
  },
  "socios": [
    { "nome": "", "cpf": "", "celular": "", "tipo": "" }
  ],
  "conjuges_responsaveis_solidarios": [
    { "nome": "", "cpf": "", "vinculo": "", "nome_socio_ref": "" }
  ],
  "dados_operacionais": {
    "origem_prospeccao": "",
    "ano_fundacao": null,
    "area_atuacao": "",
    "ponto_equilibrio": null,
    "funcionarios": null,
    "folha_pagamento": null,
    "possui_filiais": null,
    "prazo_entrega_dias": "",
    "valor_minimo_recebivel": null,
    "valor_maximo_recebivel": null,
    "prazo_medio_recebimento_dias": "",
    "prazo_medio_pagamento_dias": "",
    "percentual_duplicatas": null,
    "percentual_cheques": null,
    "percentual_outros": null,
    "mix_recebiveis": "",
    "principal_produto": "",
    "valor_maquinario": null,
    "idade_media_maquinas_anos": "",
    "possui_frota_propria": null,
    "ciclo_producao_dias": "",
    "vantagem_competitiva": "",
    "possui_estrutura_sucessoria": null,
    "motivo_antecipacao_recebiveis": "",
    "sazonalidade": null,
    "faturamento_gerencial": null,
    "area_barracao_m2": null,
    "aluguel_mensal": null,
    "valor_estoque_min": null,
    "valor_estoque_max": null
  },
  "operacao_atual_outros_parceiros": {
    "prazo_venda_dias": "",
    "prazo_pagamento_fornecedores": "",
    "ticket_minimo_nf": null,
    "ticket_maximo_nf": null,
    "ticket_medio_nf": null,
    "volume_boletos_mes_min": null,
    "volume_boletos_mes_max": null,
    "mix_recebiveis_descricao": "",
    "possui_concentracao_sacado": null,
    "percentual_sacado_paga_confirma": null,
    "percentual_sacado_paga_nao_confirma": null,
    "frequencia_operacao_semanal": "",
    "emissao_boleto": "",
    "endividamento_banco": null,
    "endividamento_factoring": null
  },
  "parametros_sugeridos": {
    "modalidade_operacao": "",
    "opera_cheque_terceiros": null,
    "comissaria": null,
    "desagio_proposto_percent": null,
    "valor_boleto": null,
    "limite_global": null,
    "limite_convencional": null,
    "limite_comissaria": null,
    "limite_por_sacado": null,
    "limite_principais_sacados": null,
    "limite_duplicatas_pj": null,
    "limite_cheques_pj": null,
    "concentracao_percent": null,
    "tranche_limite_global": null,
    "tranche_checagem": null,
    "prazo_maximo_titulo_dias": null,
    "prazo_tranche_limite_global_dias": null,
    "taxa_duplicata_percent": null,
    "taxa_cheque_percent": null,
    "taxa_comissaria_percent": null,
    "prazo_recompra_cedente_dias": null,
    "prazo_cartorio_dias": null,
    "tac_valor": null,
    "politica_cartorio": "",
    "canhoto": null,
    "canhoto_detalhes": ""
  },
  "percepcao_gerente": "",
  "defesa_credito": "",
  "recomendacao": ""
}

Regras:
- Campos ausentes ou não mencionados → retornar null
- CNPJ sempre com máscara XX.XXX.XXX/XXXX-XX
- CPF sempre com máscara XXX.XXX.XXX-XX
- Datas sempre no formato DD/MM/AAAA
- Valores monetários: retorne como float SEM formatação — ex: 750000.00
- IMPORTANTE — formato brasileiro: ponto (.) é separador de milhar, vírgula (,) é decimal. "750.000,00" = 750000.00. Remova pontos de milhar e troque vírgula por ponto.
- ABREVIAÇÕES MONETÁRIAS: "1M" = 1000000, "1,5M" = 1500000, "500k" ou "500K" = 500000, "100k" = 100000, "50k" = 50000. Converter SEMPRE para float.
- VALOR ZERO: se o documento mostrar "0", "R$ 0", "R$0,00" ou "zero" → retornar 0.0 (NUNCA null). Zero é informação válida e DEVE ser preservada.
- Percentuais como float — ex: 2.20 (não "2,20%")
- Campos com múltiplos valores (ex: prazo 30/60/90, fornecedores à vista ou 28/35/42/60) → salvar como string completa mantendo a barra ou texto original — NÃO truncar no primeiro valor
- Campos com faixa (ex: "R$ 150.000 a R$ 300.000") → valor_min e valor_max como floats separados
- parametros_sugeridos → varrer TODAS as seções do documento: "Parâmetros sugeridos para negócio", "Proposta final do gerente", "item 27", ou seção equivalente; priorizar valores mais específicos quando houver duplicidade
- limite_global → limite total da operação (soma de todos os sub-limites); buscar em "Limite global", "Limite total", "LG"
- limite_convencional → limite para operações convencionais/duplicatas; buscar em "Limite convencional", "LC"; se for 0 → retornar 0.0
- limite_comissaria → limite para operações em comissária; buscar em "Limite comissária", "Limite comissaria", "LCom"; se for 0 → retornar 0.0
- limite_por_sacado → limite máximo por sacado individual; buscar em "Limite por sacado", "Concentração por sacado"
- limite_principais_sacados → limite para os principais sacados em conjunto; buscar em "Limite principais sacados", "Limite principais sacados (30 a 40%)", "Top sacados"
- tranche_limite_global → SOMENTE quando o documento usar EXPLICITAMENTE as expressões "Tranche Limite Global", "Tranche LG" ou "Tranche Global" seguido de valor monetário. SE o documento usar "Tranche checagem", "Tranche comissária" ou simplesmente "Tranche" sem qualificador → NÃO colocar aqui, retornar null. Em caso de dúvida entre os dois campos → sempre preferir tranche_checagem (tranche_limite_global é o campo mais raro). Exemplos CORRETOS: "Tranche LG: R$ 500.000" → tranche_limite_global: 500000 | "Tranche checagem: R$ 300.000" → tranche_limite_global: null | "Tranche: R$ 300.000" → tranche_limite_global: null.
- tranche_checagem → campo PRINCIPAL de tranche. Capturar quando o documento usar: "Tranche checagem", "Tranche comissária", "Checagem", ou simplesmente "Tranche" sem qualificador. Pode ser float OU string descritiva: se valor monetário → retornar float; se "Sem checagem", "Não se aplica", "S/C" → retornar string exata. NUNCA retornar null se houver qualquer menção a tranche ou checagem no documento. Exemplos CORRETOS: "Tranche checagem: R$ 300.000" → tranche_checagem: 300000 | "Tranche: R$ 300.000" → tranche_checagem: 300000 | "Sem checagem comissária" → tranche_checagem: "Sem checagem comissária".
- prazo_maximo_titulo_dias → prazo máximo do título/recebível; buscar em "Prazo máximo", "Prazo máx", "Prazo máximo de título", "Prazo max. título"; retornar APENAS o número inteiro de dias (ex: 180)
- prazo_tranche_limite_global_dias → prazo em dias da tranche do limite global; buscar em "Prazo tranche", "Prazo da tranche", "Prazo tranche LG", "Prazo de tranche"; retornar APENAS o número inteiro de dias (ex: 5, 30). ATENÇÃO: NÃO confundir com prazo máximo do título ou prazo de recompra.
- prazo_cartorio_dias → prazo em dias para envio ao cartório de protesto; buscar em "Prazo cartório", "Prazo de cartório", "Prazo cartório protesto", "Envio cartório", "Protesto cartório"; retornar APENAS o número inteiro (ex: 10, 15, 20). Se o documento disser "até X dias" → retornar X.
- prazo_recompra_cedente_dias → prazo em dias para recompra pelo cedente; buscar em "Prazo de recompra", "Recompra cedente", "Prazo recompra"; retornar APENAS o número inteiro (ex: 10)
- tac_valor → valor monetário da TAC (Taxa de Abertura de Crédito); buscar EXATAMENTE nos campos "TAC", "T.A.C.", "Taxa de abertura", "Taxa de abertura de crédito"; interpretar abreviações (ex: "R$100k" = 100000, "R$5.000,00" = 5000.0); se for percentual (ex: "0,5%"), deixar null; se for "isento", "0" ou "sem TAC" → retornar 0.0
- valor_boleto → valor cobrado por boleto emitido; buscar em "Boleto", "Emissão boleto", "Custo boleto"; interpretar "R$5,00" = 5.0
- taxa_duplicata_percent → taxa percentual para duplicatas/convencionais; buscar em "Taxa convencional", "Taxa duplicata"; se for 0 → retornar 0.0
- taxa_comissaria_percent → taxa percentual para comissária; buscar em "Taxa comissária", "Taxa comissaria"
- socios → lista os sócios/administradores do cabeçalho do documento
- conjuges_responsaveis_solidarios → lista cônjuges dos sócios (geralmente no item 21 ou seção "Cônjuge") com nome_socio_ref indicando a qual sócio pertence
- gerente_responsavel → NOME PRÓPRIO do gerente/analista (ex: "João Silva"), EXATAMENTE como consta na assinatura. NUNCA retornar cargo genérico — se não houver nome próprio, retornar null
- recomendacao → conclusão final do gerente sobre o crédito
- possui_filiais, possui_frota_propria, sazonalidade, faturamento_gerencial, possui_estrutura_sucessoria, possui_concentracao_sacado, canhoto, opera_cheque_terceiros, comissaria → sempre true ou false, nunca string
- endividamento_banco → saldo devedor total da empresa com bancos no momento da visita (R$); buscar em "Endividamento banco", "Dívida bancária", "Bancos"
- endividamento_factoring → saldo devedor total com factoring/FIDC (R$); buscar em "Endividamento factoring", "Dívida factoring", "FIDC"
- Nunca inventar dados ausentes`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Gemini Files API — upload para fileUri (evita inline base64 para PDFs grandes)
// ─────────────────────────────────────────
async function uploadToGeminiFiles(buffer: Buffer, mimeType: string, displayName: string, apiKey: string): Promise<string> {
  const boundary = "cap_gemini_boundary_x7z";
  const metaJson = JSON.stringify({ file: { display_name: displayName } });
  // Google Files API exige X-Goog-Upload-Protocol: multipart e dados em base64 com Content-Transfer-Encoding
  const base64Data = buffer.toString("base64");
  const body = [
    `--${boundary}`,
    `Content-Type: application/json; charset=utf-8`,
    ``,
    metaJson,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Data,
    `--${boundary}--`,
  ].join("\r\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "X-Goog-Upload-Protocol": "multipart",
      },
      body,
    }
  );
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Gemini Files API ${response.status}: ${txt.substring(0, 200)}`);
  }
  const result = await response.json();
  const fileUri = result?.file?.uri;
  if (!fileUri) throw new Error("Gemini Files API não retornou fileUri");
  return fileUri as string;
}

async function callGemini(prompt: string, content: string | { mimeType: string; base64: string } | { mimeType: string; fileUri: string }, maxOutputTokens = 2048, thinkingBudget = 0): Promise<string> {
  // Estrutura otimizada para o caching implicito do Gemini 2.5:
  // o PROMPT (estatico, ~400 linhas no CONTRATO) vai PRIMEIRO em uma part isolada,
  // e o conteudo dinamico vai depois. Quando a mesma extracao se repete (mesmo
  // prompt = mesmo prefixo), o Gemini aplica desconto de ~70-90% em input tokens
  // automaticamente, sem precisar de cached content endpoint.
  type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: { mimeType: string; fileUri: string } };
  const parts: Array<GeminiPart> = [];
  parts.push({ text: prompt });
  if (typeof content === "string") {
    parts.push({ text: "\n\n--- DOCUMENTO ---\n\n" + content });
  } else if ("fileUri" in content) {
    parts.push({ fileData: { mimeType: content.mimeType, fileUri: content.fileUri } });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
  }

  const startIdx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  const rotatedKeys = [...GEMINI_API_KEYS.slice(startIdx), ...GEMINI_API_KEYS.slice(0, startIdx)];
  // Conteúdo grande (>20k chars) precisa de mais tempo para o Gemini processar e gerar tokens.
  // 1 tentativa × 20s × 2 modelos (flash+lite) = 40s — cabe nos 52s. Pro não tem tempo p/ grandes.
  const isLargeContent = typeof content === "string" && content.length > 20000;
  const MAX_ATTEMPTS = isLargeContent ? 1 : 2;
  const perAttemptMs  = isLargeContent ? 20000 : 8000;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  keyLoop: for (const apiKey of rotatedKeys) {
    for (const model of GEMINI_MODELS) {
      // flash-lite rejeita thinkingBudget entre 1-511 com HTTP 400 — pular modelo e usar o próximo
      if (model.includes("lite") && thinkingBudget > 0 && thinkingBudget < 512) continue;
      // gemini-2.5-pro rejeita thinkingBudget=0 — exige thinking mode obrigatório
      const effectiveBudget = (model.includes("2.5-pro") && thinkingBudget === 0) ? 1024 : thinkingBudget;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model} attempt=${attempt + 1}/${MAX_ATTEMPTS}`);
          const controller = new AbortController();
          const fetchTimeout = setTimeout(() => controller.abort(), perAttemptMs);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens,
                responseMimeType: "application/json",
                ...((model.includes("2.5") || model.includes("3.")) ? {
                  thinkingConfig: {
                    thinkingBudget: effectiveBudget,
                  },
                } : {}),
              },
            }),
          });
          clearTimeout(fetchTimeout);

          // 403: chave inválida/vazada — não adianta tentar outros modelos, pula para próxima chave
          if (response.status === 403) {
            const body = await response.text();
            console.error(`[Gemini] HTTP 403 key=${apiKey.substring(0, 8)} — chave revogada/vazada, skip key:`, body.substring(0, 200));
            continue keyLoop;
          }

          // 503: servidor fora — não adianta retry, pula modelo imediatamente
          if (response.status === 503) {
            console.log(`[Gemini] HTTP 503 key=${apiKey.substring(0, 8)} model=${model} — skip`);
            break;
          }
          // 429: rate limit — vale esperar e tentar de novo
          if (response.status === 429) {
            if (attempt < MAX_ATTEMPTS - 1) {
              const backoffMs = 3000 * Math.pow(2, attempt);
              console.log(`[Gemini] HTTP 429 key=${apiKey.substring(0, 8)} model=${model}, backoff ${backoffMs}ms`);
              await sleep(backoffMs);
              continue;
            }
            break;
          }

          // 404: modelo nao existe — nao adianta retry, pula direto
          if (response.status === 404) {
            console.error(`[Gemini] HTTP 404 model=${model} — modelo invalido, skip`);
            break;
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Gemini] HTTP ${response.status}:`, body.substring(0, 300));
            break;
          }

          const result = await response.json();
          // gemini-2.5-flash pode retornar "thinking" parts - pegar a última text part (não thought)
          const parts2 = result?.candidates?.[0]?.content?.parts || [];
          const textPart = [...parts2].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought);
          const text = textPart?.text || parts2?.[parts2.length - 1]?.text || parts2?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response, parts:`, JSON.stringify(parts2).substring(0, 200));
            break;
          }
          return text;
        } catch (err) {
          // AbortError (timeout) e erros de rede: retry uma vez
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (isAbort && attempt < MAX_ATTEMPTS - 1) {
            console.warn(`[Gemini] timeout key=${apiKey.substring(0, 8)} model=${model}, tentando de novo`);
            await sleep(500);
            continue;
          }
          console.error(`[Gemini] Error:`, err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada OpenRouter (fallback text-only)
// ─────────────────────────────────────────
async function callOpenRouter(prompt: string, textContent: string): Promise<string> {
  if (OPENROUTER_API_KEYS.length === 0) throw new Error("OPENROUTER_API_KEYS não configurada");
  for (const apiKey of OPENROUTER_API_KEYS) {
    for (const model of OPENROUTER_MODELS) {
      try {
        console.log(`[OpenRouter/extract] key=${apiKey.substring(0, 16)}... model=${model}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://plataformacapital.vercel.app",
            "X-Title": "Capital Financas",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt + "\n\n--- DOCUMENTO ---\n\n" + textContent }],
            temperature: 0.1,
            max_tokens: 8192,
          }),
        });
        if (!response.ok) { console.error(`[OpenRouter/extract] HTTP ${response.status}`); continue; }
        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content;
        if (!text) { console.error(`[OpenRouter/extract] Empty response`); continue; }
        console.log(`[OpenRouter/extract] Success model=${model}`);
        return text;
      } catch (err) {
        console.error(`[OpenRouter/extract] Error:`, err instanceof Error ? err.message : err);
      }
    }
  }
  throw new Error("OPENROUTER_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada AI — Gemini primário, OpenRouter fallback (texto)
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string },
  maxOutputTokens = 2048,
  fileBuffer?: Buffer,
  thinkingBudget = 0,
): Promise<string> {
  // Para PDFs com imagem (> 500KB): usa Gemini Files API (fileUri) em vez de inline base64.
  // Abaixo de 500KB vai inline — elimina latência e 503 do upload. Acima, Files API é mais estável.
  const FILES_API_THRESHOLD = 500 * 1024;
  let resolvedContent: string | { mimeType: string; base64: string } | { mimeType: string; fileUri: string };

  if (imageContent && fileBuffer && fileBuffer.length > FILES_API_THRESHOLD && GEMINI_API_KEYS.length > 0) {
    try {
      console.log(`[extract] Arquivo grande (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB) — usando Gemini Files API`);
      const fileUri = await uploadToGeminiFiles(fileBuffer, imageContent.mimeType, "document.pdf", GEMINI_API_KEYS[0]);
      console.log(`[extract] Gemini Files API upload OK: ${fileUri}`);
      resolvedContent = { mimeType: imageContent.mimeType, fileUri };
    } catch (uploadErr) {
      console.warn(`[extract] Gemini Files API upload falhou, caindo pro inline base64:`, uploadErr instanceof Error ? uploadErr.message : uploadErr);
      resolvedContent = imageContent;
    }
  } else {
    resolvedContent = imageContent ?? textContent;
  }

  // Hobby plan: 60s max total — 52s deixa margem para overhead do Vercel
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT_52s")), 52000)
  );

  const aiCall = async (): Promise<string> => {
    try {
      return await callGemini(prompt, resolvedContent, maxOutputTokens, thinkingBudget);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (imageContent || OPENROUTER_API_KEYS.length === 0) throw err;
      console.warn(`[extract] Gemini falhou (${msg}), tentando OpenRouter...`);
      return await callOpenRouter(prompt, textContent);
    }
  };

  return Promise.race([aiCall(), timeoutPromise]);
}

// ─────────────────────────────────────────
// Parse JSON
// ─────────────────────────────────────────
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  // Remove markdown code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Tenta extrair JSON se resposta veio com texto antes/depois
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  // Números no formato brasileiro (ex: 9.498.394) com 2+ grupos de 3 dígitos são
  // separadores de milhar e jamais decimais JSON válidos. Se o Gemini os retornar
  // sem aspas, o JSON.parse falha. Removemos os pontos antes de parsear.
  cleaned = cleaned.replace(/\b(\d{1,3}(?:\.\d{3}){2,})\b/g, (m) => m.replace(/\./g, ""));
  // Remove "$" espúrio após dígitos — OCR do SCR/BACEN às vezes gera "R$ 200.419,62$"
  cleaned = cleaned.replace(/(\d)\$/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[parseJSON] Falha ao parsear resposta da IA:", (err as Error).message, "| raw (primeiros 500 chars):", raw.slice(0, 500));
    // Retorna objeto vazio ao invés de crash — fillXxxDefaults vai preencher campos padrão
    return {} as T;
  }
}

// ─────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────
/**
 * Adapter: converte o JSON snake_case do novo prompt de Cartão CNPJ
 * para o formato camelCase esperado pelo resto do pipeline (CNPJData).
 * Também aceita camelCase de fallback para o caso do Gemini responder no formato antigo.
 */
function adaptCNPJNew(raw: Record<string, unknown>): Partial<CNPJData> {
  const r = raw ?? {};
  const s = (v: unknown): string => (v == null ? "" : String(v));

  // Endereço: o novo prompt retorna objeto; o antigo retornava string.
  let enderecoStr = "";
  if (typeof r.endereco === "string") {
    enderecoStr = r.endereco;
  } else if (r.endereco && typeof r.endereco === "object") {
    const e = r.endereco as Record<string, unknown>;
    const linha1 = [s(e.logradouro), s(e.numero)].filter(Boolean).join(", ");
    const cidadeUf = [s(e.municipio), s(e.uf)].filter(Boolean).join("/");
    const parts = [linha1, s(e.complemento), s(e.bairro), cidadeUf, s(e.cep) ? `CEP ${s(e.cep)}` : ""].filter(Boolean);
    enderecoStr = parts.join(", ");
  }

  // Natureza jurídica: código + descrição (ou só descrição se código ausente).
  const natCod = s(r.natureza_juridica_codigo);
  const natDesc = s(r.natureza_juridica_descricao);
  const natJur = [natCod, natDesc].filter(Boolean).join(" - ") || s(r.naturezaJuridica);

  // CNAE principal: código + descrição.
  const cnaePCod = s(r.cnae_principal_codigo);
  const cnaePDesc = s(r.cnae_principal_descricao);
  const cnaePrinc = [cnaePCod, cnaePDesc].filter(Boolean).join(" - ") || s(r.cnaePrincipal);

  // CNAEs secundários: array de {codigo, descricao} → string separada por " ; ".
  let cnaeSecStr = "";
  if (Array.isArray(r.cnaes_secundarios)) {
    cnaeSecStr = (r.cnaes_secundarios as Array<Record<string, unknown>>)
      .map(c => [s(c.codigo), s(c.descricao)].filter(Boolean).join(" - "))
      .filter(Boolean)
      .join(" ; ");
  } else if (typeof r.cnaeSecundarios === "string") {
    cnaeSecStr = r.cnaeSecundarios;
  }

  // motivoSituacao: no Cartão CNPJ vem como "situacao_especial" (ex: "Omissa no período").
  const motivo = s(r.situacao_especial) || s(r.motivoSituacao);

  // tipoEmpresa: derivado da descrição da natureza jurídica (mantém feature parity).
  const deriveTipo = (natJurDesc: string): string => {
    const txt = natJurDesc.toLowerCase();
    if (/microempreendedor|mei/.test(txt)) return "MEI";
    if (/sociedade an[oô]nima|\bs\/?a\b/.test(txt)) return "S/A";
    if (/empres[aá]ria limitada|\bltda\b|limitada/.test(txt)) return "LTDA";
    if (/eireli/.test(txt)) return "EIRELI";
    if (/unipessoal|\bslu\b/.test(txt)) return "SLU";
    if (/sociedade simples/.test(txt)) return "SS";
    if (/cooperativa/.test(txt)) return "COOPERATIVA";
    return "";
  };

  return {
    razaoSocial:            s(r.razao_social)  || s(r.razaoSocial),
    nomeFantasia:           s(r.nome_fantasia) || s(r.nomeFantasia),
    cnpj:                   s(r.cnpj),
    dataAbertura:           s(r.data_abertura) || s(r.dataAbertura),
    situacaoCadastral:      s(r.situacao_cadastral) || s(r.situacaoCadastral),
    dataSituacaoCadastral:  s(r.data_situacao_cadastral) || s(r.dataSituacaoCadastral),
    motivoSituacao:         motivo,
    naturezaJuridica:       natJur,
    cnaePrincipal:          cnaePrinc,
    cnaeSecundarios:        cnaeSecStr,
    porte:                  s(r.porte),
    capitalSocialCNPJ:      s(r.capitalSocialCNPJ), // não existe no novo prompt — fica vazio (capital social vem do QSA/Contrato)
    endereco:               enderecoStr,
    telefone:               s(r.telefone),
    email:                  s(r.email),
    tipoEmpresa:            s(r.tipoEmpresa) || deriveTipo(natDesc),
  };
}

// ─── Helpers de adapter (novo prompt → formato camelCase legado) ────────────

/** Converte qualquer valor (number, string com formato BR ou EN, null) em string "R$ 1.234,56". */
function _fmtMoneyBR(v: unknown): string {
  if (v == null || v === "") return "";
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const s = String(v).trim().replace(/[R$\s]/g, "");
    // Detecta formato: se tem vírgula depois do último ponto, é BR ("1.234,56"); senão EN ("1234.56")
    const hasBRFormat = /,\d{1,2}$/.test(s);
    n = parseFloat(hasBRFormat ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  }
  if (!isFinite(n)) return typeof v === "string" ? v : "";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function _s(v: unknown): string { return v == null ? "" : String(v); }

function _sumNums(vals: unknown[]): number {
  return vals.reduce<number>((acc, v) => {
    if (v == null || v === "") return acc;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[R$\s.]/g, "").replace(",", "."));
    return acc + (isFinite(n) ? n : 0);
  }, 0);
}

// ─── Adapters por doc (snake_case novo prompt → camelCase legado) ───────────

/** Converte para string "1.234,56" (formato BR SEM prefixo "R$"). Usado pelo parseBR do hydrator. */
function _fmtMoneyBRNoPrefix(v: unknown): string {
  if (v == null || v === "") return "";
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const s = String(v).trim().replace(/[R$\s]/g, "");
    const hasBRFormat = /,\d{1,2}$/.test(s);          // "1.234,56"
    const hasMultipleDots = (s.match(/\./g) ?? []).length > 1; // "10.809.058"
    if (hasBRFormat) {
      // Formato BR com decimal: "1.234.567,89" → remove pontos, troca vírgula por ponto
      n = parseFloat(s.replace(/\./g, "").replace(",", "."));
    } else if (hasMultipleDots) {
      // Inteiro BR com milhar: "10.809.058" → remove pontos → 10809058
      // parseFloat pararia no segundo ponto, por isso usamos replace primeiro
      n = parseFloat(s.replace(/\./g, ""));
    } else {
      n = parseFloat(s.replace(/,/g, ""));
    }
  }
  if (!isFinite(n)) return typeof v === "string" ? v : "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Fevereiro" → 2. Aceita nome PT, abreviação ("fev"), número como string ou number. */
function _mesToNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const map: Record<string, number> = {
    jan:1, janeiro:1, fev:2, fevereiro:2, mar:3, marco:3, "março":3,
    abr:4, abril:4, mai:5, maio:5, jun:6, junho:6, jul:7, julho:7,
    ago:8, agosto:8, set:9, setembro:9, out:10, outubro:10,
    nov:11, novembro:11, dez:12, dezembro:12,
  };
  return map[s.slice(0, 3)] || map[s] || 0;
}

function adaptFaturamentoNew(raw: Record<string, unknown>): Partial<FaturamentoData> {
  const r = raw ?? {};
  const mesesRaw = Array.isArray(r.meses) ? r.meses as Array<Record<string, unknown>> : [];

  const meses: FaturamentoMensal[] = mesesRaw.map(m => {
    const mesN = _mesToNum(m.mes);
    const anoRaw = m.ano ?? "";
    const ano = String(anoRaw).trim();
    const mesKey = mesN && ano
      ? `${String(mesN).padStart(2, "0")}/${ano.length === 2 ? "20" + ano : ano}`
      : _s(m.mes); // fallback se já vier no formato MM/YYYY
    const valor = _fmtMoneyBRNoPrefix(m.total ?? m.valor);
    return { mes: mesKey, valor };
  }).filter(m => m.mes && m.valor !== ""); // meses sem valor são excluídos (null no documento)

  const totais = r.totais as Record<string, unknown> | undefined;
  const media = r.media_mensal as Record<string, unknown> | undefined;

  // Totais e médias por ano (tabelas multi-ano)
  const totaisPorAnoRaw = Array.isArray(r.totais_por_ano)
    ? r.totais_por_ano as Array<Record<string, unknown>>
    : [];
  const fmmAnual: Record<string, string> = {};
  const totalAnual: Record<string, string> = {};
  for (const t of totaisPorAnoRaw) {
    const ano = String(t.ano ?? "").trim();
    if (!ano) continue;
    const media_val = _fmtMoneyBRNoPrefix(t.media_mensal);
    const total_val = _fmtMoneyBRNoPrefix(t.total);
    if (media_val) fmmAnual[ano] = media_val;
    if (total_val) totalAnual[ano] = total_val;
  }

  return {
    meses,
    somatoriaAno: _fmtMoneyBRNoPrefix(totais?.total) || _s((r as Record<string, unknown>).somatoriaAno),
    mediaAno: _fmtMoneyBRNoPrefix(media?.total) || _s((r as Record<string, unknown>).mediaAno),
    ...(Object.keys(fmmAnual).length > 0 ? { fmmAnual } : {}),
    // Passa razao_social e cnpj como campos extras (preservados pelo schema passthrough)
    ...(_s(r.razao_social) ? { razaoSocial: _s(r.razao_social) } : {}),
    ...(_s(r.cnpj) ? { cnpj: _s(r.cnpj) } : {}),
    // totalAnual: totais brutos por ano para validação
    ...(Object.keys(totalAnual).length > 0 ? { totalAnual } : {}),
  } as Partial<FaturamentoData>;
}

function adaptSCRNew(raw: Record<string, unknown>): Partial<SCRData> {
  const r = raw ?? {};
  const dados = (r.dados_operacao ?? {}) as Record<string, unknown>;
  const aVen  = (r.carteira_a_vencer ?? {}) as Record<string, unknown>;
  const venc  = (r.vencidos ?? {}) as Record<string, unknown>;
  const prej  = (r.prejuizos ?? {}) as Record<string, unknown>;
  const limi  = (r.limite_credito ?? {}) as Record<string, unknown>;
  const outr  = (r.outros_valores ?? {}) as Record<string, unknown>;
  const mods  = Array.isArray(r.modalidades) ? r.modalidades as Array<Record<string, unknown>> : [];

  const cpfCnpj = _s(r.cpf_cnpj) || _s((r as Record<string,unknown>).cpfCnpj);
  const tipoRaw = _s(r.tipo_cliente).toUpperCase();
  const tipoPessoa: "PF" | "PJ" | undefined = tipoRaw === "PF" ? "PF" : tipoRaw === "PJ" ? "PJ" : undefined;

  // Faixa "De 14 a 30 dias" (primeira faixa BACEN). Aceita nome novo ou antigo pra ser leniente.
  const aVen_ate30 = aVen.de_14_a_30_dias ?? aVen.ate_30_dias;
  // Curto prazo = até 360 dias. Longo prazo = acima de 360 dias.
  const curtoN = _sumNums([aVen_ate30, aVen.de_31_a_60_dias, aVen.de_61_a_90_dias, aVen.de_91_a_180_dias, aVen.de_181_a_360_dias]);
  const longoN = _sumNums([aVen.acima_de_360_dias]);

  // Para carteira_a_vencer: recalcula pelas faixas porque Gemini omite "De 14 a 30 dias" no total.
  // Para vencidos/prejuizos: prefere o total declarado no documento — mais confiável que a soma
  // de faixas, pois Gemini às vezes misplaces valores entre faixas mas acerta o total.
  const vencN = _sumNums([venc.de_15_a_30_dias, venc.de_31_a_60_dias, venc.de_61_a_90_dias, venc.de_91_a_180_dias, venc.de_181_a_360_dias, venc.acima_de_360_dias]);
  const prejN = _sumNums([prej.ate_12_meses, prej.acima_12_meses]);
  const vencDocTotal = venc.total != null ? Number(venc.total) : 0;
  const prejDocTotal = prej.total != null ? Number(prej.total) : 0;
  // Effective = total do documento se disponível; suma das faixas como fallback
  const vencEffective = vencDocTotal > 0 ? vencDocTotal : vencN;
  const prejEffective = prejDocTotal > 0 ? prejDocTotal : prejN;
  const totalFromFaixas = curtoN + longoN + vencEffective + prejEffective;
  const totalN = totalFromFaixas > 0
    ? totalFromFaixas
    : _sumNums([outr.responsabilidade_total ?? aVen.total, venc.total, prej.total]);

  const classifyModSituacao = (s: string): string => {
    const u = s.toUpperCase().trim();
    // "VENCID" cobre tanto "VENCIDO" (masc.) quanto "VENCIDA" (fem.)
    if (u.includes("VENCID")) return "VENCIDO";
    // qualquer outro "VENC" = A VENCER (ex: "A VENCER", "VENCIMENTO")
    if (u.includes("VENC")) return "A VENCER";
    if (u.includes("PREJUIZO") || u.includes("PREJU")) return "PREJUIZO";
    return u;
  };

  return {
    tipoPessoa,
    nomeCliente: _s((r as Record<string,unknown>).nomeCliente),
    cpfSCR:  tipoPessoa === "PF" ? cpfCnpj : "",
    cnpjSCR: tipoPessoa === "PJ" ? cpfCnpj : (tipoPessoa ? "" : cpfCnpj),
    periodoReferencia: _s(r.periodo_referencia) || _s((r as Record<string,unknown>).periodoReferencia),
    qtdeInstituicoes: _s(dados.qtde_instituicoes ?? (r as Record<string,unknown>).qtdeInstituicoes),
    qtdeOperacoes:    _s(dados.qtde_operacoes    ?? (r as Record<string,unknown>).qtdeOperacoes),
    pctDocumentosProcessados: _s(dados.percentual_doctos_processados),
    pctVolumeProcessado:      _s(dados.percentual_volume_processado),
    // carteiraAVencer: recalculada pelas faixas (Gemini omite a faixa 14-30d no total)
    // vencidos/prejuizos: total declarado no documento tem prioridade sobre soma de faixas
    carteiraAVencer:     _fmtMoneyBR((curtoN + longoN) > 0 ? (curtoN + longoN) : aVen.total),
    vencidos:            _fmtMoneyBR(vencEffective > 0 ? vencEffective : null),
    prejuizos:           _fmtMoneyBR(prejEffective > 0 ? prejEffective : null),
    limiteCredito:       _fmtMoneyBR(limi.total),
    carteiraCurtoPrazo:  curtoN > 0 ? _fmtMoneyBR(curtoN) : "",
    carteiraLongoPrazo:  longoN > 0 ? _fmtMoneyBR(longoN) : "",
    totalDividasAtivas:  totalN > 0 ? _fmtMoneyBR(totalN) : "",
    coobrigacoes:        _fmtMoneyBR(outr.coobrigacoes ?? dados.coobrigacao_assumida),
    faixasAVencer: {
      ate30d:   _fmtMoneyBR(aVen_ate30),
      d31_60:   _fmtMoneyBR(aVen.de_31_a_60_dias),
      d61_90:   _fmtMoneyBR(aVen.de_61_a_90_dias),
      d91_180:  _fmtMoneyBR(aVen.de_91_a_180_dias),
      d181_360: _fmtMoneyBR(aVen.de_181_a_360_dias),
      acima360d: _fmtMoneyBR(aVen.acima_de_360_dias),
      prazoIndeterminado: _fmtMoneyBR(aVen.prazo_indeterminado),
      total: _fmtMoneyBR(aVen.total),
    },
    faixasVencidos: {
      ate30d:   _fmtMoneyBR(venc.de_15_a_30_dias),
      d31_60:   _fmtMoneyBR(venc.de_31_a_60_dias),
      d61_90:   _fmtMoneyBR(venc.de_61_a_90_dias),
      d91_180:  _fmtMoneyBR(venc.de_91_a_180_dias),
      d181_360: _fmtMoneyBR(venc.de_181_a_360_dias),
      acima360d: _fmtMoneyBR(venc.acima_de_360_dias),
      total: _fmtMoneyBR(venc.total),
    },
    faixasPrejuizos: {
      ate12m:   _fmtMoneyBR(prej.ate_12_meses),
      acima12m: _fmtMoneyBR(prej.acima_12_meses),
      total:    _fmtMoneyBR(prej.total),
    },
    faixasLimite: {
      ate360d:   _fmtMoneyBR(limi.ate_360_dias),
      acima360d: _fmtMoneyBR(limi.acima_360_dias),
      total:     _fmtMoneyBR(limi.total),
    },
    outrosValores: {
      carteiraCredito:       _fmtMoneyBR(outr.carteira_credito),
      responsabilidadeTotal: _fmtMoneyBR(outr.responsabilidade_total),
      riscoTotal:            _fmtMoneyBR(outr.risco_total),
      coobrigacaoAssumida:   _fmtMoneyBR(dados.coobrigacao_assumida),
      coobrigacaoRecebida:   _fmtMoneyBR(dados.coobrigacao_recebida),
      creditosALiberar:      _fmtMoneyBR(outr.creditos_a_liberar),
    },
    modalidades: mods.map<SCRModalidade>(m => {
      const sit = classifyModSituacao(_s(m.situacao));
      const valor = _fmtMoneyBR(m.valor);
      return {
        nome: _s(m.subdominio) || _s(m.tipo) || _s(m.dominio) || _s(m.codigo_modalidade),
        total:     valor,
        aVencer:   sit === "A VENCER" ? valor : "",
        vencido:   sit === "VENCIDO"  ? valor : "",
        participacao: "",
      };
    }),
    instituicoes: [],
    valoresMoedaEstrangeira: "",
    historicoInadimplencia: "",
    operacoesAVencer: "",
    operacoesEmAtraso: "",
    operacoesVencidas: "",
    tempoAtraso: "",
    classificacaoRisco: _s((r as Record<string, unknown>).classificacao_risco) || "",
    semDados: r.sem_dados_scr === true ? true : undefined,
    fonteBureau: _s(r.fonte_bureau) || undefined,
  };
}

function adaptContratoNew(raw: Record<string, unknown>): Partial<ContratoSocialData> {
  const r = raw ?? {};
  const ultAlt   = (r.ultima_alteracao ?? {}) as Record<string, unknown>;
  const regJunta = (r.registro_junta ?? {}) as Record<string, unknown>;
  const admObj   = (r.administracao ?? {}) as Record<string, unknown>;
  const sociosArr = Array.isArray(r.socios) ? r.socios as Array<Record<string, unknown>> : [];
  const retirArr  = Array.isArray(r.socios_retirantes) ? r.socios_retirantes as Array<Record<string, unknown>> : [];
  const anterArr  = Array.isArray(r.quadro_anterior) ? r.quadro_anterior as Array<Record<string, unknown>> : [];
  const filiaisArr = Array.isArray(r.filiais) ? r.filiais as Array<Record<string, unknown>> : [];
  const objItems  = Array.isArray(r.objeto_social_itens) ? (r.objeto_social_itens as unknown[]).map(x => String(x)).filter(Boolean) : [];

  const numOr = (v: unknown): number => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
    if (!s) return 0;
    const hasBR = /,\d{1,2}$/.test(s);
    const multiDot = (s.match(/\./g) ?? []).length > 1;
    if (hasBR) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    if (multiDot) return parseFloat(s.replace(/\./g, "")) || 0;
    return parseFloat(s.replace(/,/g, "")) || 0;
  };

  const totalQuotasN = numOr(r.total_quotas);

  const mapSocio = (s: Record<string, unknown>): Socio => {
    const qts = numOr(s.quotas);
    let participacao = "";
    if (s.percentual_participacao != null) {
      const pct = numOr(s.percentual_participacao);
      participacao = pct > 0 ? pct.toFixed(0) + "%" : "";
    } else if (qts > 0 && totalQuotasN > 0) {
      participacao = ((qts / totalQuotasN) * 100).toFixed(2).replace(".", ",") + "%";
    } else if (_s(s.participacao)) {
      participacao = _s(s.participacao);
    }
    const qualBase = _s(s.qualificacao);
    const qualFull = s.administrador === true && !/administrador/i.test(qualBase)
      ? (qualBase ? `${qualBase} (Administrador)` : "Administrador")
      : qualBase;
    return {
      nome: _s(s.nome),
      cpf: _s(s.cpf),
      participacao,
      qualificacao: qualFull,
      ...(s.rg ? { rg: _s(s.rg) } : {}),
      ...(s.orgao_emissor_rg ? { orgaoEmissorRg: _s(s.orgao_emissor_rg) } : {}),
      ...(s.data_nascimento ? { dataNascimento: _s(s.data_nascimento) } : {}),
      ...(s.estado_civil ? { estadoCivil: _s(s.estado_civil) } : {}),
      ...(s.regime_bens ? { regimeBens: _s(s.regime_bens) } : {}),
      ...(s.endereco_residencial ? { enderecoResidencial: _s(s.endereco_residencial) } : {}),
      ...(s.administrador != null ? { administrador: s.administrador === true } : {}),
      ...(qts > 0 ? { quotas: qts } : {}),
      ...(s.valor_total_quotas ? { valorTotalQuotas: _fmtMoneyBR(s.valor_total_quotas) } : {}),
    };
  };

  // Administradores: prioriza objeto administracao, fallback sócios com administrador=true
  const admArr = Array.isArray(admObj.administradores) ? (admObj.administradores as Array<Record<string,unknown>>).map(a => _s(a.nome)).filter(Boolean) : [];
  const admFallback = sociosArr.filter(s => s.administrador === true).map(s => _s(s.nome)).filter(Boolean);
  const administracao = (admArr.length > 0 ? admArr : admFallback).join(", ");

  const hasAlteracao = !!(_s(ultAlt.tipo_ato) || _s(ultAlt.data_registro) || _s(ultAlt.data_assinatura));

  const filiais: Filial[] = filiaisArr.map(f => ({
    cnpj: _s(f.cnpj),
    nire: _s(f.nire) || undefined,
    logradouro: _s(f.logradouro) || undefined,
    numero: _s(f.numero) || undefined,
    bairro: _s(f.bairro) || undefined,
    municipio: _s(f.municipio),
    uf: _s(f.uf),
    cep: _s(f.cep) || undefined,
  })).filter(f => f.cnpj || f.municipio);

  const sociosRetirantes: SocioRetirante[] = retirArr.map(s => ({
    nome: _s(s.nome),
    cpf: _s(s.cpf),
    quotasCedidas: numOr(s.quotas_cedidas),
    valorQuotasCedidas: _fmtMoneyBR(s.valor_quotas_cedidas),
    ...(s.cessionario ? { cessionario: _s(s.cessionario) } : {}),
    ...(s.data_retirada ? { dataRetirada: _s(s.data_retirada) } : {}),
  })).filter(s => s.nome);

  const registro = (_s(regJunta.protocolo) || _s(regJunta.numero_registro) || _s(regJunta.data_registro))
    ? {
        protocolo:      _s(regJunta.protocolo) || undefined,
        dataProtocolo:  _s(regJunta.data_protocolo) || undefined,
        numeroRegistro: _s(regJunta.numero_registro) || _s(regJunta.numero_arquivamento) || undefined,
        dataRegistro:   _s(regJunta.data_registro) || _s(regJunta.data_arquivamento) || undefined,
        dataEfeitos:    _s(regJunta.data_efeitos) || _s(ultAlt.data_assinatura) || undefined,
        orgao:          _s(regJunta.orgao) || undefined,
      }
    : undefined;

  return {
    socios: sociosArr.map(mapSocio),
    capitalSocial: _fmtMoneyBR(r.capital_social_valor),
    objetoSocial: _s(r.objeto_social),
    ...(objItems.length > 0 ? { objetoSocialItems: objItems } : {}),
    dataConstituicao: _s(r.data_constituicao),
    temAlteracoes: hasAlteracao,
    prazoDuracao: _s(r.prazo_duracao),
    administracao,
    foro: _s(r.foro),
    // Campos enriquecidos
    ...(r.cnpj ? { cnpj: _s(r.cnpj) } : {}),
    ...(r.nire ? { nire: _s(r.nire) } : {}),
    ...(r.nome_fantasia ? { nomeFantasia: _s(r.nome_fantasia) } : {}),
    ...(filiais.length > 0 ? { filiais } : {}),
    ...(sociosRetirantes.length > 0 ? { sociosRetirantes } : {}),
    ...(anterArr.length > 0 ? { quadroAnterior: anterArr.map(mapSocio) } : {}),
    ...(totalQuotasN > 0 ? { totalQuotas: totalQuotasN } : {}),
    ...(r.quota_valor_unitario ? { quotaValorUnitario: _fmtMoneyBR(r.quota_valor_unitario) } : {}),
    ...(r.capital_integralizado != null ? { capitalIntegralizado: r.capital_integralizado === true } : {}),
    ...(registro ? { registro } : {}),
  };
}

function adaptCurvaABCNew(raw: Record<string, unknown>): Partial<CurvaABCData> {
  const r = raw ?? {};
  const clientesRaw = Array.isArray(r.curva_abc_clientes) ? r.curva_abc_clientes as Array<Record<string, unknown>> : [];
  const totalFatN = typeof r.total_faturado === "number" ? r.total_faturado : parseFloat(_s(r.total_faturado)) || 0;

  // Parse valores primeiro para poder ordenar
  const clientesParsed = clientesRaw.map(c => ({
    raw: c,
    valor: typeof c.valor === "number" ? c.valor : parseFloat(_s(c.valor)) || 0,
    pct: typeof c.percentual === "number" ? c.percentual : parseFloat(_s(c.percentual)) || 0,
  }));
  // Garantir ordem decrescente por valor independente de como o doc apresenta
  clientesParsed.sort((a, b) => b.valor - a.valor);

  let acc = 0;
  const clientes: ClienteCurvaABC[] = clientesParsed.map(({ raw: c, valor, pct }, idx) => {
    acc += pct;
    const classe = _s(c.classificacao) || (acc <= 80 ? "A" : acc <= 95 ? "B" : "C");
    return {
      posicao: idx + 1,
      nome: _s(c.cliente),
      cnpjCpf: "",
      valorFaturado: _fmtMoneyBR(valor),
      percentualReceita: pct.toFixed(2),
      percentualAcumulado: Math.min(acc, 100).toFixed(2),
      classe,
    };
  });

  const top3Pct = clientes.slice(0, 3).reduce((s, c) => s + parseFloat(c.percentualReceita), 0);
  const top5Pct = clientes.slice(0, 5).reduce((s, c) => s + parseFloat(c.percentualReceita), 0);
  const top10Pct = clientes.slice(0, 10).reduce((s, c) => s + parseFloat(c.percentualReceita), 0);
  const classeA = clientes.filter(c => c.classe === "A");
  const receitaClasseA = classeA.reduce((s, c) => {
    const n = parseFloat(c.valorFaturado.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
    return s + n;
  }, 0);

  console.log('[curva_abc]', {
    totalClientes: clientes.length,
    maiorClientePct: clientes[0]?.percentualReceita ?? "—",
    clientesRaw: clientesRaw.length,
  });
  return {
    clientes,
    totalClientesExtraidos: clientes.length,
    totalClientesNaBase: clientes.length,
    periodoReferencia: _s(r.periodo_referencia),
    receitaTotalBase: _fmtMoneyBRNoPrefix(totalFatN),
    concentracaoTop3: top3Pct.toFixed(2),
    concentracaoTop5: top5Pct.toFixed(2),
    concentracaoTop10: top10Pct.toFixed(2),
    totalClientesClasseA: classeA.length,
    receitaClasseA: _fmtMoneyBRNoPrefix(receitaClasseA),
    maiorCliente: clientes[0]?.nome || "",
    maiorClientePct: clientes[0]?.percentualReceita || "0.00",
    alertaConcentracao: top3Pct > 50,
  };
}

function adaptDRENew(raw: Record<string, unknown>): Partial<DREData> {
  const r = raw ?? {};
  const anosRaw = Array.isArray(r.anos) ? r.anos as Array<Record<string, unknown>> : [];
  const numOr = (v: unknown): number => typeof v === "number" ? v : parseFloat(_s(v)) || 0;

  const anos: DREAno[] = anosRaw.map(a => {
    const recFin = numOr(a.receitas_financeiras);
    const despFin = Math.abs(numOr(a.despesas_financeiras));
    return {
      ano: _s(a.ano),
      receitaBruta: _fmtMoneyBR(a.receita_bruta),
      deducoes: _fmtMoneyBR(a.deducoes_receita_bruta),
      receitaLiquida: _fmtMoneyBR(a.receita_liquida),
      custoProdutosServicos: _fmtMoneyBR(a.custos_total),
      lucroBruto: _fmtMoneyBR(a.lucro_bruto),
      margemBruta: _s(a.margem_bruta_percent),
      despesasOperacionais: _fmtMoneyBR(a.despesas_operacionais_total),
      ebitda: _fmtMoneyBR(a.resultado_operacional),
      margemEbitda: _s(a.margem_operacional_percent),
      depreciacaoAmortizacao: "",
      resultadoFinanceiro: _fmtMoneyBR(recFin - despFin),
      lucroAntesIR: _fmtMoneyBR(a.resultado_antes_ir_csl),
      impostoRenda: _fmtMoneyBR(a.provisao_irpj_csll),
      lucroLiquido: _fmtMoneyBR(a.lucro_liquido_exercicio),
      margemLiquida: _s(a.margem_liquida_percent),
    };
  });

  let tendencia: "crescimento" | "estavel" | "queda" = "estavel";
  if (anosRaw.length >= 2) {
    const l0 = numOr(anosRaw[0].lucro_liquido_exercicio);
    const l1 = numOr(anosRaw[anosRaw.length - 1].lucro_liquido_exercicio);
    if (l0 && l1) {
      if (l1 > l0 * 1.05) tendencia = "crescimento";
      else if (l1 < l0 * 0.95) tendencia = "queda";
    }
  }

  return {
    anos,
    crescimentoReceita: "0,00",
    tendenciaLucro: tendencia,
    periodoMaisRecente: anos.length > 0 ? anos[anos.length - 1].ano : "",
    observacoes: "",
  };
}

function adaptBalancoNew(raw: Record<string, unknown>): Partial<BalancoData> {
  const r = raw ?? {};
  const anosRaw = Array.isArray(r.anos) ? r.anos as Array<Record<string, unknown>> : [];

  const anos: BalancoAno[] = anosRaw.map(a => {
    const ac  = (a.ativo_circulante ?? {}) as Record<string, unknown>;
    const anc = (a.ativo_nao_circulante ?? {}) as Record<string, unknown>;
    const pc  = (a.passivo_circulante ?? {}) as Record<string, unknown>;
    const pnc = (a.passivo_nao_circulante ?? {}) as Record<string, unknown>;
    const pl  = (a.patrimonio_liquido ?? {}) as Record<string, unknown>;
    const ind = (a.indicadores ?? {}) as Record<string, unknown>;

    return {
      ano: _s(a.ano),
      ativoTotal: _fmtMoneyBR(a.ativo_total),
      ativoCirculante: _fmtMoneyBR(ac.total),
      caixaEquivalentes: _fmtMoneyBR(ac.disponivel),
      contasAReceber: _fmtMoneyBR(ac.clientes),
      estoques: _fmtMoneyBR(ac.estoques),
      outrosAtivosCirculantes: _fmtMoneyBR(ac.outros_creditos),
      ativoNaoCirculante: _fmtMoneyBR(anc.total),
      imobilizado: _fmtMoneyBR(anc.imobilizado_liquido ?? anc.imobilizado_bruto),
      intangivel: "",
      outrosAtivosNaoCirculantes: _fmtMoneyBR(anc.outros_creditos),
      passivoTotal: _fmtMoneyBR(a.passivo_total),
      passivoCirculante: _fmtMoneyBR(pc.total),
      fornecedores: _fmtMoneyBR(pc.fornecedores),
      emprestimosCP: _fmtMoneyBR(pc.emprestimos_financiamentos),
      outrosPassivosCirculantes: _fmtMoneyBR(pc.outras_obrigacoes),
      passivoNaoCirculante: _fmtMoneyBR(pnc.total),
      emprestimosLP: "",
      outrosPassivosNaoCirculantes: "",
      patrimonioLiquido: _fmtMoneyBR(pl.total),
      capitalSocial: _fmtMoneyBR(pl.capital_social),
      reservas: "",
      lucrosAcumulados: _fmtMoneyBR(pl.lucros_prejuizos_acumulados),
      liquidezCorrente: _s(ind.liquidez_corrente),
      liquidezGeral: _s(ind.liquidez_geral),
      endividamentoTotal: _s(ind.endividamento_total_percent),
      capitalDeGiroLiquido: _fmtMoneyBR(ind.capital_de_giro),
    };
  });

  return {
    anos,
    periodoMaisRecente: anos.length > 0 ? anos[anos.length - 1].ano : "",
    tendenciaPatrimonio: "estavel",
    observacoes: "",
  };
}

function adaptIRNew(raw: Record<string, unknown>): Partial<IRSocioData> {
  const r = raw ?? {};
  const ident = (r.identificacao ?? {}) as Record<string, unknown>;
  const evo = (r.evolucao_patrimonial ?? {}) as Record<string, unknown>;
  const bens = Array.isArray(r.bens_e_direitos) ? r.bens_e_direitos as Array<Record<string, unknown>> : [];
  const rendTrib = Array.isArray(r.rendimentos_tributaveis_pj_titular) ? r.rendimentos_tributaveis_pj_titular as Array<Record<string, unknown>> : [];
  const rendIsen = Array.isArray(r.rendimentos_isentos_nao_tributaveis) ? r.rendimentos_isentos_nao_tributaveis as Array<Record<string, unknown>> : [];
  const rendExcl = Array.isArray(r.rendimentos_tributacao_exclusiva) ? r.rendimentos_tributacao_exclusiva as Array<Record<string, unknown>> : [];
  const impPago = (r.imposto_pago_retido ?? {}) as Record<string, unknown>;
  const resumo = (r.resumo ?? {}) as Record<string, unknown>;

  // Parsing robusto de valor numérico — suporta float puro (93432.24),
  // BR com decimal (25.324,06) e inteiro BR com milhar (10.809.058)
  const numOr = (v: unknown): number => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
    if (!s) return 0;
    const hasBR = /,\d{1,2}$/.test(s);
    const multiDot = (s.match(/\./g) ?? []).length > 1;
    if (hasBR)       return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    if (multiDot)    return parseFloat(s.replace(/\./g, "")) || 0;
    return parseFloat(s.replace(/,/g, "")) || 0;
  };

  // Grupos DIRPF: 01=imóveis, 02=bens móveis, 03=participações societárias,
  // 04-07=aplicações/investimentos/créditos/depósitos/fundos.
  const sumByGrupo = (grupos: string[]) => bens
    .filter(b => grupos.includes(_s(b.grupo).padStart(2, "0")))
    .reduce((sum, b) => sum + numOr(b.valor_atual), 0);

  const bensImoveisN   = sumByGrupo(["01"]);
  const bensVeiculosN  = sumByGrupo(["02"]);
  const aplicacoesN    = sumByGrupo(["04", "05", "06", "07"]);
  const outrosBensN    = sumByGrupo(["03"]);

  const totalBensN = numOr(evo.bens_direitos_ano_atual);
  const dividasN   = numOr(evo.dividas_ano_atual);

  const rendTribTotal = rendTrib.reduce((s, x) => s + numOr(x.rendimentos_recebidos), 0);
  const rendIsenTotal = rendIsen.reduce((s, x) => s + numOr(x.valor), 0);
  // Total exclusiva: prioriza campo do resumo (mais preciso), fallback soma da array
  const rendExclTotal = numOr(resumo.rendimentos_tributacao_exclusiva)
    || rendExcl.reduce((s, x) => s + numOr(x.valor), 0);

  const tipoDecRaw = _s(r.tipo_declaracao).toLowerCase();
  const tipoDoc: "recibo" | "declaracao" | "extrato" = /recibo/.test(tipoDecRaw)
    ? "recibo"
    : /extrato/.test(tipoDecRaw) ? "extrato" : "declaracao";

  // Participações societárias: usa cnpj_empresa se disponível, senão extrai da discriminacao via regex
  const sociedades: SociedadeIR[] = bens
    .filter(b => _s(b.grupo).padStart(2, "0") === "03")
    .map(p => {
      const discr = _s(p.discriminacao);
      const cnpjFromDiscr = discr.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0] ?? "";
      return {
        razaoSocial: discr,
        cnpj: _s(p.cnpj_empresa) || cnpjFromDiscr,
        participacao: "",
      };
    });

  const cpfConjuge = _s(ident.cpf_conjuge);

  return {
    nomeSocio: _s(r.nome),
    cpf: _s(r.cpf),
    ...(cpfConjuge ? { cpfConjuge } : {}),
    anoBase: _s(r.ano_calendario),
    ...(r.exercicio != null ? { exercicio: _s(r.exercicio) } : {}),
    tipoDocumento: tipoDoc,
    numeroRecibo: _s(r.numero_recibo_ultima_declaracao),
    dataEntrega: "",
    rendimentosTributaveis: _fmtMoneyBRNoPrefix(rendTribTotal),
    rendimentosIsentos: _fmtMoneyBRNoPrefix(rendIsenTotal),
    ...(rendExclTotal > 0 ? { rendimentosTributacaoExclusiva: _fmtMoneyBRNoPrefix(rendExclTotal) } : {}),
    rendimentoTotal: _fmtMoneyBRNoPrefix(rendTribTotal + rendIsenTotal + rendExclTotal),
    bensImoveis: _fmtMoneyBRNoPrefix(bensImoveisN),
    bensVeiculos: _fmtMoneyBRNoPrefix(bensVeiculosN),
    aplicacoesFinanceiras: _fmtMoneyBRNoPrefix(aplicacoesN),
    outrosBens: _fmtMoneyBRNoPrefix(outrosBensN),
    totalBensDireitos: _fmtMoneyBRNoPrefix(totalBensN),
    dividasOnus: _fmtMoneyBRNoPrefix(dividasN),
    patrimonioLiquido: _fmtMoneyBRNoPrefix(totalBensN - dividasN),
    impostoPago: _fmtMoneyBRNoPrefix(impPago.total_imposto_pago),
    impostoRestituir: _fmtMoneyBRNoPrefix(resumo.imposto_a_restituir),
    temSociedades: sociedades.length > 0,
    sociedades,
    coerenciaComEmpresa: true,
    observacoes: "",
    situacaoMalhas: r.debitos_receita_federal === true || _s(r.situacao_declaracao).toLowerCase().includes("malha"),
    debitosEmAberto: r.debitos_receita_federal === true,
    descricaoDebitos: r.debitos_receita_federal === true ? (_s(r.situacao_declaracao) || "Débitos identificados") : "",
    bensEDireitos: bens.map(b => ({
      grupo: _s(b.grupo),
      discriminacao: _s(b.discriminacao),
      valor_atual: typeof b.valor_atual === "number" ? b.valor_atual : numOr(b.valor_atual) || null,
    })),
    dividasOnusReais: (Array.isArray(r.dividas_onus_reais) ? r.dividas_onus_reais as Array<Record<string, unknown>> : []).map(d => ({
      discriminacao: _s(d.discriminacao),
      situacao_atual: typeof d.situacao_atual === "number" ? d.situacao_atual : numOr(d.situacao_atual) || null,
    })),
    pagamentosEfetuados: (Array.isArray(r.pagamentos_efetuados) ? r.pagamentos_efetuados as Array<Record<string, unknown>> : []).map(p => ({
      nome_beneficiario: _s(p.nome_beneficiario),
      valor_pago: typeof p.valor_pago === "number" ? p.valor_pago : numOr(p.valor_pago) || null,
      descricao: _s(p.descricao),
    })),
  };
}

function adaptVisitaNew(raw: Record<string, unknown>): Partial<RelatorioVisitaData> {
  const r      = raw ?? {};
  const ops    = (r.dados_operacionais ?? {}) as Record<string, unknown>;
  const params = (r.parametros_sugeridos ?? {}) as Record<string, unknown>;
  const end    = (r.endereco_visitado ?? {}) as Record<string, unknown>;
  const cont   = (r.contatos ?? {}) as Record<string, unknown>;
  const opAt   = (r.operacao_atual_outros_parceiros ?? {}) as Record<string, unknown>;
  const socios = Array.isArray(r.socios) ? r.socios as Array<Record<string, unknown>> : [];
  const conj   = Array.isArray(r.conjuges_responsaveis_solidarios) ? r.conjuges_responsaveis_solidarios as Array<Record<string, unknown>> : [];

  const localParts = [_s(end.logradouro), _s(end.numero), _s(end.complemento), _s(end.bairro), _s(end.municipio), _s(end.uf)].filter(Boolean);
  const cepPart = _s(end.cep) ? `CEP ${_s(end.cep)}` : "";
  const localVisita = [...localParts, cepPart].filter(Boolean).join(" – ");

  const funcN = typeof ops.funcionarios === "number" ? ops.funcionarios : parseInt(_s(ops.funcionarios)) || 0;
  const valorMaq = typeof ops.valor_maquinario === "number" ? ops.valor_maquinario : parseFloat(_s(ops.valor_maquinario)) || 0;

  const recRaw = _s(r.recomendacao).toLowerCase();
  const recVisitante: "aprovado" | "condicional" | "reprovado" =
    /reprov/.test(recRaw) ? "reprovado" : /condic/.test(recRaw) ? "condicional" : "aprovado";

  const gerenteRaw = _s(r.gerente_responsavel).trim();
  const isGenericRole = /^(gerente|analista|gerente de neg[óo]cios|analista de cr[ée]dito|respons[áa]vel|gerente comercial)\s*\.?$/i.test(gerenteRaw);
  const gerenteNome = isGenericRole ? "" : gerenteRaw;

  // Modalidade
  const modRaw = _s(params.modalidade_operacao).toLowerCase();
  const modalidade: RelatorioVisitaData["modalidade"] =
    /comiss/.test(modRaw) ? "comissaria" : /conv/.test(modRaw) ? "convencional" : /hibr/.test(modRaw) ? "hibrida" : undefined;

  // Primeiro sócio e cônjuge principal
  const socPrincipal = socios[0];
  const conjPrincipal = conj[0];

  // Percentuais como string formatada
  const fmtPct = (v: unknown): string => {
    if (v == null || v === "") return "";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? String(n) : _s(v);
  };

  return {
    dataVisita: _s(r.data_visita),
    responsavelVisita: gerenteNome,
    localVisita,
    duracaoVisita: "",
    estruturaFisicaConfirmada: true,
    funcionariosObservados: funcN,
    estoqueVisivel: false,
    estimativaEstoque: _fmtMoneyBR(ops.valor_estoque_max ?? ops.valor_estoque_min),
    operacaoCompativelFaturamento: true,
    maquinasEquipamentos: valorMaq > 0,
    descricaoEstrutura: _s(ops.vantagem_competitiva),
    pontosPositivos: [],
    pontosAtencao: [],
    recomendacaoVisitante: recVisitante,
    nivelConfiancaVisita: "alto",
    presencaSocios: socios.length > 0,
    sociosPresentes: socios.map(s => _s(s.nome)).filter(Boolean),
    documentosVerificados: [],
    observacoesLivres: _s(r.percepcao_gerente),
    pleito: _s(r.defesa_credito),

    // Contatos
    ...(cont.email_financeiro ? { emailFinanceiro: _s(cont.email_financeiro) } : {}),
    ...(socPrincipal ? { nomeSocio: _s(socPrincipal.nome), celularSocio: _s(socPrincipal.celular) } : {}),
    ...(conjPrincipal ? { nomeConjuge: _s(conjPrincipal.nome), cpfConjuge: _s(conjPrincipal.cpf) } : {}),

    // Modalidade
    ...(modalidade ? { modalidade } : {}),
    ...(typeof params.opera_cheque_terceiros === "boolean" ? { operaCheque: params.opera_cheque_terceiros } : {}),

    // Parâmetros do pleito (item 27 / Proposta final do gerente)
    limiteTotal: _fmtMoneyBR(params.limite_global),
    limiteConvencional: _fmtMoneyBR(params.limite_convencional),
    limiteComissaria: _fmtMoneyBR(params.limite_comissaria),
    limitePorSacado: _fmtMoneyBR(params.limite_por_sacado),
    limitePrincipaisSacados: _fmtMoneyBR(params.limite_principais_sacados),
    limiteDuplicatasPJ: _fmtMoneyBR(params.limite_duplicatas_pj),
    limiteChequesPJ: _fmtMoneyBR(params.limite_cheques_pj),
    concentracaoPercent: fmtPct(params.concentracao_percent),
    prazoMaximoOp: _s(params.prazo_maximo_titulo_dias),
    tranche: _fmtMoneyBR(params.tranche_limite_global),
    // tranche_checagem pode ser número (R$) ou texto descritivo ("Sem checagem comissária")
    trancheChecagem: (() => {
      const tc = params.tranche_checagem;
      if (tc == null || tc === "") return "";
      const n = typeof tc === "number" ? tc : parseFloat(String(tc).replace(/\./g, "").replace(",", "."));
      return isFinite(n) ? _fmtMoneyBR(tc) : String(tc).trim();
    })(),
    prazoTranche: _s(params.prazo_tranche_limite_global_dias),
    prazoEnvioCartorio: _s(params.prazo_cartorio_dias),
    cobrancaTAC: _fmtMoneyBR(params.tac_valor),
    taxaConvencional: fmtPct(params.taxa_duplicata_percent),
    taxaCheque: fmtPct(params.taxa_cheque_percent),
    taxaComissaria: fmtPct(params.taxa_comissaria_percent),
    valorCobrancaBoleto: _fmtMoneyBR(params.valor_boleto),
    desagioPropostoPercent: fmtPct(params.desagio_proposto_percent),
    prazoRecompraCedente: _s(params.prazo_recompra_cedente_dias),

    // Tickets e operação
    ticketMinimo: _fmtMoneyBR(opAt.ticket_minimo_nf),
    ticketMaximo: _fmtMoneyBR(opAt.ticket_maximo_nf),
    ticketMedio: _fmtMoneyBR(opAt.ticket_medio_nf),
    prazoVenda: _s(opAt.prazo_venda_dias),
    prazoFornecedores: _s(opAt.prazo_pagamento_fornecedores),
    mixRecebiveis: _s(opAt.mix_recebiveis_descricao) || _s(ops.mix_recebiveis),
    frequenciaOperacao: _s(opAt.frequencia_operacao_semanal),

    // Dados da empresa
    folhaPagamento: _fmtMoneyBR(ops.folha_pagamento),
    prazoMedioFaturamento: _s(ops.prazo_medio_recebimento_dias),
    prazoMedioEntrega: _s(ops.prazo_entrega_dias),
    endividamentoBanco: _fmtMoneyBR(opAt.endividamento_banco),
    endividamentoFactoring: _fmtMoneyBR(opAt.endividamento_factoring),
    // Percentual de vendas por tipo
    vendasDuplicata: ops.percentual_duplicatas != null ? `${ops.percentual_duplicatas}%` : "",
    vendasOutras: ops.percentual_outros != null ? `${ops.percentual_outros}%` : "",
  };
}

function adaptQSANew(raw: Record<string, unknown>): Partial<QSAData> {
  const r = raw ?? {};
  const capitalStr = _s(r.capital_social_valor) || _s((r as Record<string,unknown>).capitalSocial);
  const capitalFmt = _fmtMoneyBR(capitalStr);

  const sociosArr = Array.isArray(r.socios) ? r.socios as Array<Record<string, unknown>>
                  : Array.isArray(r.quadroSocietario) ? r.quadroSocietario as Array<Record<string, unknown>>
                  : [];

  return {
    capitalSocial: capitalFmt,
    quadroSocietario: sociosArr.map(x => {
      const codigo = _s(x.qualificacao_codigo);
      const desc = _s(x.qualificacao_descricao);
      // Mantém formato "CODIGO - DESCRIÇÃO" que a UI já sabe processar (rendering strippa o prefixo numérico).
      const qualFull = codigo && desc ? `${codigo} - ${desc}`
                    : desc ? desc
                    : _s(x.qualificacao);
      return {
        nome: _s(x.nome),
        cpfCnpj: _s(x.cpf) || _s(x.cpfCnpj),
        qualificacao: qualFull,
        participacao: _s(x.participacao),
        dataEntrada: _s(x.data_entrada) || _s(x.dataEntrada),
      };
    }),
  };
}

function fillCNPJDefaults(data: Partial<CNPJData>): CNPJData {
  return {
    razaoSocial: data.razaoSocial || "", nomeFantasia: data.nomeFantasia || "",
    cnpj: data.cnpj || "", dataAbertura: data.dataAbertura || "",
    situacaoCadastral: data.situacaoCadastral || "", dataSituacaoCadastral: data.dataSituacaoCadastral || "",
    motivoSituacao: data.motivoSituacao || "", naturezaJuridica: data.naturezaJuridica || "",
    cnaePrincipal: data.cnaePrincipal || "", cnaeSecundarios: data.cnaeSecundarios || "",
    porte: data.porte || "", capitalSocialCNPJ: data.capitalSocialCNPJ || "",
    endereco: data.endereco || "", telefone: data.telefone || "", email: data.email || "",
  };
}

function fillQSADefaults(data: Partial<QSAData>): QSAData & { _incompleteCount?: number } {
  // Descarta socios totalmente vazios MAS conta quantos foram descartados
  // pra que a Review possa exibir "N socios foram detectados parcialmente".
  const raw = Array.isArray(data.quadroSocietario) ? data.quadroSocietario : [];
  let incompleteCount = 0;
  const quadro = raw
    .filter(s => {
      if (!s) { incompleteCount++; return false; }
      const hasName = !!(s.nome && s.nome.trim());
      const hasCpf = !!(s.cpfCnpj && s.cpfCnpj.trim());
      const hasQual = !!(s.qualificacao && s.qualificacao.trim());
      // Se so tem qualificacao/participacao e nada identificavel, e ruido
      if (!hasName && !hasCpf && !hasQual) { incompleteCount++; return false; }
      // Se so tem nome OU so tem CPF, mantem com warning no log
      if (!hasName || !hasCpf) {
        console.warn(`[extract][qsa] socio parcial mantido: nome="${s.nome ? s.nome.split(" ")[0] : "—"}" cpf="${s.cpfCnpj ? s.cpfCnpj.replace(/\D/g,"").slice(0,3)+"***" : "—"}"`);
      }
      return true;
    })
    .map(s => ({
      nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
      qualificacao: s.qualificacao || "", participacao: s.participacao || "",
    }));
  if (incompleteCount > 0) {
    console.warn(`[extract][qsa] ${incompleteCount} entrada(s) totalmente vazia(s) descartada(s)`);
  }
  const result: QSAData & { _incompleteCount?: number } = {
    capitalSocial: data.capitalSocial || "", quadroSocietario: quadro,
  };
  if (incompleteCount > 0) result._incompleteCount = incompleteCount;
  return result;
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData & { _incompleteCount?: number } {
  const raw = Array.isArray(data.socios) ? data.socios : [];
  let incompleteCount = 0;
  const socios = raw
    .filter(s => {
      if (!s) { incompleteCount++; return false; }
      const hasName = !!(s.nome && s.nome.trim());
      const hasCpf = !!(s.cpf && s.cpf.trim());
      const hasPart = !!(s.participacao && s.participacao.trim());
      if (!hasName && !hasCpf && !hasPart) { incompleteCount++; return false; }
      if (!hasName || !hasCpf) {
        console.warn(`[extract][contrato] socio parcial mantido: nome="${s.nome ? s.nome.split(" ")[0] : "—"}" cpf="${s.cpf ? s.cpf.replace(/\D/g,"").slice(0,3)+"***" : "—"}"`);
      }
      return true;
    })
    .map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }));
  if (incompleteCount > 0) {
    console.warn(`[extract][contrato] ${incompleteCount} entrada(s) totalmente vazia(s) descartada(s)`);
  }
  const result: ContratoSocialData & { _incompleteCount?: number } = {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
  if (incompleteCount > 0) result._incompleteCount = incompleteCount;
  return result;
}

function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  const _mesAtualFiltro = new Date().getMonth() + 1;
  const _anoAtualFiltro = new Date().getFullYear();

  const _mesesFuturosDropados: string[] = [];
  const meses = (Array.isArray(data.meses) ? data.meses : [])
    .filter(m => {
      if (!m.mes) return false;
      const [mesNum, anoNum] = m.mes.split("/").map(Number);
      if (!mesNum || !anoNum) return false;

      // Meses futuros: marca como dropado pra expor na Review, nao silencia
      if (anoNum > _anoAtualFiltro || (anoNum === _anoAtualFiltro && mesNum > _mesAtualFiltro)) {
        _mesesFuturosDropados.push(m.mes);
        return false;
      }
      return true;
    });
  if (_mesesFuturosDropados.length > 0) {
    console.warn(`[extract][faturamento] ${_mesesFuturosDropados.length} mes(es) futuro(s) descartado(s): ${_mesesFuturosDropados.join(", ")}`);
  }
  const parseBR = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenados = [...meses].sort((a, b) => {
    const [mesA, anoA] = (a.mes || "").split("/").map(Number);
    const [mesB, anoB] = (b.mes || "").split("/").map(Number);
    return (anoA - anoB) || (mesA - mesB);
  });

  const meses12 = ordenados.slice(-12);
  const soma12 = meses12.reduce((s, m) => s + parseBR(m.valor), 0);
  const fmm12m = meses12.length > 0 ? soma12 / meses12.length : 0;

  const porAno: Record<string, number[]> = {};
  for (const m of ordenados) {
    const parts = (m.mes || "").split("/");
    const anoRaw = parts[1] || "";
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    if (!ano) continue;
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(parseBR(m.valor));
  }

  const fmmAnual: Record<string, number> = {};
  for (const [ano, valores] of Object.entries(porAno)) {
    const somaAno = valores.reduce((s, v) => s + v, 0);
    fmmAnual[ano] = somaAno / valores.length;
  }

  const anosCompletos = Object.entries(porAno).filter(([, v]) => v.length === 12);
  const fmmMedio = anosCompletos.length > 0
    ? anosCompletos.reduce((s, [ano]) => s + fmmAnual[ano], 0) / anosCompletos.length
    : fmm12m;

  const anoAtual = String(new Date().getFullYear());
  const fmmAnoAtual = fmmAnual[anoAtual];
  let tendencia: "crescimento" | "estavel" | "queda" | "indefinido" = "indefinido";
  if (fmmAnoAtual && fmm12m > 0) {
    const delta = (fmmAnoAtual - fmm12m) / fmm12m;
    if (delta > 0.05) tendencia = "crescimento";
    else if (delta < -0.05) tendencia = "queda";
    else tendencia = "estavel";
  }

  // somatoriaAno = soma dos últimos 12 meses (valor anualizado, não total histórico)
  const soma12m = meses12.reduce((s, m) => s + parseBR(m.valor), 0);

  const mesesZerados = meses12
    .filter(m => parseBR(m.valor) === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  const result = {
    meses,
    somatoriaAno: fmtBR(soma12m),
    mediaAno: fmtBR(fmm12m),
    fmm12m: fmtBR(fmm12m),
    fmmAnual: Object.fromEntries(
      Object.entries(fmmAnual).map(([ano, v]) => [ano, fmtBR(v)])
    ),
    fmmMedio: fmtBR(fmmMedio),
    tendencia,
    faturamentoZerado: meses.length === 0 || meses.every(m => parseBR(m.valor) === 0),
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || (ordenados.length > 0 ? ordenados[ordenados.length - 1].mes : ""),
    mesesZerados,
    quantidadeMesesZerados: mesesZerados.length,
    temMesesZerados: mesesZerados.length > 0,
  } as FaturamentoData & { _mesesFuturosIgnorados?: string[] };
  if (_mesesFuturosDropados.length > 0) result._mesesFuturosIgnorados = _mesesFuturosDropados;
  return result;
}

function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  // Normaliza faixas key-por-key para evitar objetos vazios {} que passam pelo ||
  const f = data.faixasAVencer as Record<string, string> | undefined;
  const fv = data.faixasVencidos as Record<string, string> | undefined;
  const faixasAVencer: SCRData["faixasAVencer"] = {
    ate30d: f?.ate30d || "", d31_60: f?.d31_60 || "", d61_90: f?.d61_90 || "",
    d91_180: f?.d91_180 || "", d181_360: f?.d181_360 || "", acima360d: f?.acima360d || "",
    prazoIndeterminado: f?.prazoIndeterminado || "", total: f?.total || "",
  };
  const faixasVencidos: SCRData["faixasVencidos"] = {
    ate30d: fv?.ate30d || "", d31_60: fv?.d31_60 || "", d61_90: fv?.d61_90 || "",
    d91_180: fv?.d91_180 || "", d181_360: fv?.d181_360 || "", acima360d: fv?.acima360d || "",
    total: fv?.total || "",
  };

  // ─── FALLBACK: curto/longo prazo quando faixas não foram extraídas ───
  // Se o prompt não encontrou a seção "Discriminação A Vencer por Faixa de
  // Prazo", carteiraCurtoPrazo fica vazia mas carteiraAVencer pode ter valor.
  // Deriva: curto = aVencer - acima360d (fallback mínimo: tudo é curto prazo).
  const parseMoney = (s: unknown): number => {
    if (s == null || s === "") return 0;
    const str = String(s).trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  };
  let carteiraCurtoPrazo = data.carteiraCurtoPrazo || "";
  let carteiraLongoPrazo = data.carteiraLongoPrazo || "";
  const aVencerNum = parseMoney(data.carteiraAVencer);
  const curtoNum   = parseMoney(carteiraCurtoPrazo);
  const longoNum   = parseMoney(carteiraLongoPrazo);
  if (curtoNum === 0 && longoNum === 0 && aVencerNum > 0) {
    // Nenhum dado de faixa — assume 100% curto prazo (cenário conservador)
    const acima360 = parseMoney(faixasAVencer.acima360d);
    const curtoDerivado = Math.max(0, aVencerNum - acima360);
    carteiraCurtoPrazo = curtoDerivado.toFixed(2).replace(".", ",");
    carteiraLongoPrazo = acima360.toFixed(2).replace(".", ",");
    console.log(`[scr-fallback] curto/longo derivados de carteiraAVencer=${aVencerNum} (curto=${curtoDerivado}, longo=${acima360})`);
  }

  return {
    // Identificação — preservar para roteamento PJ vs PF
    tipoPessoa: data.tipoPessoa || undefined,
    nomeCliente: data.nomeCliente || "",
    cpfSCR: data.cpfSCR || "",
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer: data.carteiraAVencer || "", vencidos: data.vencidos || "",
    prejuizos: data.prejuizos || "", limiteCredito: data.limiteCredito || "",
    qtdeInstituicoes: data.qtdeInstituicoes || "", qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas: data.totalDividasAtivas || "", operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "", operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "", coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo, carteiraLongoPrazo,
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
    // Campos detalhados
    cnpjSCR: data.cnpjSCR || "",
    pctDocumentosProcessados: data.pctDocumentosProcessados || "",
    pctVolumeProcessado: data.pctVolumeProcessado || "",
    faixasAVencer,
    faixasVencidos,
    faixasPrejuizos: { ate12m: data.faixasPrejuizos?.ate12m || "", acima12m: data.faixasPrejuizos?.acima12m || "", total: data.faixasPrejuizos?.total || "" },
    faixasLimite: { ate360d: data.faixasLimite?.ate360d || "", acima360d: data.faixasLimite?.acima360d || "", total: data.faixasLimite?.total || "" },
    outrosValores: {
      carteiraCredito: data.outrosValores?.carteiraCredito || "",
      responsabilidadeTotal: data.outrosValores?.responsabilidadeTotal || "",
      riscoTotal: data.outrosValores?.riscoTotal || "",
      coobrigacaoAssumida: data.outrosValores?.coobrigacaoAssumida || "",
      coobrigacaoRecebida: data.outrosValores?.coobrigacaoRecebida || "",
      creditosALiberar: data.outrosValores?.creditosALiberar || "",
    },
    emDia: data.emDia || "",
    semHistorico: data.semHistorico ?? (!data.totalDividasAtivas && !data.carteiraAVencer && !data.vencidos && !data.prejuizos && !data.limiteCredito),
    numeroIfs: data.numeroIfs || "",
  };
}

function fillProtestosDefaults(data: Partial<ProtestosData>): ProtestosData {
  return {
    vigentesQtd: data.vigentesQtd || "", vigentesValor: data.vigentesValor || "",
    regularizadosQtd: data.regularizadosQtd || "", regularizadosValor: data.regularizadosValor || "",
    detalhes: Array.isArray(data.detalhes) ? data.detalhes : [],
  };
}

function fillProcessosDefaults(data: Partial<ProcessosData>): ProcessosData {
  return {
    passivosTotal: data.passivosTotal || "", ativosTotal: data.ativosTotal || "",
    valorTotalEstimado: data.valorTotalEstimado || "", temRJ: data.temRJ || false,
    distribuicao: Array.isArray(data.distribuicao) ? data.distribuicao : [],
    bancarios: Array.isArray(data.bancarios) ? data.bancarios : [],
    fiscais: Array.isArray(data.fiscais) ? data.fiscais : [],
    fornecedores: Array.isArray(data.fornecedores) ? data.fornecedores : [],
    outros: Array.isArray(data.outros) ? data.outros : [],
  };
}

function fillGrupoEconomicoDefaults(data: Partial<GrupoEconomicoData>): GrupoEconomicoData {
  return { empresas: Array.isArray(data.empresas) ? data.empresas : [] };
}

function fillCurvaABCDefaults(data: Partial<CurvaABCData>): CurvaABCData {
  return {
    clientes: data.clientes ?? [],
    totalClientesNaBase: data.totalClientesNaBase ?? 0,
    totalClientesExtraidos: data.totalClientesExtraidos ?? 0,
    periodoReferencia: data.periodoReferencia ?? "",
    receitaTotalBase: data.receitaTotalBase ?? "0,00",
    concentracaoTop3: data.concentracaoTop3 ?? "0.00",
    concentracaoTop5: data.concentracaoTop5 ?? "0.00",
    concentracaoTop10: data.concentracaoTop10 ?? "0.00",
    totalClientesClasseA: data.totalClientesClasseA ?? 0,
    receitaClasseA: data.receitaClasseA ?? "0,00",
    maiorCliente: data.maiorCliente ?? "",
    maiorClientePct: data.maiorClientePct ?? "0.00",
    alertaConcentracao: data.alertaConcentracao ?? false,
  };
}

function fillDREDefaults(data: Partial<DREData>): DREData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    crescimentoReceita: data.crescimentoReceita || "0,00",
    tendenciaLucro: data.tendenciaLucro || "estavel",
    periodoMaisRecente: data.periodoMaisRecente || "",
    observacoes: data.observacoes || "",
  };
}

function fillBalancoDefaults(data: Partial<BalancoData>): BalancoData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    periodoMaisRecente: data.periodoMaisRecente || "",
    tendenciaPatrimonio: data.tendenciaPatrimonio || "estavel",
    observacoes: data.observacoes || "",
  };
}

function fillIRSocioDefaults(data: Partial<IRSocioData>): IRSocioData {
  const parseMoney = (v: string | undefined | null): number => {
    if (!v || v === "0,00") return 0;
    const s = String(v).replace(/[R$\s]/g, "").trim();
    const lastComma = s.lastIndexOf(",");
    const lastDot   = s.lastIndexOf(".");
    if (lastComma > lastDot) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s.replace(/,/g, "")) || 0;
  };
  const fmtMoney = (n: number): string =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bensImoveis        = sanitizeMoney(data.bensImoveis);
  const bensVeiculos       = sanitizeMoney(data.bensVeiculos);
  const aplicacoes         = sanitizeMoney(data.aplicacoesFinanceiras);
  const outrosBens         = sanitizeMoney(data.outrosBens);
  const dividasOnus        = sanitizeMoney(data.dividasOnus);

  // Reconciliação de totalBensDireitos.
  // O Gemini às vezes retorna um total que é só o primeiro item da lista (ex: "640k" quando
  // na verdade o total é 1.2M), ou retorna subcategorias incompletas. Quando há divergência
  // significativa, usamos o MAIOR dos dois — parte-se da premissa de que o menor está
  // incompleto (o agregador raramente inventa valor, mas frequentemente perde itens).
  const totalDoc   = parseMoney(data.totalBensDireitos);
  const totalCalc  = parseMoney(bensImoveis) + parseMoney(bensVeiculos) + parseMoney(aplicacoes) + parseMoney(outrosBens);
  const maxTotal   = Math.max(totalDoc, totalCalc);
  const diverges   = totalDoc > 0 && totalCalc > 0 && Math.abs(totalDoc - totalCalc) > maxTotal * 0.05;
  if (diverges) {
    console.warn(
      `[IR extract] totalBensDireitos divergente: doc=${totalDoc}, calc=${totalCalc}. ` +
      `Usando o maior (${maxTotal}). Subcategorias provavelmente incompletas.`,
    );
  }
  const totalBens = maxTotal > 0 ? fmtMoney(maxTotal) : "0,00";

  // patrimonioLiquido: recalcula server-side para garantir consistência
  const totalBensN = parseMoney(totalBens);
  const dividasN   = parseMoney(dividasOnus);
  const plDocN     = parseMoney(data.patrimonioLiquido);
  // Usa o valor do Gemini se razoável (diferença < 1% do total), senão recalcula
  const plFinal = (plDocN !== 0 && Math.abs(plDocN - (totalBensN - dividasN)) < totalBensN * 0.01)
    ? sanitizeMoney(data.patrimonioLiquido)
    : fmtMoney(Math.max(0, totalBensN - dividasN));

  return {
    nomeSocio: sanitizeStr(data.nomeSocio, 100),
    cpf: data.cpf || "",
    anoBase: data.anoBase || "",
    tipoDocumento: sanitizeEnum(data.tipoDocumento, ["recibo", "declaracao", "extrato"] as const, "recibo"),
    numeroRecibo: data.numeroRecibo || "",
    dataEntrega: data.dataEntrega || "",
    situacaoMalhas: data.situacaoMalhas ?? false,
    debitosEmAberto: data.debitosEmAberto ?? false,
    descricaoDebitos: sanitizeDescricaoDebitos(data.descricaoDebitos),
    rendimentosTributaveis: sanitizeMoney(data.rendimentosTributaveis),
    rendimentosIsentos: sanitizeMoney(data.rendimentosIsentos),
    rendimentoTotal: sanitizeMoney(data.rendimentoTotal),
    bensImoveis,
    bensVeiculos,
    aplicacoesFinanceiras: aplicacoes,
    outrosBens,
    totalBensDireitos: totalBens,
    dividasOnus,
    patrimonioLiquido: plFinal,
    impostoDefinido: sanitizeMoney(data.impostoDefinido),
    valorQuota: sanitizeMoney(data.valorQuota),
    impostoPago: sanitizeMoney(data.impostoPago),
    impostoRestituir: sanitizeMoney(data.impostoRestituir),
    temSociedades: data.temSociedades ?? false,
    sociedades: Array.isArray(data.sociedades) ? data.sociedades : [],
    coerenciaComEmpresa: data.coerenciaComEmpresa ?? true,
    observacoes: sanitizeStr(data.observacoes, 500),
    bensEDireitos: Array.isArray(data.bensEDireitos) ? data.bensEDireitos : [],
    dividasOnusReais: Array.isArray(data.dividasOnusReais) ? data.dividasOnusReais : [],
    pagamentosEfetuados: Array.isArray(data.pagamentosEfetuados) ? data.pagamentosEfetuados : [],
  };
}

function fillRelatorioVisitaDefaults(data: Partial<RelatorioVisitaData>): RelatorioVisitaData {
  return {
    dataVisita: data.dataVisita || "",
    responsavelVisita: data.responsavelVisita || "",
    localVisita: data.localVisita || "",
    duracaoVisita: data.duracaoVisita || "",
    estruturaFisicaConfirmada: data.estruturaFisicaConfirmada ?? true,
    funcionariosObservados: data.funcionariosObservados ?? 0,
    estoqueVisivel: data.estoqueVisivel ?? false,
    estimativaEstoque: data.estimativaEstoque || "",
    operacaoCompativelFaturamento: data.operacaoCompativelFaturamento ?? true,
    maquinasEquipamentos: data.maquinasEquipamentos ?? false,
    descricaoEstrutura: data.descricaoEstrutura || "",
    pontosPositivos: Array.isArray(data.pontosPositivos) ? data.pontosPositivos : [],
    pontosAtencao: Array.isArray(data.pontosAtencao) ? data.pontosAtencao : [],
    recomendacaoVisitante: data.recomendacaoVisitante || "aprovado",
    nivelConfiancaVisita: data.nivelConfiancaVisita || "alto",
    presencaSocios: data.presencaSocios ?? false,
    sociosPresentes: Array.isArray(data.sociosPresentes) ? data.sociosPresentes : [],
    documentosVerificados: Array.isArray(data.documentosVerificados) ? data.documentosVerificados : [],
    observacoesLivres: data.observacoesLivres || "",
    pleito: data.pleito || "",
    modalidade: data.modalidade || undefined,
    taxaConvencional: data.taxaConvencional || "",
    taxaComissaria: data.taxaComissaria || "",
    limiteTotal: data.limiteTotal || "",
    limiteConvencional: data.limiteConvencional || "",
    limiteComissaria: data.limiteComissaria || "",
    limitePorSacado: data.limitePorSacado || "",
    limiteDuplicatasPJ: data.limiteDuplicatasPJ || "",
    limiteChequesPJ: data.limiteChequesPJ || "",
    limitePrincipaisSacados: data.limitePrincipaisSacados || "",
    ticketMedio: data.ticketMedio || "",
    valorCobrancaBoleto: data.valorCobrancaBoleto || "",
    prazoRecompraCedente: data.prazoRecompraCedente || "",
    prazoEnvioCartorio: data.prazoEnvioCartorio || "",
    prazoMaximoOp: data.prazoMaximoOp || "",
    cobrancaTAC: data.cobrancaTAC || "",
    tranche: data.tranche || "",
    trancheChecagem: data.trancheChecagem || "",
    prazoTranche: data.prazoTranche || "",
    folhaPagamento: data.folhaPagamento || "",
    endividamentoBanco: data.endividamentoBanco || "",
    endividamentoFactoring: data.endividamentoFactoring || "",
    vendasCheque: data.vendasCheque || "",
    vendasDuplicata: data.vendasDuplicata || "",
    vendasOutras: data.vendasOutras || "",
    prazoMedioFaturamento: data.prazoMedioFaturamento || "",
    prazoMedioEntrega: data.prazoMedioEntrega || "",
    referenciasFornecedores: data.referenciasFornecedores || (data as Record<string, unknown>).referenciaComercial as string || "",
    referenciasComerciais: Array.isArray(data.referenciasComerciais) ? data.referenciasComerciais : [],
  };
}

type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData | CurvaABCData | DREData | BalancoData | IRSocioData | RelatorioVisitaData;

function countFilledFields(data: AnyExtracted): number {
  const obj = data as unknown as Record<string, unknown>;
  return Object.values(obj).filter(v =>
    typeof v === "string" ? v.length > 0 :
    Array.isArray(v) ? v.length > 0 :
    typeof v === "boolean" ? true : false
  ).length;
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // ── Caminho 2: arquivo via Vercel Blob URL (JSON body) ──────────────────
    // Usado para arquivos grandes que não cabem no corpo de uma função serverless.
    // O cliente faz upload direto para o Blob e nos envia só a URL.
    if (contentType.includes("application/json")) {
      let body: { blobUrl?: string; type?: string; slot?: string; fileName?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
      }
      const { blobUrl, type: docTypeJson, slot: slotJson, fileName, bypass_cache: bypassCacheJson } = body as { blobUrl?: string; type?: string; slot?: string; fileName?: string; bypass_cache?: boolean };
      if (!blobUrl || !docTypeJson) {
        return NextResponse.json({ error: "blobUrl e type são obrigatórios." }, { status: 400 });
      }
      if (GEMINI_API_KEYS.length === 0) {
        return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
      }
      // Fetch do blob (URL pública temporária do Vercel Blob)
      const blobResp = await fetch(blobUrl);
      if (!blobResp.ok) {
        return NextResponse.json({ error: "Não foi possível baixar o arquivo do blob." }, { status: 400 });
      }
      const blobBuffer = Buffer.from(await blobResp.arrayBuffer());
      const blobFileName = fileName ?? blobUrl.split("/").pop() ?? "document.pdf";
      const blobExt = getFileExt(blobFileName);
      const blobMime = EXT_TO_MIME[blobExt];
      if (!blobMime) {
        return NextResponse.json({ error: `Formato .${blobExt} não suportado.` }, { status: 400 });
      }
      // Caminho Blob: variáveis já prontas, pula o bloco FormData
      if (GEMINI_API_KEYS.length === 0) {
        return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
      }
      return processExtract(request, blobBuffer, blobFileName, blobMime, docTypeJson, slotJson ?? null, bypassCacheJson === true);
    }

    // ── Caminho 1: arquivo via multipart/form-data (upload direto) ──────────
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Request deve ser multipart/form-data ou JSON com blobUrl.", success: false },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[extract] FormData parse failed:", formErr instanceof Error ? formErr.message : formErr);
      return NextResponse.json(
        { error: "Falha ao processar o upload. Verifique o arquivo e tente novamente.", success: false },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;
    const slot = formData.get("slot") as string | null;
    const bypassCache = formData.get("bypass_cache") === "true";

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    const MAX_SIZE = 30 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 30MB. Comprima o PDF antes de enviar." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return processExtract(request, buffer, file.name, mimeType, docType, slot, bypassCache);
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// Lógica de extração compartilhada (FormData e Blob)
// ─────────────────────────────────────────
// Cache version — bump aqui ao atualizar prompts para invalidar extrações antigas.
// v3 = Layer 3 (subformatos especializados, SCR texto, IR/FAT/SCR novos prompts).
const CACHE_VERSION = "v4";
// TTL do cache: extrações mais antigas que N dias são ignoradas e refeitas.
const CACHE_TTL_DAYS = 30;

async function processExtract(
  request: NextRequest,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  docType: string,
  slot: string | null,
  bypassCache = false,
): Promise<Response> {
  const ext = getFileExt(fileName);
  try {
    // ──── Cache de extracao por hash (sha256 do arquivo) ────
    // Versão = CACHE_VERSION, TTL = CACHE_TTL_DAYS dias.
    // bypassCache=true pula a leitura (mas ainda escreve após extração bem-sucedida).
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const cacheDocType = `${docType}_${CACHE_VERSION}`;
    const cacheTTLDate = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
    let cachedUserId: string | null = null;
    try {
      const supaCache = createServerSupabase();
      const { data: userData } = await supaCache.auth.getUser();
      cachedUserId = userData.user?.id || null;
      if (cachedUserId && !bypassCache) {
        const { data: cached } = await supaCache
          .from("extraction_cache")
          .select("extracted_data, filled_fields")
          .eq("user_id", cachedUserId)
          .eq("file_hash", fileHash)
          .eq("doc_type", cacheDocType)
          .gte("created_at", cacheTTLDate)
          .maybeSingle();
        if (cached?.extracted_data) {
          console.log(`[extract][cache] HIT ${cacheDocType} hash=${fileHash.substring(0, 12)} (${cached.filled_fields ?? "?"} campos)`);
          return NextResponse.json({
            success: true,
            data: cached.extracted_data,
            meta: { rawTextLength: 0, filledFields: cached.filled_fields ?? 0, isScanned: false, aiPowered: false, cached: true },
          });
        }
      } else if (bypassCache) {
        console.log(`[extract][cache] BYPASS ${cacheDocType} hash=${fileHash.substring(0, 12)}`);
      }
    } catch (cacheErr) {
      console.warn(`[extract][cache] lookup falhou (seguindo sem cache):`, cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }

    // ──── Excel: processamento direto sem IA ────
    // Se o parser Excel retornar vazio OU lancar erro, cai pro Gemini como fallback
    // (evita que analista veja "faturamento vazio" sem aviso quando o XLSX foge do formato).
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${fileName}`);
        const faturamento = await extractExcel(buffer);
        const filled = countFilledFields(faturamento);
        const hasMeses = Array.isArray(faturamento.meses) && faturamento.meses.length > 0;
        if (!hasMeses || filled === 0) {
          console.warn(`[extract] Excel parser retornou vazio (meses=${faturamento.meses?.length ?? 0}, filled=${filled}) — caindo pro Gemini como fallback`);
          // Prossegue para fluxo Gemini (nao retorna aqui)
        } else {
          return NextResponse.json({
            success: true,
            data: faturamento,
            meta: { rawTextLength: 0, filledFields: filled, isScanned: false, aiPowered: false },
          });
        }
      } catch (err) {
        console.error("[extract] Excel processing failed:", err);
        // Se falhar, tentar via IA
      }
    }

    // ──── Layer 3: extrair texto para detecção de subformato ────
    // PDFs textuais têm extração rápida (pdf-parse). O texto extraído aqui é reutilizado
    // no modo texto para Gemini, evitando dupla extração.
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let rawPdfText = "";
    if (ext === "pdf") {
      rawPdfText = await extractText(buffer, "pdf");
    }
    const subformat = detectSubformat(docType, rawPdfText);
    if (subformat !== "DEFAULT") {
      console.log(`[extract] subformat detected: ${subformat}`);
    }

    // ──── Selecionar prompt (Layer 3: especializado por subformato) ────
    let prompt: string;
    switch (docType) {
      case "cnpj":       prompt = PROMPT_CNPJ; break;
      case "qsa":        prompt = PROMPT_QSA; break;
      case "contrato":   prompt = PROMPT_CONTRATO; break;
      case "faturamento":
        if (subformat === "FAT_DAS")      prompt = PROMPT_FAT_DAS;
        else if (subformat === "FAT_BANCARIO") prompt = PROMPT_FAT_BANCARIO;
        else                               prompt = PROMPT_FATURAMENTO;
        break;
      case "scr": {
        if (subformat === "SCR_BACEN_SEM_DADOS") prompt = PROMPT_SCR_SEM_DADOS;
        else if (subformat === "SCR_BUREAU")     prompt = PROMPT_SCR_BUREAU;
        else {
          const tipoEsperado = slot === "scr_socio" ? "PF" : "PJ";
          prompt = PROMPT_SCR.replace("{{TIPO_ESPERADO}}", tipoEsperado);
        }
        break;
      }
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      case "curva_abc":      prompt = PROMPT_CURVA_ABC; break;
      case "dre":            prompt = PROMPT_DRE; break;
      case "balanco":        prompt = PROMPT_BALANCO; break;
      case "ir_socio":
        prompt = subformat === "IR_RECIBO" ? PROMPT_IR_RECIBO : PROMPT_IR_SOCIOS;
        break;
      case "relatorio_visita": prompt = PROMPT_RELATORIO_VISITA; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    // Documentos textuais usam modo texto (3-5x mais rápido, sem timeout).
    // SCR BACEN e bureau também têm PDF digital — estende modo texto para eles.
    const TEXT_MODE_TYPES = ["faturamento", "ir_socio", "scr", "curva_abc"];

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else if (ext === "pdf") {
      // Detectar PDF escaneado (sem texto) antes de enviar ao Gemini
      if (rawPdfText.trim().length < 50) {
        return NextResponse.json({
          error: "PDF escaneado sem texto selecionável",
          meta: { isScanned: true, rawTextLength: rawPdfText.trim().length },
        }, { status: 422 });
      }
      if (TEXT_MODE_TYPES.includes(docType)) {
        const hasUsefulText = rawPdfText.trim().length > 200 && /\d/.test(rawPdfText);
        if (hasUsefulText) {
          textContent = rawPdfText;
          console.log(`[extract] ${docType}/${subformat} — modo texto (${rawPdfText.length} chars)`);
        } else {
          imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
          console.log(`[extract] ${docType}/${subformat} — modo visual (texto insuficiente: ${rawPdfText.trim().length} chars)`);
        }
      } else {
        // PDFs grandes (>1MB) digitais: tenta texto antes de ir visual — evita Files API e timeout de 52s.
        // Se escaneado (rawPdfText insuficiente) → cai pro visual normalmente.
        const isLargeFile = buffer.length > 1024 * 1024;
        const hasUsefulText = rawPdfText.trim().length > 200 && /\d/.test(rawPdfText);
        if (isLargeFile && hasUsefulText) {
          textContent = rawPdfText;
          console.log(`[extract] ${docType} — texto (fallback ${rawPdfText.length} chars, ${(buffer.length / 1024 / 1024).toFixed(1)}MB PDF digital)`);
        } else {
          console.log(`[extract] ${docType} — modo visual (PDF binário)`);
          imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
          textContent = "";
        }
      }
    } else {
      // Formatos não-PDF (xlsx, docx, txt…): extrai texto normalmente
      textContent = await extractText(buffer, ext);
      if (!textContent.trim()) {
        if (docType !== "faturamento") {
          return NextResponse.json({
            error: "Não foi possível extrair texto do documento. Tente enviar em formato PDF.",
          }, { status: 422 });
        }
        console.warn(`[extract] faturamento: texto vazio para ext=${ext} — tentando Gemini sem conteúdo textual`);
      }
    }

    // Injeta hint do nome do arquivo no prompt para SCR — quando periodoReferencia
    // nao aparece no documento, Gemini pode usar o filename como pista de ultimo recurso.
    if (docType === "scr" && fileName) {
      prompt = `${prompt}\n\n═══ HINT DO NOME DO ARQUIVO ═══\nO arquivo foi enviado com o nome: "${fileName}"\nSe o documento nao declarar periodoReferencia claramente mas o nome do arquivo contem uma data (ex: "scr-11-2025.pdf", "bacen-2024-12.pdf"), use essa data como periodoReferencia (formato MM/AAAA). NUNCA retorne periodoReferencia vazio.`;
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 4000, qsa: 6000, faturamento: 20000, scr: 15000,
        protestos: 8000, processos: 12000, grupoEconomico: 8000,
        dre: 30000, balanco: 30000, ir_socio: 25000,
        curva_abc: 60000,
        // relatorio_visita / contrato → modo visual, não chegam aqui
      };
      textContent = textContent.substring(0, maxChars[docType] || 10000);
    }

    console.log(`[extract] ${fileName} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── SSE stream — mantém conexão viva enquanto Gemini processa ────
    const enc = new TextEncoder();
    const _send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) => {
      try { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); } catch { /* ignore if closed */ }
    };

    // Para documentos enviados como binário (vision), injeta instrução de leitura completa.
    // Sem isso, modelos multimodais podem processar só as primeiras páginas de PDFs longos.
    if (imageContent) {
      prompt = `INSTRUÇÃO CRÍTICA: Leia TODAS as páginas deste documento do início ao fim antes de extrair qualquer dado. Não pare nas primeiras páginas. Seções importantes como parâmetros, quadro societário, bens e direitos e conclusões geralmente estão nas últimas páginas.\n\n${prompt}`;
    }

    const _prompt = prompt;
    const _textContent = textContent;
    const _imageContent = imageContent;
    const _docType = docType;
    const _cacheDocType = cacheDocType;
    const _isImage = isImage;
    const _buffer = buffer;
    const maxOutputTokensMap: Record<string, number> = {
      cnpj: 4096, qsa: 4096, grupoEconomico: 4096, protestos: 4096,
      faturamento: 8192, scr: 8192, processos: 8192,
      dre: 8192, balanco: 8192,
      contrato: 8192, curva_abc: 10000, ir_socio: 8192, relatorio_visita: 8192,
    };
    const _maxOutputTokens = maxOutputTokensMap[docType] ?? 2048;

    // Thinking budget calibrado para Hobby plan (60s max total).
    // 2.5 Pro com 1024 tokens completa em ~15-35s; 512 em ~10-20s; 0 em ~5-15s.
    const thinkingBudgetMap: Record<string, number> = {
      relatorio_visita:  512,  // reduzido de 1024 — Files API + 3.1 Pro cascade pode exceder 52s
      contrato:          512,
      ir_socio:            0,  // tabelas/listas — thinking sem ganho; evita timeout no Hobby plan
      curva_abc:           0,  // tabela de clientes — sem raciocínio necessário
      faturamento:         0,  // extração de tabela simples — thinking adiciona latência sem ganho
      scr:               128,
      dre:               128,
      balanco:           128,
      processos:         128,
      protestos:           0,
      qsa:                 0,
      grupoEconomico:      0,
      cnpj:                0,
    };
    const _thinkingBudget = thinkingBudgetMap[docType] ?? 256;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        const startTimeMs = Date.now();
        const zodWarnings: Array<{field: string; message: string}> = [];
        try {
          let data: AnyExtracted;
          let _rawAiResponse = "";
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent, _maxOutputTokens, _imageContent ? _buffer : undefined, _thinkingBudget);
            _rawAiResponse = aiResponse;
            console.log(`[extract] AI response length: ${aiResponse.length}`);
            console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
            const rawParsed = parseJSON<Record<string, unknown>>(aiResponse);

            // ──── Validacao Zod por doc type (leniente + warnings) ────
            // Coerciona tipos, aplica defaults e acumula avisos de formato/negocio.
            // Nao bloqueia a resposta — so documenta problemas.
            let parsed: Record<string, unknown> = rawParsed;
            try {
              if (_docType === "cnpj") {
                // Adapter: novo prompt do Cartão CNPJ retorna snake_case + estrutura aninhada.
                // Converte para camelCase flat esperado pelo CNPJDataSchema antes da validação.
                const adapted = adaptCNPJNew(rawParsed);
                const r = safeParseExtracted(CNPJDataSchema, adapted as Record<string, unknown>, "cnpj");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "qsa") {
                const adapted = adaptQSANew(rawParsed);
                const r = safeParseExtracted(QSADataSchema, adapted as Record<string, unknown>, "qsa");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "contrato") {
                const adapted = adaptContratoNew(rawParsed);
                const r = safeParseExtracted(ContratoSocialDataSchema, adapted as Record<string, unknown>, "contrato");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "faturamento") {
                const adapted = adaptFaturamentoNew(rawParsed);
                const r = safeParseExtracted(FaturamentoDataSchema, adapted as Record<string, unknown>, "faturamento");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "scr") {
                const adapted = adaptSCRNew(rawParsed);
                const r = safeParseExtracted(SCRDataSchema, adapted as Record<string, unknown>, "scr");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              }
              // Docs sem schema Zod: roda o adapter direto (hydrator cuida dos defaults)
              if (_docType === "curva_abc")        parsed = adaptCurvaABCNew(rawParsed) as Record<string, unknown>;
              else if (_docType === "dre")         parsed = adaptDRENew(rawParsed)      as Record<string, unknown>;
              else if (_docType === "balanco")     parsed = adaptBalancoNew(rawParsed)  as Record<string, unknown>;
              else if (_docType === "ir_socio")    parsed = adaptIRNew(rawParsed)       as Record<string, unknown>;
              else if (_docType === "relatorio_visita") {
                const adaptedVisita = adaptVisitaNew(rawParsed) as Record<string, unknown>;
                const rv = safeParseExtracted(RelatorioVisitaSchema, adaptedVisita, "relatorio_visita");
                parsed = rv.data as unknown as Record<string, unknown>;
                zodWarnings.push(...rv.warnings);
              }
              // Audit de regras de negocio (range, coerencia, formato)
              const businessWarnings = auditBusinessRules(_docType, parsed);
              zodWarnings.push(...businessWarnings);
              if (zodWarnings.length > 0) {
                console.warn(`[extract][${_docType}] ${zodWarnings.length} warning(s) de validacao`);
              }
            } catch (zodErr) {
              console.warn(`[extract][${_docType}] zod falhou, seguindo com rawParsed:`, zodErr instanceof Error ? zodErr.message : zodErr);
              parsed = rawParsed;
            }

            switch (_docType) {
              case "cnpj": {
                data = fillCNPJDefaults(parsed as Partial<CNPJData>);
                // Bonus: se o Cartão CNPJ incluir QSA detectado, guarda para usar como QSA automático
                const qsaDetectado = (parsed as Record<string, unknown>).qsaDetectado as Array<{nome?:string;cpfCnpj?:string;qualificacao?:string;dataEntrada?:string}> | undefined;
                if (Array.isArray(qsaDetectado) && qsaDetectado.length > 0) {
                  const validSocios = qsaDetectado.filter(s => s && s.nome && s.nome.trim().length > 2);
                  if (validSocios.length > 0) {
                    (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado = {
                      capitalSocial: (parsed as Record<string, unknown>).capitalSocialCNPJ as string || "",
                      quadroSocietario: validSocios.map(s => ({
                        nome: s.nome || "",
                        cpfCnpj: s.cpfCnpj || "",
                        qualificacao: s.qualificacao || "",
                        participacao: "",
                        dataEntrada: s.dataEntrada || "",
                      })),
                    };
                    console.log(`[extract][cnpj] QSA detectado no cartão: ${validSocios.length} sócios`);
                  }
                }
                break;
              }
              case "qsa": {
                data = fillQSADefaults(parsed as Partial<QSAData>);
                const n = (data as QSAData).quadroSocietario?.length ?? 0;
                console.log(`[extract][qsa] Gemini retornou ${n} socio(s) apos filtro. capitalSocial="${(data as QSAData).capitalSocial || "vazio"}"`);
                if (n === 0) {
                  console.warn(`[extract][qsa] NENHUM SOCIO EXTRAIDO — verifique o documento e o prompt. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
                }
                break;
              }
              case "contrato": {
                data = fillContratoDefaults(parsed as Partial<ContratoSocialData>);
                const cd = data as ContratoSocialData;
                const n = cd.socios?.length ?? 0;
                console.log(`[extract][contrato] socios=${n} capitalSocial="${cd.capitalSocial || "vazio"}" objetoSocial=${cd.objetoSocial ? `${cd.objetoSocial.length}c` : "vazio"} dataConst="${cd.dataConstituicao || "vazio"}" temAlteracoes=${cd.temAlteracoes}`);
                if (n === 0 && !cd.capitalSocial && !cd.objetoSocial) {
                  console.warn(`[extract][contrato] NENHUM CAMPO EXTRAIDO — verifique documento. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
                }
                break;
              }
              case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
              case "scr": {
                data = fillSCRDefaults(parsed as Partial<SCRData>);
                const scrData = data as SCRData;
                // Override de tipoPessoa baseado no slot do frontend — elimina a dependencia
                // do Gemini inferir PJ/PF corretamente.
                if (slot === "scr_socio" || slot === "scr_socio_anterior") {
                  if (scrData.tipoPessoa !== "PF") {
                    console.log(`[extract][scr] slot=${slot} forcando tipoPessoa=PF (Gemini retornou "${scrData.tipoPessoa || "vazio"}")`);
                  }
                  scrData.tipoPessoa = "PF";
                } else if (slot === "scr" || slot === "scrAnterior") {
                  if (scrData.tipoPessoa !== "PJ") {
                    console.log(`[extract][scr] slot=${slot} forcando tipoPessoa=PJ (Gemini retornou "${scrData.tipoPessoa || "vazio"}")`);
                  }
                  scrData.tipoPessoa = "PJ";
                }
                // Persiste o slot original do upload como hint determinístico para
                // a hidratação decidir atual/anterior quando periodoReferencia falhar.
                if (slot) {
                  (scrData as SCRData & { _slotHint?: string })._slotHint = slot;
                }
                console.log(`[extract][scr] slot=${slot || "nenhum"} periodoRef="${scrData.periodoReferencia || "VAZIO"}" tipoPessoa="${scrData.tipoPessoa || "VAZIO"}" cnpjSCR="${scrData.cnpjSCR || ""}" cpfSCR="${scrData.cpfSCR || ""}" totalDividas="${scrData.totalDividasAtivas || "0"}"`);
                if (!scrData.periodoReferencia) {
                  console.warn(`[extract][scr] SEM periodoReferencia — ordenacao atual/anterior vai falhar`);
                }
                const periodoAnterior = (parsed as Record<string, unknown>).periodoAnterior as Partial<SCRData> | undefined;
                if (periodoAnterior && periodoAnterior.periodoReferencia) {
                  (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior = fillSCRDefaults(periodoAnterior);
                  (data as SCRData & { _variacoes?: Record<string, string> })._variacoes =
                    ((parsed as Record<string, unknown>).variacoes as Record<string, string>) || {};
                  console.log(`[extract][scr] Periodo anterior detectado no mesmo doc: ${periodoAnterior.periodoReferencia}`);
                }
                break;
              }
              case "protestos":        data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
              case "processos":        data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
              case "grupoEconomico":   data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
              case "curva_abc":        data = fillCurvaABCDefaults(parsed as Partial<CurvaABCData>); break;
              case "dre":              data = fillDREDefaults(parsed as Partial<DREData>); break;
              case "balanco":          data = fillBalancoDefaults(parsed as Partial<BalancoData>); break;
              case "ir_socio":         data = fillIRSocioDefaults(parsed as Partial<IRSocioData>); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults(parsed as Partial<RelatorioVisitaData>); break;
              default:                 data = fillCNPJDefaults(parsed as Partial<CNPJData>);
            }
          } catch (aiError) {
            const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
            console.error(`[extract] AI failed:`, errMsg);
            console.error(`[extract] Context: inputMode=${inputMode} | docType=${_docType}`);
            console.error(`[extract] Input preview:`, inputMode === "text"
              ? _textContent.substring(0, 200)
              : `[binary ${_imageContent?.mimeType}, base64 len: ${_imageContent?.base64.length}]`
            );

            switch (_docType) {
              case "cnpj":           data = fillCNPJDefaults({}); break;
              case "qsa":            data = fillQSADefaults({}); break;
              case "contrato":       data = fillContratoDefaults({}); break;
              case "faturamento":    data = fillFaturamentoDefaults({}); break;
              case "scr":            data = fillSCRDefaults({}); break;
              case "protestos":      data = fillProtestosDefaults({}); break;
              case "processos":      data = fillProcessosDefaults({}); break;
              case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
              case "curva_abc":      data = fillCurvaABCDefaults({}); break;
              case "dre":            data = fillDREDefaults({}); break;
              case "balanco":        data = fillBalancoDefaults({}); break;
              case "ir_socio":       data = fillIRSocioDefaults({}); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults({}); break;
              default:               data = fillCNPJDefaults({});
            }

            let errorType: "quota" | "parse" | "empty" | "unknown" = "unknown";
            if (errMsg.includes("429") || errMsg.includes("EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("rate")) {
              errorType = "quota";
            } else if (errMsg.includes("TIMEOUT") || errMsg.includes("timed out") || errMsg.includes("AbortError")) {
              errorType = "quota"; // timeout → "API indisponível" é mais útil que "formato inválido"
            } else if (errMsg.includes("JSON") || errMsg.includes("parse") || errMsg.includes("SyntaxError")) {
              errorType = "parse";
            } else if (errMsg.includes("empty") || errMsg.includes("length: 0") || errMsg.includes("Empty")) {
              errorType = "empty";
            }

            // success: false quando IA falhou — o frontend trata como erro visivel
            // em vez de fingir sucesso com dados vazios
            _send(controller, "result", {
              success: false, data,
              error: errMsg.substring(0, 200),
              meta: { rawTextLength: _textContent.length, filledFields: 0, isScanned: _isImage, aiError: true, errorType, errorMessage: errMsg.substring(0, 200) },
            });
            return;
          }

          const filled = countFilledFields(data);
          const scrAnteriorExtra = (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
          const variacoesExtra = (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          if (scrAnteriorExtra) {
            delete (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
            delete (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          }
          // QSA detectado automaticamente no Cartão CNPJ
          const qsaDetectadoExtra = (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado;
          if (qsaDetectadoExtra) {
            delete (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado;
          }

          // Injeta warnings de validação dentro do próprio data com prefixo
          // "_warnings" (meta-field, strippado na hidratação). Permite que o
          // histórico/UI exibam badges por documento sem mexer no fluxo de estado.
          const dataWithMeta = zodWarnings.length > 0
            ? { ...(data as unknown as Record<string, unknown>), _warnings: zodWarnings }
            : data;

          _send(controller, "result", {
            success: true, data: dataWithMeta,
            ...(scrAnteriorExtra ? { scrAnterior: scrAnteriorExtra, variacoes: variacoesExtra } : {}),
            ...(qsaDetectadoExtra ? { qsaDetectado: qsaDetectadoExtra } : {}),
            meta: { rawTextLength: _textContent.length, filledFields: filled, isScanned: _isImage, aiPowered: true, warningsCount: zodWarnings.length },
          });

          // Grava no cache de extracao — fire-and-forget, nunca bloqueia a resposta.
          // So cacheia quando a extracao veio util (filled > 0).
          if (cachedUserId && filled > 0) {
            (async () => {
              try {
                const supaCacheWrite = createServerSupabase();
                await supaCacheWrite.from("extraction_cache").upsert({
                  user_id: cachedUserId,
                  file_hash: fileHash,
                  doc_type: cacheDocType,
                  extracted_data: data as unknown as Record<string, unknown>,
                  filled_fields: filled,
                }, { onConflict: "user_id,file_hash,doc_type" });
                console.log(`[extract][cache] gravado ${_cacheDocType} hash=${fileHash.substring(0, 12)} filled=${filled}`);
              } catch (e) {
                console.warn(`[extract][cache] falha ao gravar (ignorado):`, e instanceof Error ? e.message : e);
              }
            })();
          }

          // Metricas de extracao — fire-and-forget. Captura cada extracao para
          // futuro diagnostico de quais campos falham mais por doc type.
          if (cachedUserId) {
            const duracaoMs = Date.now() - startTimeMs;
            (async () => {
              try {
                const supaMetrics = createServerSupabase();
                await supaMetrics.from("extraction_metrics").insert({
                  user_id: cachedUserId,
                  doc_type: _docType,
                  filled_fields: filled,
                  input_mode: inputMode,
                  text_length: _textContent.length,
                  duration_ms: duracaoMs,
                  ai_powered: true,
                  cached: false,
                  zod_warnings: zodWarnings.length > 0 ? zodWarnings : null,
                  input_chars: _textContent.length || null,
                  raw_response: (filled === 0 || _docType === "relatorio_visita") ? _rawAiResponse.slice(0, 5000) || null : null,
                });
              } catch { /* nunca falha a requisicao */ }
            })();
          }
        } catch (err) {
          console.error("[extract] Stream error:", err instanceof Error ? err.message : err);
          _send(controller, "result", { success: false, error: "Erro interno ao processar o documento." });
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
