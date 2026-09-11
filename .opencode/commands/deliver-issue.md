---
description: Implementa uma sub-issue do GitHub, roda review adversarial, corrige e re-revisa ate a PR ficar review-ready (sem merge)
agent: build
---

Voce e o orquestrador do fluxo de entrega de uma sub-issue. Entrada: $ARGUMENTS

Siga `docs/project/WORKFLOW.md` e todos os `AGENTS.md` aplicaveis durante todo o fluxo. Nunca atribua a ferramentas de IA em commits, PRs ou metadados; use a identidade Git existente do repositorio.

## 1. Implementar

- Carregue a skill `implement-github-issue` com a ferramenta `skill` e execute-a exatamente como descrita para a issue em $ARGUMENTS.
- Prossiga ate existir uma PR review-ready, aberta contra a base correta, com criterios de aceite mapeados e evidencias de verificacao registradas. Mantenha a PR como draft enquanto houver criterio ou verificacao pendente.
- Nao faca merge, deploy, release ou promocao.

## 2. Review adversarial

- Invoque o subagent `pr-reviewer` (ferramenta `task`, `subagent_type: "pr-reviewer"`) sobre a PR criada.
- Passe o numero da PR, a issue e a base. O reviewer e read-only e deve tentar falsificar cada criterio de aceite.
- Trate como bloqueante: falha de criterio de aceite, regressao, risco de seguranca, alteracao fora de escopo, segredo/artefato gerado no diff, ou verificacao ausente/invalida.

## 3. Corrigir

- Se houver achados bloqueantes, invoque o subagent `pr-fixer` (`subagent_type: "pr-fixer"`) passando a lista de achados do reviewer.
- O fixer aplica a menor correcao, roda as verificacoes focadas e as obrigatorias do repositorio, faz commit com a identidade Git existente (sem atribuicao de IA) e atualiza a PR.

## 4. Re-revisar

- Apos as correcoes, invoque novamente `pr-reviewer` sobre o novo diff.
- Repita os passos 2 a 4 ate o reviewer nao reportar achados bloqueantes, ou ate 3 iteracoes.
- Se apos 3 iteracoes ainda houver bloqueio, pare e reporte os achados remanescentes como bloqueio, sem merge.

## 5. Encerrar

- Garanta que a PR esta fora de draft quando todos os criterios e verificacoes estiverem demonstrados.
- Publique o handoff exigido pelo WORKFLOW.md na sub-issue.
- Nao faca merge: a decisao de merge e do mantenedor e so ocorre sob pedido explicito.
- Responda com: link da PR, resultado final do review, verificacoes e evidencias, limitacoes/riscos e o que falta.
