import type { LocalProgress } from "./offline-storage";
import { saveProgress, markProgressSynced, adoptServerProgressLocal, removeProgress } from "./offline-storage";
import { saveProgress as apiSaveProgress } from "../api/endpoints/reader";
import { NotFoundError } from "@/api/errors";
import { domainEvents } from "@/domain/events";

/**
 * Result of a CAS PUT to /api/reader/progress.
 *
 * - `accepted`: server took our position as-is (clean CAS match).
 * - `rebased`: server had a newer version but our fraction >= its fraction,
 *              so it accepted as a forward advance.
 * - `adopted`: server rejected our rewind; we adopted its current state.
 *              `adoptedPosition` is the position the reader should jump to.
 * - `dropped`: server returned 404 — the book no longer exists. The local
 *              row is a stale tail from IDB; we removed it.
 * - `failed`: network error, HTTP error, aborted, etc.
 */
export interface PushResult {
  status: "accepted" | "rebased" | "adopted" | "dropped" | "failed";
  adoptedPosition?: string;
  serverVersion?: number;
}

interface PushOptions {
  deviceName: string;
  keepalive?: boolean;
}

/**
 * Push a local reading_progress row to the server using version-based CAS.
 *
 * On success (`accepted` or `rebased`) the local row is updated with the new
 * `serverVersion` and marked synced. On reject-adopt (`adopted`) the local row
 * is replaced with the server's current state and marked synced; the returned
 * `adoptedPosition` lets the caller jump the reader UI.
 *
 * Both useReaderPosition (reader mounted) and main.tsx (background catalog sync)
 * call this helper so every PUT goes through the same CAS flow.
 */
export async function pushProgressToServerCAS(
  progress: LocalProgress,
  opts: PushOptions,
): Promise<PushResult> {
  try {
    const data = await apiSaveProgress(
      progress.bookId,
      {
        position: progress.position,
        lastDevice: opts.deviceName,
        lastFormat: progress.lastFormat,
        fraction: progress.fraction,
        expectedVersion: progress.serverVersion,
      },
      { keepalive: opts.keepalive },
    );

    if (data.accepted === true) {
      await saveProgress(progress.bookId, {
        position: progress.position,
        fraction: progress.fraction,
        lastFormat: progress.lastFormat,
        lastReadAt: progress.lastReadAt,
        serverVersion: data.version,
      });
      await markProgressSynced(progress.bookId);
      domainEvents.publish("readingProgressChanged", {
        bookId: progress.bookId,
        hadPosition: Boolean(progress.position),
        hasPosition: Boolean(progress.position),
        lastReadAtChanged: true,
      });
      return {
        status: data.rebased === true ? "rebased" : "accepted",
        serverVersion: data.version,
      };
    }

    if (
      data.accepted === false &&
      data.current &&
      typeof data.current.position === "string"
    ) {
      const srvPosition: string = data.current.position;
      const srvVersion = data.current.version;
      const srvNarrowed = {
        position: srvPosition,
        fraction: data.current.fraction,
        lastFormat: data.current.lastFormat,
        lastReadAt: data.current.lastReadAt,
        version: srvVersion,
      };
      await adoptServerProgressLocal(progress.bookId, srvNarrowed, progress.lastFormat);
      return {
        status: "adopted",
        adoptedPosition: srvPosition,
        serverVersion: srvVersion,
      };
    }

    return { status: "failed" };
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Book was deleted on the server. The local IDB row is a stale tail —
      // remove it so the unsynced-progress queue stops re-attempting forever.
      await removeProgress(progress.bookId);
      return { status: "dropped" };
    }
    console.warn("Failed to push progress:", err);
    return { status: "failed" };
  }
}
