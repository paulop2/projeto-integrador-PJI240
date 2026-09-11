# Comvest/Unicamp como banca piloto

Pesquisa feita em 10/09/2026 para a [epic #2](https://github.com/paulop2/projeto-integrador-PJI240/issues/2), usando apenas páginas, arquivos e respostas HTTP oficiais da Comvest/Unicamp.

## Resumo executivo

**Recomendação: executar uma amostra parcial da edição 2025**, com 11 questões — uma por disciplina — e atribuição “Comvest / Vestibular Unicamp 2025”. A primeira fase recente tem encaixe conceitual excelente no MVP: são 72 questões de múltipla escolha, quatro alternativas e uma única resposta. A própria Comvest autoriza publicamente a reprodução parcial e não exclusiva de questões anteriores, desde que a fonte seja sempre citada; ela proíbe reproduzir a prova inteira.

A implementação recomendada é um importador **build-time** a partir de uma cópia local da prova e do gabarito oficiais, com os artefatos de origem identificados por URL e SHA-256, normalização para o contrato atual e publicação de JSON/JPGs no mesmo domínio do aplicativo. Os endpoints do simulador podem servir como evidência e apoio de validação manual, não como fonte automatizada nem dependência de runtime.

## Acervo e formato

- A página [Anos anteriores](https://www.comvest.unicamp.br/vestibulares-anteriores/) oferece páginas de ingresso de 1987 a 2026, além de [provas comentadas](https://www.comvest.unicamp.br/vestibulares-anteriores/1a-fase-2a-fase-comentadas/) e do [Simulado Online](https://www.comvest.unicamp.br/SimuladoOnLine/). O formato variou ao longo do tempo; o piloto deve declarar uma edição específica, não assumir um esquema único para todo o acervo.
- A [prova comentada da 1ª fase de 2025](https://www.comvest.unicamp.br/wp-content/uploads/2025/06/F1_2025.pdf) registra 72 questões de múltipla escolha, quatro alternativas por questão e a alternativa correta de cada item.
- Na inspeção do simulador, a edição 2025 retornou 72 registros e 11 disciplinas: Matemática (12); Inglês, Física, Geografia, História, Biologia e Química (7 cada); Língua Portuguesa e Literatura (6 cada); Filosofia e Sociologia (3 cada). Os gabaritos estavam entre A e D, exceto a questão 53 de Matemática, marcada com `*` por estar anulada; o importador deve rejeitá-la ou representá-la somente após uma decisão explícita de produto.

## Simulado e superfície técnica

O frontend oficial revela uma API PHP interna. As consultas abaixo foram testadas com sucesso, mas não são documentadas como API pública:

| Recurso | Método e dados | Resultado observado |
| --- | --- | --- |
| [`ListarProcessos.php`](https://www.comvest.unicamp.br/SimuladoOnLine/BackEnd/ListarProcessos.php) | `GET` | Vestibular Unicamp e Vestibular Indígena |
| [`ListarAnos.php`](https://www.comvest.unicamp.br/SimuladoOnLine/BackEnd/ListarAnos.php?processo=Vestibular%20Unicamp) | `GET`, `processo` | 2017 a 2026, com dois dias em 2021 |
| [`ListarDisciplinas.php`](https://www.comvest.unicamp.br/SimuladoOnLine/BackEnd/ListarDisciplinas.php?processo=Vestibular%20Unicamp&ano=2025) | `GET`, `processo`, `ano` | disciplina e quantidade |
| [`MontarVestibular.php`](https://www.comvest.unicamp.br/SimuladoOnLine/BackEnd/MontarVestibular.php) | `POST` form, `processo`, `ano` | lista de questões da edição |
| [`ListarProntos.php`](https://www.comvest.unicamp.br/SimuladoOnLine/BackEnd/ListarProntos.php) | `GET` | nove simulados prontos por disciplina |

Cada registro de 2025 contém `id_questao`, processo, ano, fase, dia, disciplina, número, resposta e um caminho como `2025/F1_25_GEO_Q1.jpg`. Não há enunciado nem alternativas estruturadas: o simulador exibe a questão inteira como um JPEG e oferece separadamente um seletor fixo A–D. Os JPGs testados responderam `200 image/jpeg`.

### Restrições operacionais

- O [`robots.txt`](https://www.comvest.unicamp.br/robots.txt) declara `User-agent: *` e `Disallow: /`. Portanto, um importador que rastreie o site sem anuência explícita não é recomendável.
- Nas respostas testadas de página, endpoints PHP e JPG não havia `Access-Control-Allow-Origin`. Uma aplicação hospedada em outro domínio não consegue buscar e armazenar esses recursos diretamente via `fetch`; referenciá-los remotamente também quebraria o requisito offline.
- Os endpoints retornam JSON com `Content-Type: text/html`, não têm versão ou documentação pública e podem responder `200` com um objeto de erro para parâmetros ausentes. Devem ser tratados como implementação instável, não como contrato.
- O PDF é uma fonte oficial mais estável e tem texto extraível, mas contém diagramação, imagens, tabelas e hifenização. Conversão automática exige validação visual por questão; o JPEG do simulador preserva a aparência, porém é pouco acessível e não separa enunciado de alternativas.

## Reprodução, atribuição e proveniência

A página oficial de [provas comentadas](https://www.comvest.unicamp.br/vestibulares-anteriores/1a-fase-2a-fase-comentadas/) autoriza reproduzir questões de vestibulares anteriores quando a licença não for exclusiva, a fonte for sempre citada no padrão “Comvest / Vestibular Unicamp xxxx (ano)” e a reprodução for **parcial, nunca a prova inteira**. Esse texto sustenta a amostra de 11 questões, não um pacote 72/72 nem coleta irrestrita.

Várias questões adaptam textos, fotografias, charges e obras de terceiros. A amostra deve registrar a fonte indicada em cada questão e preferir itens cujo material incorporado possa ser redistribuído com segurança; dúvidas específicas devem ser levadas ao [Fale Conosco](https://www.comvest.unicamp.br/fale-conosco/) ou a `vestibular@unicamp.br`. Para publicar a prova inteira, rastrear o site ou usar os endpoints em lote, solicitar autorização escrita que cubra aquisição automatizada, transformação, hospedagem e distribuição offline.

## Compatibilidade com o repositório

O formato lógico satisfaz `single-choice`: quatro alternativas e exatamente uma resposta. O [`questionSchema`](../../src/contracts/question.ts) também exige conteúdo textual ou arquivo para cada alternativa, e o [`QuestionCard`](../../src/app/QuestionCard.tsx) renderiza enunciado/mídia e alternativas separadamente. Por isso, o JSON image-first do simulador não pode ser copiado diretamente com fidelidade sem uma destas estratégias:

1. extrair texto e figuras do PDF, preservando as quatro alternativas como objetos separados; ou
2. recortar deterministicamente o JPEG em enunciado e alternativas, com revisão visual e texto acessível.

Não se recomenda inventar texto apenas para fazer o schema passar nem criar tratamento especial no frontend. A amostra pode usar `institutionId: unicamp`, `examId: vestibular-unicamp`, `editionId: vestibular-unicamp-2025-amostra` e números oficiais de questão como IDs de origem, preservando a regra global de IDs e evitando colisões com ENEM.

O [`OfflinePackageManager`](../../src/offline/package-manager.ts) já coleta URLs de mídia das questões, verifica pacote por tamanho/SHA-256 e armazena JSON e assets em Cache Storage. Assim, sob a autorização parcial acima e após a normalização, o pacote funcionará offline sem mudança arquitetural desde que todos os assets sejam publicados junto ao catálogo do projeto; URLs vivas da Comvest não devem permanecer no pacote.

## Riscos e decisão do piloto

| Risco | Nível | Mitigação mínima |
| --- | --- | --- |
| Exceder a autorização de reprodução parcial | Bloqueador | limitar a 11 questões, citar “Comvest / Vestibular Unicamp 2025” e pedir autorização para ampliar |
| Obras de terceiros dentro das questões | Alto | registrar fontes e selecionar/revisar cada item da amostra |
| `robots.txt` proíbe coleta automatizada | Bloqueador | obter anuência e uma forma de aquisição autorizada; não rastrear o site por padrão |
| Fonte image-first e acessibilidade | Alto | extração estruturada, revisão visual e texto alternativo significativo |
| Endpoints internos sem versão/CORS | Alto | coleta build-time opcional, fixtures e validação contra PDF/gabarito; nunca runtime |
| Mudanças de layout e cadernos equivalentes | Médio | fixar edição/caderno, registrar hashes e rejeitar divergências explicitamente |

**Go** para o pacote “Vestibular Unicamp 2025 — amostra”, com 11 questões revisadas (uma por disciplina), quatro alternativas e um gabarito por questão, atribuição visível, zero colisões de IDs, assets locais, schemas runtime aprovados e teste offline completo. **No-go** para um pacote 72/72, crawling ou importação em lote pelos endpoints sem autorização escrita adicional da Comvest.
