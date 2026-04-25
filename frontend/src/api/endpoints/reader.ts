import { client } from "../client";

export interface ReaderSettingsResponse {
  settings: Record<string, unknown>;
}

export interface ReaderOkResponse {
  ok: true;
}

// /api/reader wire is snake_case — endpoint not migrated by pbz2.
export interface ReadingProgressState {
  position: string | null;
  fraction: number | null;
  last_device: string | null;
  last_format: string | null;
  version: number;
  last_read_at?: string | null;
}

export interface SaveProgressBody {
  position: string;
  last_device: string;
  last_format: string;
  fraction: number;
  expected_version: number;
}

export interface SaveProgressAcceptResponse {
  accepted: true;
  version: number;
  rebased?: boolean;
}

export interface SaveProgressRejectResponse {
  accepted: false;
  current: ReadingProgressState | null;
  retry_exhausted?: boolean;
}

export type SaveProgressResponse = SaveProgressAcceptResponse | SaveProgressRejectResponse;

export interface SaveProgressOptions {
  keepalive?: boolean;
  signal?: AbortSignal;
}

export function getSettings(signal?: AbortSignal): Promise<ReaderSettingsResponse> {
  return client<ReaderSettingsResponse>("GET", "/api/reader/settings", { signal });
}

export function saveSettings(settings: Record<string, unknown>): Promise<ReaderOkResponse> {
  return client<ReaderOkResponse>("PUT", "/api/reader/settings", { body: { settings } });
}

export function getProgress(id: number, signal?: AbortSignal): Promise<ReadingProgressState> {
  return client<ReadingProgressState>("GET", `/api/reader/progress/${id}`, { signal });
}

export function saveProgress(
  id: number,
  body: SaveProgressBody,
  opts: SaveProgressOptions = {},
): Promise<SaveProgressResponse> {
  return client<SaveProgressResponse>("PUT", `/api/reader/progress/${id}`, {
    body,
    keepalive: opts.keepalive,
    signal: opts.signal,
  });
}
