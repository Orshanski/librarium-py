import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import type { BookCardProps, BookCardRating } from "./book-card.types";
import CardTitleMeta from "./card-title-meta";
import CoverFrame from "./cover-frame";
import CoverProgressBar from "./cover-progress-bar";
import CoverRemoveButton from "./cover-remove-button";
import CoverRatingStars from "./cover-rating-stars";
import CoverRatingChip from "./cover-rating-chip";
import CoverOfflineBadge from "./cover-offline-badge";
import {
  EXTERNAL_SOURCE_ICON_PATH,
  EXTERNAL_SOURCE_ICON_SIZE_PX,
  EXTERNAL_SOURCE_ICON_STROKE_COLOR,
  EXTERNAL_SOURCE_ICON_STROKE_WIDTH,
  EXTERNAL_SOURCE_ICON_VIEWBOX,
  EXTERNAL_SOURCE_LABEL_FONT_SIZE_PX,
  EXTERNAL_SOURCE_LABEL_GAP_PX,
  EXTERNAL_SOURCE_LABEL_PADDING,
  EXTERNAL_SOURCE_OVERLAY_BACKGROUND,
  EXTERNAL_SOURCE_OVERLAY_TEXT_COLOR,
  OFFLINE_BADGE_INNER_SIZE_PX,
  OFFLINE_BADGE_OUTER_SIZE_PX,
  OFFLINE_BADGE_RIGHT_PX,
  RATING_CHIP_TOKENS,
  RATING_STARS_TOKENS,
  REMOVE_BUTTON_TOKENS,
  TITLE_META_TOKENS,
  buildCoverFrameTokens,
  offlineBottomFor,
} from "./book-card-tokens";

const LINK_WRAPPER_STYLE: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  display: "inline-block",
};

const INNER_DIV_STYLE: CSSProperties = {
  cursor: "pointer",
  minWidth: 0,
};

const externalSourceIcon = (
  <svg
    width={EXTERNAL_SOURCE_ICON_SIZE_PX}
    height={EXTERNAL_SOURCE_ICON_SIZE_PX}
    viewBox={EXTERNAL_SOURCE_ICON_VIEWBOX}
    fill="none"
    stroke={EXTERNAL_SOURCE_ICON_STROKE_COLOR}
    strokeWidth={EXTERNAL_SOURCE_ICON_STROKE_WIDTH}
  >
    <path d={EXTERNAL_SOURCE_ICON_PATH} />
  </svg>
);

function renderRating(rating: BookCardRating | undefined): ReactNode {
  if (!rating) return null;
  if (rating.style === "stars") {
    return <CoverRatingStars rating={rating.value} tokens={RATING_STARS_TOKENS} />;
  }
  return <CoverRatingChip rating={rating.value} tokens={RATING_CHIP_TOKENS} />;
}

function renderProgress(progressPercent: number | undefined): ReactNode {
  if (progressPercent == null) return null;
  return <CoverProgressBar progressPercent={progressPercent} />;
}

function renderRemoveButton(onRemove: (() => void) | undefined): ReactNode {
  if (!onRemove) return null;
  return <CoverRemoveButton onClick={onRemove} tokens={REMOVE_BUTTON_TOKENS} />;
}

function renderOfflineBadge(hasOffline: boolean | undefined, hasProgress: boolean): ReactNode {
  if (!hasOffline) return null;
  return (
    <CoverOfflineBadge
      tokens={{
        outerSize: OFFLINE_BADGE_OUTER_SIZE_PX,
        innerSize: OFFLINE_BADGE_INNER_SIZE_PX,
        bottom: offlineBottomFor(hasProgress),
        right: OFFLINE_BADGE_RIGHT_PX,
      }}
    />
  );
}

function renderExternalSourceLabel(label: string | undefined): ReactNode {
  if (!label) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: EXTERNAL_SOURCE_OVERLAY_BACKGROUND,
        padding: EXTERNAL_SOURCE_LABEL_PADDING,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: EXTERNAL_SOURCE_LABEL_GAP_PX,
        fontSize: EXTERNAL_SOURCE_LABEL_FONT_SIZE_PX,
        color: EXTERNAL_SOURCE_OVERLAY_TEXT_COLOR,
      }}
    >
      {externalSourceIcon} {label}
    </div>
  );
}

function renderLink(props: Readonly<BookCardProps>, children: ReactNode): ReactNode {
  if (props.external) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={props.onClick}
        style={LINK_WRAPPER_STYLE}
      >
        {children}
      </a>
    );
  }
  return (
    <Link to={props.href} state={props.linkState} onClick={props.onClick} style={LINK_WRAPPER_STYLE}>
      {children}
    </Link>
  );
}

export default function BookCard(props: Readonly<BookCardProps>) {
  const frameTokens = buildCoverFrameTokens({
    width: props.width,
    opacity: props.opacity,
    border: props.border,
  });
  const inner = (
    <div style={{ ...INNER_DIV_STYLE, width: props.width }}>
      <CoverFrame src={props.src} alt={props.alt} tokens={frameTokens}>
        {renderProgress(props.progressPercent)}
        {renderRemoveButton(props.onRemove)}
        {renderRating(props.rating)}
        {renderOfflineBadge(props.hasOffline, props.progressPercent != null)}
        {renderExternalSourceLabel(props.externalSourceLabel)}
      </CoverFrame>
      <CardTitleMeta
        title={props.title}
        authors={props.authors}
        series={props.series}
        seriesNumber={props.seriesNumber}
        tokens={TITLE_META_TOKENS}
      />
    </div>
  );
  return renderLink(props, inner);
}
