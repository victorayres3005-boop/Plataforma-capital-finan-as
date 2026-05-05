# Decisões arquiteturais (ADRs)

Decisões com peso de longo prazo. Cada uma com **contexto**, **escolha**, e **consequência** — para que mudanças futuras saibam o trade-off em vogor.

---

## ADR-001 — Gemini-only, sem OpenRouter/Groq

**Contexto:** Em outages do Gemini (503, timeout), seria tentador adicionar fallback para outro LLM (OpenRouter, Groq, etc.).

**Decisão:** **NÃO adicionar fallback de provider.** Esperar Gemini voltar.

**Razão:** Victor não quer — alinhamento de qualidade/precisão é difícil entre providers, e pareceres divergentes confundem analistas. A política de crédito está calibrada contra comportamento Gemini.

**Consequência:** durante outages, extração e análise ficam indisponíveis. Mitigação: parser regex direto para curva_abc (bypass Gemini) em arquivos grandes. Para outros tipos, sem alternativa.

---

## ADR-002 — Pipeline de extração: multimodal direto (sem texto puro)

**Contexto:** Pipeline original extraía texto puro (pdf-parse/mammoth/tesseract) e enviava string ao Gemini, perdendo layout, tabelas, estrutura visual.

**Decisão (2026-04-01):** Migrar para **inlineData base64** direto ao Gemini (multimodal).

**Razão:** Extração de IR, balanços e DREs com tabelas falhava com texto puro. Multimodal preserva estrutura.

**Consequência:** custo maior por chamada, mas precisão MUITO superior. Fallback de texto mantido para DOCX e PDFs digitais grandes.

**Atualização (2026-04-26):** Inversão da prioridade. **Modo texto vira o padrão** quando `pdf-parse` extrai >200 chars com dígitos. Apenas `VISUAL_ONLY_TYPES = ["contrato", "relatorio_visita"]` ficam em multimodal sempre.

**Razão da reversão parcial:** Hobby plan = 60s max. Modo visual gasta 30-45s só na inferência. Modo texto custa 5-8s. Maioria dos PDFs (cartão CNPJ, balanço, DRE, SCR Bacen, faturamento) é digital — pdf-parse extrai perfeitamente.

---

## ADR-003 — Política de crédito como fonte única de verdade

**Contexto:** Antes, prompt tinha fallbacks que estimavam score quando faltavam dados, e `fund_settings` (tabela separada) governava limites de elegibilidade. Resultado: rating do Gemini divergia do score V2 calculado, e mudanças de política exigiam dois lugares.

**Decisão (2026-04-29):** `politica_credito_config` é a **única fonte de verdade**. Carregada server-side em `loadPoliticaServidor()`. Sobrescreve `FundSettings`. Gemini SEMPRE recebe a política completa no prompt via `buildPoliticaBlock()`. Auto-score server-side se cliente não enviar.

**Consequência:**
- Mudanças de política = só mudar no Supabase, sem deploy
- Gemini não mais "estima" score — sempre recebe um Score V2
- `fund_settings` vira fallback de última instância apenas
- `ratingConfianca` reflete cobertura mas nunca altera score

---

## ADR-004 — Middleware: getSession, não getUser

**Contexto:** `supabase.auth.getUser()` no middleware causava 504 GATEWAY_TIMEOUT no Edge Runtime do Vercel (timeout 1.5s) quando o Supabase ficava lento.

**Decisão:** Sempre usar `supabase.auth.getSession()` no middleware. `getUser()` só em rotas individuais que exigem validação server-side máxima (operações financeiras críticas, admin).

**Razão:** `getSession()` lê do cookie sem rede — instantâneo. `getUser()` faz HTTP para Supabase em todo request.

**Consequência:** middleware não detecta sessões revogadas após emissão do cookie (até expirar). Mitigação: rotas sensíveis revalidam com `getUser()`.

---

## ADR-005 — Único arquivo de template do PDF/HTML

**Contexto:** Antes existiam dois caminhos paralelos: HTML/Puppeteer e jsPDF nas `lib/generators/pdf/sections/*.ts`. Mudanças exigiam espelhar nos dois.

**Decisão:** **`lib/pdf/template.ts` é o único arquivo a editar.** Em produção, Puppeteer + template.ts é o caminho real. jsPDF vira fallback local.

**Consequência:** Mudanças visuais/estruturais em um lugar só. Exceção: `HIDE_AVALIACAO` precisa estar nos 3 arquivos (`template.ts`, `parecer.ts`, `sintese.ts`) para PDF/HTML/jsPDF ficarem consistentes.

