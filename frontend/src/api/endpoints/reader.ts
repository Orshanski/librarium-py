import { client } from "../client";

export interface ReaderSettingsResponse {
  settings: Record<string, unknown>;
}

export interface ReaderOkResponse {
  ok: true;
}

export interface ReadingProgressState {
  position: string | null;
  fraction: number | null;
  lastDevice: string | null;
  lastFormat: string | null;
  version: number;
  lastReadAt?: string | null;
}

export interface SaveProgressBody {
  position: string;
  lastDevice: string;
  lastFormat: string;
  fraction: number;
  expectedVersion: number;
}

export interface SaveProgressAcceptResponse {
  accepted: true;
  version: number;
  rebased?: boolean;
}

export interface SaveProgressRejectResponse {
  accepted: false;
  current: ReadingProgressState | null;
  retryExhausted?: boolean;
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
