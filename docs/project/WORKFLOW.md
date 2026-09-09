# Fluxo de trabalho do projeto

Use este fluxo para qualquer trabalho planejado no GitHub. Uma **epic** é uma issue-pai; features, tasks e bugs executáveis são **sub-issues** nativas dessa epic. O acompanhamento acontece no [Maratona — Roadmap](https://github.com/users/paulop2/projects/5).

## Fontes de verdade

Cada informação tem um único local autoritativo:

| Informação                                 | Fonte de verdade                      |
| ------------------------------------------ | ------------------------------------- |
| Regras permanentes do repositório          | `AGENTS.md` e documentação versionada |
| Objetivo, limites e resultado do produto   | Epic                                  |
| Escopo executável e critérios de aceite    | Sub-issue                             |
| Estado, `Kind`, prioridade, área e esforço | GitHub Project                        |
| Prazo                                      | Milestone                             |
| Mudanças e evidências de verificação       | Pull request                          |
| Contexto para retomada                     | Comentário de handoff na sub-issue    |

Referencie a fonte em vez de copiar seu conteúdo. Quando uma decisão mudar, atualize primeiro a fonte de verdade e depois ajuste apenas referências afetadas.

## Planejar uma epic

1. Crie a epic com o template de epic e defina problema, resultado, limites e critérios de conclusão.
2. Associe a milestone e adicione a epic ao Project com `Kind`, prioridade, área, esforço e status.
3. Decomponha o trabalho em sub-issues pequenas, verificáveis e vinculadas pela relação nativa de sub-issue.
4. Declare dependências entre sub-issues e ordene somente o que tiver dependência real.

A epic está pronta para execução quando seu resultado e limites estão claros, cada entrega conhecida possui uma sub-issue e a próxima sub-issue pode ser iniciada sem redescobrir o escopo.

## Executar uma sub-issue

1. Leia a sub-issue, a epic-pai e a documentação apontada por elas. Se os critérios de aceite estiverem ambíguos, ajuste a issue antes do código.
2. Confirme milestone, dependências e estado no Project. Trabalhe somente em uma issue executável por vez.
3. Crie a branch a partir da base indicada usando `<tipo>/<numero>-<slug>`, por exemplo `feat/42-seletor-de-provas`.
4. Implemente o menor incremento que satisfaz os critérios e registre na issue qualquer decisão que altere escopo ou dependências.
5. Execute verificações proporcionais ao risco e guarde comandos, resultados e limitações para a PR.
6. Abra uma PR ligada à sub-issue com `Closes #<numero>` e referencie a epic-pai sem fechá-la. Mantenha a PR como draft enquanto houver critério de aceite ou verificação pendente.

A sub-issue está pronta para review quando todos os critérios de aceite estão demonstrados na PR, as verificações atuais estão registradas e riscos ou limitações restantes estão explícitos.

## Handoff

Antes de interromper uma sub-issue em andamento, publique nela um comentário curto com:

- estado atual e branch/PR;
- o que foi concluído;
- verificações executadas e respectivos resultados;
- pendências, bloqueios e decisões abertas;
- próxima ação concreta.

Um handoff está completo quando outra pessoa ou agente consegue continuar pela issue, sem depender do histórico da sessão anterior.

## Concluir

- Deixe a decisão de merge com o mantenedor; faça o merge somente quando ele solicitar explicitamente.
- Feche uma sub-issue de código pela PR com `Closes #<numero>`. Para trabalho sem código, feche-a somente após anexar a evidência do resultado na própria issue.
- Mova o item para `Done` apenas quando a sub-issue estiver fechada; uma PR aberta ou um handoff não representa conclusão.
- Conclua a epic somente quando seus critérios de conclusão forem demonstrados e todas as sub-issues estiverem fechadas ou explicitamente removidas de escopo com justificativa.
- Registre follow-ups como novas sub-issues; não esconda trabalho pendente em texto de PR.
