# Plano de Ação — Projeto Integrador (PJI240)

> Versão em Markdown do documento oficial entregue no AVA. O arquivo para envio (PDF) deve ser gerado a partir de `Plano-de-Acao-Maratona.docx`, nesta mesma pasta, após revisar os campos marcados como `[completar]`.

## Integrantes

- Erikson Souza da Silva — RA: `[completar]`
- Paulo Vitor de Souza — RA: `[completar]`
- Elias Alves Bastos Neto — RA: `[completar]`

## Identificação

| Campo | Valor |
|---|---|
| Disciplina | Projeto Integrador em Computação II — PJI240-DRP04-A2026S2-T004 (DRP04, Turma 004) |
| Tema escolhido pelo grupo | `[CONFERIR redação oficial do tema norteador do semestre divulgado pela Univesp]` Educação e tecnologia: acesso democratizado a ferramentas de estudo para o ENEM e vestibulares, voltado a estudantes com pouco tempo disponível e acesso limitado à internet. |
| Título provisório | Maratona: plataforma offline de questões para ENEM e vestibulares, com controle de tempo por questão e gamificação |
| Polo(s) | Valinhos |
| Orientador do PI | Augusto Rafael Carvalho De Sousa |

## Problema

Estudantes que se preparam para o ENEM e outros vestibulares enfrentam dois problemas relacionados. O primeiro é a dificuldade em administrar o tempo de resposta por questão durante o treino: a motivação inicial do projeto veio da observação de que o irmão de um dos integrantes do grupo tinha dificuldade recorrente em cumprir o tempo médio disponível por questão, o que prejudicava seu desempenho mesmo dominando o conteúdo. O segundo é o acesso: plataformas que centralizam questões de múltiplas bancas (ENEM, FUVEST, COMVEST, ITA, IME, FGV etc.) em uma única experiência de estudo costumam cobrar assinatura para desbloquear o catálogo completo, mesmo as provas e questões originais sendo de domínio público e gratuitas nos sites das próprias instituições. Esse modelo prejudica estudantes com menor poder aquisitivo e, em especial, quem tem acesso limitado ou instável à internet — por exemplo, quem trabalha de manhã e só consegue estudar à noite, ou aproveita o trajeto de ônibus para revisar questões.

## Objetivo

Desenvolver e evoluir uma plataforma web (PWA) gratuita, offline-first e centralizadora de questões de múltiplas bancas de vestibular — começando pelo ENEM —, que treine o estudante sob um tempo limite por questão, simulando a pressão real da prova e ajudando a desenvolver gestão de tempo, e que acompanhe seu desempenho ao longo do tempo. Partindo do MVP já funcional com 177 questões do ENEM 2023, o objetivo do grupo nesta disciplina é ampliar o catálogo para outras bancas (FUVEST, COMVEST, ITA, IME, FGV, entre outras), tratar e normalizar esses novos dados, evoluir a interface e a experiência de uso, e adicionar funcionalidades de estudo como repetição espaçada (estilo Anki), dashboard de desempenho e, se o tempo permitir, um modo de competição com ranking entre usuários.

## Comunidade externa

**Processo de escolha do local.** O grupo não buscou uma instituição formal (escola, cursinho ou empresa) como comunidade externa. A escolha partiu da observação direta de um problema real: o integrante Paulo Vitor de Souza percebeu, ao acompanhar os estudos do próprio irmão — um estudante se preparando para o ENEM —, a dificuldade recorrente de administrar o tempo por questão durante simulações de prova. A partir dessa observação, o grupo optou por validar o problema junto a um círculo próximo de estudantes de ensino médio e pré-vestibular (familiares e colegas), por ser uma comunidade de fácil acesso, disponível ao longo de todo o desenvolvimento do projeto e diretamente afetada pelo problema identificado.

**Conversa com a comunidade externa.** A conversa inicial ocorreu de forma informal, entre os integrantes do grupo e estudantes de seu convívio que estão se preparando para o ENEM e outros vestibulares, incluindo o irmão do integrante Paulo Vitor de Souza. Nessas conversas, os estudantes relataram dificuldade em manter o ritmo de resposta dentro do tempo médio disponível por questão, e disseram recorrer a plataformas de questões online que, na maioria das vezes, cobram assinatura para acessar o banco completo de múltiplas bancas ou dependem de conexão constante com a internet — o que é um problema para quem estuda em trajetos (como no ônibus) ou tem acesso limitado à internet.

**Problemas identificados.** A partir dessas conversas, o grupo identificou dois problemas centrais a serem pesquisados: (1) a dificuldade de estudantes em desenvolver gestão de tempo durante a resolução de questões de vestibular, habilidade determinante para o desempenho na prova real; e (2) a barreira de acesso representada por bancos de questões pagos que centralizam múltiplas bancas, o que penaliza estudantes de menor renda e sem conexão estável à internet. Ambos se relacionam ao tema norteador de democratização do acesso à educação por meio da tecnologia.

**Tema específico do PI.** Democratização do acesso a bancos de questões de vestibulares brasileiros por meio de uma plataforma gratuita e offline-first, que treina a gestão do tempo de resposta e centraliza múltiplas bancas em um único aplicativo, ampliando o acesso ao estudo de qualidade independentemente da renda ou da qualidade da conexão à internet do estudante.

