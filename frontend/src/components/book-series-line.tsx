import type { CSSProperties } from "react";
import { colors } from "../theme";

export interface BookSeriesLineTokens {
  fontSize: number;
  color: string;
  accentName: boolean;
  separator: string;
  marginBottom: number;
}

interface BookSeriesLineProps {
  seriesName: string;
  seriesNumber: number | null;
  tokens: BookSeriesLineTokens;
}

export default function BookSeriesLine({
  seriesName,
  seriesNumber,
  tokens,
}: Readonly<BookSeriesLineProps>) {
  const containerStyle: CSSProperties = {
    fontSize: tokens.fontSize,
    color: tokens.color,
    marginBottom: tokens.marginBottom,
    lineHeight: 1.5,
  };
  const nameStyle: CSSProperties = tokens.accentName ? { color: colors.accent } : {};

  return (
    <div style={containerStyle}>
      <span data-series-name="true" style={nameStyle}>
        {seriesName}
      </span>
      {seriesNumber !== null && (
        <span>
          {tokens.separator}книга {seriesNumber}
        </span>
      )}
    </div>
  );
}
