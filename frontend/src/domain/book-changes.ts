import type { BookChangedField } from "./events";

type UnknownEditBody = Record<string, unknown>;

const FIELD_MAP: Array<[string, BookChangedField]> = [
  ["title", "title"],
  ["description", "description"],
  ["publisher", "publisher"],
  ["pubDate", "pubDate"],
  ["authorIds", "authors"],
  ["authors", "authors"],
  ["seriesId", "series"],
  ["series", "series"],
  ["seriesNumber", "seriesNumber"],
  ["tagIds", "tags"],
  ["tags", "tags"],
  ["language", "language"],
  ["coverPath", "coverPath"],
  ["commitCover", "coverPath"],
  ["addFormats", "files"],
  ["deleteFormats", "files"],
  ["files", "files"],
  ["identifiers", "identifiers"],
  ["isbn", "identifiers"],
];

export function deriveBookChangedFields(body: UnknownEditBody): BookChangedField[] {
  const result: BookChangedField[] = [];
  for (const [bodyKey, changedField] of FIELD_MAP) {
    if (body[bodyKey] === undefined) continue;
    if (!result.includes(changedField)) result.push(changedField);
  }
  return result;
}
