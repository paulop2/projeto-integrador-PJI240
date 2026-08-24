import type { PackageDescriptor } from '../contracts';
import type { PackageCache } from './types';

const safeHash = (hash: string) => hash.slice('sha256:'.length, 'sha256:'.length + 12);
const cacheName = (descriptor: PackageDescriptor) => `maratona-package-${descriptor.id}-v${descriptor.version}-${safeHash(descriptor.sha256)}`;

export class BrowserPackageCache implements PackageCache {
  constructor(private readonly storage: CacheStorage = caches) {}

  async putPackage(descriptor: PackageDescriptor, response: Response) {
    const cache = await this.storage.open(cacheName(descriptor));
    await cache.put(descriptor.url, response);
  }

  async getPackage(descriptor: PackageDescriptor) {
    const cache = await this.storage.open(cacheName(descriptor));
    return (await cache.match(descriptor.url)) ?? null;
  }

  async deletePackage(descriptor: PackageDescriptor) {
    await this.storage.delete(cacheName(descriptor));
  }

  async putAsset(descriptor: PackageDescriptor, url: string, response: Response) {
    const cache = await this.storage.open(cacheName(descriptor));
    await cache.put(url, response);
  }
}

export class MemoryPackageCache implements PackageCache {
  readonly packages = new Map<string, Response>();
  readonly assets = new Map<string, Response>();
  async putPackage(descriptor: PackageDescriptor, response: Response) { this.packages.set(descriptor.sha256, response); }
  async getPackage(descriptor: PackageDescriptor) { return this.packages.get(descriptor.sha256)?.clone() ?? null; }
  async deletePackage(descriptor: PackageDescriptor) { this.packages.delete(descriptor.sha256); }
  async putAsset(_descriptor: PackageDescriptor, url: string, response: Response) { this.assets.set(url, response); }
}
