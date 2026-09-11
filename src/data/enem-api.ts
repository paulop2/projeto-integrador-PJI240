import { z } from 'zod';

import { foreignLanguageSchema, type ForeignLanguage } from '../contracts/question';

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
  language: foreignLanguageSchema.nullable().optional(),
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

export const enemExamSchema = z.object({
  title: z.string().trim().min(1),
  year: z.number().int().min(1998).max(3000),
  disciplines: z.array(
    z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }),
  ),
  languages: z.array(
    z.object({ label: z.string().trim().min(1), value: foreignLanguageSchema }),
  ),
});

export const enemExamsResponseSchema = z.array(enemExamSchema);

export type EnemApiQuestion = z.infer<typeof enemApiQuestionSchema>;

export type EnemExam = z.infer<typeof enemExamSchema>;

export interface EnemMissingLanguageVariant {
  readonly index: number;
  readonly language: ForeignLanguage;
}

export interface EnemEditionListing {
  readonly questions: readonly EnemApiQuestion[];
  readonly missingLanguageVariants: readonly EnemMissingLanguageVariant[];
}

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

  async #request(url: URL, options: { allowNotFound?: boolean } = {}): Promise<unknown | null> {
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

      if (options.allowNotFound && response.status === 404) return null;

      if (!RETRYABLE_STATUS.has(response.status) || attempt >= this.#maxRetries) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`enem.dev returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }

      const delay = retryAfterMs(response) ?? this.#initialRetryMs * 2 ** attempt;
      attempt += 1;
      await this.#sleep(delay);
    }
  }

  async listExams(): Promise<EnemExam[]> {
    const exams = enemExamsResponseSchema.parse(await this.#request(new URL(`${this.#baseUrl}/exams`)));
    return [...exams].sort((left, right) => left.year - right.year);
  }

  async getQuestionOrNull(
    year: number,
    index: number,
    language?: string | null,
  ): Promise<EnemApiQuestion | null> {
    const url = new URL(`${this.#baseUrl}/exams/${year}/questions/${index}`);
    if (language) url.searchParams.set('language', language);
    const payload = await this.#request(url, { allowNotFound: true });
    if (payload === null) return null;
    const question = enemApiQuestionSchema.parse(payload);
    if (question.year !== year || question.index !== index || (language && question.language !== language)) {
      throw new Error(`enem.dev returned a question that does not match ${year}/${index}${language ? `/${language}` : ''}`);
    }
    return question;
  }

  async getQuestion(year: number, index: number, language?: string | null): Promise<EnemApiQuestion> {
    const question = await this.getQuestionOrNull(year, index, language);
    if (question === null) {
      throw new Error(`enem.dev has no ${year}/${index}${language ? `/${language}` : ''}`);
    }
    return question;
  }

  async listQuestions(year: number, pageSize = 50): Promise<EnemApiQuestion[]> {
    if (!Number.isInteger(year) || year < 1998 || year > 3000) {
      throw new Error('year must be an integer between 1998 and 3000');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new Error('pageSize must be a positive integer');
    }

    const questions: EnemApiQuestion[] = [];
    const byIndex = new Map<number, EnemApiQuestion>();
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
        const previous = byIndex.get(question.index);
        if (previous !== undefined) {
          // Some editions repeat an identical row in the listing (e.g. ENEM
          // 2011). Repeating the same record is harmless; two divergent records
          // for the same index are ambiguous and abort the edition.
          if (JSON.stringify(previous) !== JSON.stringify(question)) {
            throw new Error(`enem.dev returned conflicting duplicates for question index ${question.index}`);
          }
          continue;
        }
        byIndex.set(question.index, question);
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

  /**
   * Loads every listed question plus both official language variants for the
   * positions that declare a foreign language. A variant the source does not
   * serve (HTTP 404) is reported instead of aborting the whole edition.
   */
  async listEdition(year: number, pageSize = 50): Promise<EnemEditionListing> {
    const listed = await this.listQuestions(year, pageSize);
    const languageIndexes = [...new Set(
      listed.filter(({ language }) => language !== null && language !== undefined).map(({ index }) => index),
    )].sort((left, right) => left - right);
    const languages: readonly ForeignLanguage[] = foreignLanguageSchema.options;
    const variants: EnemApiQuestion[] = [];
    const missingLanguageVariants: EnemMissingLanguageVariant[] = [];

    for (const index of languageIndexes) {
      for (const language of languages) {
        const question = await this.getQuestionOrNull(year, index, language);
        if (question === null) missingLanguageVariants.push({ index, language });
        else variants.push(question);
      }
    }

    const common = listed.filter(({ language }) => language === null || language === undefined);
    return { questions: [...variants, ...common], missingLanguageVariants };
  }

  async listQuestionsWithLanguageVariants(year: number, pageSize = 50): Promise<EnemApiQuestion[]> {
    return [...(await this.listEdition(year, pageSize)).questions];
  }
}
