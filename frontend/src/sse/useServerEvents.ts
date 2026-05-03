import { useEffect, useRef } from "react";
import { metadataCache } from "@/cache";
import { writeScrollEntries } from "@/scroll/list-scroll-validity";
import { dispatchServerEvent } from "./server-events";

type UseServerEventsOptions = {
  resyncOnNextOpen?: boolean;
};

export function useServerEvents(enabled: boolean, options: UseServerEventsOptions = {}): void {
  const hadErrorRef = useRef(false);
  const missedEventsRef = useRef(false);
  const resyncOnNextOpen = options.resyncOnNextOpen ?? false;

  useEffect(() => {
    if (resyncOnNextOpen) missedEventsRef.current = true;
  }, [resyncOnNextOpen]);

  useEffect(() => {
    if (!enabled) return;

    const events = new EventSource("/api/events/stream", { withCredentials: true });

    events.addEventListener("domain", (message) => {
      try {
        dispatchServerEvent(JSON.parse((message as MessageEvent<string>).data));
      } catch (error) {
        console.warn("Failed to dispatch server event", error);
      }
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
  }, [enabled]);
}
