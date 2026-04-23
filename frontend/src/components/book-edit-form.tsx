import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../responsive";
import MetadataSearch from "./metadata-search";
import ConfirmDialog from "./confirm-dialog";
import DesktopBookEditForm from "./desktop/desktop-book-edit-form";
import MobileBookEditForm from "./mobile/mobile-book-edit-form";
import { BookEditFormProps, MetadataPayload, NamedOption, TagOption } from "./book-edit-form.types";
import type { ListOrigin } from "./breadcrumb-origin";
import { splitCsv } from "../types";
import { fetchCoverProxy } from "../api/endpoints/metadata";
import { uploadCover, commitCover, discardCover } from "../api/endpoints/covers";
import {
  uploadFile as apiUploadFile,
  deleteFile as apiDeleteFile,
} from "@/api/endpoints/books";

export default function BookEditForm({ book, options, onSave, editOrigin }: Readonly<BookEditFormProps>) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [title, setTitle] = useState(book.title);
  const [authors, setAuthors] = useState(book.authors.join(", "));
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

  const seriesOptions = options?.series.map((s: NamedOption) => ({ value: s.name })) || [];
  const languageOptions = options?.languages.map((l) => ({ value: l.name })) || [];
  const publisherOptions = options?.publishers.map((p: string) => ({ value: p })) || [];
  const allTags = options?.tags.map((t: TagOption) => ({ name: t.name, bookCount: 0 })) || [];

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const data = await apiUploadFile(book.id, file);
      const size =
        data.size > 1048576
          ? `${(data.size / 1048576).toFixed(1)} MB`
          : `${Math.round(data.size / 1024)} KB`;
      setFormats((prev) => [...prev, { format: data.format, size }]);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const detail = err instanceof Error ? err.message : "Ошибка загрузки";
      alert(detail);
    } finally {
      setUploading(false);
    }
  }

  async function applyMetadata(data: MetadataPayload) {
    if (data.title) setTitle(data.title);
    if (data.authors) setAuthors(data.authors);
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
      if (coverChanged) {
        await commitCover(book.id);
      }
      await onSave({
        title,
        authors,
        series: seriesName || null,
        seriesNumber: seriesNumber || null,
        description,
        tags,
        language,
        publisher: publisher || null,
        pubDate: pubDate || null,
        isbn: isbn || null,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    const cancelTarget: ListOrigin =
      editOrigin?.bookOrigin ?? { type: "catalog", url: "/", label: "Каталог" };

    if (!coverChanged) {
      navigate(`/book/${book.id}`, { replace: true, state: { origin: cancelTarget } });
      return;
    }

    try {
      await discardCover(book.id);
      navigate(`/book/${book.id}`, { replace: true, state: { origin: cancelTarget } });
    } catch {
      alert("Не удалось отменить изменения");
    }
  }

  const viewProps = {
    book,
    title,
    authors,
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
    fileInputRef,
    coverInputRef,
    onSetTitle: setTitle,
    onSetAuthors: setAuthors,
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
      {isMobile ? <MobileBookEditForm {...viewProps} /> : <DesktopBookEditForm {...viewProps} />}
      {deleteFormatConfirm && (
        <ConfirmDialog
          message={`Удалить файл ${deleteFormatConfirm}?`}
          onCancel={() => setDeleteFormatConfirm(null)}
          onConfirm={async () => {
            try {
              await apiDeleteFile(book.id, deleteFormatConfirm);
              setFormats((prev) => prev.filter((x) => x.format !== deleteFormatConfirm));
            } catch (err: unknown) {
              if (err instanceof Error && err.name === "AbortError") return;
              console.warn("Failed to delete format:", err);
              alert("Не удалось удалить формат");
            } finally {
              setDeleteFormatConfirm(null);
            }
          }}
        />
      )}
    </>
  );
}
