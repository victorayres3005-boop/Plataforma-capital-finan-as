# Como usar este conjunto de arquivos com Claude/ChatGPT

## Para redesign visual de UMA aba específica

Cole na ordem:
1. `_design-system.md` (tokens + layout + UI primitives)
2. O arquivo da aba que você quer redesenhar (ex: `historico.md`)

Depois mande um prompt como:

> Quero redesenhar visualmente esta tela mantendo a mesma estrutura de dados e a mesma navegação. Proponha:
> 1. Uma nova paleta de cores e hierarquia tipográfica que combine com o design system existente.
> 2. Reorganização visual (espaçamento, agrupamento, ênfase) sem quebrar comportamento.
> 3. Código TSX completo da página remodelada, usando os mesmos componentes UI já disponíveis.
>
> Restrições: não alterar imports de hooks, libs externas, lógica de fetch ou tipos. Apenas o JSX e classes Tailwind.

## Para um redesign GERAL da plataforma

Cole apenas `_design-system.md` e peça uma proposta de paleta + tipografia + tokens nova. Depois aplique aba por aba usando as orientações acima.

## Arquivos disponíveis

- `_design-system.md` — tokens, layout, UI primitives (sempre incluir)
- `home.md` — Nova Análise (Upload/Review/Generate)
- `historico.md`, `pareceres.md`, `operacoes.md`, `metricas.md`, `custos.md`
- `configuracoes.md` — inclui Política de Crédito (denso, com sub-tabs)
- `perfil.md`, `admin.md`, `ajuda.md`, `login.md`
- `importar-goalfy.md`, `empresa-cnpj.md`, `v2-metricas-pareceres.md`
