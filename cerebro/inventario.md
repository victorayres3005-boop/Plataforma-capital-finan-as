---
tags: [capital-financas, inventario, endpoints, libs]
---

# Inventário completo da plataforma

Lista exaustiva de todos os endpoints, páginas, componentes, libs, crons e envvars. Atualizar quando criar ou remover algo.

## Endpoints API (`app/api/`)

### Fluxo principal (autenticados)

| Rota | Método | Função |
|---|---|---|
| `/api/extract` | POST | Pipeline pdf-parse → Gemini → adapter → fillDefaults. `maxDuration: 60s` |
| `/api/analyze` | POST | Política V2 + score + parecer Gemini. Carrega política do Supabase |
| `/api/bureaus` | POST | Consolida BDC + Assertiva + DataBox360 + CredHub. Promise.allSettled |
| `/api/bureaus/debug-cpf` | POST | CredHub para CPF arbitrário. **Auth obrigatória (hardening 2026-04-30)** |
| `/api/empresa/[cnpj]` | GET | Consulta empresa por CNPJ |
| `/api/operacoes` | GET/POST | CRUD operações de crédito |
| `/api/upload-blob` | POST | Vercel Blob para arquivos > 4MB. Pendente `maximumSizeInBytes` |
| `/api/share-report` | POST | Gera HTML pré-renderizado em `shared_reports`. `MAX_HTML_BYTES = 5MB` |
| `/api/custos` | GET | Lista logs de custos (`api_usage_logs`) |
| `/api/metricas` | GET | Métricas agregadas. **Auth obrigatória** |

### PDF/HTML

| Rota | Método | Função |
|---|---|---|
| `/api/generate-pdf` | POST | Puppeteer + chromium-min. `maxDuration: 60s`, `memory: 1024` |
| `/api/exportar-pdf` | POST | Legado. Requer `CHROMIUM_URL` |
| `/api/exportar-pdf-html` | POST | HTML standalone pra uso externo |

### Goalfy

| Rota | Método | Função |
|---|---|---|
| `/api/goalfy` | GET | Lista boards |
| `/api/goalfy/sync` | POST | Sincroniza cards para `goalfy_pending_operations` |
| `/api/goalfy/listar` | GET | Lista pending operations |
| `/api/goalfy/importar` | POST | Importa card → cria coleta |
| `/api/goalfy/receber` | POST | Webhook recebe payload externo. `GOALFY_WEBHOOK_SECRET` opcional |
| `/api/goalfy/webhook` | POST | Recebe payload do n8n com URLs S3 presigned |

### Crons

| Rota | Schedule | Função |
|---|---|---|
| `/api/cron/goalfy-sync` | `0 8 * * *` (8h diário) | Sincroniza Goalfy. Fail-closed sem `CRON_SECRET` |
| `/api/cron/reanalise` | `0 7 * * *` (7h diário) | Re-roda analyze em coletas. Fail-closed sem `CRON_SECRET` |

### Diagnóstico / Admin

| Rota | Método | Função |
|---|---|---|
| `/api/debug-extraction` | GET | **Auth obrigatória.** Vê `extracted_data` por collectionId |
| `/api/debug-bureaus` | POST | **Auth obrigatória.** Dispara bureaus reais ($) |
| `/api/diag-credithub` | GET | Diagnóstico CredHub |
| `/api/ch-diag` | GET | **Auth obrigatória.** Chave hardcoded removida em 2026-04-30 |
| `/api/admin/extraction-metrics` | GET | Métricas de extração (admin) |
| `/api/admin/rating-drift` | GET | Drift do rating IA (admin) |

### Fine-tuning / Embedding

| Rota | Método | Função |
|---|---|---|
| `/api/embed-feedback` | POST | Embedding via `gemini-embedding-001` (768 dims) |
| `/api/start-finetuning` | POST | Inicia fine-tuning Gemini com `prompt_versions` |
| `/api/export-finetuning` | GET | Export dataset pra fine-tuning |
| `/api/finetuning-status` | GET | Status do job. ⚠️ SSRF-shape pendente |

