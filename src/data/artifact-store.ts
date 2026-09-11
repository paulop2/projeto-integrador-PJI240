import type { ArtifactKind, ArtifactRef, Sha256 } from '../contracts/ingestion';
import { artifactRefSchema } from '../contracts/ingestion';

/**
 * Content-addressed artifact store.
 *
 * The store writes every artifact at a path derived from the SHA-256 of its bytes
 * and never overwrites an existing artifact. Storage is behind a small port so the
 * build-time pipeline can use the filesystem while tests and the browser can use an
 * in-memory implementation. Only Web Crypto is used, so the core stays isomorphic.
 */

export interface ArtifactStorage {
  has(uri: string): Promise<boolean>;
  read(uri: string): Promise<Uint8Array | null>;
  /**
   * Writes a new artifact. Implementations must never replace existing bytes;
   * they should fail when the URI already exists.
   */
  write(uri: string, bytes: Uint8Array): Promise<void>;
}

export interface PutArtifactInput {
  readonly kind: ArtifactKind;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export class ArtifactIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactIntegrityError';
  }
}

export class ArtifactConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactConflictError';
  }
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const HEX = '0123456789abcdef';

const toHex = (bytes: Uint8Array): string => {
  let hex = '';
  for (const byte of bytes) hex += HEX.charAt(byte >> 4) + HEX.charAt(byte & 0x0f);
  return hex;
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

export const sha256Bytes = async (bytes: Uint8Array): Promise<Sha256> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return `sha256:${toHex(new Uint8Array(digest))}`;
};

export const sha256Text = (text: string): Promise<Sha256> =>
  sha256Bytes(new TextEncoder().encode(text));

export const sha256Hex = (sha256: Sha256): string => sha256.slice('sha256:'.length);

export const artifactUriFor = (sha256: Sha256): string => {
  const hex = sha256Hex(sha256);
  return `sha256/${hex.slice(0, 2)}/${hex}`;
};

const sortJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === 'object') {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as { [key: string]: JsonValue })[key];
      if (entry !== undefined) sorted[key] = sortJsonValue(entry);
    }
    return sorted;
  }
  return value;
};

/**
 * Serializes a JSON value with sorted object keys so equal inputs always hash to
 * the same digest. Array order is preserved because it is meaningful.
 */
export const canonicalJson = (value: JsonValue): string => JSON.stringify(sortJsonValue(value));

export class MemoryArtifactStorage implements ArtifactStorage {
  private readonly files = new Map<string, Uint8Array>();
  readonly writes: string[] = [];

  async has(uri: string): Promise<boolean> {
    return this.files.has(uri);
  }

  async read(uri: string): Promise<Uint8Array | null> {
    const value = this.files.get(uri);
    return value === undefined ? null : value.slice();
  }

  async write(uri: string, bytes: Uint8Array): Promise<void> {
    if (this.files.has(uri)) throw new Error(`artifact already exists: ${uri}`);
    this.writes.push(uri);
    this.files.set(uri, bytes.slice());
  }

  get size(): number {
    return this.files.size;
  }
}

export class ArtifactStore {
  constructor(private readonly storage: ArtifactStorage) {}

  /**
   * Stores bytes and returns a content-addressed reference. Storing the same bytes
   * twice returns the same reference and leaves the original artifact untouched.
   */
  async put(input: PutArtifactInput): Promise<ArtifactRef> {
    const { kind, mediaType, bytes } = input;
    const sha256 = await sha256Bytes(bytes);
    const uri = artifactUriFor(sha256);
    const ref = artifactRefSchema.parse({
      kind,
      sha256,
      uri,
      byteSize: bytes.byteLength,
      mediaType,
    });

    if (await this.storage.has(uri)) {
      await this.assertStoredBytes(uri, bytes, sha256);
      return ref;
    }

    try {
      await this.storage.write(uri, bytes.slice());
    } catch (error) {
      if (await this.storage.has(uri)) {
        await this.assertStoredBytes(uri, bytes, sha256);
        return ref;
      }
      throw error;
    }

    return ref;
  }

  /**
   * Reads an artifact and re-hashes it, so a corrupted or replaced file is rejected
   * instead of being returned silently.
   */
  async read(ref: Pick<ArtifactRef, 'uri' | 'sha256'>): Promise<Uint8Array | null> {
    const bytes = await this.storage.read(ref.uri);
    if (bytes === null) return null;
    if ((await sha256Bytes(bytes)) !== ref.sha256) {
      throw new ArtifactIntegrityError(
        `artifact ${ref.uri} does not match its content address ${ref.sha256}`,
      );
    }
    return bytes;
  }

  async has(sha256: Sha256): Promise<boolean> {
    return this.storage.has(artifactUriFor(sha256));
  }

  private async assertStoredBytes(
    uri: string,
    bytes: Uint8Array,
    sha256: Sha256,
  ): Promise<void> {
    const existing = await this.storage.read(uri);
    if (existing === null) {
      throw new ArtifactIntegrityError(`artifact ${uri} disappeared before it could be reused`);
    }
    if (!bytesEqual(existing, bytes)) {
      throw new ArtifactConflictError(
        `artifact ${sha256} already exists at ${uri} with different bytes`,
      );
    }
  }
}