## Plano de Ação por quinzena

### Quinzena 1 (10/08–23/08) — Analisar o cenário do projeto e iniciar o levantamento bibliográfico
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Identificação do problema a partir de observação pessoal (dificuldade de gestão de tempo por questão) e definição do escopo inicial do MVP. | Paulo Vitor de Souza | 10/08/2026 | 16/08/2026 | Motivação inicial do projeto. |
| Levantamento bibliográfico e de mercado sobre plataformas de questões existentes (gratuitas e pagas) e bancas de vestibular. | Erikson Souza da Silva | 17/08/2026 | 23/08/2026 | Base para Problema e Objetivo. |
| Definição da stack técnica e arquitetura inicial (PWA React/TypeScript, IndexedDB, Cloudflare Pages/D1). | Paulo Vitor de Souza | 17/08/2026 | 23/08/2026 | |
| Estruturação do repositório do projeto e documentação inicial. | Elias Alves Bastos Neto | 17/08/2026 | 23/08/2026 | |

### Quinzena 2 (24/08–06/09) — Interagir com a comunidade externa, definir o problema e organizar o plano de ação
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Conversas com estudantes (comunidade externa informal) sobre gestão de tempo e acesso a bancos pagos. | Paulo Vitor de Souza | 24/08/2026 | 27/08/2026 | |
| Consolidação da definição do problema e do objetivo do PI. | Todos | 27/08/2026 | 29/08/2026 | |
| Elaboração e revisão do Plano de Ação. | Elias Alves Bastos Neto (redação) + revisão de todos | 28/08/2026 | 31/08/2026 | |
| Reunião do grupo com o orientador para validar problema e plano de ação. | Todos | 31/08/2026 | 01/09/2026 | Orientador: Augusto Rafael Carvalho De Sousa. |
| Entrega do Plano de Ação no AVA. | Paulo Vitor de Souza (envio) | 01/09/2026 | 01/09/2026 | Vencimento oficial 01/09/2026 (carência até 06/09/2026). |

### Quinzena 3 (07/09–20/09) — Definir título do trabalho e dar continuidade ao desenvolvimento
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Definição do título provisório do trabalho. | Todos | 07/09/2026 | 08/09/2026 | |
| Pesquisa e mapeamento de fontes públicas de questões de outras bancas (FUVEST, COMVEST, ITA, IME, FGV). | Erikson Souza da Silva | 08/09/2026 | 20/09/2026 | |
| Ajustes no script de seed e normalização de dados para múltiplas bancas. | Paulo Vitor de Souza | 13/09/2026 | 20/09/2026 | |
| Levantamento de referências de UX para apps de estudo e gamificação. | Elias Alves Bastos Neto | 07/09/2026 | 20/09/2026 | |

### Quinzena 4 (21/09–04/10) — Construir a solução inicial e entregar o Relatório Parcial
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Implementação da importação de questões de uma nova banca (piloto). | Paulo Vitor de Souza | 21/09/2026 | 27/09/2026 | |
| Coleta de feedback informal com estudantes sobre a nova versão. | Erikson Souza da Silva | 27/09/2026 | 29/09/2026 | |
| Redação do Relatório Parcial. | Elias Alves Bastos Neto (redação) + revisão de todos | 28/09/2026 | 30/09/2026 | |
| Entrega do Relatório Parcial no AVA. | Paulo Vitor de Souza (envio) | 30/09/2026 | 30/09/2026 | Vencimento oficial 30/09/2026 (carência até 04/10/2026). |

### Quinzena 5 (05/10–18/10) — Construir a solução final
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Ajustes na plataforma com base no feedback do Relatório Parcial. | Paulo Vitor de Souza | 05/10/2026 | 11/10/2026 | |
| Implementação de repetição espaçada (estilo Anki). | Erikson Souza da Silva | 05/10/2026 | 18/10/2026 | |
| Implementação do dashboard de desempenho aprimorado. | Elias Alves Bastos Neto | 11/10/2026 | 18/10/2026 | |

### Quinzena 6 (19/10–01/11) — Analisar resultados e preparar o vídeo
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Implementação de gamificação e leaderboard entre usuários. | Paulo Vitor de Souza | 19/10/2026 | 25/10/2026 | |
| Testes finais, ajustes de performance e correção de bugs. | Erikson Souza da Silva | 19/10/2026 | 01/11/2026 | |
| Análise dos resultados e início do roteiro/produção do vídeo. | Elias Alves Bastos Neto | 25/10/2026 | 01/11/2026 | |

### Quinzena 7 (02/11–15/11) — Concluir e entregar o Relatório Final e o Vídeo
| Atividade | Responsável | Início | Fim | Observação |
|---|---|---|---|---|
| Revisão e finalização do Relatório Final. | Todos | 02/11/2026 | 05/11/2026 | |
| Finalização e edição do vídeo de apresentação. | Elias Alves Bastos Neto | 02/11/2026 | 05/11/2026 | |
| Avaliação colaborativa entre os integrantes do grupo. | Todos | 05/11/2026 | 06/11/2026 | |
| Entrega do Relatório Final, do Vídeo e da Avaliação Colaborativa no AVA. | Paulo Vitor de Souza (envio) | 06/11/2026 | 06/11/2026 | Vencimento oficial 06/11/2026 (carência até 15/11/2026). |
