import { useState, useRef } from "react";
import { Book, BookFormat } from "../types";
import { colors, fonts } from "../theme";
import MetadataSearch from "./metadata-search";
import Combobox from "./combobox";

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.textDim,
  marginBottom: 4,
  display: "block",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default function BookEditForm({ book, options, onSave }: {
  book: Book;
  options?: { authors: any[]; series: any[]; tags: any[]; languages: string[]; publishers: string[] };
  onSave?: (data: any) => void;
}) {
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
  const [formats, setFormats] = useState<BookFormat[]>(book.formats);
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverChanged, setCoverChanged] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [coverUrl, setCoverUrl] = useState(book.coverPath);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/books/${book.id}/files`, { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        const size = data.size > 1048576
          ? `${(data.size / 1048576).toFixed(1)} MB`
          : `${Math.round(data.size / 1024)} KB`;
        setFormats([...formats, { format: data.format, size }]);
      } else {
        alert(data.error || "Ошибка загрузки");
      }
    } catch {
      alert("Ошибка загрузки");
    }
    setUploading(false);
  }

  const seriesOptions = options?.series.map((s: any) => ({ value: s.name })) || [];
  const languageOptions = options?.languages.map((l: string) => ({ value: l })) || [];
  const publisherOptions = options?.publishers.map((p: string) => ({ value: p })) || [];
  const allTags = options?.tags.map((t: any) => ({ name: t.name, bookCount: t.book_count || 0 })) || [];

  async function applyMetadata(data: {
    title?: string;
    authors?: string;
    description?: string;
    publisher?: string;
    pubDate?: string;
    isbn?: string;
    tags?: string;
    series?: string;
    seriesNumber?: string;
    coverUrl?: string;
  }) {
    if (data.title) setTitle(data.title);
    if (data.authors) setAuthors(data.authors);
    if (data.description) setDescription(data.description);
    if (data.publisher) setPublisher(data.publisher);
    if (data.pubDate) setPubDate(data.pubDate);
    if (data.isbn) setIsbn(data.isbn);
    if (data.tags) setTags(data.tags.split(",").map((t) => t.trim()).filter(Boolean));
    if (data.series) setSeriesName(data.series);
    if (data.seriesNumber) setSeriesNumber(data.seriesNumber);

    // Download and upload cover via server proxy
    if (data.coverUrl) {
      try {
        const coverRes = await fetch(`/api/metadata/cover-proxy?url=${encodeURIComponent(data.coverUrl)}`);
        const blob = await coverRes.blob();
        const form = new FormData();
        form.append("file", blob, "cover.jpg");
        const uploadRes = await fetch(`/api/books/${book.id}/cover`, { method: "POST", body: form, credentials: "include" });
        if (uploadRes.ok) {
          setCoverUrl(`/api/uploads/cover/${book.id}?t=${Date.now()}`);
          setCoverChanged(true);
        }
      } catch {}
    }
    setShowMetadataSearch(false);
  }

  return (
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
      {/* Left: cover + files */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            width: 260,
            height: 390,
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: colors.bg,
          }}
        >
          {coverUrl && <img
            src={coverUrl}
            alt={book.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "top",
              display: "block",
            }}
          />}
        </div>

        <button
          onClick={() => coverInputRef.current?.click()}
          style={{ ...btnStyle, borderColor: "rgba(249, 190, 3, 0.3)", color: colors.accent }}
        >
          {uploadingCover ? "Загрузка..." : "Заменить обложку"}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploadingCover(true);
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`/api/books/${book.id}/cover`, { method: "POST", body: form, credentials: "include" });
            if (res.ok) {
              setCoverUrl(`/api/uploads/cover/${book.id}?t=${Date.now()}`);
              setCoverChanged(true);
            }
            setUploadingCover(false);
            e.target.value = "";
          }}
        />

        {/* Existing files */}
        <div>
          <div style={labelStyle}>Файлы</div>
          {formats.map((f) => (
            <div
              key={f.format}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
                fontSize: 13,
                color: colors.textSecondary,
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span>{f.format} — {f.size}</span>
              {formats.length > 1 && (
                <button
                  onClick={async () => {
                    if (!confirm(`Удалить файл ${f.format}?`)) return;
                    const res = await fetch(`/api/books/${book.id}/files?format=${f.format}`, { method: "DELETE" });
                    if (res.ok) {
                      setFormats(formats.filter((x) => x.format !== f.format));
                    }
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.danger,
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "inherit",
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Upload new file */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
          }}
          style={{
            border: `2px dashed ${dragOver ? colors.accent : colors.border}`,
            borderRadius: 6,
            padding: 16,
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragOver ? "rgba(249, 190, 3, 0.05)" : "transparent",
          }}
        >
          <div style={{ fontSize: 13, color: colors.textDim, marginBottom: 4 }}>
            {uploading ? "Загрузка..." : "Добавить файл"}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim }}>
            FB2, EPUB, PDF
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".fb2,.epub,.pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) uploadFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Right: form */}
      <div style={{ width: 520, flexShrink: 0 }}>
        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Название</label>
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Authors */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Авторы</label>
          <input
            style={inputStyle}
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Через запятую"
          />
        </div>

        {/* Series row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Серия</label>
            <Combobox
              value={seriesName}
              onChange={setSeriesName}
              options={seriesOptions}
              placeholder="Введите или выберите..."
            />
          </div>
          <div style={{ width: 80 }}>
            <label style={labelStyle}>Номер</label>
            <input
              type="number"
              step="0.1"
              style={inputStyle}
              value={seriesNumber}
              onChange={(e) => setSeriesNumber(e.target.value)}
            />
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Описание</label>
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Жанры / теги</label>

          {/* Search input */}
          <Combobox
            value={tagSearch}
            onChange={(val) => setTagSearch(val)}
            onSelect={(val) => {
              if (val && !tags.includes(val)) {
                setTags([...tags, val]);
              }
              setTagSearch("");
            }}
            options={allTags
              .filter((t) => !tags.includes(t.name))
              .map((t) => ({ value: t.name, hint: String(t.bookCount) }))}
            placeholder="Найти или добавить жанр..."
          />

          {/* Chips */}
          {tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 12,
                    backgroundColor: "rgba(249, 190, 3, 0.12)",
                    border: "1px solid rgba(249, 190, 3, 0.3)",
                    color: colors.accent,
                  }}
                >
                  {tag}
                  <span
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    style={{ cursor: "pointer", fontSize: 11, marginLeft: 2 }}
                  >
                    ✕
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Language + Year row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Язык</label>
            <Combobox
              value={language}
              onChange={setLanguage}
              options={languageOptions}
              placeholder="Введите или выберите..."
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Год</label>
            <input
              style={inputStyle}
              value={pubDate}
              onChange={(e) => setPubDate(e.target.value)}
            />
          </div>
        </div>

        {/* Publisher + ISBN row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Издатель</label>
            <Combobox
              value={publisher}
              onChange={setPublisher}
              options={publisherOptions}
              placeholder="Введите или выберите..."
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ISBN</label>
            <input
              style={inputStyle}
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </div>
        </div>

        {/* Search metadata */}
        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <button
            onClick={() => setShowMetadataSearch(!showMetadataSearch)}
            style={{
              ...btnStyle,
              backgroundColor: showMetadataSearch ? "rgba(249, 190, 3, 0.12)" : "transparent",
              borderColor: "rgba(249, 190, 3, 0.3)",
              color: colors.accent,
            }}
          >
            {showMetadataSearch ? "Скрыть поиск" : "Найти метаданные"}
          </button>
        </div>

        {showMetadataSearch && (
          <MetadataSearch
            query={title}
            onApply={applyMetadata}
            onClose={() => setShowMetadataSearch(false)}
          />
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button
            disabled={saving}
            onClick={async () => {
              if (!onSave) return;
              setSaving(true);
              if (coverChanged) {
                await fetch(`/api/books/${book.id}/cover`, { method: "PUT", credentials: "include" });
              }
              onSave({
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
            }}
            style={{
              ...btnStyle,
              backgroundColor: colors.accent,
              color: colors.sidebar,
              borderColor: colors.accent,
              fontWeight: 600,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button
            onClick={async () => {
              if (coverChanged) {
                await fetch(`/api/books/${book.id}/cover`, { method: "DELETE", credentials: "include" });
              }
              history.back();
            }}
            style={btnStyle}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontFamily: "inherit",
  color: colors.textSecondary,
  cursor: "pointer",
};
