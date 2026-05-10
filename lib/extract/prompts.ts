/**
 * Prompts Gemini para extração de documentos de crédito.
 *
 * Cada `PROMPT_*` é uma string literal que orienta o modelo Gemini a extrair
 * dados estruturados de um tipo específico de documento. Os prompts incluem:
 *  - schema JSON esperado
 *  - regras de formatação (datas, máscaras, valores)
 *  - rules específicas do domínio (BACEN, Simples Nacional, DIRPF, etc.)
 *
 * Importado por `app/api/extract/route.ts` no switch que escolhe o prompt
 * conforme `docType` e `subformat`. PROMPT_SCR usa placeholder {{TIPO_ESPERADO}}
 * substituído via String.replace antes de chamar o Gemini.
 */

// ─────────────────────────────────────────

export const PROMPT_CNPJ = `Você receberá um PDF de Comprovante de Inscrição e Situação Cadastral (Cartão CNPJ) emitido pela Receita Federal do Brasil. Extraia todos os campos presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

export const PROMPT_QSA = `Você receberá um PDF de Consulta ao Quadro de Sócios e Administradores (QSA) emitido pela Receita Federal do Brasil. Extraia todos os campos presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

export const PROMPT_CONTRATO = `Você receberá um PDF de Contrato Social, Alteração Contratual ou Consolidação registrado em Junta Comercial. O documento pode conter múltiplas seções: certidão de inteiro teor, requerimento capa, texto do contrato/alteração, protocolo de assinaturas e termo de autenticação. Extraia os dados abaixo e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

export const PROMPT_FATURAMENTO = `Você receberá um documento de faturamento de uma empresa brasileira. Pode ser qualquer formato: relatório contábil assinado, DAS/PGDAS do Simples Nacional, extrato de sistema contábil (Omie, Totvs, Sankhya, Sieg, NFe.io, SPED, Domínio, Alterdata, etc.), planilha interna, resumo de Notas Fiscais, declaração de faturamento, ou qualquer documento que contenha receita mensal. Extraia todos os dados e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

export const PROMPT_SCR = `CONTEXTO DO DOCUMENTO:
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
export const PROMPT_SCR_SEM_DADOS = `Este documento SCR do Banco Central do Brasil indica que o cliente não possui operações registradas no SCR para o período consultado. Extraia apenas os dados de identificação presentes e retorne SOMENTE um JSON válido.

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
export const PROMPT_SCR_BUREAU = `Você receberá um relatório de bureau de crédito (Credit Hub, Quod, Boa Vista SCPC, Serasa Experian ou similar). Este documento tem formato diferente do SCR BACEN — não possui faixas de vencimento, mas contém resumo de negativações e pendências. Extraia os dados disponíveis e retorne SOMENTE um JSON válido.

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
export const PROMPT_FAT_DAS = `Você receberá um documento DAS/PGDAS do Simples Nacional emitido pela Receita Federal. Extraia todos os dados e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown.

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
export const PROMPT_FAT_BANCARIO = `Você receberá um extrato bancário de conta corrente ou conta PJ. Extraia o faturamento mensal (entradas/créditos) e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown.

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
export const PROMPT_IR_RECIBO = `Você receberá um Recibo de Entrega da DIRPF — apenas o comprovante de que a declaração foi enviada à Receita Federal. Este documento NÃO contém dados financeiros completos. Extraia apenas os dados de identificação presentes e retorne SOMENTE um JSON válido.

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

