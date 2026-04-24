const KEY = "librarium_scroll_counter";

export function getScrollCounter(): number {
  const raw = sessionStorage.getItem(KEY);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function bumpScrollCounter(): void {
  const next = getScrollCounter() + 1;
  sessionStorage.setItem(KEY, String(next));
}
