import { setReadingFlag } from "../utils/readerFlag";
import BookActionButton from "./book-action-button";

interface BookFormat {
  format: string;
  size: string;
}

interface BookReadDownloadButtonsProps {
  bookId: number;
  formats: ReadonlyArray<BookFormat>;
  readableFormats: ReadonlyArray<string>;
}

function isReadable(format: string, readableFormats: ReadonlyArray<string>): boolean {
  const normalizedFormat = format.toUpperCase();
  return readableFormats.some((readableFormat) => readableFormat.toUpperCase() === normalizedFormat);
}

export default function BookReadDownloadButtons({
  bookId,
  formats,
  readableFormats,
}: Readonly<BookReadDownloadButtonsProps>) {
  if (formats.length === 0) return null;

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
          kind="anchor"
          href={`/api/books/${bookId}/download?format=${encodeURIComponent(bookFormat.format)}`}
          variant="neutral"
          aside={bookFormat.size}
        >
          Скачать {bookFormat.format}
        </BookActionButton>
      ))}
    </>
  );
}
