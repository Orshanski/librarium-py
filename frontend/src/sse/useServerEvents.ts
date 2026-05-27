import { useEffect, useRef } from "react";
import { metadataCache } from "@/cache";
import { writeScrollEntries } from "@/scroll/list-scroll-validity";
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
    const events = new EventSource(`/api/events/stream?since=${since}`, { withCredentials: true });

    events.addEventListener("domain", (message) => {
      void (async () => {
        try {
          const raw = JSON.parse((message as MessageEvent<string>).data);
          if (typeof raw?.eventId === "number" && raw.eventId <= readLastAppliedEventId(userId)) {
            return;
          }
          const envelope = await applyServerEvent(raw);
          writeLastAppliedEventId(userId, envelope.eventId);
        } catch (error) {
          console.warn("Failed to dispatch server event", error);
        }
      })();
    });

    events.addEventListener("reset", (message) => {
      void (async () => {
        try {
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
          writeLastAppliedEventId(userId, raw.resumeAfterEventId);
        } catch (error) {
          console.warn("Failed to handle server reset event", error);
        }
      })();
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
      events.close();
    };
  }, [enabled, userId]);
}
