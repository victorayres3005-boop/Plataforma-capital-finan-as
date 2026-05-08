/**
 * Adapters de extração: convertem o JSON snake_case que o Gemini retorna
 * para o formato camelCase tipado consumido pelo restante do pipeline
 * (`processExtract` em `app/api/extract/route.ts`).
 *
 * Cada `adapt*New` corresponde a um tipo de documento (CNPJ, QSA, SCR,
 * etc.) e devolve `Partial<T>`. A normalização final (campos faltando)
 * fica em `fill*Defaults` no route.ts. Os helpers privados (`_fmtMoneyBR`,
 * `_s`, `_sumNums`, etc.) ficam internos ao módulo.
 */

import type {
  BalancoAno, BalancoData, CNPJData, ClienteCurvaABC, ContratoSocialData,
  CurvaABCData, DREAno, DREData, FaturamentoData, FaturamentoMensal,
  Filial, IRSocioData, QSAData, RelatorioVisitaData, SCRData,
  SCRModalidade, SociedadeIR, Socio, SocioRetirante,
} from "@/types";
import { isLinhaTotalCurvaABC } from "@/lib/sacados/extractTopSacados";

/**
 * Adapter: converte o JSON snake_case do novo prompt de Cartão CNPJ
 * para o formato camelCase esperado pelo resto do pipeline (CNPJData).
 * Também aceita camelCase de fallback para o caso do Gemini responder no formato antigo.
 */
