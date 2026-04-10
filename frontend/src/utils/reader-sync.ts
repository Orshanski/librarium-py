import type { LocalProgress } from "./offline-storage";
import { saveProgress, markProgressSynced } from "./offline-storage";

/**
 * Result of a CAS PUT to /api/reader/progress.
 *
 * - `accepted`: server took our position as-is (clean CAS match).
 * - `rebased`: server had a newer version but our fraction >= its fraction,
 *              so it accepted as a forward advance.
 * - `adopted`: server rejected our rewind; we adopted its current state.
 *              `adoptedPosition` is the position the reader should jump to.
 * - `failed`: network error, HTTP error, aborted, etc.
 */
export interface PushResult {
  status: "accepted" | "rebased" | "adopted" | "failed";
  adoptedPosition?: string;
  serverVersion?: number;
}

interface PushOptions {
  deviceName: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

/**
 * Push a local reading_progress row to the server using version-based CAS.
 *
 * On success (`accepted` or `rebased`) the local row is updated with the new
 * `serverVersion` and marked synced. On reject-adopt (`adopted`) the local row
 * is replaced with the server's current state and marked synced; the returned
 * `adoptedPosition` lets the caller jump the reader UI.
 *
 * Both useReaderStorage (reader mounted) and main.tsx (background catalog sync)
 * call this helper so every PUT goes through the same CAS flow.
 */
export async function pushProgressToServerCAS(
  progress: LocalProgress,
  opts: PushOptions,
): Promise<PushResult> {
  try {
    const resp = await fetch(`/api/reader/progress/${progress.bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: opts.keepalive,
      signal: opts.signal,
      body: JSON.stringify({
        position: progress.position,
        last_device: opts.deviceName,
        last_format: progress.lastFormat,
        fraction: progress.fraction,
        expected_version: progress.serverVersion,
      }),
    });
    if (!resp.ok) return { status: "failed" };

    const data = await resp.json();

    if (data.accepted === true) {
      await saveProgress(progress.bookId, {
        position: progress.position,
        fraction: progress.fraction,
        lastFormat: progress.lastFormat,
        lastReadAt: progress.lastReadAt,
        serverVersion: data.version,
      });
      await markProgressSynced(progress.bookId);
      return {
        status: data.rebased === true ? "rebased" : "accepted",
        serverVersion: data.version,
      };
    }

    if (data.accepted === false && data.current) {
      const srv = data.current;
      await saveProgress(progress.bookId, {
        position: srv.position,
        fraction: srv.fraction ?? 0,
        lastFormat: srv.last_format ?? progress.lastFormat,
        lastReadAt: srv.last_read_at
          ? new Date(srv.last_read_at).getTime()
          : Date.now(),
        serverVersion: srv.version,
      });
      await markProgressSynced(progress.bookId);
      return {
        status: "adopted",
        adoptedPosition: srv.position,
        serverVersion: srv.version,
      };
    }

    return { status: "failed" };
  } catch (err) {
    console.warn("Failed to push progress:", err);
    return { status: "failed" };
  }
}