### Outros

| Rota | Método | Função |
|---|---|---|
| `/api/map-image` | GET | Imagem de mapa Google (`GOOGLE_MAPS_KEY`) |

## Páginas (`app/`)

| Rota | Página |
|---|---|
| `/` | Home + Visão Geral + Nova Coleta (UploadStep → ReviewStep → ScoreForm → GenerateStep) |
| `/login` | Login |
| `/perfil` | Perfil do usuário |
| `/configuracoes` | Operacional (toggle conformidade) + Política V2 |
| `/historico` | Lista de coletas. Busca + paginação 2026-05-04 |
| `/pareceres` | Lista de pareceres. CSV export BOM UTF-8 |
| `/parecer` | Parecer da coleta atual |
| `/parecer/[id]` | Redirect amigável |
| `/operacoes` | CRUD de operações |
| `/empresa/[cnpj]` | Visualização de empresa por CNPJ |
| `/custos` | BureauPrices × BureauCalls × Gemini |
| `/metricas` | Métricas agregadas |
| `/ajuda` | FAQ / ajuda |
| `/importar-goalfy` | Lista pending operations Goalfy |
| `/r/[id]` | Relatório compartilhado (Route Handler, sem React) |
| `/admin/extraction` | Admin: métricas de extração |
| `/admin/rating-drift` | Admin: drift de rating |
| `/v2` | Em desenvolvimento (DevBanner) |
| `/v2/metricas` | v2 métricas (WIP) |
| `/v2/pareceres` | v2 pareceres (WIP) |

## Componentes (`components/`)

| Componente | Função |
|---|---|
| `UploadStep.tsx` | Upload de 16 tipos de doc. Pre-fill Goalfy via `?highlight` |
| `ReviewStep.tsx` | 8 seções de revisão (CNPJ, QSA, Faturamento, Financeiro, SCR, IR, Visita, Protestos, Processos, GE) |
| `GenerateStep.tsx` | **Monolito 2810 linhas.** PDF/HTML/share. Busca Score V2. Barras inline |
| `UploadArea.tsx` | Drag-drop genérico |
| `ProgressBar.tsx` | Barra de progresso |
| `AlertList.tsx` | Lista de alertas categorizados (alta/moderada/info) |
| `Logo.tsx` | Sempre navega Visão Geral |
| `DevBanner.tsx` | Banner "em desenvolvimento" para `/admin` e `/v2` |
| `ThemeToggle.tsx` | Dark mode lite |
| `WelcomeModal.tsx` | Modal de boas-vindas. Atualização otimista obrigatória |
| `CommandPalette.tsx` | Ctrl+K (2026-05-04) |
| `PageTransition.tsx` | Fade puro 200ms (2026-05-04) |
| `OnboardingTooltip.tsx` | **Órfão** — existe mas não é usado |
| `FirstCollectionChecklist.tsx` | Checklist de primeira coleta |
| `GoalfyButton.tsx` | Botão de importar do Goalfy |

### Subpastas componentes
- `components/ui/` — shadcn (dialog, tooltip, tabs, select, dropdown-menu, table, skeleton, breadcrumb, confirm-dialog)
- `components/review/` — `SectionCNPJ`, `SectionQSA`, `SectionFaturamento`, `SectionFinanceiro`, `SectionSCR`, `SectionIR`, `SectionRelatorioVisita`, `SectionProtestos`, `SectionProcessos`, `SectionGrupoEconomico`
- `components/score/` — `ScoreForm`, `ScoreSection`
- `components/politica/` — `OperacionalTab`, `PoliticaCreditoTab`

## Libs (`lib/`)

