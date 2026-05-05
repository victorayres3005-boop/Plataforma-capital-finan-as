# Arquitetura — Capital Finanças

Plataforma web para análise de crédito (FIDC, due diligence, KYC) que consolida documentos financeiros + APIs de bureaus em um relatório PDF/HTML para o comitê.

## Stack

- **Front/back:** Next.js 14 (App Router) + React 18 + TypeScript
- **Banco/Auth:** Supabase (Postgres + Auth + Storage)
- **IA:** Google Gemini (multimodal e texto) — `gemini-2.5-flash` / `pro` / `flash-lite`
- **PDF:** Puppeteer + `@sparticuz/chromium-min` (Vercel) ou Puppeteer full (local)
- **UI:** Tailwind + shadcn/ui
- **Deploy:** Vercel (Hobby plan, `maxDuration = 60s`)
- **Porta dev:** 3017

## Diretório principal: `capital-financas/`

```
app/
  api/
    extract/route.ts          # extração documento → JSON via Gemini
    analyze/route.ts          # política V2 + score + parecer Gemini
    generate-pdf/route.ts     # Puppeteer → template.ts
    bureaus/                  # BDC, Assertiva, DataBox360, CredHub
    cron/                     # reanalise, goalfy-sync (fail-closed via CRON_SECRET)
    upload-blob/route.ts      # arquivos > 4MB (Vercel Blob)
    share-report/route.ts     # link compartilhado /r/[id]
  collection/                 # fluxo principal do analista (upload → review → generate)
  r/[id]/route.ts             # serve HTML pré-renderizado do banco

lib/
  pdf/template.ts             # ÚNICO arquivo do relatório (HTML completo)
  generators/pdf/sections/    # jsPDF (legado, fallback local)
  bureaus/                    # databox360.ts, bdc.ts, assertiva.ts, credithub.ts, goalfy/
  politica-credito/           # defaults V2, validação elegibilidade, score
  embeddings.ts               # gemini-embedding-001 (768 dims)

types/index.ts                # ExtractedData, QSASocio, ScoreResult, RespostaCriterio
```

## Fluxo principal (analista)

```
1. Upload    → /collection (UploadStep)
                ├─ FormData direto: arquivos < 4MB
                └─ /api/upload-blob (Vercel Blob): > 4MB
                  pre-fill via Goalfy (n8n cron) opcional
2. Extract   → /api/extract por documento
                ├─ pdf-parse extrai texto (modo padrão)
                └─ Gemini multimodal só para VISUAL_ONLY_TYPES = ["contrato", "relatorio_visita"]
3. Review    → ReviewStep — analista valida JSON extraído por seção
4. Bureaus   → /api/bureaus consolida BDC + Assertiva + DataBox360 + CredHub
5. Score V2  → ScoreForm: 5 pilares com critérios (analista preenche)
6. Analyze   → /api/analyze: política do Supabase + score + Gemini parecer
7. Generate  → /api/generate-pdf (Puppeteer) ou Visualizar (HTML inline)
                share-report → grava HTML em shared_reports e dá link /r/<id>
```

## Modelo de dados — entidades principais

- `collections` — uma análise; tem `extracted_data` (JSON consolidado por tipo de documento)
- `score_operacoes` — score V2 do analista (`score_result` + `respostas[]` por critério)
- `politica_credito_config` — política viva (5 pilares + parâmetros) por usuário
- `shared_reports` — HTML pré-renderizado do relatório (servido em `/r/[id]`)
- `bureau_cache` — cache 24h de respostas SCR/CredHub (chave `<bureau>:<doc>:<periodo>`)
- `goalfy_pending_operations` — fila de cards do CRM Goalfy via cron n8n
- `fund_settings` — fallback de última instância para parâmetros de elegibilidade

## Direção estratégica

**APIs como fonte primária.** Reduzir uploads de documentos sempre que possível. Bureau busca antes; upload só quando o dado não existe na API (ex: IR pessoal). Exemplo: SCR via DataBox360 substituiu upload manual do relatório do Bacen.

→ Detalhe: [bureaus.md](bureaus.md), [decisoes.md](decisoes.md)

## Configuração de timeout (Hobby plan)

```
maxDuration                  = 60s      (Vercel Hobby cap)
AI_TIMEOUT_52s               = 52000ms  (extract outer)
perAttempt binário           = 40000ms
perAttempt texto grande      = 20000ms
perAttempt texto pequeno     = 15000ms
Files API timeout            = 10000ms  (com AbortController + rotação de chaves)
analyze timeout              = 40000ms
SCR DataBox360 timeout       = 30000ms
```

## Edge cases conhecidos da arquitetura

- **PDFs escaneados** (sem texto OCR): `hasUsefulText = false` → cai pro modo visual automaticamente
- **Curva ABC com 400+ clientes**: parser regex direto bypassa Gemini (>15k chars) → ver [runbooks.md](runbooks.md)
- **Sandbox DataBox360**: detecção via valores idênticos entre períodos → esconde colunas no PDF
- **Goalfy plano grátis**: API não retorna URLs públicas de arquivo → integração via n8n + webhook

## Comandos comuns

```bash
npx tsc --noEmit             # type-check antes de deploy
npx vercel --prod            # deploy (NÃO usa git push integrado)
npm run dev                  # local em 3017
vercel logs --follow         # logs em tempo real
vercel env pull              # baixar envvars (CUIDADO: sobrescreve .env.local)
```
