# BLUEX e BLUEX-v2 como insumos para a pipeline Comvest/Fuvest

Pesquisa feita em 10/09/2026 para orientar a arquitetura da pipeline da [epic #2](https://github.com/paulop2/projeto-integrador-PJI240/issues/2). A análise usa os repositórios, datasets e artigos dos próprios autores, além das regras oficiais já levantadas para a Comvest.

## Resumo executivo

**BLUEX e BLUEX-v2 têm papéis diferentes.** O BLUEX publicado hoje no Hugging Face contém 1.422 questões objetivas de primeira fase da Unicamp e USP, de 2018 a 2025; o BLUEX-v2 contém 395 questões/919 subquestões dissertativas de segunda fase, de 2022 a 2025. O v2 está fora do formato de produto atual (`single-choice`), mas documenta uma pipeline muito próxima da que precisamos construir: manifesto de PDFs oficiais, extração híbrida de texto/imagem, OCR, segmentação heurística, revisão humana, deduplicação e enriquecimento posterior. [BLUEX Revisited, tabela 1](https://arxiv.org/html/2508.21294v1#S3.SS4), [BLUEX-v2, fontes e pipeline](https://arxiv.org/html/2606.22723v2#S3.SS2)

Recomendação: usar o BLUEX como **entrada de bootstrap, corpus de referência e conjunto de casos de teste**, nunca como fonte de verdade suficiente. A fonte canônica de cada questão deve continuar sendo o PDF e o gabarito oficiais, identificados por URL, hash e edição. BLUEX pode acelerar extração e comparação; divergências precisam abrir revisão humana, e não ser resolvidas automaticamente a favor do dataset.

## BLUEX: primeira fase objetiva

O artigo original descreve extração automática de enunciados, alternativas e imagens, seguida de correção e anotação manual. Ele cobre questões de múltipla escolha de Unicamp/Comvest e USP/Fuvest e registra nove disciplinas, interdisciplinaridade e seis capacidades cognitivas. [Artigo BLUEX, criação e metadados](https://arxiv.org/html/2307.05410v1#S3)

O dataset atual é a expansão “BLUEX Revisited”: 1.422 questões entre 2018 e 2025, 610 com imagens e 812 sem imagens. Por ano, os totais são 180 (2018–2020), 234 (2021) e 162 (2022–2025). As somas por área não são exclusivas porque uma questão pode ter mais de uma disciplina. A expansão também adicionou 2024–2025 e duas legendas em português para cada imagem: uma “blind”, gerada somente da imagem, e uma contextual, gerada com imagem e enunciado. [BLUEX Revisited, seleção e captioning](https://arxiv.org/html/2508.21294v1#S3.SS1), [estatísticas](https://arxiv.org/html/2508.21294v1#S3.SS4)

O esquema publicado no Hub contém:

```text
question, number, id, alternatives[], associated_images[], answer,
has_associated_images, alternatives_type, subject[],
TU, IU, MR, ML, BK, PRK, blind_captions[], context_captions[]
```

Há um único split `questions` com 1.422 linhas. As imagens ficam embutidas como strings e são referenciadas por marcadores `[IMAGE n]` no texto; `id` codifica universidade, ano e número, como `UNICAMP_2018_19` e `USP_2023_35`. [Metadata oficial do dataset](https://huggingface.co/api/datasets/portuguese-benchmark-datasets/BLUEX), [README e loader oficiais](https://github.com/Portuguese-Benchmark-Datasets/BLUEX)

### Limitações do BLUEX para o PJI240

- A estrutura é próxima do nosso `single-choice`, mas não traz `institutionId`, `examId`, `editionId`, proveniência por PDF/página, hash da origem, coordenadas de layout, confiança de OCR nem trilha de revisão. Esses dados precisam nascer na nossa camada intermediária, antes da normalização final. [Schema BLUEX](https://github.com/Portuguese-Benchmark-Datasets/BLUEX#collection-methodology)
- `associated_images` mistura asset e transporte, e `alternatives_type` admite alternativas-imagem; portanto não se deve mapear cegamente strings para o contrato final. Marcadores, ordem, mime type, dimensões e pertencimento ao enunciado/alternativa devem ser verificados contra a página renderizada. [Artigo BLUEX, image positioning e alternative type](https://arxiv.org/html/2307.05410v1#S3.SS2)
- O próprio artigo diz que houve correção manual de erros de extração. Isso torna BLUEX ótimo para montar fixtures e medir regressões, mas inadequado como prova de que um OCR/extrator novo está correto: ele não publica ground truth de caixas, páginas, transcrições antes/depois nem decisões de revisão. [Artigo BLUEX, criação](https://arxiv.org/html/2307.05410v1#S3.SS1)
- O README do repositório está defasado (1.260 questões, 2018–2024), enquanto o Hub e o artigo Revisited registram 1.422 e 2018–2025. A ingestão deve fixar revisão/commit e validar contagens, nunca depender apenas do texto do README. [README](https://github.com/Portuguese-Benchmark-Datasets/BLUEX/blob/main/README.md), [dataset atual](https://huggingface.co/api/datasets/portuguese-benchmark-datasets/BLUEX)

### Decisão de uso no projeto

Em 10/09/2026, o mantenedor informou que o BLUEX pode ser usado sob a licença Apache geral e retirou a licença do escopo desta análise. A pipeline pode, portanto, consumi-lo diretamente; ainda assim, deve fixar a revisão ou o hash do dataset para garantir reprodutibilidade.

O PDF e o gabarito oficiais permanecem como evidência canônica de correção. Para a Comvest, a autorização pública encontrada permite reprodução parcial, nunca da prova inteira, com atribuição no padrão “Comvest / Vestibular Unicamp xxxx”; isso continua orientando o pacote publicado pelo PJI240. [Regra oficial da Comvest](https://www.comvest.unicamp.br/vestibulares-anteriores/1a-fase-2a-fase-comentadas/)

## BLUEX-v2: segunda fase dissertativa

BLUEX-v2 cobre exclusivamente questões abertas da segunda fase de Comvest e Fuvest entre 2022 e 2025. São 395 questões, divididas em 919 subquestões, com respostas esperadas oficiais; 220 questões (55,7%) têm pelo menos uma imagem. O artigo informa 211 questões/499 subquestões da Unicamp e 184/420 da USP. Redações e duplicatas foram excluídas. [BLUEX-v2, escopo e estatísticas](https://arxiv.org/html/2606.22723v2#S3.SS1), [tabela 1](https://arxiv.org/html/2606.22723v2#S3.SS3)

Cada linha do Hub representa uma subquestão e contém `question_id`, universidade, ano, disciplina, `question_text`, comentários, seis flags cognitivas, imagens, captions, `id`, rótulo e texto da subquestão, `expected_answer` e `marking_criteria`. Isso é valioso para estudar ligação questão–subquestão, imagens compartilhadas e respostas oficiais, mas não deve entrar no produto atual enquanto questões dissertativas estiverem fora de escopo. [Dataset card oficial](https://huggingface.co/datasets/Tropic-AI/BLUEX-v2#dataset-structure)

### Pipeline publicada

O artigo descreve estas etapas:

1. baixar PDFs oficiais de prova e resposta por manifesto;
2. extrair texto e imagens com `pdfminer` + Azure Computer Vision OCR;
3. segmentar questões/subquestões por regex e parear prova/resposta por posição;
4. exportar JSON por universidade/ano;
5. revisar 470 candidatas com quatro anotadores em uma aplicação web, corrigindo OCR e segmentação, associando imagens, anotando capacidades e removendo duplicatas;
6. gerar captions contextuais com Gemini 3.1 Flash Lite Preview e classificar disciplina com Sabiá-4;
7. gerar critérios binários de correção a partir da resposta oficial com Sabiá-4 e publicar o dataset.

[BLUEX-v2, pipeline de coleta e processamento](https://arxiv.org/html/2606.22723v2#S3.SS2)

O repositório público, porém, **não contém a pipeline completa de PDF/OCR/segmentação nem a aplicação de validação**. A árvore traz apenas scripts de captioning e geração de rúbricas, além de inferência/avaliação e resultados. Logo, a alegação de “full reproducibility” do artigo não se traduz em código público suficiente para reconstruir o dataset desde os PDFs; essas etapas terão de ser implementadas ou solicitadas aos autores. [Árvore oficial do BLUEX-v2](https://api.github.com/repos/TropicAI-Research/BLUEXv2/git/trees/main?recursive=1), [README oficial](https://github.com/TropicAI-Research/BLUEXv2#dataset-pipeline-for-transparency)

O script público de captioning lê JSONs e assets já extraídos, envia imagem + enunciado + subquestões ao Gemini via OpenRouter e grava `caption_images`; o script de rúbricas usa Sabiá-4 via Maritaca, retries e escrita atômica/checkpoints. Eles são reaproveitáveis como referências de enriquecimento, não como extratores. [generate_captions.py](https://github.com/TropicAI-Research/BLUEXv2/blob/main/dataset_pipeline/generate_captions.py), [generate_marking_criteria.py](https://github.com/TropicAI-Research/BLUEXv2/blob/main/dataset_pipeline/generate_marking_criteria.py)

O projeto declara CC BY 4.0 para código e resultados no README, e o dataset card também declara CC BY 4.0; não há arquivo `LICENSE` no repositório. A declaração deve ser preservada com atribuição, mas os termos dos PDFs e conteúdos de terceiros ainda precisam de análise separada. [README/licença BLUEX-v2](https://github.com/TropicAI-Research/BLUEXv2#license), [dataset card/licença](https://huggingface.co/datasets/Tropic-AI/BLUEX-v2#license)

## Arquitetura recomendada para nossa pipeline

Separar aquisição, extração, revisão e publicação evita que um resultado corrigido manualmente pareça saída bruta reproduzível:

```text
manifesto de fontes oficiais
  -> aquisição imutável (PDF + SHA-256 + headers + timestamp)
  -> análise de páginas (texto nativo, imagens, renderização, coordenadas)
  -> OCR seletivo por região/página
  -> documento intermediário com evidências e confiança
  -> segmentação específica por banca/edição
  -> revisão humana lado a lado com a página original
  -> normalização para o contrato PJI240
  -> validação estrutural, semântica e visual
  -> pacote/manifesto offline versionado
```

Decisões importantes:

- **PDF oficial é a fonte; BLUEX é referência.** Guardar `sourceDocumentId`, URL, SHA-256, página e bounding boxes em cada fragmento. Comparar texto, alternativas, gabarito e assets com BLUEX, mas exigir revisão quando houver diferença.
- **OCR seletivo, não obrigatório para tudo.** Primeiro extrair camada textual e objetos do PDF; renderizar/OCR apenas páginas ou regiões sem texto confiável e imagens que contêm texto. Preservar tanto o asset original quanto a transcrição/descrição.
- **Modelo intermediário lossless.** Antes de produzir `Question`, manter tokens/blocos ordenados, coordenadas, página, método (`native-text`, `embedded-image`, `ocr`), confiança, alertas e histórico de correções. A normalização final não deve ser o único registro do processamento.
- **Adapters por banca e versão de layout.** Comvest primeiro, Fuvest depois, compartilhando aquisição/OCR/revisão; somente segmentação, numeração, gabarito e regras editoriais devem variar por adapter.
- **Human-in-the-loop como gate.** Revisar lado a lado enunciado, alternativas, ordem dos marcadores, fórmulas/tabelas, imagem, resposta e anulação. Registrar quem/o quê/quando mudou e impedir publicação com alertas críticos.
- **Validação em três níveis.** Estrutural (schema, quatro/cinco alternativas, uma resposta, IDs), documental (página/trecho e hash de origem) e visual (render normalizado versus recorte da página). BLUEX pode fornecer corpus de comparação, não o oracle exclusivo.
- **Fase 2 fora do pacote, dentro do desenho.** O modelo intermediário pode suportar questão–subquestões e resposta esperada desde já, inspirado no v2, enquanto o normalizador do MVP aceita somente primeira fase objetiva. Assim não se mistura escopo de produto com capacidade futura da pipeline.

## Experimentos iniciais sugeridos

1. Fixar uma prova Comvest de primeira fase e o gabarito oficial no manifesto, com hashes.
2. Selecionar uma amostra estratificada: texto simples, duas colunas, fórmula, tabela, uma imagem, alternativas-imagem e questão anulada.
3. Rodar dois caminhos independentes — extração nativa e renderização+OCR — e comparar ambos com página oficial e BLUEX.
4. Medir por campo: precisão de segmentação, texto exato após normalização, alternativa/gabarito, recall de assets, ordem dos marcadores e taxa de revisão manual.
5. Só então definir thresholds e automatizar o adapter Comvest; repetir o mesmo corpus de aceitação ao introduzir Fuvest.

## Inspeção local

Até esta pesquisa, nenhum arquivo ou diretório BLUEX/BLUEX-v2 apareceu dentro do workspace. A inspeção foi somente em leitura; nenhum dataset baixado pelo usuário foi movido ou alterado.
