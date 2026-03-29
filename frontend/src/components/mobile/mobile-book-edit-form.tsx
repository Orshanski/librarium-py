import { colors, fonts } from "../../theme";
import MetadataSearch from "../metadata-search";
import Combobox from "../combobox";
import { BookEditViewProps } from "../book-edit-form.types";
import { sharedBookEditButtonStyle, sharedBookEditInputStyle, sharedBookEditLabelStyle } from "../book-edit-form.styles";

const inputStyle: React.CSSProperties = {
  ...sharedBookEditInputStyle,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  ...sharedBookEditLabelStyle,
  fontSize: 11,
};

const btnStyle: React.CSSProperties = {
  ...sharedBookEditButtonStyle,
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 13,
};

export default function MobileBookEditForm({
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
  onSetTitle,
  onSetAuthors,
  onSetSeriesName,
  onSetSeriesNumber,
  onSetDescription,
  onSetTagSearch,
  onAddTag,
  onRemoveTag,
  onSetLanguage,
  onSetPublisher,
  onSetPubDate,
  onSetIsbn,
  onToggleMetadataSearch,
  onApplyMetadata,
  onCloseMetadataSearch,
  onChooseCover,
  onCoverInputChange,
  onChooseFile,
  onFileInputChange,
  onDropFile,
  onDragOver,
  onDragLeave,
  onDeleteFormat,
  onSaveForm,
  onCancel,
}: BookEditViewProps) {
  return (
    <div>
      <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 14 }}>
        Редактирование
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 92,
            borderRadius: 6,
            overflow: "hidden",
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bg,
            flexShrink: 0,
          }}
        >
          {coverUrl && (
            <img
              src={coverUrl}
              alt={book.title}
              style={{
                width: "100%",
                aspectRatio: "2 / 3",
                objectFit: "contain",
                objectPosition: "top",
                display: "block",
              }}
            />
          )}
        </div>
        <button
          onClick={onChooseCover}
          style={{
            background: "none",
            border: "none",
            color: colors.accent,
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {uploadingCover ? "Загрузка..." : "Заменить обложку"}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { void onCoverInputChange(e); }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Название</label>
        <input style={inputStyle} value={title} onChange={(e) => onSetTitle(e.target.value)} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Автор</label>
        <input
          style={inputStyle}
          value={authors}
          onChange={(e) => onSetAuthors(e.target.value)}
          placeholder="Через запятую"
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Серия</label>
        <Combobox
          value={seriesName}
          onChange={onSetSeriesName}
          options={seriesOptions}
          placeholder="Введите или выберите..."
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>№ в серии</label>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            style={inputStyle}
            value={seriesNumber}
            onChange={(e) => onSetSeriesNumber(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Год</label>
          <input inputMode="numeric" style={inputStyle} value={pubDate} onChange={(e) => onSetPubDate(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Аннотация</label>
        <textarea
          style={{ ...inputStyle, minHeight: 96, resize: "vertical", lineHeight: 1.5 }}
          value={description}
          onChange={(e) => onSetDescription(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Жанры</label>
        <Combobox
          value={tagSearch}
          onChange={onSetTagSearch}
          onSelect={onAddTag}
          options={allTags.filter((t) => !tags.includes(t.name)).map((t) => ({ value: t.name, hint: String(t.bookCount) }))}
          placeholder="Найти или добавить жанр..."
        />
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
                <span onClick={() => onRemoveTag(tag)} style={{ cursor: "pointer", fontSize: 11, marginLeft: 2 }}>✕</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Язык</label>
        <Combobox
          value={language}
          onChange={onSetLanguage}
          options={languageOptions}
          placeholder="Введите или выберите..."
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Издательство</label>
        <Combobox
          value={publisher}
          onChange={onSetPublisher}
          options={publisherOptions}
          placeholder="Введите или выберите..."
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>ISBN</label>
        <input inputMode="numeric" style={inputStyle} value={isbn} onChange={(e) => onSetIsbn(e.target.value)} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 10 }}>Файлы</div>
      {formats.map((f) => (
        <div
          key={f.format}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.accent,
                background: "rgba(249, 190, 3, 0.15)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {f.format}
            </span>
            <span style={{ fontSize: 13, color: colors.textSecondary }}>{f.size}</span>
          </div>
          {formats.length > 1 && (
            <button
              onClick={() => onDeleteFormat(f.format)}
              style={{
                background: "none",
                border: "none",
                color: colors.danger,
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              🗑
            </button>
          )}
        </div>
      ))}

      <div
        onClick={onChooseFile}
        style={{
          border: `2px dashed ${dragOver ? colors.accent : colors.border}`,
          borderRadius: 8,
          padding: 16,
          textAlign: "center",
          marginBottom: 16,
          backgroundColor: dragOver ? "rgba(249, 190, 3, 0.05)" : "transparent",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 18, marginBottom: 4, opacity: 0.4 }}>+</div>
        <div style={{ fontSize: 12, color: colors.textDim }}>{uploading ? "Загрузка..." : "Добавить файл"}</div>
        <div style={{ fontSize: 10, color: "#555" }}>FB2, EPUB, PDF</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".fb2,.epub,.pdf"
          style={{ display: "none" }}
          onChange={onFileInputChange}
        />
      </div>

      <button
        onClick={onToggleMetadataSearch}
        style={{
          ...btnStyle,
          width: "100%",
          marginBottom: 16,
          backgroundColor: showMetadataSearch ? "rgba(249, 190, 3, 0.12)" : "rgba(255,255,255,0.04)",
          borderColor: showMetadataSearch ? "rgba(249, 190, 3, 0.3)" : colors.border,
          color: showMetadataSearch ? colors.accent : colors.textSecondary,
        }}
      >
        {showMetadataSearch ? "Скрыть поиск" : "Найти метаданные"}
      </button>

      {showMetadataSearch && (
        <div style={{ marginBottom: 16 }}>
          <MetadataSearch query={title} onApply={(data) => { void onApplyMetadata(data); }} onClose={onCloseMetadataSearch} />
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          position: "sticky",
          bottom: 0,
          paddingTop: 12,
          paddingBottom: 8,
          background: "linear-gradient(to top, rgba(45,48,64,1), rgba(45,48,64,0.96), rgba(45,48,64,0))",
        }}
      >
        <button onClick={() => { void onCancel(); }} style={{ ...btnStyle, flex: 1 }}>
          Отмена
        </button>
        <button
          disabled={saving}
          onClick={() => { void onSaveForm(); }}
          style={{
            ...btnStyle,
            flex: 1,
            backgroundColor: colors.accent,
            color: colors.sidebar,
            borderColor: colors.accent,
            fontWeight: 600,
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
