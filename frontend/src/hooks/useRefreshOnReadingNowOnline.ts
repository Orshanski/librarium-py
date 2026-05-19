import { useEffect } from "react";
import { refreshOfflineSnapshots } from "../utils/offline-metadata-refresh";

/**
 * When `enabled` transitions to/is `true`, kick off a background refresh of
 * every locally cached offline book's card-level metadata. Intended to be
 * wired to `(isReadingNow && navigator.onLine)` on the ShelfPage so that
 * opening the "Reading now" shelf while online keeps local snapshots in sync
 * with the server. Failures are swallowed — this is best-effort.
 */
export function useRefreshOnReadingNowOnline(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    refreshOfflineSnapshots().catch((err) => {
      console.debug("Background snapshot refresh failed:", err);
    });
  }, [enabled]);
}