### Bureaus (`lib/bureaus/`)
| Arquivo | Função |
|---|---|
| `bigdatacorp.ts` | BDC empresa + sócios. `OWNERSHIP_KEYWORDS` |
| `assertiva.ts` | OAuth2 + score PJ/PF + protestos + consultas |
| `databox360.ts` | SCR Bacen empresa/sócios/grupo. Lock + circuit breaker |
| `credithub.ts` | Score serasa + protestos/processos empresa. Cache 24h |
| `datajud.ts` | API pública CNJ. Chave gratuita hardcoded |
| `brasilapi.ts` | Cartão CNPJ pública |
| `transparencia.ts` | Portal transparência. **Mock** (chave não cadastrada) |
| `serasa.ts` / `spc.ts` / `quod.ts` | **Mock intencional** — sem contrato |
| `merger.ts` | Consolida resultados de todos os bureaus em ExtractedData |
| `cache.ts` | Helpers `cacheGet`/`cacheSet` para `bureau_cache` |

### Geradores (`lib/generators/`)
| Arquivo | Função |
|---|---|
| `pdf.ts` | `generateHTMLPreview()` + `buildPDFReport()` |
| `pdf/index.ts` | Entry jsPDF |
| `pdf/sections/*.ts` | Seções jsPDF (capa, indice, sintese, parecer, faturamento, scr, abc, socios, conformidade, visita, risco, bdc-insights) |
| `pdf/helpers.ts` + `helpers.ts` | Helpers compartilhados |
| `pdf/design-system.ts` | Cores, fontes, tamanhos |
| `pdf/context.ts` | `pdf-ctx` parametrizado |
| `report-template.ts` | Re-export de `gerarHtmlRelatorio` |
| `report-shared.ts` | Helpers compartilhados HTML/PDF |
| `html.ts` | Geração HTML standalone |
| `docx.ts` / `excel.ts` | Exports alternativos |

### Política (`lib/politica-credito/`)
| Arquivo | Função |
|---|---|
| `defaults.ts` | `DEFAULT_POLITICA_V2` (5 pilares + parâmetros) |
| `calculator.ts` | Calcula score a partir de respostas |
| `validators.ts` | `validarContraParametros()` |
| `auto-score.ts` | `autoPreencherScore()` server-side |

### Hooks
| Arquivo | Função |
|---|---|
| `useAuth.ts` | Hook de autenticação |
| `useOnboarding.ts` | `welcome_seen`, `tooltips_seen`, `first_collection_done` |
| `useTooltips.ts` | Estado de tooltips |
| `useTheme.ts` | Dark/light |
| `useAnimatedCounter.ts` | Contadores animados |

### Outros
| Arquivo | Função |
|---|---|
| `pdf/template.ts` | **Único arquivo do template HTML do relatório** |
| `extract/sanitize.ts` | Sanitização de strings extraídas |
| `extract/schemas.ts` | Schemas Zod por tipo de doc |
| `goalfy/sync.ts` | Sincronização cards → pending operations |
| `goalfy/mapper.ts` | Mapeamento Goalfy → docTypes |
| `supabase/client.ts` | Cliente Supabase (browser) |
| `supabase/server.ts` | `createServerSupabase()` |
| `embeddings.ts` | `gemini-embedding-001` 768 dims |
| `formatters.ts` | `fmtBRL`, `fmtUSD`, formatadores compartilhados |
| `scrTotal.ts` | `calcScrTotal(scr)` único (carteira+vencidos+prejuízos) |
| `mergeQsaWithContrato.ts` | Match fuzzy QSA ← Contrato |
| `crossValidate.ts` | Validação cruzada de dados |
| `validateReport.ts` | Validação do relatório antes de gerar |
| `hydrateFromCollection.ts` | Reconstrói ExtractedData do banco |
| `buildCollectionDocs.ts` | Serializa ExtractedData pra banco |
| `storage.ts` | Helper Supabase Storage |
| `assets/capital-logo-b64.ts` | LOGO_B64 |
| `utils.ts` | Utilitários genéricos |

