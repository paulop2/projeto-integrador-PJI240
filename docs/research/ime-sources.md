# Fontes públicas das provas do IME

Levantamento da sub-issue [#43](https://github.com/paulop2/projeto-integrador-PJI240/issues/43), pertencente à epic [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2).

O IME **não possui dataset estruturado nem API no formato [enem.dev](https://enem.dev)**. A fonte pública é o site oficial, que publica provas e gabaritos em PDF. Este documento mapeia essas fontes; não baixa, não extrai e não publica o conteúdo das questões.

> **Atenção de verificação.** O servidor `ime.eb.mil.br` retornou erro de transporte nas tentativas de coleta automatizada durante este levantamento. O conteúdo abaixo veio de resultados indexados das próprias páginas oficiais e **precisa de confirmação manual item a item** antes de qualquer ingestão.

## Fontes oficiais

| Seção | Página |
| ----- | ------ |
| Ensino médio (CFG) | `https://www.ime.eb.mil.br/vestibular-e-concursos/cfg-ensino-medio/provas-anteriores-cfg` |
| Graduação (CG — Oficiais da AMAN) | `https://www.ime.eb.mil.br/vestibular-e-concursos/cg/provas-anteriores-cg` |
| CFrm (nível superior) | área de vestibular e concursos do IME (URL exata a confirmar) |
| CP/IME (Curso de Preparação) | área de vestibular e concursos do IME (URL exata a confirmar) |

## Abrangência por seção

- **CFG (Ensino Médio):** edições de **1996/1997 a 2025/2026**, cada uma com prova objetiva de Matemática / Física / Química / Português-Inglês e o respectivo gabarito. O site também oferece **um único arquivo `.rar`** com todas as provas do período.
- **CG (Graduação — Oficiais da AMAN):** edições de **2010/2011 a 2025/2026** (a listagem indexada começa em 2009/2010), com provas de **Cálculo / Física / Português-Inglês** e gabarito preliminar em parte dos anos.
- **CFrm (Nível Superior):** área de provas anteriores similar, a confirmar.
- **CP/IME:** curso de preparação ao IME, com provas próprias, a confirmar.

A chave de edição precisa preservar o ano letivo no formato `AAAA/AAAA` (ex.: `2025/2026`), que é como o IME identifica cada concurso.

## Estrutura e formato observados

- A prova objetiva do CFG combina **Matemática, Física, Química e Português-Inglês**.
- A seção CG é organizada por disciplina (**Cálculo**, **Física**, **Português-Inglês**).
- O ano letivo atravessa o calendário civil, então a edição não pode ser derivada de um único ano.
- Há material de **2ª fase discursiva** em parte das edições, fora do contrato `single-choice` atual.

## Anomalias e pontos de atenção

- **Acesso automatizado indisponível:** o servidor retornou erro de transporte; sem confirmação manual, não se deve afirmar a cobertura exata de cada seção.
- **Nomenclatura por ano letivo** (`1996/1997` … `2025/2026`) e não por ano civil.
- **Pacote `.rar` agregado** para o CFG: não convém usá-lo como artefato de ingestão sem antes enumerar e fixar as edições.
- **Duas fases** e, ao menos em parte dos anos, gabarito apenas preliminar.

## Condições de uso

O conteúdo das questões é de titularidade do **Instituto Militar de Engenharia (IME)**. Vale a mesma regra das demais bancas já documentadas: reprodução parcial com atribuição, com checagem de obras de terceiros embutidas em cada questão e sign-off editorial do mantenedor pendentes antes de qualquer uso público amplo.

Este levantamento não copiou PDFs, o arquivo `.rar` agregado nem o texto integral das questões para o repositório ou `public/data`.

## Próximos passos sugeridos

1. Confirmar manualmente as edições e os arquivos de cada seção, já que a coleta automatizada falhou.
2. Decidir o recorte (ensino médio/CFG é objetivo e mais previsível; CG tem apenas Cálculo/Física/Português-Inglês).
3. Se o IME for banca piloto, preferir edições com prova objetiva e gabarito oficial (não apenas preliminar).

## Como verificar

- Abrir as duas páginas oficiais no navegador e conferir ano, fase e existência de gabarito.
- Conferir se o link do pacote `.rar` continua publicado e qual o seu conteúdo.
