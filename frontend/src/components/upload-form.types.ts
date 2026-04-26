import type { UploadDuplicate, UploadMetadata } from "@/api/endpoints/upload";

export type UploadDuplicateAction = "add-format" | "new-book";

export interface UploadEntry {
  id: string;
  tempId: string;
  name: string;
  size: string;
  format: string;
  progress: number;
  status: "uploading" | "ready" | "error";
  error?: string;
}

export interface BookGroup {
  key: string;
  metadata: UploadMetadata;
  files: UploadEntry[];
  duplicate: UploadDuplicate | null;
  duplicateAction: UploadDuplicateAction | null;
  hasDuplicateFormat: boolean;
}
