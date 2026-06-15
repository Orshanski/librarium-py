import { downloadBook } from "@/api/endpoints/books";
import { isIOS, isStandalone } from "../utils/device-info";
import { setReadingFlag } from "../utils/readerFlag";
import BookActionButton from "./book-action-button";

interface BookFormat {
  format: string;
  size: string;
}

interface BookReadDownloadButtonsProps {
  bookId: number;
  bookTitle: string;
  formats: ReadonlyArray<BookFormat>;
  readableFormats: ReadonlyArray<string>;
}

function isReadable(format: string, readableFormats: ReadonlyArray<string>): boolean {
  const normalizedFormat = format.toUpperCase();
  return readableFormats.some((readableFormat) => readableFormat.toUpperCase() === normalizedFormat);
}

function sanitizeFilenameBase(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let end = sanitized.length;
  while (end > 0 && (sanitized[end - 1] === "." || sanitized[end - 1] === " ")) {
    end -= 1;
  }
  return sanitized.slice(0, end) || "book";
}

function buildDownloadFilename(title: string, format: string): string {
  return `${sanitizeFilenameBase(title)}.${format.toLowerCase()}`;
}

function saveBlobWithAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function shareFileIfSupported(file: File): Promise<boolean> {
  const shareData: ShareData = { files: [file] };
  if (!navigator.canShare?.(shareData) || !navigator.share) return false;
  try {
    await navigator.share(shareData);
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return true;
    return false;
  }
}

export default function BookReadDownloadButtons({
  bookId,
  bookTitle,
  formats,
  readableFormats,
}: Readonly<BookReadDownloadButtonsProps>) {
  if (formats.length === 0) return null;

  async function handleDownload(format: string): Promise<void> {
    const blob = await downloadBook(bookId, format);
    const filename = buildDownloadFilename(bookTitle, format);
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    // Share нужен только в iOS-standalone PWA, где WebView игнорирует
    // <a download> и навигирует на бинарь, заперая пользователя (баг an73).
    // Везде ещё — обычная blob-загрузка через anchor.
    if (isIOS() && isStandalone()) {
      if (await shareFileIfSupported(file)) return;
    }
    saveBlobWithAnchor(file, filename);
  }

  return (
    <>
      {formats
        .filter((bookFormat) => isReadable(bookFormat.format, readableFormats))
        .map((bookFormat) => (
          <BookActionButton
            key={`read-${bookFormat.format}`}
            kind="link"
            to={`/book/${bookId}/read/${encodeURIComponent(bookFormat.format.toLowerCase())}`}
            onClick={setReadingFlag}
            variant="accent"
          >
            Читать {bookFormat.format}
          </BookActionButton>
        ))}
      {formats.map((bookFormat) => (
        <BookActionButton
          key={`download-${bookFormat.format}`}
          kind="button"
          onClick={() => { void handleDownload(bookFormat.format); }}
          variant="neutral"
          aside={bookFormat.size}
        >
          Скачать {bookFormat.format}
        </BookActionButton>
      ))}
    </>
  );
}
