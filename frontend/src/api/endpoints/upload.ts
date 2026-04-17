import { client } from "../client";

export interface UploadMetadata {
  title: string;
  authors: string;
  series: string;
  seriesNumber: string;
  description: string;
  language: string;
  tags: string;
  publisher: string;
  pubDate: string;
  isbn: string;
  coverUrl?: string | null;
}

export interface UploadDuplicate {
  id: number;
  title: string;
  authors: string;
  [key: string]: unknown; // backend sends more fields; permit unknown
}

export interface UploadResponse {
  tempId: string;
  format: string;
  metadata: UploadMetadata;
  duplicate: UploadDuplicate | null;
}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface DeleteTempResponse {
  ok: true;
}

export interface CreateBookResponse {
  bookId: number;
}

export function uploadTempFile(
  file: File,
  opts: UploadOptions = {},
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        const pct = Math.min(Math.round((e.loaded / e.total) * 100), 99);
        opts.onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        let detail = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string };
          if (body.detail) detail = body.detail;
        } catch {
          // keep default detail
        }
        reject(new Error(detail));
      }
    };

    xhr.onerror = () => reject(new Error("Ошибка сети"));
    xhr.onabort = () => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export function deleteTempUpload(tempId: string): Promise<DeleteTempResponse> {
  return client<DeleteTempResponse>("DELETE", `/api/uploads/${tempId}`);
}

export function createBookFromUpload(
  tempId: string,
  metadata: UploadMetadata,
): Promise<CreateBookResponse> {
  return client<CreateBookResponse>("POST", "/api/books/create", {
    body: { tempId, metadata },
  });
}
