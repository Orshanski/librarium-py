import { client } from "../client";
import type { MetadataResult } from "@/components/metadata-search.types";

export type { MetadataResult };

export interface MetadataSearchResponse {
  results: MetadataResult[];
}

export function searchMetadata(
  q: string,
  providers?: string[],
  signal?: AbortSignal,
): Promise<MetadataSearchResponse> {
  const query: Record<string, unknown> = { q };
  if (providers && providers.length > 0) query.providers = providers.join(",");
  return client<MetadataSearchResponse>("GET", "/api/metadata/search", {
    query,
    signal,
  });
}

export function fetchCoverProxy(url: string, signal?: AbortSignal): Promise<Blob> {
  return client<Blob>("GET", "/api/metadata/cover-proxy", {
    query: { url },
    blob: true,
    signal,
  });
}

export function coverProxyUrl(url: string): string {
  return `/api/metadata/cover-proxy?url=${encodeURIComponent(url)}`;
}
