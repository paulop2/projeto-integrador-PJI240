# Fontes públicas das provas do Vestibular UECE

Levantamento da sub-issue [#45](https://github.com/paulop2/projeto-integrador-PJI240/issues/45), pertencente à epic [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2).

A UECE (via CEV) **não possui dataset estruturado nem API no formato [enem.dev](https://enem.dev)**. A fonte pública é o site oficial, que publica provas e gabaritos em PDF, distribuídos pelas páginas de cada edição. Este documento mapeia essas fontes; não baixa, não extrai e não publica o conteúdo das questões.

## Fonte oficial

| Item | Valor |
| ---- | ----- |
| Lista de vestibulares | `https://www.cev.uece.br/home/home/concursos-servicos/encerrados/vestibulares/vestibular-uece` |
| Verificação | Página listada e página da edição 2026.2 abertas e lidas em 2026-09-11 |
| Edições listadas | 2010.2 até 2026.2 |

Cada edição tem **página própria** (`https://www.cev.uece.br/...`), e é nela que ficam os arquivos de prova e gabarito.

## Abrangência por edição

| Edição | Página |
| ------ | ------ |
| 2026.2 | `https://www.cev.uece.br/vestibular20262/` |
| 2026.1 | `https://www.cev.uece.br/vestibular20261/` |
| 2025.2 | `https://www.cev.uece.br/vestibular20252/` |
| 2025.1 | `https://www.cev.uece.br/vestibular-2025-1/` |
| 2024.2 | `https://www.cev.uece.br/vestibular-2024-2/` |
| 2024.1 | `https://www.cev.uece.br/vestibular20241/` |
| 2023.2 | `https://www.cev.uece.br/vestibular-2023-2/` |
| 2023.1 | `https://www.cev.uece.br/home/concursos-servicos/vestibular-2023-1/` |
| 2022.2 | `https://www.cev.uece.br/2022/02/18/vestibular-2022-2/` |
| 2022.1 | `https://www.cev.uece.br/2021/08/12/vestibular-20221/` |
| 2021.1 | `https://www.cev.uece.br/2021/02/01/vestibular-20211/` |
| 2020.2 | `https://www.cev.uece.br/2019/09/09/vestibular-20202/` |
| 2020.1 | `https://www.cev.uece.br/2019/08/01/vestibular-20201/` |
| 2019.2 | `https://www.cev.uece.br/2019/02/15/vestibular-20192/` |
| 2019.1 | `https://www.cev.uece.br/2018/08/03/vestibular-20191/` |
| 2018.2 | `https://www.cev.uece.br/2018/03/16/vestibular-20182/` |
| 2018.1 | `https://www.cev.uece.br/2017/09/21/vestibular-20181/` |
| 2017.2 | `https://www.cev.uece.br/2017/03/02/vestibular-20172/` |
| 2017.1 | `https://www.cev.uece.br/2016/07/28/vestibular-20171/` |
| 2016.2 | `https://www.cev.uece.br/2016/03/04/vestibular-20162/` |
| 2016.1 | `https://www.cev.uece.br/2015/08/20/vestibular-20161/` |
| 2015.2 | `https://www.cev.uece.br/2015/03/13/vestibular-20152/` |
| 2015.1 | `https://www.cev.uece.br/2014/08/28/vestibular-20151/` |
| 2014.2 | `https://www.cev.uece.br/2014/01/31/vestibular-20142-da-uece/` |
| 2014.1 | `https://www.cev.uece.br/2013/07/29/vestibular-20141/` |
| 2013.2 | `https://www.cev.uece.br/2013/02/25/vestibular-20132/` |
| 2013.1 | `https://www.cev.uece.br/2012/07/09/vestibular-20131/` |
| 2012.2 | `https://www.cev.uece.br/2012/02/06/vestibular-20122/` |
| 2012.1 | `https://www.cev.uece.br/2011/08/08/vestibular-20121/` |
| 2011.2 | `https://www.cev.uece.br/2011/02/10/vestibular-20112/` |
| 2011.1 | `https://www.cev.uece.br/2010/08/03/vestibular-20111/` |
| 2010.2 | `https://www.cev.uece.br/2010/05/05/vestibular-20102-geral/` |

Observação: a lista salta de 2021.1 para 2022.1 — **não há edição 2021.2** publicada no índice consultado.

## Estrutura e formato observados

A partir da página da edição 2026.2, a UECE organiza o vestibular em:

- **1ª fase:** Prova Objetiva de **Conhecimentos Gerais** (dia único).
- **2ª fase:** Provas de **Conhecimentos Específicos** em **dois dias** (1º e 2º dia), mais **Prova de Redação**.

Os arquivos e consultas por edição ficam sob `https://www2.cev.uece.br/vest/{edicao}/vestibular/`, por exemplo:

| Artefato | Caminho |
| -------- | ------- |
| Prova da 1ª fase | `…/vest/20262/vestibular/consulta_provaf1` |
| Prova da 2ª fase — 1º dia | `…/vest/20262/vestibular/consulta_provaf2_d1` |
| Prova da 2ª fase — 2º dia | `…/vest/20262/vestibular/consulta_provaf2_d2` |
| Grade de respostas (1ª fase) | `…/vest/20262/vestibular/grade_respostas` |
| Grade de respostas (2ª fase) | `…/vest/20262/vestibular/grade_respostas_consulta_fase2` |
| Folha de respostas | `…/vest/20262/vestibular/folha_respostas` |

Os editais e comunicados ficam em PDF no domínio `cev.uece.br`, em `wp-content/uploads/`.

## Anomalias e pontos de atenção

- **Duas edições por ano** (semestre). A chave de edição precisa incluir o semestre (`2026.1`, `2026.2`), nunca apenas o ano, para não colidir IDs.
- **Gabarito preliminar x definitivo:** a UECE publica grades preliminares e, depois dos recursos, grades definitivas. A ingestão deve usar a **definitiva** e registrar a distinção.
- **Arquivos atrelados à página da edição:** não há um índice único de PDFs; é preciso abrir cada edição para enumerar prova e gabarito.
- **Prova de Conhecimentos Específicos** é por curso; questões discursivas ficam fora do contrato `single-choice`.

## Condições de uso

O conteúdo das questões é de titularidade da **Universidade Estadual do Ceará (UECE) / Comissão Executiva do Vestibular (CEV)**. Vale a mesma regra das demais bancas já documentadas: reprodução parcial com atribuição, com checagem de obras de terceiros embutidas em cada questão e sign-off editorial do mantenedor pendentes antes de qualquer uso público amplo.

Este levantamento não copiou PDFs nem o texto integral das questões para o repositório ou `public/data`.

## Próximos passos sugeridos

1. Abrir cada edição e registrar manualmente os artefatos de prova e gabarito definitivo.
2. Se a UECE for banca piloto, começar pela 1ª fase (Conhecimentos Gerais, objetiva) de uma única edição.
3. Modelar `editionId` com semestre explícito e usar a grade definitiva.

## Como verificar

- Abrir `https://www.cev.uece.br/home/home/concursos-servicos/encerrados/vestibulares/vestibular-uece` e conferir as edições.
- Abrir a página de uma edição (ex.: `https://www.cev.uece.br/vestibular20262/`) e conferir os links de prova e gabarito.
