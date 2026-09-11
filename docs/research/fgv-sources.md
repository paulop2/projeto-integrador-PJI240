# Fontes públicas das provas do Vestibular FGV

Levantamento da sub-issue [#44](https://github.com/paulop2/projeto-integrador-PJI240/issues/44), pertencente à epic [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2).

A FGV **não possui dataset estruturado nem API no formato [enem.dev](https://enem.dev)**. A fonte pública é o site oficial, que publica provas e gabaritos em PDF por curso. Este documento mapeia essas fontes; não baixa, não extrai e não publica o conteúdo das questões.

## Fontes oficiais

| Item | Valor |
| ---- | ----- |
| Provas e gabaritos | `https://vestibular.fgv.br/provas-gabaritos` |
| Materiais do processo seletivo (âncora usada pela página de gabaritos) | `https://vestibular.fgv.br/processo-seletivo#block-quicktabsmateriaisimportantes` |
| Página de gabarito de uma edição | `https://vestibular.fgv.br/vestibular2026-2-gabarito` |
| Respostas de recursos | `https://recursos-fgvprojetos.fgv.br/inscricao/vestibularfgv202602_recurso/respostas.cfm` |
| Verificação | Páginas abertas e lidas em 2026-09-11 |

Os PDFs ficam sob `https://vestibular.fgv.br/sites/default/files/{ano}-{mes}/…`. Exemplo de gabarito observado: `https://vestibular.fgv.br/sites/default/files/2025-06/gabarito-eaesp.pdf`.

## Organização por curso e tipo de prova

Diferentemente do ENEM, o Vestibular FGV é **fragmentado por curso/escola**, e a página orienta o candidato a "selecionar a cidade e o curso". Cada combinação cidade/curso tem prova e gabarito próprios. Há ainda **múltiplos tipos de prova** (Tipo 1 a 4), usados como variação anti-cola.

- **Graduação — cursos citados na edição 2026.2:** Administração de Empresas (SP), Administração (RJ), Comunicação Digital (RJ) e Ciências Econômicas (RJ).
- **Fases:** a graduação tem 1ª fase objetiva e fases seguintes por curso/escola; os arquivos variam por curso.
- **Prova realizada em 2026-05-24** (edição 2026.2), conforme comunicado oficial.

## Limitação central: seletor dinâmico

Na página `provas-gabaritos`, a lista de arquivos é montada por um **seletor dinâmico no navegador** (cidade + curso). A leitura automatizada da página retorna apenas a casca; a enumeração completa dos PDFs de uma edição exige **verificação manual** (ou automação de navegador) e deve ser registrada por edição.

## Anomalias e pontos de atenção

- **Ambiguidade de `editionId`:** uma mesma edição tem provas por curso e por tipo, então a chave precisa incluir curso (e, se aplicável, tipo de prova), não apenas ano/semestre.
- **Vários portais FGV:** a FGV reúne escolas distintas (EAESP, EBAPE, Direito Rio/SP, EESP, EPGE, entre outras) com processos seletivos próprios; o levantamento precisa delimitar qual(is) entrará no produto.
- **Fases discursivas** existem e ficam fora do contrato `single-choice`.
- **Não confundir** com "Simulado FGV" de terceiros, conteúdos de TI (ex.: repositórios `fgv-quiz`) nem com a FGV Ensino Médio Digital, que não são as provas oficiais do vestibular.

## Condições de uso

O conteúdo das questões é de titularidade da **Fundação Getulio Vargas (FGV)**. Vale a mesma regra das demais bancas já documentadas: reprodução parcial com atribuição, com checagem de obras de terceiros embutidas em cada questão e sign-off editorial do mantenedor pendentes antes de qualquer uso público amplo.

Este levantamento não copiou PDFs nem o texto integral das questões para o repositório ou `public/data`.

## Próximos passos sugeridos

1. Delimitar o escopo: qual escola/curso da FGV entra (ex.: Administração SP) e se a 1ª fase é o alvo.
2. Registrar manualmente, por edição escolhida, os PDFs de prova e gabarito por curso/tipo.
3. Se a FGV for banca piloto, preferir uma combinação curso/tipo estável e com gabarito definitivo, não preliminar.

## Como verificar

- Abrir `https://vestibular.fgv.br/provas-gabaritos`, selecionar cidade e curso e conferir prova e gabarito.
- Conferir a página da edição (ex.: `https://vestibular.fgv.br/vestibular2026-2-gabarito`) e os links de recursos.
