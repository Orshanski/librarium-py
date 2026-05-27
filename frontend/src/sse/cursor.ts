const CURSOR_PREFIX = "librarium_sse_last_applied_event_id:user:";
const DECIMAL_CURSOR_PATTERN = /^(0|[1-9]\d*)$/;

export function buildSseCursorStorageKey(userId: number): string {
  return `${CURSOR_PREFIX}${userId}`;
}

export function readLastAppliedEventId(userId: number): number | null {
  try {
    const raw = localStorage.getItem(buildSseCursorStorageKey(userId));
    if (raw === null) return null;
    if (!DECIMAL_CURSOR_PATTERN.test(raw)) return null;

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastAppliedEventId(userId: number, eventId: number): void {
  if (!Number.isInteger(eventId) || eventId < 0) return;

  try {
    const current = readLastAppliedEventId(userId) ?? 0;
    localStorage.setItem(buildSseCursorStorageKey(userId), String(Math.max(current, eventId)));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}
