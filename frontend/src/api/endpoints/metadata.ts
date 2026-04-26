import { client, type ClientQuery } from "../client";

export interface MetadataResult {
  title: string;
  authors: string;
  description: string;
  publisher: string;
  pubDate: string;
  isbn: string;
  tags: string;
  source: string;
  coverUrl: string;
}

export interface MetadataSearchResponse {
  results: MetadataResult[];
}

export function searchMetadata(
  q: string,
  providers?: string[],
  signal?: AbortSignal,
): Promise<MetadataSearchResponse> {
  const query: ClientQuery = { q };
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
  const params = new URLSearchParams({ url });
  return `/api/metadata/cover-proxy?${params.toString()}`;
}
