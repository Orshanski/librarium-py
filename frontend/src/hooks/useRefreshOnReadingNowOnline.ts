import { useEffect, useSyncExternalStore } from "react";
import { refreshOfflineSnapshots } from "../utils/offline-metadata-refresh";

function subscribeOnline(handler: () => void): () => void {
  globalThis.addEventListener("online", handler);
  globalThis.addEventListener("offline", handler);
  return () => {
    globalThis.removeEventListener("online", handler);
    globalThis.removeEventListener("offline", handler);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * При переходе `(isReadingNow && online) → true` запускает фоновое обновление
 * card-level метаданных всех локально закешированных книг. Подписывается на
 * `online`/`offline` window events, поэтому реагирует на изменение сетевого
 * статуса между рендерами (раньше `navigator.onLine` читался только при
 * рендере и пропускал переходы). Failures are swallowed — best-effort.
 */
export function useRefreshOnReadingNowOnline(isReadingNow: boolean): void {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineSnapshot);
  const enabled = isReadingNow && online;
  useEffect(() => {
    if (!enabled) return;
    refreshOfflineSnapshots().catch((err) => {
      console.debug("Background snapshot refresh failed:", err);
    });
  }, [enabled]);
}
