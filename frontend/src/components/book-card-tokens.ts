import { colors, layout } from "../theme";
import type { CardTitleMetaTokens } from "./card-title-meta";
import type { BookCardProps, BookCardRating } from "./book-card.types";
import type { CoverFrameTokens } from "./cover-frame";
import type { Book } from "../types";
import { MOBILE_BOOK_GRID_COLUMNS, MOBILE_BOOK_GRID_GAP_PX } from "./book-layout-tokens";

// === Catalog desktop baseline (golden source) ===
export const CATALOG_COVER_WIDTH = 150;
export const CATALOG_COVER_HEIGHT = 230;
export const COVER_FRAME_ASPECT_RATIO =
  `${CATALOG_COVER_WIDTH} / ${CATALOG_COVER_HEIGHT}`;

// === Series-rail (BookDetail) ===
export const SERIES_RAIL_COVER_WIDTH = 100;
export const SERIES_RAIL_GAP_PX = 16;

// === Frame визуал ===
export const COVER_FRAME_RADIUS = 4;
export const COVER_FRAME_MARGIN_BOTTOM = 8;
export const COVER_FRAME_BORDER_DEFAULT_COLOR = "rgba(255, 255, 255, 0.15)";
export const COVER_FRAME_BORDER_DEFAULT_WIDTH_PX = 1;
export const COVER_FRAME_BORDER =
  `${COVER_FRAME_BORDER_DEFAULT_WIDTH_PX}px solid ${COVER_FRAME_BORDER_DEFAULT_COLOR}`;

export const SERIES_RAIL_BORDER_WIDTH_PX = 2;
export const SERIES_RAIL_BORDER_ACCENT =
  `${SERIES_RAIL_BORDER_WIDTH_PX}px solid ${colors.accent}`;
// Не-current items сохраняют ту же тонкую обводку, что и в каталоге (видимый цвет),
// но с шириной 2px ради layout-стабильности с current accent border.
export const SERIES_RAIL_BORDER_PLACEHOLDER =
  `${SERIES_RAIL_BORDER_WIDTH_PX}px solid ${COVER_FRAME_BORDER_DEFAULT_COLOR}`;

export const SERIES_RAIL_OPACITY_INACTIVE = 0.6;
export const SERIES_RAIL_OPACITY_ACTIVE = 1;

// === Title meta (catalog desktop golden) ===
export const TITLE_META_TOKENS: CardTitleMetaTokens = {
  titleSize: 13,
  titleLineHeight: 1.3,
  authorsSize: 12,
  seriesSize: 11,
};

// === Decorations ===

// Rating stars
export const RATING_STARS_TOP_PX = 4;
export const RATING_STARS_RIGHT_PX = 4;
export const RATING_STARS_FONT_SIZE_PX = 8;
export const RATING_STARS_TOKENS = {
  top: RATING_STARS_TOP_PX,
  right: RATING_STARS_RIGHT_PX,
  fontSize: RATING_STARS_FONT_SIZE_PX,
} as const;

// Rating chip
export const RATING_CHIP_TOP_PX = 6;
export const RATING_CHIP_RIGHT_PX = 6;
export const RATING_CHIP_PADDING_Y_PX = 2;
export const RATING_CHIP_PADDING_X_PX = 6;
export const RATING_CHIP_PADDING =
  `${RATING_CHIP_PADDING_Y_PX}px ${RATING_CHIP_PADDING_X_PX}px`;
export const RATING_CHIP_FONT_SIZE_PX = 11;
export const RATING_CHIP_ICON_FONT_SIZE_PX = 10;
export const RATING_CHIP_TOKENS = {
  top: RATING_CHIP_TOP_PX,
  right: RATING_CHIP_RIGHT_PX,
  padding: RATING_CHIP_PADDING,
  fontSize: RATING_CHIP_FONT_SIZE_PX,
  iconFontSize: RATING_CHIP_ICON_FONT_SIZE_PX,
} as const;

// Offline badge
export const OFFLINE_BADGE_OUTER_SIZE_PX = 28;
export const OFFLINE_BADGE_INNER_SIZE_PX = 16;
export const OFFLINE_BADGE_BOTTOM_BASE_PX = 6;
/** Сдвиг над base, когда снизу есть progress-bar; абсолютное значение catalog desktop golden. */
export const OFFLINE_BADGE_BOTTOM_WITH_PROGRESS_PX = 7;
export const OFFLINE_BADGE_RIGHT_PX = 6;

// Remove button — touch-friendly размер для попадания пальцем (mobile-friendly,
// действует и на desktop — иначе на мобильном кнопка нечитаема для touch-target).
export const REMOVE_BUTTON_SIZE_PX = 44;
export const REMOVE_BUTTON_TOP_PX = 0;
export const REMOVE_BUTTON_LEFT_PX = 0;
export const REMOVE_BUTTON_FONT_SIZE_PX = 14;
export const REMOVE_BUTTON_WITH_HOVER_FADE = false;
export const REMOVE_BUTTON_BACKGROUND = "rgba(0,0,0,0.65)";
export const REMOVE_BUTTON_TRANSFORM = "translate(-6px, -6px)";
export const REMOVE_BUTTON_TOKENS = {
  size: REMOVE_BUTTON_SIZE_PX,
  top: REMOVE_BUTTON_TOP_PX,
  left: REMOVE_BUTTON_LEFT_PX,
  fontSize: REMOVE_BUTTON_FONT_SIZE_PX,
  withHoverFade: REMOVE_BUTTON_WITH_HOVER_FADE,
  background: REMOVE_BUTTON_BACKGROUND,
  transform: REMOVE_BUTTON_TRANSFORM,
} as const;