export function adaptCNPJNew(raw: Record<string, unknown>): Partial<CNPJData> {
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

export function adaptFaturamentoNew(raw: Record<string, unknown>): Partial<FaturamentoData> {
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

export function adaptSCRNew(raw: Record<string, unknown>): Partial<SCRData> {
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
  // Longo prazo (BCB) = acima 360 dias + prazo indeterminado.
  const longoN = _sumNums([aVen.acima_de_360_dias, aVen.prazo_indeterminado]);

  // Para carteira_a_vencer: recalcula pelas faixas porque Gemini omite "De 14 a 30 dias" no total.
  // Para vencidos/prejuizos: prefere o total declarado no documento — mais confiável que a soma
  // de faixas, pois Gemini às vezes misplaces valores entre faixas mas acerta o total.
  const vencN = _sumNums([venc.de_15_a_30_dias, venc.de_31_a_60_dias, venc.de_61_a_90_dias, venc.de_91_a_180_dias, venc.de_181_a_360_dias, venc.acima_de_360_dias]);
  const prejN = _sumNums([prej.ate_12_meses, prej.acima_12_meses]);
  // _sumNums já trata BR ("5.000,00"), EN ("5000.00") e number — Number() puro retorna NaN em string BR.
  const vencDocTotal = venc.total != null ? _sumNums([venc.total]) : 0;
  const prejDocTotal = prej.total != null ? _sumNums([prej.total]) : 0;
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

export function adaptContratoNew(raw: Record<string, unknown>): Partial<ContratoSocialData> {
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

export function adaptCurvaABCNew(raw: Record<string, unknown>): Partial<CurvaABCData> {
  const r = raw ?? {};
  const clientesRawAll = Array.isArray(r.curva_abc_clientes) ? r.curva_abc_clientes as Array<Record<string, unknown>> : [];

  // Filtra linhas de totalizador / rodapé que Gemini às vezes captura como cliente.
  // Caso real prod 2026-05-08: "Totais listados ....: 451 16.906.347" virou
  // top1 da Curva ABC com R$ 67M, sem CNPJ — poluindo a tabela inteira.
  const clientesRaw = clientesRawAll.filter(c => !isLinhaTotalCurvaABC(_s(c.cliente)));
  const descartados = clientesRawAll.length - clientesRaw.length;
  if (descartados > 0) {
    console.log(`[curva_abc] ${descartados} linha(s) de totalizador descartada(s) na extração`);
  }

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
    // Cumulativa é a fonte da verdade — o prompt instrui Gemini a classificar
    // por percentual acumulado, mas nem sempre obedece. Logamos divergências.
    const classeCumulativa = acc <= 80 ? "A" : acc <= 95 ? "B" : "C";
    const classeRaw = _s(c.classificacao);
    if (classeRaw && classeRaw !== classeCumulativa) {
      console.warn(`[curva_abc] classe raw "${classeRaw}" diverge de cumulativa "${classeCumulativa}" em "${_s(c.cliente)}" (acc=${acc.toFixed(2)}%)`);
    }
    const classe = classeCumulativa;
    // CNPJ/CPF: prioridade vem do campo dedicado; fallback regex no nome.
    // Em prod 2026-05-08 confirmamos casos onde Gemini concatena no nome
    // ("EMPRESA LTDA - 12.345.678/0001-99") e onde o documento traz CNPJ
    // numa coluna separada — aceitar os dois caminhos.
    const cnpjFromField = _s(c.cnpj || c.cnpj_cpf || c.cpf_cnpj || c.documento || c.cnpjCpf);
    const cnpjMatch = (_s(c.cliente) + " " + cnpjFromField).match(
      /(\d{2}\.?\d{3}\.?\d{3}[\/.-]?\d{4}[-.]?\d{2}|\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/
    );
    const cnpjCpf = cnpjMatch ? cnpjMatch[1].replace(/\D/g, "") : "";
    return {
      posicao: idx + 1,
      nome: _s(c.cliente),
      cnpjCpf,
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

// Parser direto de Curva ABC para evitar timeout Gemini em arquivos grandes (400+ clientes).
// Extrai linhas de clientes via regex sem depender de IA.
export function directParseCurvaABC(text: string): {
  clientes: Array<{ cliente: string; valor: number; percentual: number; classificacao: string }>;
  periodoReferencia: string;
  totalFaturado: number;
} | null {
  const lines = text.split('\n');

  // Período de referência
  let periodoReferencia = '';
  const m1 = text.match(/per[íi]odo[^\n]{0,100}?(\d{2}\/\d{2}\/\d{4})[^\n]{0,60}?(\d{2}\/\d{2}\/\d{4})/i);
  if (m1) {
    periodoReferencia = `${m1[1]} a ${m1[2]}`;
  } else {
    const m2 = text.match(/de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (m2) periodoReferencia = `${m2[1]} a ${m2[2]}`;
  }

  // Total faturado: primeira linha que começa com TOTAL e contém valor monetário
  let totalFaturado = 0;
  for (const line of lines) {
    if (/^\s*TOTAL\b/i.test(line.trim())) {
      const m = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (m) { totalFaturado = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); break; }
    }
  }

  // Padrões de linhas a ignorar
  const SKIP = /^(TOTAL|CLIENTE|POSIÇÃO|POSICAO|NOME|SEQ|FATURA|RELAT|DATA|PER[IÍ]|EMITI|EMISS|={3,}|-{3,}|_{3,}|\*{3,})/i;
  // CNPJ ou CPF embutido na linha
  const DOC_ID = /\d{2}[.\-]\d{3}[.\-]\d{3}[\/\-]\d{4}[.\-]\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/;

  const clientes: Array<{ cliente: string; valor: number; percentual: number; classificacao: string }> = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length < 8) continue;
    if (SKIP.test(t)) continue;

    // Extrair todos os valores monetários da linha (formato BRL com sep de milhar)
    const brlMatches = Array.from(t.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g));
    if (brlMatches.length === 0) continue;

    const brlVals = brlMatches.map(m => ({
      str: m[1] as string,
      n: parseFloat((m[1] as string).replace(/\./g, '').replace(',', '.')),
      idx: m.index!,
    }));

    // Valor principal: o maior valor que tem separador de milhar (ponto) ou é > 100
    const sigVals = brlVals.filter(v => v.str.includes('.') || v.n > 100);
    if (sigVals.length === 0) continue;
    const mainVal = sigVals.reduce((mx, v) => v.n > mx.n ? v : mx, sigVals[0]);

    // Nome: tudo antes do valor principal (e antes do CNPJ/CPF se houver)
    const docIdMatch = t.match(DOC_ID);
    let nameEnd = mainVal.idx;
    if (docIdMatch && docIdMatch.index !== undefined && docIdMatch.index < nameEnd) {
      nameEnd = docIdMatch.index;
    }
    let nome = t.substring(0, nameEnd).trim();
    nome = nome.replace(/^\d{1,4}\s+/, '').trim(); // remove número de sequência
    nome = nome.replace(/[\s\-_.]+$/, '').trim();
    if (!nome || nome.length < 2) continue;
    if (/^\d+$/.test(nome)) continue;
    if (nome.length > 80) nome = nome.substring(0, 80);

    // Percentual: primeiro valor após o valor principal que seja ≤ 100
    const afterVals = brlVals.filter(v => v.idx > mainVal.idx && v.n <= 100 && v.n > 0);
    const pct = afterVals.length > 0 ? afterVals[0].n : 0;

    // Classificação A/B/C no final da linha
    const classMatch = t.match(/\b([ABC])\b\s*$/);
    const classificacao = classMatch ? classMatch[1] : '';

    clientes.push({ cliente: nome, valor: mainVal.n, percentual: pct, classificacao });
  }

  if (clientes.length < 5) return null;
  if (totalFaturado === 0) totalFaturado = clientes.reduce((s, c) => s + c.valor, 0);

  return { clientes, periodoReferencia, totalFaturado };
}

export function adaptDRENew(raw: Record<string, unknown>): Partial<DREData> {
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

export function adaptBalancoNew(raw: Record<string, unknown>): Partial<BalancoData> {
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

export function adaptIRNew(raw: Record<string, unknown>): Partial<IRSocioData> {
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

  const bensImoveisN          = sumByGrupo(["01"]);
  const bensVeiculosN         = sumByGrupo(["02"]);
  const participacoesN        = sumByGrupo(["03"]);
  const aplicacoesN           = sumByGrupo(["04", "05", "06", "07"]);
  const outrosBensN           = 0; // grupos 08+ raramente preenchidos; grupo 03 agora em participacoesSocietarias

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
    participacoesSocietarias: participacoesN > 0 ? _fmtMoneyBRNoPrefix(participacoesN) : undefined,
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

export function adaptVisitaNew(raw: Record<string, unknown>): Partial<RelatorioVisitaData> {
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

  // Modalidade — normaliza diacríticos para casar "Híbrida"/"Comissária" etc.
  const modRaw = _s(params.modalidade_operacao).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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

export function adaptQSANew(raw: Record<string, unknown>): Partial<QSAData> {
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
