import type { CSSProperties } from "react";
import { colors, fonts } from "../theme";
import type { Book } from "../types";
import type { ListOrigin } from "./breadcrumb-origin";
import BookCard from "./book-card";
import {
  bookToBookCardCommonProps,
  pickBorder,
  pickOpacity,
  SERIES_RAIL_COVER_WIDTH,
  SERIES_RAIL_GAP_PX,
} from "./book-card-tokens";

export interface BookSeriesRailTokens {
  titleFontSize: number;
  titleFontWeight: number;
  titleMarginBottom: number;
  marginTop: number;
}

interface BookSeriesRailProps {
  books: ReadonlyArray<Book>;
  offlineBookIds: Set<number>;
  currentBookId: number;
  bookOrigin: ListOrigin;
  seriesName: string;
  tokens: BookSeriesRailTokens;
}

const RAIL_STYLE: CSSProperties = {
  display: "flex",
  gap: SERIES_RAIL_GAP_PX,
  overflowX: "auto",
  paddingBottom: 8,
};

export default function BookSeriesRail({
  books,
  offlineBookIds,
  currentBookId,
  bookOrigin,
  seriesName,
  tokens,
}: Readonly<BookSeriesRailProps>) {
  if (books.length <= 1) return null;

  const sectionStyle: CSSProperties = { marginTop: tokens.marginTop };
  const titleStyle: CSSProperties = {
    fontFamily: fonts.display,
    fontSize: tokens.titleFontSize,
    fontWeight: tokens.titleFontWeight,
    color: colors.text,
    marginBottom: tokens.titleMarginBottom,
  };

  return (
    <div style={sectionStyle}>
      <h3 style={titleStyle}>Другие книги серии «{seriesName}»</h3>
      <div style={RAIL_STYLE}>
        {books.map((book) => (
          <div key={book.id} style={{ width: SERIES_RAIL_COVER_WIDTH, flexShrink: 0 }}>
            <BookCard
              {...bookToBookCardCommonProps(book)}
              width={SERIES_RAIL_COVER_WIDTH}
              hasOffline={offlineBookIds.has(book.id)}
              opacity={pickOpacity(book.id === currentBookId)}
              border={pickBorder(book.id === currentBookId)}
              linkState={{ origin: bookOrigin }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
