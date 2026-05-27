import { useEffect, useRef } from "react";
import { metadataCache } from "@/cache";
import { writeScrollEntries } from "@/scroll/list-scroll-validity";
import { refreshOfflineSnapshots } from "@/utils/offline-metadata-refresh";
import { readLastAppliedEventId, writeLastAppliedEventId } from "./cursor";
import { applyServerEvent } from "./server-events";

type UseServerEventsOptions = {
  userId?: number;
  resyncOnNextOpen?: boolean;
};

export function useServerEvents(enabled: boolean, options: UseServerEventsOptions = {}): void {
  const hadErrorRef = useRef(false);
  const missedEventsRef = useRef(false);
  const userId = options.userId;
  const resyncOnNextOpen = options.resyncOnNextOpen ?? false;

  useEffect(() => {
    if (resyncOnNextOpen) missedEventsRef.current = true;
  }, [resyncOnNextOpen]);

  useEffect(() => {
    if (!enabled || userId === undefined) return;

    const since = readLastAppliedEventId(userId);
    const streamUrl = since === null ? "/api/events/stream" : `/api/events/stream?since=${since}`;
    const events = new EventSource(streamUrl, { withCredentials: true });
    let closed = false;
    let chain = Promise.resolve();

    const closeAfterFailure = () => {
      closed = true;
      events.close();
    };

    const enqueue = (task: () => Promise<void>, warning: string) => {
      chain = chain.then(async () => {
        if (closed) return;
        try {
          await task();
        } catch (error) {
          console.warn(warning, error);
          closeAfterFailure();
        }
      });
    };

    events.addEventListener("domain", (message) => {
      enqueue(async () => {
        const raw = JSON.parse((message as MessageEvent<string>).data);
        const lastApplied = readLastAppliedEventId(userId);
        if (typeof raw?.eventId === "number" && lastApplied !== null && raw.eventId <= lastApplied) {
          return;
        }
        const envelope = await applyServerEvent(raw);
        if (!closed) {
          writeLastAppliedEventId(userId, envelope.eventId);
        }
      }, "Failed to dispatch server event");
    });

    events.addEventListener("reset", (message) => {
      enqueue(async () => {
        const raw = JSON.parse((message as MessageEvent<string>).data);
        if (
          raw?.reason !== "publication_cursor_expired" ||
          !Number.isInteger(raw.resumeAfterEventId) ||
          raw.resumeAfterEventId < 0
        ) {
          throw new Error("bad server reset event");
        }
        metadataCache.clear();
        writeScrollEntries([]);
        await refreshOfflineSnapshots();
        if (!closed) {
          writeLastAppliedEventId(userId, raw.resumeAfterEventId);
        }
      }, "Failed to handle server reset event");
    });

    events.onerror = () => {
      hadErrorRef.current = true;
    };

    events.onopen = () => {
      if (!hadErrorRef.current && !missedEventsRef.current) return;
      hadErrorRef.current = false;
      missedEventsRef.current = false;
      metadataCache.clear();
      writeScrollEntries([]);
    };

    return () => {
      closed = true;
      events.close();
    };
  }, [enabled, userId]);
}
