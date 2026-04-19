// Prompt Gemini para extração de Relatório de Visita / Ficha de Referência Comercial.
export const PROMPT_RELATORIO_VISITA = `Você receberá um Relatório de Visita OU uma Ficha de Referência Comercial (texto livre, formulário estruturado, template, ata ou PDF). Extraia os dados e retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema:
{"dataVisita":"","responsavelVisita":"","localVisita":"","duracaoVisita":"","estruturaFisicaConfirmada":true,"funcionariosObservados":0,"estoqueVisivel":false,"estimativaEstoque":"","operacaoCompativelFaturamento":true,"maquinasEquipamentos":false,"descricaoEstrutura":"","pontosPositivos":[],"pontosAtencao":[],"recomendacaoVisitante":"aprovado","nivelConfiancaVisita":"alto","presencaSocios":false,"sociosPresentes":[],"documentosVerificados":[],"observacoesLivres":"","pleito":"","modalidade":"","taxaConvencional":"","taxaComissaria":"","limiteTotal":"","limiteConvencional":"","limiteComissaria":"","limitePorSacado":"","limitePrincipaisSacados":"","ticketMedio":"","valorCobrancaBoleto":"","prazoRecompraCedente":"","prazoEnvioCartorio":"","prazoMaximoOp":"","cobrancaTAC":"","tranche":"","trancheChecagem":"","prazoTranche":"","folhaPagamento":"","endividamentoBanco":"","endividamentoFactoring":"","vendasCheque":"","vendasDuplicata":"","vendasOutras":"","prazoMedioFaturamento":"","prazoMedioEntrega":"","referenciasFornecedores":"","referenciasComerciais":[]}

ATENÇÃO: o campo de referências comerciais DEVE ser chamado "referenciasFornecedores" (NÃO "referenciaComercial" ou "referencias"). Use exatamente esse nome.

Regras gerais:
- dataVisita: formato DD/MM/YYYY
- recomendacaoVisitante: "aprovado" | "condicional" | "reprovado"
- nivelConfiancaVisita: "alto" | "medio" | "baixo"
- Campos ausentes: "" para strings, false para booleans, 0 para números, [] para arrays
- NÃO invente dados — se não há informação explícita, deixe vazio
- pontosPositivos e pontosAtencao: listas de strings curtas (1 frase cada)
- sociosPresentes: lista de nomes dos sócios presentes na visita
- documentosVerificados: lista de docs confirmados fisicamente ("Contrato Social", "Alvará", "Notas fiscais", etc.)
- observacoesLivres: bloco de texto com observações gerais do visitante (máximo 500 caracteres)
- descricaoEstrutura: descrição física do local (área, organização, condições — máximo 300 caracteres)

═══ REGRA CRÍTICA ANTI-CONFUSAO DE SEPARADORES (valores operacionais: taxas, limites, pleito, ticket) ═══
ATENÇÃO: o separador brasileiro usa PONTO para milhar e VÍRGULA para decimal.
NUNCA confunda com formato americano (vírgula para milhar, ponto para decimal).

CORRETOS (formato brasileiro):
- R$ 3.506.158,22  (três milhões e meio)
- R$ 850.000,00    (oitocentos e cinquenta mil)
- R$ 42.300,50     (quarenta e dois mil trezentos)

ERRADOS (interpretação americana do brasileiro):
- 3,506,158.22 (NÃO USE — formato americano)
- 3506158.22   (NÃO USE — sem separador de milhar)

REGRA DE OURO: se você vê "3.506.158,22" em um documento brasileiro:
- São 3 milhões 506 mil 158 reais e 22 centavos
- NÃO é "3.506.158,22 milhões" (isso seria 3 trilhões)

Se um limite ou pleito extraído parecer 10x ou 100x maior que o razoável, REINTERPRETE o separador.

Pleito e modalidade:
- pleito: valor em R$ sugerido pelo cedente (ex: "150000,00"). Buscar por "pleito", "valor solicitado", "limite sugerido", "crédito pleiteado"

═══ MODALIDADE — ATENÇÃO CRÍTICA ═══
A modalidade descreve COMO o FIDC opera com o cedente:

- "convencional": FIDC assume o risco total. Cedente cede os recebíveis e NÃO faz cobrança.
  Palavras-chave: "cessão plena", "risco do FIDC", "sem recompra", "convencional"

- "comissaria": Cedente mantém o relacionamento, faz a cobrança. FIDC desconta os títulos.
  Palavras-chave: "comissária", "cobrança pelo cedente", "recompra obrigatória", "mandato"

- "hibrida": O cedente opera em AMBAS as modalidades (algumas operações convencional, outras comissária).
  Palavras-chave: "híbrida", "mista", "ambas", "os dois formatos"
  Sinal decisivo: se o documento tem TANTO taxaConvencional QUANTO taxaComissaria, é hibrida.

REGRAS DE DEDUÇÃO:
- Se documento menciona APENAS "convencional" OU só taxaConvencional → "convencional"
- Se documento menciona APENAS "comissária" OU só taxaComissaria → "comissaria"
- Se documento menciona AMBAS ou "híbrida" → "hibrida"
- Se não há menção clara → "" (vazio, NUNCA invente)

Parâmetros operacionais (buscar em tabelas, campos rotulados ou seção de "parâmetros/condições"):
- taxaConvencional: taxa % para modalidade convencional (ex: "2,5%")
- taxaComissaria: taxa % para modalidade comissária (ex: "1,8%")
- limiteTotal: limite total aprovado em R$ (ex: "500000,00")
- limiteConvencional / limiteComissaria: limites por modalidade
- limitePorSacado: limite máximo por sacado em R$ (geralmente 20 a 30% do limite total — "Limite por Sacado", "Limite Máximo por Sacado")
- limitePrincipaisSacados: limite concentrado para principais sacados em R$ (geralmente 30 a 40% — "Limite Principais Sacados", "Concentração Top Sacados")
- ticketMedio: valor médio por duplicata/título em R$
- valorCobrancaBoleto: valor cobrado por emissão/cobrança de boleto
- prazoRecompraCedente: prazo em dias para recompra pelo cedente
- prazoEnvioCartorio: dias até envio para cartório
- prazoMaximoOp: prazo máximo da operação em dias
- cobrancaTAC: valor ou "Sim"/"Não" para cobrança de TAC
- tranche: valor da tranche principal em R$ (operação principal)
- trancheChecagem: valor da tranche de checagem em R$ ("Tranche Checagem", "Checagem Lastro", "Tranche de Verificação") — é DIFERENTE da tranche principal
- prazoTranche: prazo da tranche em dias

Dados da empresa (coletados na visita):
- folhaPagamento: folha de pagamento mensal em R$
- endividamentoBanco: endividamento bancário total em R$ (use "—" se não há endividamento declarado)
- endividamentoFactoring: endividamento com factoring/FIDC em R$
- vendasCheque / vendasDuplicata / vendasOutras: % de vendas por forma de recebimento
- prazoMedioFaturamento: prazo médio em dias
- prazoMedioEntrega: prazo médio de entrega em dias
- referenciasFornecedores: lista resumida de referências (texto livre, separadas por vírgula — legado)
- referenciasComerciais: array de objetos com as referências comerciais estruturadas. Para cada referência extraia:
  { "empresa": "Nome da empresa", "cnpj": "XX.XXX.XXX/XXXX-XX", "contato": "Nome/Telefone/Email", "tipoRelacionamento": "Fornecedor|Cliente|Banco|Parceiro", "tempoRelacionamento": "X anos/meses", "avaliacaoPagamento": "boa|regular|ruim", "limiteConcelidado": "R$ XXX", "observacoes": "texto livre" }
  Se o documento FOR uma Ficha de Referência Comercial, extraia todas as empresas listadas como referência. Campos ausentes deixe "" ou omita.`;
