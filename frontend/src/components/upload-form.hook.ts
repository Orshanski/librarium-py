import { useState } from "react";
import {
  uploadTempFile, deleteTempUpload, createBookFromUpload,
} from "@/api/endpoints/upload";
import { addFormat } from "@/api/endpoints/books";
import type { BookGroup, UploadEntry, UploadDuplicateAction } from "./upload-form.types";
import {
  formatSize, groupKey, mergeMeta, updateFileInGroups,
  groupHasReadyFormat, groupsShareReadyFormat,
} from "./upload-form.helpers";

export function useUploadGroups() {
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);

  function handleFiles(fileList: FileList) {
    const accepted = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["fb2", "epub", "pdf", "zip"].includes(ext || "");
    });
    for (const file of accepted) {
      const id = Math.random().toString(36).slice(2);
      const ext = file.name.split(".").pop()?.toUpperCase() || "???";
      const entry: UploadEntry = {
        id, tempId: "", name: file.name, size: formatSize(file.size),
        format: ext, progress: 0, status: "uploading",
      };
      setGroups((prev) => [...prev, {
        key: "__pending_" + id,
        metadata: {
          title: file.name, authors: "", series: "", seriesNumber: "",
          description: "", language: "", tags: "", publisher: "",
          pubDate: "", isbn: "", coverUrl: null,
        },
        files: [entry],
        duplicate: null,
        duplicateAction: null,
        hasDuplicateFormat: false,
      }]);
      uploadFile(id, file);
    }
  }

  function bumpProgress(id: string, pct: number) {
    setGroups((prev) => updateFileInGroups(prev, id, (f) => ({ ...f, progress: pct })));
  }

  async function uploadFile(id: string, file: File) {
    try {
      const result = await uploadTempFile(file, {
        onProgress: (pct) => bumpProgress(id, pct),
      });

      const meta = result.metadata;
      const fmt = result.format || file.name.split(".").pop()?.toUpperCase() || "???";
      const key = groupKey(meta.title, meta.authors);

      setGroups((prev) => {
        const without = prev.filter((g) => g.key !== "__pending_" + id);
        const existing = without.find((g) => g.key === key);
        const updatedEntry: UploadEntry = {
          id, tempId: result.tempId, name: file.name,
          size: formatSize(file.size), format: fmt, progress: 100, status: "ready",
        };

        if (existing) {
          const hasDupeFmt = groupHasReadyFormat(existing, fmt);
          return without.map((g) => g.key === key ? {
            ...g,
            files: [...g.files, updatedEntry],
            hasDuplicateFormat: g.hasDuplicateFormat || hasDupeFmt,
            metadata: !g.metadata.coverUrl && meta.coverUrl ? meta : g.metadata,
          } : g);
        }
        return [...without, {
          key,
          metadata: meta,
          files: [updatedEntry],
          duplicate: result.duplicate,
          duplicateAction: null,
          hasDuplicateFormat: false,
        }];
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setGroups((prev) => updateFileInGroups(prev, id, (f) => ({
        ...f, status: "error" as const, error: msg, progress: 0,
      })));
    }
  }

  function removeFile(fileId: string) {
    setGroups((prev) => {
      const updated: BookGroup[] = [];
      for (const g of prev) {
        const file = g.files.find((f) => f.id === fileId);
        if (file?.tempId) {
          deleteTempUpload(file.tempId).catch((err) => console.warn("Upload cleanup failed:", err));
        }
        const remaining = g.files.filter((f) => f.id !== fileId);
        if (remaining.length > 0) {
          updated.push({ ...g, files: remaining });
        }
      }
      return updated;
    });
  }

  function removeGroup(key: string) {
    setGroups((prev) => {
      const group = prev.find((g) => g.key === key);
      if (group) {
        for (const f of group.files) {
          if (f.tempId) deleteTempUpload(f.tempId).catch((err) => console.warn("Upload cleanup failed:", err));
        }
      }
      return prev.filter((g) => g.key !== key);
    });
  }

  async function saveAsAddFormat(g: BookGroup): Promise<void> {
    if (!g.duplicate) return;
    const readyFiles = g.files.filter((f) => f.status === "ready");
    for (const f of readyFiles) {
      try {
        await addFormat(g.duplicate.id, f.tempId);
      } catch (err) {
        console.warn("Failed to add format:", err);
        alert("Не удалось добавить формат");
      }
    }
  }

  async function saveAsNewBook(g: BookGroup): Promise<void> {
    const readyFiles = g.files.filter((f) => f.status === "ready");
    if (readyFiles.length === 0) return;
    const first = readyFiles[0];
    try {
      const created = await createBookFromUpload(first.tempId, g.metadata);
      if (created) {
        for (const f of readyFiles.slice(1)) {
          try {
            await addFormat(created.bookId, f.tempId);
          } catch (err) {
            console.warn("Failed to add format:", err);
            alert("Не удалось добавить формат");
          }
        }
      }
    } catch (err) {
      console.warn("Failed to create book:", err);
      alert("Не удалось создать книгу");
    }
  }

  async function saveAll() {
    const ready = groups.filter((g) => g.files.some((f) => f.status === "ready"));
    if (ready.length === 0) return;
    setSaving(true);
    for (const g of ready) {
      if (g.duplicate && g.duplicateAction === "add-format") {
        await saveAsAddFormat(g);
      } else {
        await saveAsNewBook(g);
      }
    }
    setSaving(false);
    setSaved(true);
  }

  function mergeInto(targetKey: string) {
    if (!mergeSource || mergeSource === targetKey) {
      setMergeSource(null);
      return;
    }
    setGroups((prev) => {
      const source = prev.find((g) => g.key === mergeSource);
      const target = prev.find((g) => g.key === targetKey);
      if (!source || !target) return prev;
      const merged: BookGroup = {
        ...target,
        files: [...target.files, ...source.files],
        hasDuplicateFormat: target.hasDuplicateFormat || groupsShareReadyFormat(target, source),
        metadata: mergeMeta(target.metadata, source.metadata),
      };
      return prev.filter((g) => g.key !== mergeSource).map((g) => g.key === targetKey ? merged : g);
    });
    setMergeSource(null);
  }

  function setDuplicateAction(key: string, action: UploadDuplicateAction) {
    setGroups((prev) => prev.map((g) => g.key === key ? { ...g, duplicateAction: action } : g));
  }

  function cancelAll() {
    for (const g of groups) {
      for (const f of g.files) {
        if (f.tempId) deleteTempUpload(f.tempId).catch((err) => console.warn("Upload cleanup failed:", err));
      }
    }
    setGroups([]);
  }

  function resetSaved() {
    setGroups([]);
    setSaved(false);
  }

  return {
    groups, saving, saved, mergeSource,
    handleFiles, removeFile, removeGroup, saveAll,
    setMergeSource, mergeInto, setDuplicateAction,
    cancelAll, resetSaved,
  };
}
