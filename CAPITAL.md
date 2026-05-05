---
tags: [capital-financas, hub, moc]
aliases: [Cérebro Capital, Capital Hub]
---

# 🧠 Capital Finanças — Cérebro

Mapa de Conteúdo do projeto. Aponta para o conhecimento estável (`cerebro/`) e a memória cronológica do Claude Code (`~/.claude/.../memory/`).

---

## Atalhos

### Conhecimento estável

| Vou para... | Quando |
|---|---|
| **[[arquitetura]]** | Stack, fluxo, modelo de dados, configs de timeout |
| **[[bureaus]]** | BDC, Assertiva, DataBox360, CredHub, Goalfy |
| **[[politica-credito]]** | Política V2, 5 pilares, score, elegibilidade, HIDE_AVALIACAO |
| **[[pdf-relatorio]]** | Estrutura 12 páginas, Puppeteer/jsPDF, `template.ts` |
| **[[extracao]]** | Pipeline `/api/extract`, modos texto/visual, nuances por tipo |
| **[[ui-fluxos]]** | UploadStep, ReviewStep, GenerateStep, telas auxiliares |
| **[[banco-dados]]** | Schema Supabase, RLS, migrations, SQLs prontos |
| **[[runbooks]]** | Diagnóstico, BDC_TOKEN, Gemini outage, 504, blob, embeddings |
| **[[decisoes]]** | ADRs: por que Gemini-only, getSession, removeConsole=false, etc. |
| **[[snippets-padroes]]** | Padrões de código (auth, safeNum, parseJSON, withTimeout) |
| **[[glossario]]** | Termos do domínio (FIDC, FMM, sacado, cedente, SCR, etc.) |
| **[[roadmap-gaps]]** | Avaliação 7.5/10, gaps, roadmap, pendências |
| **[[historico]]** | Changelog datado de sessões e cirurgias |
| **[[inventario]]** | Lista exaustiva: endpoints, páginas, componentes, libs, crons, envvars |
| **[[protocolo-claude]]** | Como o Claude usa e mantém este cérebro |

### Memória cronológica
Carrega automaticamente em toda sessão do Claude Code. Não precisa abrir manualmente.
- `MEMORY.md` em `~/.claude/projects/.../memory/`

---

## O que é o cérebro

Duas camadas, sem duplicação:

**`cerebro/`** — conhecimento **estável** do projeto. Sobrevive a sessões. Editável a mão. Quando algo muda na plataforma de modo permanente (nova decisão arquitetural, novo bureau, mudança de fluxo), atualizo aqui.

**`~/.claude/projects/.../memory/`** — memória **cronológica**: factos datados, feedbacks, incidentes, contexto temporal. Carregada automaticamente em toda sessão do Claude Code via `MEMORY.md`. Não duplica o que está em `cerebro/`.

**Regra:** se a info é "como o sistema funciona" → `cerebro/`. Se é "o que aconteceu / quem disse o quê / quando" → memória.

Esta cópia no projeto é **espelho** do vault em `C:\Users\Admin\Documents\Obsidian Vault\Capital Finanças\`. As duas existem; mantenha sincronizadas quando atualizar uma. Procedimento detalhado em [[protocolo-claude]].

---

## Quick reference

### Stack & deploy
- Next.js 14 + Supabase + Gemini
- Porta dev: 3017
- Deploy: `npx vercel --prod` (NÃO usa git push integrado)
- Type-check antes: `npx tsc --noEmit`
- Vercel Hobby: `maxDuration = 60s`

### Estado em calibração
- Rating + Decisão escondidos no PDF/HTML via `HIDE_AVALIACAO = true`
- Reativar quando: política completa chegar (semana de 2026-05-05 prevista)
- 3 arquivos: `template.ts`, `parecer.ts`, `sintese.ts`

### Tokens com renovação
- **BDC_TOKEN** — TTL 7 dias, manual (Nayara) — ver [[runbooks#bdc_token-expirou|runbooks]]
- **DATABOX360** — sandbox até 2026-04-29, virar para prod
- **GEMINI_API_KEYS** — 3 chaves em rotação (vírgula-separadas)

### Incidentes recentes
- 2026-04-30: outage Gemini 503 → adicionado parser regex direto curva ABC
- 2026-04-30: 504 middleware → trocar `getUser()` por `getSession()`
- 2026-04-30: security hardening 10 endpoints
- 2026-05-03: auditoria 70+ arquivos + 3 SQLs RLS
- 2026-05-04: overhaul UX (15 commits)

→ Detalhe completo: [[historico]]

---

## Onde editar o quê

| Mudança | Arquivo |
|---|---|
| Visual ou dado do PDF/HTML | `lib/pdf/template.ts` |
| Política de crédito (pilares/critérios/parâmetros) | Supabase `politica_credito_config` (sem deploy) |
| Defaults da política | `lib/politica-credito/defaults.ts` |
| Pipeline de extração | `app/api/extract/route.ts` |
| Bureau novo / endpoint | `lib/bureaus/<bureau>.ts` |
| Análise Gemini (prompt, score) | `app/api/analyze/route.ts` |
| Auth/sessão | `middleware.ts` (usar `getSession`) |
| Schema banco | `capital-financas/supabase/migrations/*.sql` |

---

## Padrão Claude Code para este projeto

- `CLAUDE.md` (se existir) governa comportamentos persistentes
- `MEMORY.md` (em `~/.claude/...`) é o índice da memória cronológica
- Skills disponíveis: `capital-pdf-report`, `capital-rating-analysis`
- Codex review automático ativo após mudanças de código
- Protocolo de manutenção do cérebro: [[protocolo-claude]]

---

## Stakeholders

- **Victor** — analista de crédito, usa a plataforma intensivamente. Stakeholder primário.
- **Débora** — cliente do projeto.
- **Nayara** — renova BDC_TOKEN semanalmente.
- **Vitor** (Goalfy) — pode configurar webhook na automação deles.

---

## Manutenção

Regra geral: **a cada execução / mudança / decisão com peso de invariante, atualizar o cérebro.** Detalhe e procedimento em [[protocolo-claude]].
