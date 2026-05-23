import { isRecord } from "./guards";

export function patchBookDetailBook(
  detail: unknown,
  patcher: (book: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (!isRecord(detail) || !isRecord(detail.book)) return detail;
  return { ...detail, book: patcher({ ...detail.book }) };
}
