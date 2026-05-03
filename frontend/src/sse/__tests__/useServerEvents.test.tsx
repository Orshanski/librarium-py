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

  close() {
    this.closed = true;
  }
}

function Harness({
  enabled,
  resyncOnNextOpen = false,
}: {
  enabled: boolean;
  resyncOnNextOpen?: boolean;
}) {
  useServerEvents(enabled, { resyncOnNextOpen });
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens and closes an EventSource when enabled changes", () => {
    const { rerender, unmount } = render(<Harness enabled={true} />);
    expect(FakeEventSource.instances[0].url).toBe("/api/events/stream");
    expect(FakeEventSource.instances[0].init).toEqual({ withCredentials: true });

    rerender(<Harness enabled={false} />);
    expect(FakeEventSource.instances[0].closed).toBe(true);

    unmount();
  });

  it("closes the EventSource when unmounted while enabled", () => {
    const { unmount } = render(<Harness enabled={true} />);

    unmount();

    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("forwards domain events from the stream", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    render(<Harness enabled={true} />);
    FakeEventSource.instances[0].emitDomain({
      eventId: 1,
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    });

    expect(handler).toHaveBeenCalledWith({ bookId: 7 });
  });

  it("warns instead of crashing for invalid stream events", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<Harness enabled={true} />);
    FakeEventSource.instances[0].emitRawDomain("{bad json");

    expect(warn).toHaveBeenCalledWith(
      "Failed to dispatch server event",
      expect.any(Error),
    );
  });

  it("clears persisted metadata and scroll state on reconnect after an error", () => {
    metadataCache.set("books", "catalog", { books: [{ id: 1 }], hasMore: false });
    writeScrollEntries([{ url: "/", scrollTop: 100, version: 1 }]);

    render(<Harness enabled={true} />);
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

    const { rerender } = render(<Harness enabled={true} />);
    FakeEventSource.instances[0].onopen?.();

    rerender(<Harness enabled={false} />);
    expect(FakeEventSource.instances[0].closed).toBe(true);

    rerender(<Harness enabled={true} />);
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