---

## ADR-006 — APIs como fonte primária; uploads são complemento

**Contexto:** Plataforma começou com fluxo upload-first (analista anexa cartão CNPJ, contrato, SCR, etc.). Onerava o analista e ficava sujeito a documento desatualizado/errado.

**Decisão:** Sempre que possível, buscar via API antes de exigir upload. Uploads ficam para dados que APIs não cobrem (ex: IR pessoal, contrato social).

**Exemplos:**
- SCR: DataBox360 substituiu upload manual do relatório do Bacen
- Sócios: BDC busca QSA, dispensa upload de QSA quando empresa tem o dataset
- Cartão CNPJ: prefere API quando disponível

**Consequência:** custos de bureau crescem, mas tempo do analista cai e dado fica sempre fresco.

---

## ADR-007 — `removeConsole: false` em produção

**Contexto:** Até 2026-04-30, `next.config.mjs` strippava `console.log` e `console.info` em prod via SWC. Diagnóstico de bugs em prod ficava cego — só restavam `console.error` e `console.warn`.

**Decisão:** `removeConsole: false` permanente.

**Consequência:** logs aparecem na DevTools e em `vercel logs`. Trade-off: bundle ligeiramente maior, possível vazamento de info em logs do navegador. Aceito porque a velocidade de diagnóstico ganha mais.

---

## ADR-008 — `curva_abc` fora de `LARGE_TEXT_FALLBACK_VISUAL`

**Contexto:** Curva ABC com PDF nativo grande (>25k chars) era enviada como **imagem** ao Gemini quando entrava no fallback visual. Gemini retornava `clientes:[]` silenciosamente.

**Decisão:** Remover `curva_abc` de `LARGE_TEXT_FALLBACK_VISUAL`. Pipeline em 4 camadas:
1. Parser regex direto (bypass Gemini para >15k chars com ≥5 clientes detectados)
2. Gemini text mode (maxChars 60k, 45s timeout, 32k output tokens)
3. Roteamento texto vs visual (com `curva_abc` SEMPRE em texto)
4. Recovery de JSON truncado (`tryRecoverTruncatedJSON`)

**Consequência:** curva ABC com 400+ clientes processa em <10ms via regex direto. **Não voltar a colocar curva_abc no fallback visual.**

---

## ADR-009 — Hide rating em calibração

**Contexto:** Rating IA 0-10 e Score V2 A-F estavam mostrando vereditos não calibrados no PDF/HTML, podendo induzir comitê a decisões erradas.

**Decisão:** Toggle `HIDE_AVALIACAO = true` em 3 arquivos. Esconde **veredito final**, mantém **dados base** (alertas, fortes/fracos, 5 pilares pontuados, parecer textual).

**Tela do app continua mostrando rating** — pipeline separado.

**Consequência:** comitê só vê dados qualitativos + crítica do Gemini, sem nota numérica. Reativação = trocar `HIDE_AVALIACAO = false` nos 3 arquivos quando política for calibrada (semana de 2026-05-05 prevista).

---

## ADR-010 — Security hardening: 10 endpoints fechados (2026-04-30)

**Contexto:** Auditoria encontrou rotas anônimas vazando dados ou gastando dinheiro: `/api/debug-extraction` (vazava extracted_data), `/api/debug-bureaus` (custo $), `/api/metricas` (lista todas collections de todos os usuários), `/api/share-report` (XSS armazenado), `/api/ch-diag` (chave hardcoded como fallback).

**Decisão:** Padrão de auth obrigatório em todo endpoint que toca dados de cliente, dispara API paga, ou consome compute:

```ts
import { createServerSupabase } from "@/lib/supabase/server";
const authSb = await createServerSupabase();
const { data: { user } } = await authSb.auth.getUser();
if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
```

Crons fail-closed: 503 sem `CRON_SECRET` (Vercel auto-injeta `Authorization: Bearer ${CRON_SECRET}`).

`share-report` ganhou `MAX_HTML_BYTES = 5MB`.

**Pendente:** `app/api/upload-blob` precisa `maximumSizeInBytes`. `app/api/finetuning-status` tem SSRF-shape (modelName na URL).

---

## Quando adicionar uma nova ADR

Adicione um ADR aqui quando uma decisão tem **uma das três** propriedades:
- Inverte um padrão anterior (mostra trade-off vivo)
- Trava o time em uma direção difícil de reverter
- Passou por debate ou veio de incidente concreto

Decisões cosméticas, refactors locais, escolhas de nome — **NÃO** entram aqui. Documentam-se no commit.
