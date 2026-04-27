import { colors } from "../theme";

interface CardTitleMetaTokens {
  titleSize: number;
  titleLineHeight: number;
  authorsSize: number;
  seriesSize?: number;
  seriesEllipsis?: boolean;
}

interface CardTitleMetaProps {
  title: string;
  authors: string[];
  series?: string;
  seriesNumber?: number | null;
  tokens: CardTitleMetaTokens;
}

export default function CardTitleMeta({
  title,
  authors,
  series,
  seriesNumber,
  tokens,
}: Readonly<CardTitleMetaProps>) {
  return (
    <>
      <div
        style={{
          fontSize: tokens.titleSize,
          fontWeight: 500,
          color: colors.text,
          lineHeight: tokens.titleLineHeight,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: tokens.authorsSize,
          color: colors.textDim,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {authors.join(", ")}
      </div>
      {series && (
        <div
          style={{
            fontSize: tokens.seriesSize,
            color: colors.textDim,
            marginTop: 1,
            overflow: tokens.seriesEllipsis ? "hidden" : undefined,
            textOverflow: tokens.seriesEllipsis ? "ellipsis" : undefined,
            whiteSpace: tokens.seriesEllipsis ? "nowrap" : undefined,
          }}
        >
          {series}
          {seriesNumber ? ` (${seriesNumber})` : ""}
        </div>
      )}
    </>
  );
}
