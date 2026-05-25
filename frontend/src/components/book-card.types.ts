import type { ListOrigin } from "./breadcrumb-origin";

export type RatingStyle = "stars" | "chip";

export interface BookCardRating {
  value: number;
  style: RatingStyle;
}

export interface BookCardProps {
  // обложка
  src: string;
  alt: string;

  // размер frame'а — width в px; height вычисляет браузер из захардкоженного aspect-ratio
  width: number;

  // визуал frame'а — опциональные override'ы
  opacity?: number;
  border?: string;
  muted?: boolean;

  // мета под frame'ом
  title: string;
  authors: string[];
  series?: string;
  seriesNumber?: number;

  // decorations поверх обложки — рисуются по наличию данных
  rating?: BookCardRating;
  progressPercent?: number;
  hasOffline?: boolean;
  onRemove?: () => void;
  externalSourceLabel?: string;

  // ссылка
  href: string;
  external?: boolean;
  /**
   * Router-state для navigation history.
   * Применяется только при `external !== true` (внутренний `<Link>`).
   * При `external: true` `linkState` молча отбрасывается — внешний `<a>` не имеет router-state.
   */
  linkState?: { origin: ListOrigin };
  onClick?: () => void;
}