export const PROMPT_PROTESTOS = `Você receberá uma certidão de protestos (SERASA, cartório, CRC, IEPTB ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

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

export const PROMPT_PROCESSOS = `Você receberá um relatório de processos judiciais (Credit Bureau, SERASA, Jusbrasil, Escavador, relatório de advogado ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

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

export const PROMPT_GRUPO_ECONOMICO = `Você receberá um relatório de grupo econômico (Credit Bureau, SERASA, Escavador, relatório próprio ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

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

export const PROMPT_CURVA_ABC = `Você receberá um PDF de Curva ABC ou relatório de faturamento por cliente, que pode conter gráficos, tabelas e mapas. Extraia todos os dados tabulares e numéricos presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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
      "cnpj": "",
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
- cnpj → CRÍTICO: extraia o CNPJ ou CPF do cliente quando aparecer no documento. Pode estar:
  • numa coluna separada ao lado do nome (formato "12.345.678/0001-99" ou "123.456.789-00")
  • imediatamente após o nome separado por hífen, traço ou barra (ex: "EMPRESA LTDA - 12.345.678/0001-99")
  • em linha abaixo do nome (alguns relatórios quebram em duas linhas)
  • em formato cru sem pontuação (14 dígitos seguidos = CNPJ; 11 dígitos = CPF)
  Se o documento não trouxer CNPJ/CPF do cliente, retornar "" (string vazia). NUNCA inventar nem deduzir CNPJ a partir do nome.
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

export const PROMPT_DRE = `Você receberá um PDF de Demonstração do Resultado do Exercício (DRE). O documento pode conter colunas para dois anos (ano atual e ano anterior). Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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
      "despesas_nao_operacionais": null,
      "receitas_nao_operacionais": null,
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

export const PROMPT_BALANCO = `Você receberá um PDF de Balanço Patrimonial. O documento pode conter colunas para dois anos. Extraia todos os dados e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

export const PROMPT_IR_SOCIOS = `Você receberá um PDF de Declaração de Ajuste Anual do Imposto de Renda Pessoa Física (DIRPF). Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

export const PROMPT_RELATORIO_VISITA = `Você receberá um PDF de Relatório de Visita elaborado por um analista/gerente de uma instituição financeira. Extraia todos os dados presentes e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem explicações.

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

// ─── Dívida Ativa ───
export const PROMPT_DIVIDA_ATIVA = `Você receberá uma certidão de débitos inscritos em Dívida Ativa (PGFN, Receita Federal, SEFAZ estadual, fazenda municipal). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"qtdRegistros":0,"valorTotal":"","registros":[{"origem":"","numeroInscricao":"","valor":"","situacao":"","dataInscricao":"","natureza":""}],"certidaoNegativa":false,"dataConsulta":""}

Regras:
- qtdRegistros: número total de inscrições de dívida ativa identificadas
- valorTotal: soma dos valores de TODAS as inscrições com prefixo "R$" (ex: "R$ 12.345,67")
- registros: liste TODAS as inscrições
  - origem: órgão credor — "PGFN", "Receita Federal", "SEFAZ-SP", "Município de São Paulo", etc.
  - numeroInscricao: número CDA (Certidão de Dívida Ativa) ou processo
  - valor: em reais com prefixo "R$"
  - situacao: "Ativa" | "Suspensa" | "Negociada" | "Quitada" | "Em parcelamento" | "Em recurso"
  - dataInscricao: DD/MM/AAAA
  - natureza: "Tributária" | "Não Tributária" | "Previdenciária" — vazio se não identificável
- certidaoNegativa: true SOMENTE se documento explicitamente diz "NADA CONSTA", "Negativa", "Sem débitos", "Não consta dívida ativa"
- dataConsulta: DD/MM/AAAA — data de emissão da certidão

Documentos negativos:
- "NADA CONSTA" / "Certidão Negativa" → qtdRegistros=0, valorTotal="R$ 0,00", registros=[], certidaoNegativa=true

NÃO invente dados. Campos ausentes = "".`;

// ─── CENPROT ───
export const PROMPT_CENPROT = `Você receberá uma certidão emitida pela Central Nacional de Protestos (CENPROT / IEPTB-BR). Esta é a certidão OFICIAL — pode contradizer informações de bureaus. Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"qtdRegistros":0,"valorTotal":"","registros":[{"cartorio":"","cidade":"","uf":"","data":"","valor":"","devedor":"","cedente":"","protocolo":""}],"certidaoNegativa":false,"dataConsulta":""}

Regras:
- qtdRegistros: número total de protestos identificados
- valorTotal: soma dos valores com prefixo "R$"
- registros: liste TODOS os protestos individualmente
  - cartorio: nome ou número do cartório (ex: "1º Tabelionato de Protesto")
  - cidade: município
  - uf: estado em duas letras (ex: "SP")
  - data: DD/MM/AAAA
  - valor: com "R$"
  - devedor: nome/razão social do devedor (a empresa analisada normalmente)
  - cedente: apresentante/credor
  - protocolo: número do protocolo no cartório se houver
- certidaoNegativa: true se "NADA CONSTA" / "Sem registros" / similar
- dataConsulta: DD/MM/AAAA — data de emissão

NÃO invente dados.`;

// ─── GEFIP / SEFIP / eSocial ───
export const PROMPT_GEFIP = `Você receberá um relatório de recolhimentos previdenciários e trabalhistas — GEFIP, SEFIP, eSocial, FGTS Digital, ou similar. Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"competenciaInicio":"","competenciaFim":"","totalFuncionarios":0,"valorFgtsTotal":"","valorInssTotal":"","competenciasEmAtraso":0,"competencias":[{"mes":"","funcionarios":0,"valorFgts":"","valorInss":"","situacao":""}]}

Regras:
- competenciaInicio: MM/YYYY — competência mais antiga listada (ex: "03/2025")
- competenciaFim: MM/YYYY — competência mais recente
- totalFuncionarios: número de funcionários da última competência
- valorFgtsTotal: soma de TODAS as competências FGTS, com "R$"
- valorInssTotal: soma de TODAS as competências INSS, com "R$"
- competenciasEmAtraso: quantas competências têm situação diferente de "Recolhido" / "Quitado"
- competencias: liste TODAS as competências
  - mes: MM/YYYY
  - funcionarios: número da competência
  - valorFgts: com "R$"
  - valorInss: com "R$"
  - situacao: "Recolhido" | "Em atraso" | "Não recolhido" | "Parcelado" | "Em discussão"

Sinais de atraso: "Em atraso", "Não recolhido", "Inadimplência", datas posteriores ao vencimento (dia 7 do mês seguinte)

NÃO invente dados. Campos ausentes = "" ou 0.`;
