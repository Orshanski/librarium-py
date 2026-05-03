import { MetadataCacheStore } from "./store";

export const metadataCache = new MetadataCacheStore();
export { MetadataCacheStore };
export { useCachedResource } from "./useCachedResource";
export type { CachedResourceOptions, CachedResourceResult } from "./useCachedResource";
