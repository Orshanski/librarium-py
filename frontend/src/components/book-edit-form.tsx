import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookEditForm from "./desktop/desktop-book-edit-form";
import { BookEditFormProps, MetadataPayload, NamedOption, TagOption } from "./book-edit-form.types";
import type { ListOrigin } from "./breadcrumb-origin";
import { splitCsv } from "../types";
import { fetchCoverProxy } from "../api/endpoints/metadata";
import { uploadCover, discardCover } from "../api/endpoints/covers";
import { uploadTempFile, deleteTempUpload } from "@/api/endpoints/upload";
import { ApiError, ServerError, ValidationError } from "@/api/errors";

export default function BookEditForm({ book, options, onSave, editOrigin }: Readonly<BookEditFormProps>) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(book.title);
  const [authors, setAuthors] = useState<string[]>(book.authors);
  const [authorSearch, setAuthorSearch] = useState("");
  const [seriesName, setSeriesName] = useState(book.series || "");
  const [seriesNumber, setSeriesNumber] = useState(book.seriesNumber?.toString() || "");
  const [description, setDescription] = useState(book.description || "");
  const [tags, setTags] = useState<string[]>(book.tags);
  const [tagSearch, setTagSearch] = useState("");
  const [language, setLanguage] = useState(book.language);
  const [publisher, setPublisher] = useState(book.publisher || "");
  const [pubDate, setPubDate] = useState(book.pubDate || "");
  const [isbn, setIsbn] = useState(book.isbn || "");
  const [formats, setFormats] = useState(book.formats);
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deleteFormatConfirm, setDeleteFormatConfirm] = useState<string | null>(null);
  const [coverChanged, setCoverChanged] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [coverUrl, setCoverUrl] = useState(book.coverPath);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [pendingAddFormats, setPendingAddFormats] = useState<{ tempId: string; format: string; size: number }[]>([]);
  const [pendingDeleteFormats, setPendingDeleteFormats] = useState<string[]>([]);

  const seriesOptions = options?.series.map((s: NamedOption) => ({ value: s.name })) || [];
  const languageOptions = options?.languages.map((l) => ({ value: l.name })) || [];
  const publisherOptions = options?.publishers.map((p: string) => ({ value: p })) || [];
  const allTags = options?.tags.map((t: TagOption) => ({ name: t.name, bookCount: t.bookCount ?? 0 })) || [];
  const allAuthors = options?.authors.map((a: NamedOption) => ({ value: a.name })) || [];

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const data = await uploadTempFile(file);
      const fmtUpper = data.format.toUpperCase();

      // Bug 2 guard: запретить duplicate формат если оригинал не помечен на удаление.
      const existingDuplicate = formats.some(f => f.format.toUpperCase() === fmtUpper);
      const markedForDelete = pendingDeleteFormats.includes(fmtUpper);
      if (existingDuplicate && !markedForDelete) {
        alert(`Формат ${fmtUpper} уже есть. Удалите старый перед загрузкой нового.`);
        // Откат temp на сервере, чтобы не оставить orphan.
        try {
          await deleteTempUpload(data.tempId);
        } catch {
          // ignore: cleanup_old_uploads подчистит через час.
        }
        return;
      }

      const sizeBytes = file.size;
      const sizeDisplay =
        sizeBytes > 1048576
          ? `${(sizeBytes / 1048576).toFixed(1)} MB`
          : `${Math.round(sizeBytes / 1024)} KB`;
      setPendingAddFormats((prev) => [...prev, { tempId: data.tempId, format: data.format, size: sizeBytes }]);
      setFormats((prev) => [...prev, { format: data.format, size: sizeDisplay }]);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const detail = err instanceof ApiError ? err.detail : (err instanceof Error ? err.message : "Ошибка загрузки");
      alert(detail);
    } finally {
      setUploading(false);
    }
  }

  async function applyMetadata(data: MetadataPayload) {
    if (data.title) setTitle(data.title);
    if (data.authors) setAuthors(splitCsv(data.authors));
    if (data.description) setDescription(data.description);
    if (data.publisher) setPublisher(data.publisher);
    if (data.pubDate) setPubDate(data.pubDate);
    if (data.isbn) setIsbn(data.isbn);
    if (data.tags) setTags(splitCsv(data.tags));
    if (data.series) setSeriesName(data.series);
    if (data.seriesNumber) setSeriesNumber(data.seriesNumber);

    if (data.coverUrl) {
      try {
        const blob = await fetchCoverProxy(data.coverUrl);
        const res = await uploadCover(book.id, blob, "cover.jpg");
        setCoverUrl(res.tempCoverUrl);
        setCoverChanged(true);
      } catch (err) {
        console.warn("Failed to apply cover from metadata:", err);
        alert("Не удалось загрузить обложку из метаданных");
      }
    }
    setShowMetadataSearch(false);
  }

  async function handleCoverInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const res = await uploadCover(book.id, file);
      setCoverUrl(res.tempCoverUrl);
      setCoverChanged(true);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Ошибка загрузки обложки";
      alert(detail);
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  }

  async function handleSaveForm() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        title,
        authors: authors.join(", "),
        series: seriesName || null,
        seriesNumber: seriesNumber || null,
        description,
        tags,
        language,
        publisher: publisher || null,
        pubDate: pubDate || null,
        isbn: isbn || null,
        addFormats: pendingAddFormats.map(p => p.tempId),
        deleteFormats: pendingDeleteFormats,
        commitCover: coverChanged,
      });
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        alert("Проверьте заполнение формы");
      } else if (err instanceof ServerError) {
        alert("Не удалось сохранить изменения");
      } else if (err instanceof ApiError) {
        alert(err.detail);
      } else {
        alert(err instanceof Error ? err.message : "Неизвестная ошибка");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    const cancelTarget: ListOrigin =
      editOrigin?.bookOrigin ?? { type: "catalog", url: "/", label: "Каталог" };

    const cleanups: Promise<unknown>[] = [];
    for (const p of pendingAddFormats) {
      cleanups.push(deleteTempUpload(p.tempId).catch(() => undefined));
    }
    if (coverChanged) {
      cleanups.push(discardCover(book.id).catch(() => undefined));
    }
    await Promise.allSettled(cleanups);
    navigate(`/book/${book.id}`, { replace: true, state: { origin: cancelTarget } });
  }

  const viewProps = {
    book,
    title,
    authors,
    authorSearch,
    seriesName,
    seriesNumber,
    description,
    tags,
    tagSearch,
    language,
    publisher,
    pubDate,
    isbn,
    formats,
    showMetadataSearch,
    saving,
    uploading,
    uploadingCover,
    dragOver,
    coverUrl,
    seriesOptions,
    languageOptions,
    publisherOptions,
    allTags,
    allAuthors,
    fileInputRef,
    coverInputRef,
    onSetTitle: setTitle,
    onSetAuthorSearch: setAuthorSearch,
    onAddAuthor: (value: string) => {
      if (value && !authors.includes(value)) {
        setAuthors((prev) => [...prev, value]);
      }
      setAuthorSearch("");
    },
    onRemoveAuthor: (value: string) => setAuthors((prev) => prev.filter((author) => author !== value)),
    onSetSeriesName: setSeriesName,
    onSetSeriesNumber: setSeriesNumber,
    onSetDescription: setDescription,
    onSetTagSearch: setTagSearch,
    onAddTag: (value: string) => {
      if (value && !tags.includes(value)) {
        setTags((prev) => [...prev, value]);
      }
      setTagSearch("");
    },
    onRemoveTag: (value: string) => setTags((prev) => prev.filter((tag) => tag !== value)),
    onSetLanguage: setLanguage,
    onSetPublisher: setPublisher,
    onSetPubDate: setPubDate,
    onSetIsbn: setIsbn,
    onToggleMetadataSearch: () => setShowMetadataSearch((value) => !value),
    onApplyMetadata: applyMetadata,
    onCloseMetadataSearch: () => setShowMetadataSearch(false),
    onChooseCover: () => coverInputRef.current?.click(),
    onCoverInputChange: handleCoverInputChange,
    onChooseFile: () => fileInputRef.current?.click(),
    onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) void uploadFile(e.target.files[0]);
      e.target.value = "";
    },
    onDropFile: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files[0]) void uploadFile(e.dataTransfer.files[0]);
    },
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDeleteFormat: (format: string) => setDeleteFormatConfirm(format),
    onSaveForm: handleSaveForm,
    onCancel: handleCancel,
  };

  return (
    <>
      <DesktopBookEditForm {...viewProps} />
      {deleteFormatConfirm && (
        <ConfirmDialog
          message={`Удалить файл ${deleteFormatConfirm}?`}
          onCancel={() => setDeleteFormatConfirm(null)}
          onConfirm={async () => {
            const fmt = deleteFormatConfirm!;
            const pendingIdx = pendingAddFormats.findIndex(p => p.format === fmt);
            if (pendingIdx >= 0) {
              const { tempId } = pendingAddFormats[pendingIdx];
              try {
                await deleteTempUpload(tempId);
              } catch {
                // ignore: cleanup_old_uploads подчистит через час
              }
              setPendingAddFormats(prev => prev.filter((_, i) => i !== pendingIdx));
            } else {
              setPendingDeleteFormats(prev => [...prev, fmt.toUpperCase()]);
            }
            setFormats(prev => prev.filter(x => x.format !== fmt));
            setDeleteFormatConfirm(null);
          }}
        />
      )}
    </>
  );
}
