import {
  catalogManifestSchema,
  questionPackageSchema,
  type CatalogManifest,
  type DownloadedPackage,
  type PackageDescriptor,
  type Question,
} from '../contracts';
import type { OfflineStorage, PackageCache, PackageListing } from './types';
import { requestPersistentStorage } from './capacity';
import { invokeFetch, type Fetcher } from './fetcher';

const digest = async (bytes: ArrayBuffer) => {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const packageAssets = (descriptor: PackageDescriptor, questions: Question[]) => {
  const values = questions.flatMap((question) => [
    ...question.files,
    ...question.alternatives.flatMap((alternative) => alternative.file ? [alternative.file] : []),
  ]);
  const base = new URL(descriptor.url, globalThis.location?.origin ?? 'http://localhost');
  return [...new Set(values.map((value) => new URL(value, base).toString()))];
};

const oldDescriptor = (descriptor: PackageDescriptor, download: DownloadedPackage): PackageDescriptor => ({
  ...descriptor,
  version: download.version,
  sha256: download.sha256,
  byteSize: download.byteSize,
});

export class OfflinePackageManager {
  constructor(
    private readonly storage: OfflineStorage,
    private readonly cache: PackageCache,
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now,
    private readonly capacity: () => Promise<{ available: number | null }> = requestPersistentStorage,
  ) {}

  async refreshCatalog(url = '/data/manifest.json') {
    const response = await invokeFetch(this.fetcher, url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    const manifest = catalogManifestSchema.parse(await response.json());
    await this.storage.putCatalog(manifest);
    return manifest;
  }

  async getCatalog(preferNetwork = true): Promise<CatalogManifest | null> {
    if (preferNetwork) {
      try { return await this.refreshCatalog(); } catch { /* offline: use the last validated catalog */ }
    }
    return this.storage.getCatalog();
  }

  async list(preferNetwork = true): Promise<PackageListing[]> {
    const catalog = await this.getCatalog(preferNetwork);
    if (!catalog) return [];
    const downloads = new Map((await this.storage.listDownloads()).map((item) => [item.packageId, item]));
    return catalog.packages.map((descriptor) => {
      const download = downloads.get(descriptor.id) ?? null;
      const changed = download !== null && (download.version !== descriptor.version || download.sha256 !== descriptor.sha256);
      return { descriptor, download, state: !download ? 'available' : changed ? 'update-available' : 'downloaded' };
    });
  }

  async install(packageId: string) {
    const catalog = await this.getCatalog(false);
    const descriptor = catalog?.packages.find(({ id }) => id === packageId);
    if (!descriptor) throw new Error(`Unknown package: ${packageId}`);
    const previous = await this.storage.getDownload(packageId);
    if (previous && previous.version === descriptor.version && previous.sha256 === descriptor.sha256) return previous;
    const { available } = await this.capacity();
    if (available !== null && available < descriptor.byteSize) throw new Error(`Not enough storage space for package ${packageId}`);

    const response = await invokeFetch(this.fetcher, descriptor.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Package request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== descriptor.byteSize) throw new Error(`Package ${packageId} has an unexpected byte size`);
    if (await digest(bytes) !== descriptor.sha256) throw new Error(`Package ${packageId} failed its integrity check`);
    const parsed = questionPackageSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (parsed.packageId !== descriptor.id || parsed.institutionId !== descriptor.institutionId || parsed.examId !== descriptor.examId || parsed.editionId !== descriptor.editionId) {
      throw new Error(`Package ${packageId} does not match its descriptor`);
    }

    try {
      await this.cache.putPackage(descriptor, new Response(bytes, { headers: { 'content-type': 'application/json' } }));
      for (const url of packageAssets(descriptor, parsed.questions)) {
        const asset = await invokeFetch(this.fetcher, url, { cache: 'no-store' });
        if (!asset.ok) throw new Error(`Asset request failed (${asset.status}): ${url}`);
        await this.cache.putAsset(descriptor, url, asset.clone());
      }
    } catch (error) {
      await this.cache.deletePackage(descriptor);
      throw error;
    }

    const timestamp = this.now();
    const download: DownloadedPackage = { packageId, version: descriptor.version, sha256: descriptor.sha256, byteSize: descriptor.byteSize, downloadedAt: timestamp, lastVerifiedAt: timestamp };
    await this.storage.putDownload(download);
    if (previous) await this.cache.deletePackage(oldDescriptor(descriptor, previous));
    return download;
  }

  async remove(packageId: string) {
    const catalog = await this.getCatalog(false);
    const descriptor = catalog?.packages.find(({ id }) => id === packageId);
    const download = await this.storage.getDownload(packageId);
    if (descriptor && download) await this.cache.deletePackage(oldDescriptor(descriptor, download));
    await this.storage.deleteDownload(packageId);
  }

  async loadQuestions(): Promise<Question[]> {
    const catalog = await this.getCatalog(false);
    if (!catalog) return [];
    const downloads = new Map((await this.storage.listDownloads()).map((item) => [item.packageId, item]));
    const questions: Question[] = [];
    for (const current of catalog.packages) {
      const download = downloads.get(current.id);
      if (!download) continue;
      const descriptor = oldDescriptor(current, download);
      const response = await this.cache.getPackage(descriptor);
      if (!response) continue;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== download.byteSize || await digest(bytes) !== download.sha256) continue;
      const parsed = questionPackageSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      if (parsed.success) {
        questions.push(...parsed.data.questions);
        await this.storage.putDownload({ ...download, lastVerifiedAt: this.now() });
      }
    }
    return questions;
  }
}
