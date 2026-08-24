# Prompt: MVP "TikTok de Questões" — ENEM

Implemente um webapp PWA mobile-first de estudo para vestibular no estilo feed de scroll infinito vertical (tipo TikTok), onde cada "página" é uma questão do ENEM. Siga esta especificação à risca. Quando algo não estiver especificado, escolha a opção mais simples que funcione.

## Stack

- Vite + React 18 + TypeScript, mobile-first (viewport ~380-430px como alvo primário, mas funcional em desktop).
- Sem backend. Dados das questões servidos como JSON estático em `/public/data/`. Progresso do usuário em `localStorage`.
- Zustand para estado global (ou Context, se preferir manter zero deps além do essencial).
- CSS puro ou Tailwind — sua escolha. Dark mode como tema padrão e único.
- Estrutura preparada para deploy no Cloudflare Pages (build estático puro, sem SSR).

## Fonte de dados: script de seed

Crie um script Node standalone `scripts/seed.ts` (rodado com `tsx`, fora do bundle do app) que:

1. Consome a API pública `https://api.enem.dev/v1`:
   - `GET /exams` — lista os anos disponíveis.
   - `GET /exams/{year}/questions?limit=50&offset=N` — pagina as questões do ano (resposta tem `metadata: { limit, offset, total, hasMore }`).
2. Baixa TODOS os anos disponíveis, respeitando rate limit: máximo ~1 request/segundo, com retry exponencial em 429/5xx.
3. Salva um arquivo por ano em `public/data/enem-{year}.json` e um `public/data/index.json` com o manifesto (anos disponíveis, contagem de questões por ano e por disciplina).
4. É idempotente: se `enem-{year}.json` já existe, pula o ano (flag `--force` para rebaixar).
5. Normaliza cada questão para este shape:

```ts
interface Question {
  id: string;              // `enem-{year}-{index}` (+ sufixo de língua se houver)
  year: number;
  index: number;
  discipline: 'linguagens' | 'ciencias-humanas' | 'ciencias-natureza' | 'matematica';
  language: 'ingles' | 'espanhol' | null;
  context: string | null;             // enunciado/texto-base, markdown
  files: string[];                    // URLs de imagens do enunciado
  alternativesIntroduction: string | null;
  alternatives: {
    letter: 'A' | 'B' | 'C' | 'D' | 'E';
    text: string | null;
    file: string | null;              // alternativa pode ser imagem
  }[];
  correctAlternative: 'A' | 'B' | 'C' | 'D' | 'E';
}
```

Importante: NÃO envie `correctAlternative` visível na UI antes da resposta, mas tudo fica no mesmo JSON (é um app de estudo, não uma prova — não precisa esconder do devtools).

Descarte questões inválidas/anuladas (sem `correctAlternative` ou sem alternativas) e logue quantas foram descartadas por ano.

## O Feed (tela principal)

- Scroll vertical com snap obrigatório por questão: container com `scroll-snap-type: y mandatory`, cada card `scroll-snap-align: start` e `height: 100dvh` (usar `dvh`, não `vh`, por causa da barra de URL mobile).
- Virtualização simples: renderizar apenas questão atual ± 2 vizinhas (não use lib pesada; um windowing manual sobre a lista embaralhada resolve).
- A ordem do feed é um shuffle das questões que passam nos filtros ativos, com seed persistida na sessão para o scroll para trás funcionar.
- Detectar questão ativa com `IntersectionObserver` (threshold ~0.6).
- Carregamento incremental dos JSONs por ano conforme necessário (lazy), não tudo no boot.

### Card de questão

Layout vertical, nesta ordem:
1. Badge pequeno: ano + disciplina (ex: "ENEM 2022 · Matemática").
2. `context` renderizado como markdown (usar `react-markdown`), imagens de `files` renderizadas inline com `loading="lazy"` e largura máxima 100%.
3. `alternativesIntroduction` se existir.
4. Lista de 5 alternativas como botões grandes (área de toque mínima 48px), letra em destaque à esquerda. Alternativas com `file` renderizam a imagem.
5. Enunciados longos: o card tem scroll interno (overflow-y no corpo do card), mas o snap do feed continua funcionando — cuidado com o conflito de gestos: o scroll interno só "vaza" para o feed quando chega ao fim (comportamento nativo de `overscroll-behavior: contain` no corpo do card NÃO deve travar a navegação; teste isso).

### Interação de resposta

- Ao tocar numa alternativa: trava as opções, pinta a escolhida de verde (acerto) ou vermelho (erro), e sempre destaca a correta em verde.
- Feedback háptico leve se disponível (`navigator.vibrate(10)`).
- Após responder, mostrar um hint sutil "arraste para a próxima ↓".
- Questão já respondida em sessão anterior: ao reaparecer no feed, mostra estado neutro de novo (repetição é desejável), mas o tracker não conta "vista" duas vezes no mesmo dia.

## Barra superior minimalista

Fixa no topo, translúcida (backdrop-blur), altura ~48px, contendo apenas:
- Esquerda: timer da questão atual, contando PARA CIMA a partir de 0 (formato m:ss), resetado quando a questão ativa muda. Congela ao responder — esse valor congelado é o `timeSpentMs` registrado.
- Direita: contador da sessão no formato `✓ 12 · ✗ 5` e um ícone que abre a tela de stats.
- Sem logo, sem menu hamburger, nada mais.

## Tracker / Stats

Persistir em `localStorage` (chave `study-tracker-v1`), com este shape:

```ts
interface Attempt {
  questionId: string;
  selected: string;
  correct: boolean;
  timeSpentMs: number;
  ts: number; // epoch ms
}
```

Tela de stats (rota/overlay separado) mostrando:
- Total de questões vistas, respondidas, acertos, erros, taxa de acerto.
- Breakdown por disciplina (acertos/total, %).
- Tempo médio por questão.
- Streak de dias consecutivos com pelo menos 1 questão respondida.
- Botão "resetar progresso" com confirmação.

Escrever no `localStorage` com debounce e proteção contra quota cheia (try/catch, degradar sem quebrar o app).

## Filtros

Bottom sheet simples acessível por um botão flutuante discreto:
- Filtro por disciplina (multi-select) e por intervalo de anos.
- Para questões de linguagens com `language`, um toggle inglês/espanhol (padrão: inglês).
- Mudar filtro re-embaralha o feed.

## PWA

- `manifest.json` (nome, ícone placeholder, display standalone, orientação portrait).
- Service worker básico (Workbox ou manual): cache-first para os JSONs de questões e imagens já vistas, permitindo revisar offline o que já foi carregado.

## Qualidade

- README com: como rodar o seed, rodar em dev, e deployar no Cloudflare Pages.
- Sem `any` no TypeScript. Validar o shape dos JSONs no seed (zod ou validação manual).
- Componentes: `Feed`, `QuestionCard`, `TopBar`, `StatsScreen`, `FilterSheet` — mantenha cada um pequeno.
- Teste manual obrigatório antes de concluir: rode o seed para pelo menos 2 anos, suba o dev server e verifique o snap do scroll, o reset do timer e a persistência do tracker após reload.

## Fora de escopo (NÃO implementar agora)

Auth, sync entre dispositivos, backend, questões Fuvest/Comvest, repetição espaçada, explicações/resoluções das questões, light mode.
