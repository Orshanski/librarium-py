// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { metadataCache } from "@/cache";
import { domainEvents } from "@/domain/events";
import { ResponsiveProvider } from "@/responsive";
import { readScrollEntries, writeScrollEntries } from "@/scroll/list-scroll-validity";
import { server } from "@/test/msw/server";
import { AuthProvider } from "@/auth";
import * as offlineRefresh from "@/utils/offline-metadata-refresh";
import { registerCursorCriticalServerEventHandler } from "../server-events";
import { useServerEvents } from "../useServerEvents";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, (event: MessageEvent<string>) => void>();
  closed = false;

  constructor(public url: string, public init?: EventSourceInit) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: EventListener) {
    this.listeners.set(type, handler as (event: MessageEvent<string>) => void);
  }

  emitDomain(data: unknown) {
    this.listeners.get("domain")?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  emitRawDomain(data: string) {
    this.listeners.get("domain")?.({ data } as MessageEvent<string>);
  }

  emitReset(data: unknown) {
    this.listeners.get("reset")?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  emitRawReset(data: string) {
    this.listeners.get("reset")?.({ data } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

function Harness({
  enabled,
  userId,
  resyncOnNextOpen = false,
}: {
  enabled: boolean;
  userId?: number;
  resyncOnNextOpen?: boolean;
}) {
  useServerEvents(enabled, { userId, resyncOnNextOpen });
  return null;
}

function AppWithNavigation({ navigateTo }: { navigateTo?: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (navigateTo) navigate(navigateTo);
  }, [navigate, navigateTo]);

  return <App />;
}

function mockOnlineStatus(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderAuthenticatedApp(initialEntry: string, navigateTo?: string) {
  return render(
    <AuthProvider>
      <ResponsiveProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppWithNavigation navigateTo={navigateTo} />
        </MemoryRouter>
      </ResponsiveProvider>
    </AuthProvider>
  );
}

describe("useServerEvents", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    sessionStorage.clear();
    localStorage.clear();
    metadataCache.clear();
    domainEvents.clear();
    mockOnlineStatus(true);
    vi.spyOn(offlineRefresh, "refreshOfflineSnapshots").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens and closes an EventSource when enabled changes", () => {
    const { rerender, unmount } = render(<Harness enabled={true} userId={2} />);
    expect(FakeEventSource.instances[0].url).toBe("/api/events/stream");
    expect(FakeEventSource.instances[0].init).toEqual({ withCredentials: true });

    rerender(<Harness enabled={false} userId={2} />);
    expect(FakeEventSource.instances[0].closed).toBe(true);

    unmount();
  });

  it("closes the EventSource when unmounted while enabled", () => {
    const { unmount } = render(<Harness enabled={true} userId={2} />);

    unmount();

    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("does not open EventSource when enabled is true but userId is undefined", () => {
    render(<Harness enabled={true} />);

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("opens EventSource with the current user's stored cursor", () => {
    localStorage.setItem("librarium_sse_last_applied_event_id:user:2", "41");

    render(<Harness enabled={true} userId={2} />);

    expect(FakeEventSource.instances[0].url).toBe("/api/events/stream?since=41");
  });

  it("omits since for malformed stored cursors so the server starts at current tail", () => {
    localStorage.setItem("librarium_sse_last_applied_event_id:user:2", "1e6");

    render(<Harness enabled={true} userId={2} />);

    expect(FakeEventSource.instances[0].url).toBe("/api/events/stream");
  });

  it("advances the user cursor only after successful application", async () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    render(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[0].emitDomain({
      eventId: 5,
      publishedAt: "2026-05-27T08:00:00Z",
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    });

    await waitFor(() => expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBe("5"));
    expect(handler).toHaveBeenCalledWith({ bookId: 7 });
  });

  it("applies domain events serially before advancing the cursor", async () => {
    const firstApplication = deferred();
    const handler = vi.fn();
    const unregister = registerCursorCriticalServerEventHandler("bookDeleted", (payload) => (
      payload.bookId === 7 ? firstApplication.promise : Promise.resolve()
    ));
    domainEvents.subscribe("bookDeleted", handler);

    try {
      render(<Harness enabled={true} userId={2} />);
      FakeEventSource.instances[0].emitDomain({
        eventId: 5,
        publishedAt: "2026-05-27T08:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      });
      FakeEventSource.instances[0].emitDomain({
        eventId: 6,
        publishedAt: "2026-05-27T08:00:01Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 8 } },
      });

      await waitFor(() => expect(handler).toHaveBeenCalledWith({ bookId: 7 }));
      expect(handler).not.toHaveBeenCalledWith({ bookId: 8 });
      expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBeNull();

      firstApplication.resolve();

      await waitFor(() => expect(handler).toHaveBeenCalledWith({ bookId: 8 }));
      expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBe("6");
    } finally {
      unregister();
    }
  });

  it("closes the stream and does not advance past a failed domain event", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const firstApplication = deferred();
    const handler = vi.fn();
    const unregister = registerCursorCriticalServerEventHandler("bookDeleted", (payload) => (
      payload.bookId === 7 ? firstApplication.promise : Promise.resolve()
    ));
    domainEvents.subscribe("bookDeleted", handler);

    try {
      render(<Harness enabled={true} userId={2} />);
      const source = FakeEventSource.instances[0];
      source.emitDomain({
        eventId: 5,
        publishedAt: "2026-05-27T08:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      });
      source.emitDomain({
        eventId: 6,
        publishedAt: "2026-05-27T08:00:01Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 8 } },
      });

      await waitFor(() => expect(handler).toHaveBeenCalledWith({ bookId: 7 }));
      firstApplication.reject(new Error("apply failed"));

      await waitFor(() => expect(source.closed).toBe(true));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(handler).not.toHaveBeenCalledWith({ bookId: 8 });
      expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBeNull();
    } finally {
      unregister();
    }
  });

  it("does not advance cursor when JSON parse or apply fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    render(<Harness enabled={true} userId={2} />);
    const source = FakeEventSource.instances[0];
    source.emitRawDomain("{bad json");
    source.emitDomain({
      eventId: 6,
      publishedAt: "2026-05-27T08:00:00Z",
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: "bad" } },
    });

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(source.closed).toBe(true);
    expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips duplicate event ids already applied for the same user", () => {
    localStorage.setItem("librarium_sse_last_applied_event_id:user:2", "5");
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    render(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[0].emitDomain({
      eventId: 5,
      publishedAt: "2026-05-27T08:00:00Z",
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBe("5");
  });

  it("handles reset by clearing metadata and scroll state, refreshing offline snapshots, then storing resumeAfterEventId", async () => {
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    render(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[0].emitReset({
      reason: "publication_cursor_expired",
      resumeAfterEventId: 44,
    });

    await waitFor(() => expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBe("44"));
    expect(offlineRefresh.refreshOfflineSnapshots).toHaveBeenCalledTimes(1);
    expect(metadataCache.get("books", "catalog")).toBeUndefined();
    expect(readScrollEntries()).toEqual([]);
  });

  it("serializes reset handling after prior domain application", async () => {
    const firstApplication = deferred();
    const unregister = registerCursorCriticalServerEventHandler("bookDeleted", (payload) => (
      payload.bookId === 7 ? firstApplication.promise : Promise.resolve()
    ));
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    try {
      render(<Harness enabled={true} userId={2} />);
      FakeEventSource.instances[0].emitDomain({
        eventId: 5,
        publishedAt: "2026-05-27T08:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      });
      FakeEventSource.instances[0].emitReset({
        reason: "publication_cursor_expired",
        resumeAfterEventId: 44,
      });

      expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBeNull();
      expect(metadataCache.get("books", "catalog")).toEqual({ books: [{ id: 1 }], hasMore: false });
      expect(readScrollEntries()).toEqual([
        expect.objectContaining({ url: "/", scrollTop: 100, version: 1 }),
      ]);

      firstApplication.resolve();

      await waitFor(() => expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBe("44"));
      expect(metadataCache.get("books", "catalog")).toBeUndefined();
      expect(readScrollEntries()).toEqual([]);
    } finally {
      unregister();
    }
  });

  it("does not lower the cursor when a reset resumes after an older event", async () => {
    localStorage.setItem("librarium_sse_last_applied_event_id:user:2", "50");
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });

    render(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[0].emitReset({
      reason: "publication_cursor_expired",
      resumeAfterEventId: 44,
    });

    await waitFor(() => expect(metadataCache.get("books", "catalog")).toBeUndefined());
    expect(offlineRefresh.refreshOfflineSnapshots).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBe("50");
  });

  it("warns and does not write cursor for invalid reset events", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Harness enabled={true} userId={2} />);
    const source = FakeEventSource.instances[0];
    source.emitReset({
      reason: "other",
      resumeAfterEventId: 44,
    });
    source.emitRawReset("{bad json");

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(source.closed).toBe(true);
    expect(localStorage.getItem("librarium_sse_last_applied_event_id:user:2")).toBeNull();
  });

  it("uses separate cursor keys when user id changes and closes the old EventSource", () => {
    localStorage.setItem("librarium_sse_last_applied_event_id:user:2", "10");
    localStorage.setItem("librarium_sse_last_applied_event_id:user:3", "20");

    const { rerender } = render(<Harness enabled={true} userId={2} />);
    expect(FakeEventSource.instances[0].url).toBe("/api/events/stream?since=10");

    rerender(<Harness enabled={true} userId={3} />);

    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(FakeEventSource.instances[1].url).toBe("/api/events/stream?since=20");
  });

  it("clears persisted metadata and scroll state on reconnect after an error", () => {
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    render(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[0].onopen?.();

    expect(metadataCache.get("books", "catalog")).toEqual({ books: [{ id: 1 }], hasMore: false });
    expect(readScrollEntries()).toEqual([
      expect.objectContaining({ url: "/", scrollTop: 100, version: 1 }),
    ]);

    FakeEventSource.instances[0].onerror?.();
    FakeEventSource.instances[0].onopen?.();

    expect(metadataCache.get("books", "catalog")).toBeUndefined();
    expect(readScrollEntries()).toEqual([]);
  });

  it("keeps persisted metadata and scroll state across normal disable and enable", () => {
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    const { rerender } = render(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[0].onopen?.();

    rerender(<Harness enabled={false} userId={2} />);
    expect(FakeEventSource.instances[0].closed).toBe(true);

    rerender(<Harness enabled={true} userId={2} />);
    FakeEventSource.instances[1].onopen?.();

    expect(metadataCache.get("books", "catalog")).toEqual({ books: [{ id: 1 }], hasMore: false });
    expect(readScrollEntries()).toEqual([
      expect.objectContaining({ url: "/", scrollTop: 100, version: 1 }),
    ]);
  });

  it.each([
    ["/"],
    ["/admin"],
    ["/upload"],
    ["/book/7/edit"],
    ["/book/7/read/epub"],
  ])("installs one EventSource for authenticated route %s", async (route) => {
    renderAuthenticatedApp(route);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0].url).toBe("/api/events/stream");
  });

  it("does not install an EventSource when auth has no user", async () => {
    server.use(http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })));

    renderAuthenticatedApp("/");

    await waitFor(() => expect(document.body.textContent).not.toContain("Загрузка"));
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("keeps one EventSource when navigating between shell and reader routes", async () => {
    const { rerender } = renderAuthenticatedApp("/");
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const first = FakeEventSource.instances[0];

    rerender(
      <AuthProvider>
        <ResponsiveProvider>
          <MemoryRouter initialEntries={["/"]}>
            <AppWithNavigation navigateTo="/book/7/read/epub" />
          </MemoryRouter>
        </ResponsiveProvider>
      </AuthProvider>
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(first.closed).toBe(false);
  });

  it("clears persisted metadata and scroll state when PWA offline shell reconnects", async () => {
    sessionStorage.setItem("librarium_pwa_debug", "1");
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    renderAuthenticatedApp("/");
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].onopen?.();

    expect(metadataCache.get("books", "catalog")).toEqual({ books: [{ id: 1 }], hasMore: false });
    expect(readScrollEntries()).toEqual([
      expect.objectContaining({ url: "/", scrollTop: 100, version: 1 }),
    ]);

    act(() => {
      mockOnlineStatus(false);
      globalThis.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(FakeEventSource.instances[0].closed).toBe(true));

    act(() => {
      mockOnlineStatus(true);
      globalThis.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    FakeEventSource.instances[1].onopen?.();

    expect(metadataCache.get("books", "catalog")).toBeUndefined();
    expect(readScrollEntries()).toEqual([]);
  });

  it("clears persisted metadata and scroll state when app starts offline and first opens online", async () => {
    sessionStorage.setItem("librarium_pwa_debug", "1");
    mockOnlineStatus(false);
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    renderAuthenticatedApp("/");

    await waitFor(() => expect(document.body.textContent).not.toContain("Загрузка"));
    expect(FakeEventSource.instances).toHaveLength(0);

    act(() => {
      mockOnlineStatus(true);
      globalThis.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].onopen?.();

    expect(metadataCache.get("books", "catalog")).toBeUndefined();
    expect(readScrollEntries()).toEqual([]);
  });
});
