import type { CSSProperties } from "react";
import type { Book } from "../types";

export interface BookFact {
  label: string;
  value: string;
}

interface BookFactsGridTokens {
  layout: "grid";
  fontSize: number;
  gap: string;
  gridTemplateColumns: string;
  marginBottom: number;
  labelColor: string;
  valueColor: string;
}

interface BookFactsStackTokens {
  layout: "stack";
  labelFontSize: number;
  labelLetterSpacing: string;
  labelMarginBottom: number;
  labelColor: string;
  valueFontSize: number;
  valueColor: string;
  valueMarginBottom: number;
  containerMarginBottom: number;
}

export type BookFactsTokens = BookFactsGridTokens | BookFactsStackTokens;

interface BookFactsProps {
  facts: ReadonlyArray<BookFact>;
  tokens: BookFactsTokens;
}

function hasValue(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== "";
}

export function buildBookFacts(book: Book): BookFact[] {
  const facts: BookFact[] = [];
  if (hasValue(book.language)) facts.push({ label: "Язык", value: book.language });
  if (hasValue(book.publisher)) facts.push({ label: "Издатель", value: book.publisher });
  if (hasValue(book.pubDate)) facts.push({ label: "Год", value: book.pubDate });
  if (hasValue(book.isbn)) facts.push({ label: "ISBN", value: book.isbn });
  return facts;
}

function BookFactsGrid({ facts, tokens }: Readonly<{ facts: ReadonlyArray<BookFact>; tokens: BookFactsGridTokens }>) {
  const containerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: tokens.gridTemplateColumns,
    gap: tokens.gap,
    fontSize: tokens.fontSize,
    marginBottom: tokens.marginBottom,
  };
  const labelStyle: CSSProperties = { color: tokens.labelColor };
  const valueStyle: CSSProperties = { color: tokens.valueColor };

  return (
    <div style={containerStyle}>
      {facts.map((fact) => (
        <div key={fact.label} style={{ display: "contents" }}>
          <span style={labelStyle}>{fact.label}</span>
          <span style={valueStyle}>{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

function BookFactsStack({ facts, tokens }: Readonly<{ facts: ReadonlyArray<BookFact>; tokens: BookFactsStackTokens }>) {
  const containerStyle: CSSProperties = { marginBottom: tokens.containerMarginBottom };
  const labelStyle: CSSProperties = {
    fontSize: tokens.labelFontSize,
    letterSpacing: tokens.labelLetterSpacing,
    marginBottom: tokens.labelMarginBottom,
    color: tokens.labelColor,
    textTransform: "uppercase",
  };
  const valueStyle: CSSProperties = {
    fontSize: tokens.valueFontSize,
    color: tokens.valueColor,
    marginBottom: tokens.valueMarginBottom,
  };

  return (
    <div style={containerStyle}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <div style={labelStyle}>{fact.label}</div>
          <div style={valueStyle}>{fact.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function BookFacts({ facts, tokens }: Readonly<BookFactsProps>) {
  if (facts.length === 0) return null;
  if (tokens.layout === "grid") return <BookFactsGrid facts={facts} tokens={tokens} />;
  return <BookFactsStack facts={facts} tokens={tokens} />;
}
