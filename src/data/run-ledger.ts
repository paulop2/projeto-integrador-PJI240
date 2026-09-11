import type { ArtifactRef, LedgerStage, RunLedger, Sha256, ToolchainComponent } from '../contracts/ingestion';
import { runLedgerSchema } from '../contracts/ingestion';
import type { JsonValue } from './artifact-store';
import { ArtifactStore, canonicalJson, sha256Text } from './artifact-store';

/**
 * Run-ledger recorder.
 *
 * It records the toolchain, normalized configuration, inputs and outputs of an
 * ingestion run and resolves each stage through a cache keyed by the inputs,
 * stage revision, configuration and tool versions. Repeating a run with the same
 * elements reuses prior outputs instead of recomputing or overwriting them.
 */

export interface StageCache {
  get(cacheKey: Sha256): Promise<readonly ArtifactRef[] | null>;
  set(cacheKey: Sha256, outputs: readonly ArtifactRef[]): Promise<void>;
}

export class MemoryStageCache implements StageCache {
  private readonly entries = new Map<string, readonly ArtifactRef[]>();

  async get(cacheKey: Sha256): Promise<readonly ArtifactRef[] | null> {
    return this.entries.get(cacheKey) ?? null;
  }

  async set(cacheKey: Sha256, outputs: readonly ArtifactRef[]): Promise<void> {
    if (!this.entries.has(cacheKey)) this.entries.set(cacheKey, [...outputs]);
  }
}

export interface RunLedgerStage {
  readonly id: string;
  readonly revision: string;
  readonly inputs?: readonly ArtifactRef[];
  readonly execute: () => Promise<readonly ArtifactRef[]>;
}

export interface RunLedgerOptions {
  readonly store: ArtifactStore;
  readonly cache: StageCache;
  readonly toolchain: readonly ToolchainComponent[];
  readonly config?: Readonly<Record<string, string | number | boolean | null>>;
  readonly inputs?: readonly ArtifactRef[];
}

export interface StageResult {
  readonly disposition: 'executed' | 'reused';
  readonly outputs: readonly ArtifactRef[];
}

export class RunLedgerRecorder {
  private readonly store: ArtifactStore;
  private readonly cache: StageCache;
  private readonly toolchain: readonly ToolchainComponent[];
  private readonly config: Readonly<Record<string, string | number | boolean | null>>;
  private readonly inputs: readonly ArtifactRef[];
  private readonly stages: LedgerStage[] = [];

  constructor(options: RunLedgerOptions) {
    if (options.toolchain.length === 0) {
      throw new Error('a run-ledger requires at least one toolchain component');
    }
    this.store = options.store;
    this.cache = options.cache;
    this.toolchain = options.toolchain;
    this.config = options.config ?? {};
    this.inputs = options.inputs ?? [];
  }

  async stage(spec: RunLedgerStage): Promise<StageResult> {
    if (this.stages.some(({ id }) => id === spec.id)) {
      throw new Error(`stage "${spec.id}" was already recorded in this run`);
    }

    const inputs = spec.inputs ?? this.inputs;
    const cacheKey = await this.stageCacheKey(spec, inputs);
    const cached = await this.cache.get(cacheKey);

    if (cached !== null) {
      const outputs = [...cached];
      this.stages.push({
        id: spec.id,
        revision: spec.revision,
        cacheKey,
        disposition: 'reused',
        inputs: [...inputs],
        outputs,
      });
      return { disposition: 'reused', outputs };
    }

    const outputs = [...(await spec.execute())];
    await this.cache.set(cacheKey, outputs);
    this.stages.push({
      id: spec.id,
      revision: spec.revision,
      cacheKey,
      disposition: 'executed',
      inputs: [...inputs],
      outputs,
    });
    return { disposition: 'executed', outputs };
  }

  /**
   * Builds the ledger, validates it against the contract and stores it as a
   * `run-ledger` artifact. `runId` is deterministic for equal inputs, configuration,
   * toolchain and stage revisions, independently of which stages hit the cache.
   */
  async finalize(): Promise<ArtifactRef> {
    const ledger = runLedgerSchema.parse({
      schemaVersion: 1,
      runId: await this.runId(),
      toolchain: this.sortedToolchain().map(({ name, version }) => ({ name, version })),
      config: { ...this.config },
      inputs: [...this.inputs],
      outputs: this.collectOutputs(),
      stages: this.stages.map((stage) => ({ ...stage, inputs: [...stage.inputs], outputs: [...stage.outputs] })),
    });

    const body = `${canonicalJson(ledger as unknown as JsonValue)}\n`;
    return this.store.put({
      kind: 'run-ledger',
      mediaType: 'application/json',
      bytes: new TextEncoder().encode(body),
    });
  }

  private sortedToolchain(): readonly ToolchainComponent[] {
    return [...this.toolchain].sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    );
  }

  private collectOutputs(): ArtifactRef[] {
    const seen = new Set<string>();
    const outputs: ArtifactRef[] = [];
    for (const stage of this.stages) {
      for (const ref of stage.outputs) {
        if (seen.has(ref.sha256)) continue;
        seen.add(ref.sha256);
        outputs.push(ref);
      }
    }
    return outputs;
  }

  private async stageCacheKey(
    spec: RunLedgerStage,
    inputs: readonly ArtifactRef[],
  ): Promise<Sha256> {
    return sha256Text(
      canonicalJson({
        schemaVersion: 1,
        stage: { id: spec.id, revision: spec.revision },
        toolchain: this.sortedToolchain().map(({ name, version }) => ({ name, version })),
        config: { ...this.config },
        inputs: inputs.map(({ sha256 }) => sha256).sort(),
      }),
    );
  }

  private async runId(): Promise<Sha256> {
    return sha256Text(
      canonicalJson({
        schemaVersion: 1,
        toolchain: this.sortedToolchain().map(({ name, version }) => ({ name, version })),
        config: { ...this.config },
        inputs: this.inputs.map(({ sha256 }) => sha256).sort(),
        stages: this.stages.map(({ id, revision, cacheKey }) => ({ id, revision, cacheKey })),
      }),
    );
  }
}
