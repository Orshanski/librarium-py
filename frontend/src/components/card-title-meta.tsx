import type { CSSProperties } from "react";
import { colors } from "../theme";

interface CardTitleMetaTokens {
  titleSize: number;
  titleLineHeight: number;
  authorsSize: number;
  seriesSize?: number;
  seriesEllipsis?: boolean;
  titleClamp?: number;
  titleFontWeight?: number;
  titleMarginBottom?: number;
}

interface CardTitleMetaProps {
  title: string;
  authors: string[];
  series?: string;
  seriesNumber?: number | null;
  tokens: CardTitleMetaTokens;
}

function ellipsisStyle(enabled?: boolean): CSSProperties {
  if (enabled) return { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return {};
}

function formatSeriesSuffix(seriesNumber: number | null | undefined): string {
  if (!seriesNumber) return "";
  return ` (${seriesNumber})`;
}

export default function CardTitleMeta({
  title,
  authors,
  series,
  seriesNumber,
  tokens,
}: Readonly<CardTitleMetaProps>) {
  const titleStyle: CSSProperties = {
    fontSize: tokens.titleSize,
    fontWeight: tokens.titleFontWeight ?? 500,
    color: colors.text,
    lineHeight: tokens.titleLineHeight,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: tokens.titleClamp ?? 2,
    WebkitBoxOrient: "vertical",
    marginBottom: tokens.titleMarginBottom ?? 2,
  };

  const authorsStyle: CSSProperties = {
    fontSize: tokens.authorsSize,
    color: colors.textDim,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const seriesBaseStyle: CSSProperties = {
    fontSize: tokens.seriesSize ?? tokens.authorsSize,
    color: colors.textDim,
    marginTop: 1,
  };

  return (
    <>
      <div style={titleStyle}>{title}</div>
      <div style={authorsStyle}>{authors.join(", ")}</div>
      {series && (
        <div style={{ ...seriesBaseStyle, ...ellipsisStyle(tokens.seriesEllipsis) }}>
          {series}
          {formatSeriesSuffix(seriesNumber)}
        </div>
      )}
    </>
  );
}