## Tabelas Supabase

Detalhe em banco-dados. Listagem aqui:

`document_collections`, `score_operacoes`, `pareceres`, `shared_reports`, `politica_credito_config`, `fund_settings`, `operacoes`, `bureau_cache`, `api_usage_logs`, `extraction_metrics`, `extraction_corrections`, `goalfy_pending_operations`, `user_onboarding`, `notifications`, `prompt_versions`, `company_snapshots`, `audit_log`.

**Pendente:** `analysis_cache` (cache analyze hoje in-memory).

## Crons configurados (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/goalfy-sync", "schedule": "0 8 * * *" },
    { "path": "/api/cron/reanalise",   "schedule": "0 7 * * *" }
  ]
}
```

## Variáveis de ambiente

### Obrigatórias
| Var | Onde |
|---|---|
| `GEMINI_API_KEYS` | 3 chaves vírgula-separadas. Rotação automática |
| `BDC_TOKEN` + `BDC_TOKEN_ID` | BigDataCorp. **TTL 7 dias.** |
| `ASSERTIVA_CLIENT_ID` + `ASSERTIVA_CLIENT_SECRET` | OAuth2 Assertiva. `.trim()` obrigatório |
| `DATABOX360_API_KEY` + `DATABOX360_BASE_URL` | DataBox360. Sandbox até 2026-04-29 |
| `CREDITHUB_API_KEY` | CredHub |
| `GOALFY_API_KEY` | Goalfy. Auth: `Token {JWT}` (NÃO Bearer) |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server (CUIDADO em cron/admin) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (auto-criada quando store conectado) |

### Operacionais
| Var | Função |
|---|---|
| `CRON_SECRET` | Auth crons. Fail-closed sem ele |
| `CHROMIUM_URL` | Para `/api/exportar-pdf` legado |
| `GOOGLE_MAPS_KEY` | `/api/map-image` |

### Opcionais / pendentes
| Var | Status |
|---|---|
| `GOALFY_WEBHOOK_SECRET` | ⚠️ Não setado. Webhook fica aberto com warn. Pra fechar: gerar + setar + atualizar URL Goalfy `?secret=<valor>` |
| `TRANSPARENCIA_API_KEY` | ⚠️ Não cadastrado. Cadastro gratuito em portaldatransparencia.gov.br |
| `OPENROUTER_API_KEYS` | **NÃO desejada.** Victor não quer fallback (ADR-001) |
| `GROQ_API_KEY` | **NÃO desejada.** Idem |

## Configuração Vercel

```json
// vercel.json (parcial)
{
  "framework": "nextjs",  // mas painel mostra "Vite" — corrigir manualmente
  "functions": {
    "app/api/extract/route.ts":      { "maxDuration": 60 },
    "app/api/generate-pdf/route.ts": { "memory": 1024, "maxDuration": 60 },
    "app/api/exportar-pdf/route.ts": { "memory": 1024, "maxDuration": 60 }
  }
}
```

**Plan:** Hobby (`maxDuration` máximo 60s). Pesa em decisões de timeout.

## Skills do Claude Code disponíveis

- `capital-pdf-report` — guia para editar o relatório (`lib/pdf/template.ts` + helpers)
- `capital-rating-analysis` — guia para mudar rating, prompt, score, parâmetros operacionais

## CLAUDE.md no projeto

Existe `capital-financas/CLAUDE.md` com:
- Checklist obrigatória pré-edição (TS, fluxo extração, auth, modo texto/visual, PDF/HTML, regressões)
- Vocabulário do Victor ("não está transmitindo" = dado não chega na revisão; "está quebrando" = erro ou tela branca; "cirurgia" = mudança pontual)
- Padrão de perguntas pra bugs/features/melhorias
- Quando agir direto vs perguntar

**Ler antes de qualquer edição de código.** Esta nota apenas referencia.
