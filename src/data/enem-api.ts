import { z } from 'zod';

const nullableContentSchema = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null);

export const enemAlternativeSchema = z.object({
  letter: z.string().trim().min(1),
  text: nullableContentSchema,
  file: nullableContentSchema,
  isCorrect: z.boolean(),
});

export const enemApiQuestionSchema = z.object({
  title: z.string().trim().min(1),
  index: z.number().int().positive(),
  discipline: z.string().trim().min(1),
  language: z.string().trim().min(1).nullable().optional(),
  year: z.number().int().min(1998).max(3000),
  context: nullableContentSchema,
  files: z.array(z.string().trim().min(1)),
  correctAlternative: z.string().trim().min(1),
  alternativesIntroduction: nullableContentSchema,
  alternatives: z.array(enemAlternativeSchema).min(2),
});

export const enemQuestionsPageSchema = z.object({
  metadata: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
  questions: z.array(enemApiQuestionSchema),
});

export type EnemApiQuestion = z.infer<typeof enemApiQuestionSchema>;

export interface EnemApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
  maxRetries?: number;
  initialRetryMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const retryAfterMs = (response: Response): number | null => {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;

  const milliseconds = Number(raw);
  if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds;

  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
};

export class EnemApiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (delayMs: number) => Promise<void>;
  readonly #now: () => number;
  readonly #minIntervalMs: number;
  readonly #maxRetries: number;
  readonly #initialRetryMs: number;
  #lastRequestAt: number | null = null;

  constructor(options: EnemApiClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? 'https://api.enem.dev/v1').replace(/\/$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
    this.#now = options.now ?? Date.now;
    this.#minIntervalMs = options.minIntervalMs ?? 1_050;
    this.#maxRetries = options.maxRetries ?? 4;
    this.#initialRetryMs = options.initialRetryMs ?? 1_000;
  }

  async #throttle(): Promise<void> {
    if (this.#lastRequestAt !== null) {
      const remaining = this.#minIntervalMs - (this.#now() - this.#lastRequestAt);
      if (remaining > 0) await this.#sleep(remaining);
    }
    this.#lastRequestAt = this.#now();
  }

  async #request(url: URL): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      await this.#throttle();
      let response: Response;
      try {
        response = await this.#fetch(url, {
          headers: { accept: 'application/json' },
        });
      } catch (error) {
        if (attempt >= this.#maxRetries) throw error;
        await this.#sleep(this.#initialRetryMs * 2 ** attempt++);
        continue;
      }

      if (response.ok) return response.json();

      if (!RETRYABLE_STATUS.has(response.status) || attempt >= this.#maxRetries) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`enem.dev returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }

      const delay = retryAfterMs(response) ?? this.#initialRetryMs * 2 ** attempt;
      attempt += 1;
      await this.#sleep(delay);
    }
  }

  async getQuestion(year: number, index: number, language?: string | null): Promise<EnemApiQuestion> {
    const url = new URL(`${this.#baseUrl}/exams/${year}/questions/${index}`);
    if (language) url.searchParams.set('language', language);
    return enemApiQuestionSchema.parse(await this.#request(url));
  }

  async listQuestions(year: number, pageSize = 50): Promise<EnemApiQuestion[]> {
    if (!Number.isInteger(year) || year < 1998 || year > 3000) {
      throw new Error('year must be an integer between 1998 and 3000');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new Error('pageSize must be a positive integer');
    }

    const questions: EnemApiQuestion[] = [];
    const indexes = new Set<number>();
    let offset = 0;

    for (;;) {
      const url = new URL(`${this.#baseUrl}/exams/${year}/questions`);
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('offset', String(offset));
      const page = enemQuestionsPageSchema.parse(await this.#request(url));

      if (page.metadata.offset !== offset) {
        throw new Error(`enem.dev returned offset ${page.metadata.offset}; expected ${offset}`);
      }
      for (const listedQuestion of page.questions) {
        const question = listedQuestion.alternatives.some(
          ({ text, file }) => text === null && file === null,
        )
          ? await this.getQuestion(year, listedQuestion.index, listedQuestion.language)
          : listedQuestion;
        if (indexes.has(question.index)) {
          throw new Error(`enem.dev returned duplicate question index ${question.index}`);
        }
        indexes.add(question.index);
        questions.push(question);
      }

      if (!page.metadata.hasMore) break;
      if (page.questions.length === 0) {
        throw new Error('enem.dev pagination reported hasMore without returning questions');
      }
      // enem.dev treats offset as the first source question number (inclusive),
      // rather than as a conventional count of rows already consumed.
      offset = Math.max(...page.questions.map(({ index }) => index)) + 1;
    }

    return questions;
  }
}