// External source label (плашка «litres.ru» внизу обложки)
export const EXTERNAL_SOURCE_LABEL_PADDING_TOP_PX = 16;
export const EXTERNAL_SOURCE_LABEL_PADDING_X_PX = 6;
export const EXTERNAL_SOURCE_LABEL_PADDING_BOTTOM_PX = 5;
export const EXTERNAL_SOURCE_LABEL_PADDING =
  `${EXTERNAL_SOURCE_LABEL_PADDING_TOP_PX}px ${EXTERNAL_SOURCE_LABEL_PADDING_X_PX}px ${EXTERNAL_SOURCE_LABEL_PADDING_BOTTOM_PX}px`;
export const EXTERNAL_SOURCE_LABEL_FONT_SIZE_PX = 10;
export const EXTERNAL_SOURCE_LABEL_GAP_PX = 4;
export const EXTERNAL_SOURCE_OVERLAY_BACKGROUND =
  "linear-gradient(transparent, rgba(0,0,0,0.75))";
export const EXTERNAL_SOURCE_OVERLAY_TEXT_COLOR = "rgba(255,255,255,0.7)";
export const EXTERNAL_SOURCE_ICON_STROKE_COLOR = "rgba(255,255,255,0.7)";
export const EXTERNAL_SOURCE_ICON_SIZE_PX = 10;
export const EXTERNAL_SOURCE_ICON_VIEWBOX = "0 0 12 12";
export const EXTERNAL_SOURCE_ICON_STROKE_WIDTH = 1.2;
export const EXTERNAL_SOURCE_ICON_PATH = "M3.5 1.5H1.5v9h9v-2M7 1.5h3.5V5M5 7l6-5.5";

// === Helpers ===

export function offlineBottomFor(hasProgress: boolean): number {
  if (hasProgress) return OFFLINE_BADGE_BOTTOM_WITH_PROGRESS_PX;
  return OFFLINE_BADGE_BOTTOM_BASE_PX;
}

export function pickOpacity(isCurrent: boolean): number {
  if (isCurrent) return SERIES_RAIL_OPACITY_ACTIVE;
  return SERIES_RAIL_OPACITY_INACTIVE;
}

export function pickBorder(isCurrent: boolean): string {
  if (isCurrent) return SERIES_RAIL_BORDER_ACCENT;
  return SERIES_RAIL_BORDER_PLACEHOLDER;
}

export function toStarRating(value: number | null | undefined): BookCardRating | undefined {
  if (!value) return undefined;
  return { value, style: "stars" };
}

export function toChipRating(value: number): BookCardRating {
  return { value, style: "chip" };
}

interface BuildCoverFrameTokensInput {
  width: number;
  opacity?: number;
  border?: string;
}

export function buildCoverFrameTokens(input: BuildCoverFrameTokensInput): CoverFrameTokens {
  return {
    width: input.width,
    radius: COVER_FRAME_RADIUS,
    border: input.border ?? COVER_FRAME_BORDER,
    marginBottom: COVER_FRAME_MARGIN_BOTTOM,
    opacity: input.opacity,
  };
}

/**
 * Маппинг доменной модели книги библиотеки в параметры BookCard.
 * Используется в catalog/listings/series-rail/shelf/search/author/offline callsite'ах.
 * Caller добавляет к результату специфичные для callsite'а поля
 * (`width`, `hasOffline`, `linkState`, `onClick`, `progressPercent`, `onRemove`).
 */
export function bookToBookCardCommonProps(book: Book): Pick<
  BookCardProps,
  "src" | "alt" | "title" | "authors" | "series" | "seriesNumber" | "rating" | "href"
> {
  return {
    src: book.coverPath,
    alt: book.title,
    title: book.title,
    authors: book.authors.map((a) => a.name),
    series: book.series?.name,
    seriesNumber: book.seriesNumber ?? undefined,
    rating: toStarRating(book.rating),
    href: `/book/${book.id}`,
  };
}

/**
 * Возвращает фактическую ширину одной grid-колонки на mobile в пикселях.
 * Считает от viewportWidth и known constants grid-структуры
 * (количество колонок и gap из book-layout-tokens, padding страницы из theme.layout).
 */
export function computeMobileBookCardWidth(viewportWidth: number): number {
  const usableWidth =
    viewportWidth - 2 * layout.mobileContentPaddingX - (MOBILE_BOOK_GRID_COLUMNS - 1) * MOBILE_BOOK_GRID_GAP_PX;
  return Math.floor(usableWidth / MOBILE_BOOK_GRID_COLUMNS);
}
