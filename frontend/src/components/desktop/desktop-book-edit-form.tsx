import { colors } from "../../theme";
import MetadataSearch from "../metadata-search";
import Combobox from "../combobox";
import { BookEditViewProps } from "../book-edit-form.types";
import { sharedBookEditButtonStyle, sharedBookEditInputStyle, sharedBookEditLabelStyle } from "../book-edit-form.styles";

const inputStyle: React.CSSProperties = {
  ...sharedBookEditInputStyle,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  ...sharedBookEditLabelStyle,
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  ...sharedBookEditButtonStyle,
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
};

export default function DesktopBookEditForm({
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
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
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
          {coverUrl && (
            <img
              src={coverUrl}
              alt={book.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "top",
                display: "block",
              }}
            />
          )}
        </div>

        <button
          onClick={onChooseCover}
          style={{ ...btnStyle, borderColor: "rgba(249, 190, 3, 0.3)", color: colors.accent }}
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
                  onClick={() => onDeleteFormat(f.format)}
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

        <div
          onClick={onChooseFile}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropFile}
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
          <div style={{ fontSize: 11, color: colors.textDim }}>FB2, EPUB, PDF</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".fb2,.epub,.pdf"
            style={{ display: "none" }}
            onChange={onFileInputChange}
          />
        </div>
      </div>

      <div style={{ width: 520, flexShrink: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Название</label>
          <input style={inputStyle} value={title} onChange={(e) => onSetTitle(e.target.value)} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Авторы</label>
          <input
            style={inputStyle}
            value={authors}
            onChange={(e) => onSetAuthors(e.target.value)}
            placeholder="Через запятую"
          />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Серия</label>
            <Combobox
              value={seriesName}
              onChange={onSetSeriesName}
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
              onChange={(e) => onSetSeriesNumber(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Описание</label>
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            value={description}
            onChange={(e) => onSetDescription(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Жанры / теги</label>
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

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Язык</label>
            <Combobox
              value={language}
              onChange={onSetLanguage}
              options={languageOptions}
              placeholder="Введите или выберите..."
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Год</label>
            <input style={inputStyle} value={pubDate} onChange={(e) => onSetPubDate(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Издатель</label>
            <Combobox
              value={publisher}
              onChange={onSetPublisher}
              options={publisherOptions}
              placeholder="Введите или выберите..."
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ISBN</label>
            <input style={inputStyle} value={isbn} onChange={(e) => onSetIsbn(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <button
            onClick={onToggleMetadataSearch}
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
          <MetadataSearch query={title} onApply={(data) => { void onApplyMetadata(data); }} onClose={onCloseMetadataSearch} />
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button
            disabled={saving}
            onClick={() => { void onSaveForm(); }}
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
          <button onClick={() => { void onCancel(); }} style={btnStyle}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
