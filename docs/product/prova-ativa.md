# Política da prova ativa

Esta política define como o Maratona diferencia provas disponíveis, provas
armazenadas no dispositivo e a única prova usada pelo feed de estudo. Ela é a
referência de produto para implementar o catálogo com múltiplas edições sem
misturar questões.

As decisões abaixo entram em vigor quando forem aceitas explicitamente na
[issue #7](https://github.com/paulop2/projeto-integrador-PJI240/issues/7).
Mudanças posteriores devem ser decididas nessa issue ou em uma sub-issue que a
substitua antes de alterar a implementação.

## Termos e estados

Cada pacote representa uma edição de uma prova. O `packageId` identifica o
pacote nas ações de baixar, atualizar, selecionar e remover. O `editionId`
identifica a edição das questões no feed. Não se usa `examId` para escolher a
prova ativa, pois duas edições podem ter o mesmo exame.

Os estados não são mutuamente exclusivos:

| Estado exibido | Significado | Pode ser escolhida para estudo? |
| --- | --- | --- |
| **Disponível** | Consta no catálogo, mas não está instalada e íntegra no dispositivo. | Não. Primeiro deve ser baixada. |
| **Baixada** | Está instalada e passou pela validação de integridade. | Sim. |
| **Atualização disponível** | A versão instalada continua íntegra, mas o catálogo anuncia outra versão ou hash. | Sim. A versão instalada permanece utilizável até uma atualização completa. |
| **Ativa** | É a única edição cujas questões podem alimentar o feed. | Já está selecionada. |

Uma prova ativa também está **Baixada** ou com **Atualização disponível**. O
estado **Ativa** não substitui o estado de instalação. Todos os estados devem
ser indicados por texto; cor e posição podem apenas reforçar a informação.

## Invariantes

- No máximo uma prova fica ativa por vez.
- Somente um pacote instalado, íntegro e ainda conhecido localmente pode ficar
  ativo.
- O feed contém questões somente do `editionId` associado ao `packageId` ativo.
- O filtro de matéria atua dentro da edição ativa. Não existe a opção
  **Todas** para combinar provas.
- Baixar outra prova não troca uma seleção válida.
- Atualizar uma prova não troca a seleção. Se ela era ativa, continua ativa.
- Remover uma prova não apaga progresso nem sessões de estudo.
- Uma ação que falha não altera a prova ativa nem descarta um pacote íntegro já
  instalado.
- A remoção da prova ativa nunca ativa outra prova silenciosamente.

## Inicialização e restauração

Ao iniciar ou recarregar, inclusive offline, o aplicativo considera apenas os
pacotes cuja instalação local esteja íntegra e aplica esta ordem:

1. Se a seleção salva aponta para um pacote elegível, restaura essa prova como
   ativa.
2. Se a seleção salva não é elegível, limpa a referência obsoleta.
3. Se a prova ativa acabou de ser removida e ainda não houve nova escolha,
   mantém o estado **Escolha necessária**, mesmo que reste uma única prova. Essa
   condição precisa sobreviver a reload para que a remoção nunca cause uma
   troca implícita.
4. Sem essa condição especial, se existe exatamente uma prova instalada,
   ativa-a automaticamente e salva a escolha.
5. Se não existe prova instalada, não há prova ativa e o estudante vê o convite
   para baixar uma.
6. Se existem duas ou mais provas instaladas sem seleção válida, nenhuma fica
   ativa e o estudante precisa escolher.

A prova ativa e o estado **Escolha necessária** são preferências locais do
dispositivo. Eles não dependem de login nem de conexão.

## Transições

### Baixar

- O primeiro download bem-sucedido é ativado automaticamente quando não existe
  outra prova instalada nem uma remoção ativa aguardando escolha.
- Downloads seguintes permanecem apenas baixados. A prova ativa atual não muda.
- Se existem várias provas instaladas e nenhuma seleção válida, concluir outro
  download não escolhe por recência ou posição; o estudante continua obrigado
  a escolher.
- Offline, o download não começa. A prova continua **Disponível** e a interface
  explica que é necessário conectar-se.

### Escolher para estudar

- A ação **Estudar esta prova** existe somente para uma prova baixada e elegível.
- A escolha substitui atomicamente a seleção anterior, encerra o estado
  **Escolha necessária** e passa a filtrar o feed pela edição escolhida.
- Escolher a prova já ativa não produz nova transição.
- A escolha funciona offline quando o pacote está íntegro no dispositivo.

### Atualizar

- Uma atualização é uma substituição atômica: o novo pacote só substitui o
  anterior depois de baixar e validar todo o conteúdo.
- Durante a operação, a versão instalada continua sendo a referência do estado
  ativo.
- Em caso de sucesso, a prova preserva seu estado ativo ou não ativo.
- Em caso de falha, falta de espaço ou corrupção, a versão anterior íntegra e a
  seleção são preservadas. A interface mantém **Atualização disponível** e
  oferece nova tentativa.
- Offline, a versão instalada continua estudável e a atualização aguarda
  conexão.

### Remover

- A remoção exige confirmação explícita e identifica a prova pelo nome e ano.
- Remover uma prova não ativa não altera o feed nem a seleção.
- Remover a prova ativa limpa a seleção e entra em **Escolha necessária** se
  ainda houver provas baixadas. O feed não mostra conteúdo até uma escolha
  explícita.
- Se a prova ativa era a última baixada, a remoção leva ao estado sem downloads.
  Um futuro primeiro download volta a seguir a regra de ativação automática.
- A remoção funciona offline e não exclui respostas, sessões ou estatísticas.
- Se a remoção falhar, a prova e a seleção permanecem como estavam.

## Cenários de referência

| Situação | Resultado esperado |
| --- | --- |
| Nenhuma prova baixada | Nenhuma ativa; mostrar **Baixe uma prova para começar a estudar.** |
| Primeiro download concluído | Ativar a prova e mostrar **{prova} foi baixada e definida como prova ativa.** |
| Segunda prova baixada | Manter a ativa e mostrar **{prova} foi baixada. Sua prova ativa continua sendo {ativa}.** |
| Reload com seleção válida | Restaurar a mesma prova sem pedir nova escolha. |
| Reload offline com seleção válida | Restaurar a mesma prova a partir do armazenamento local. |
| Uma prova baixada, sem seleção e sem remoção anterior | Ativá-la automaticamente. |
| Várias provas baixadas, sem seleção válida | Não carregar feed; mostrar **Escolha uma prova baixada para continuar estudando.** |
| Escolha manual | Ativar somente a escolhida e mostrar **{prova} é sua prova ativa.** |
| Atualização da ativa concluída | Manter a seleção e mostrar **{prova} foi atualizada e continua ativa.** |
| Atualização falhou | Manter versão e seleção anteriores; mostrar erro com nova tentativa. |
| Remoção de prova não ativa | Manter o feed; mostrar **{prova} foi removida. Sua prova ativa continua sendo {ativa}.** |
| Remoção da prova ativa com outras baixadas | Limpar o feed e mostrar **{prova} foi removida. Escolha outra prova para continuar.** |
| Reload após remover a ativa | Preservar **Escolha necessária**; não ativar silenciosamente uma prova restante. |
| Remoção da última prova | Nenhuma ativa; mostrar o convite para baixar uma prova. |
| Ação de rede iniciada offline | Não alterar estados; explicar que baixar ou atualizar exige conexão. |

`{prova}` e `{ativa}` representam o rótulo legível fornecido pelo catálogo, por
exemplo **ENEM 2023**. IDs técnicos não aparecem nesses textos.

## Interação acessível

- A área tem título visível **Provas** e cada edição tem um título associado aos
  seus estados e ações.
- As ações usam os textos **Baixar**, **Atualizar**, **Remover do dispositivo** e
  **Estudar esta prova**. O nome da prova faz parte do nome acessível quando o
  contexto do cartão não for suficiente.
- Operações ocupadas afetam somente a prova acionada, expõem estado de
  processamento e não bloqueiam os controles das outras provas.
- Resultados bem-sucedidos são anunciados em uma região de status. Falhas usam
  alerta e informam a ação, a prova e uma próxima tentativa possível.
- Ao concluir download ou atualização, o foco permanece no controle acionado.
  Se esse controle mudar de função, o foco vai para o título da mesma prova.
- Ao cancelar uma remoção, o foco retorna ao botão que abriu a confirmação.
- Ao confirmar a remoção de uma prova não ativa, o foco vai para a próxima prova
  da lista ou, se não houver outra, para o título **Provas**.
- Ao confirmar a remoção da ativa, o foco vai para a mensagem que solicita nova
  escolha; a mensagem também é anunciada.
- Em uma carga normal, o aplicativo não rouba o foco para anunciar restauração
  ou ativação automática.
- Estado, foco e mensagens não dependem de animação. A ordem do teclado segue a
  ordem visual e todos os focos são visíveis.

## Responsabilidades das entregas seguintes

- A camada de catálogo expõe identidade e rótulos completos sem reconstruí-los
  a partir de IDs.
- O armazenamento persiste a seleção, restaura-a offline e distingue ausência
  inicial de seleção da escolha exigida após remoção.
- A área **Provas** materializa estados, ações, mensagens e foco desta política.
- O feed recebe somente as questões da edição ativa e aplica dentro dela o
  filtro de matéria.
- Testes usam ao menos duas edições do mesmo exame e demonstram todas as
  transições desta política, inclusive reload offline e falhas atômicas.

O modo de misturar questões de várias provas permanece fora do escopo.
