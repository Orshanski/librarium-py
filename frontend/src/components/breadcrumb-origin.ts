type ListOriginBase =
  | { type: "catalog"; url: string; label: string }
  | { type: "author"; url: string; label: string }
  | { type: "series"; url: string; label: string }
  | { type: "tag"; url: string; label: string }
  | { type: "shelf"; url: string; label: string }
  | { type: "search"; url: string; label: string }
  | { type: "authors_list"; url: string; label: string }
  | { type: "series_list"; url: string; label: string };

// parentOrigin — optional предок в цепочке переходов. Нужен чтобы при возврате
// через крошку с детальной страницы сохранился контекст дальше вверх.
// Пример: /search → /series/42 (parent=поиск) → /book/17 (bookOrigin.parentOrigin=поиск).
// Клик crumb на BookPage → на SeriesPage state.origin = parentOrigin (поиск) →
// crumb "Поиск" снова активна.
export type ListOrigin = ListOriginBase & { parentOrigin?: ListOrigin };

export type BookContextOrigin = {
  type: "book";
  url: string;
  label: string;
  bookOrigin: ListOrigin;
};

export type BookOrigin = ListOrigin | BookContextOrigin;

const LIST_TYPES = ["catalog", "author", "series", "tag", "shelf", "search", "authors_list", "series_list"] as const;

// Лимит рекурсии parentOrigin — защита от циклического state (a.parentOrigin=b, b.parentOrigin=a).
// В нормальной навигации цепочка не длиннее 3-4 (поиск → серия → автор → книга).
const MAX_ORIGIN_DEPTH = 8;

function isListOrigin(v: unknown, depth: number = 0): v is ListOrigin {
  if (depth > MAX_ORIGIN_DEPTH) return false;
  if (
    typeof v !== "object" || v === null ||
    !("type" in v) || typeof (v as { type: unknown }).type !== "string" ||
    !(LIST_TYPES as readonly string[]).includes((v as { type: string }).type) ||
    !("url" in v) || typeof (v as { url: unknown }).url !== "string" ||
    (v as { url: string }).url.length === 0 ||
    !("label" in v) || typeof (v as { label: unknown }).label !== "string"
  ) {
    return false;
  }
  // parentOrigin опционален — если присутствует, должен быть валидным ListOrigin.
  if ("parentOrigin" in v) {
    const parent = (v as { parentOrigin: unknown }).parentOrigin;
    if (parent !== undefined && !isListOrigin(parent, depth + 1)) return false;
  }
  return true;
}

function isBookContextOrigin(v: unknown): v is BookContextOrigin {
  return (
    typeof v === "object" && v !== null &&
    "type" in v && (v as { type: unknown }).type === "book" &&
    "url" in v && typeof (v as { url: unknown }).url === "string" &&
    "label" in v && typeof (v as { label: unknown }).label === "string" &&
    "bookOrigin" in v && isListOrigin((v as { bookOrigin: unknown }).bookOrigin)
  );
}

// Runtime-валидация location.state: защищает от криво переданного state
// (например, `navigate(..., {state: {origin: 42}})`) — type-assertion молча
// пропустил бы мусор, а narrowing по .type ==='book' провалился бы с undefined.
export function readOriginFromState(state: unknown): BookOrigin | undefined {
  if (typeof state !== "object" || state === null || !("origin" in state)) return undefined;
  const origin = (state as { origin: unknown }).origin;
  if (isListOrigin(origin) || isBookContextOrigin(origin)) return origin;
  return undefined;
}
