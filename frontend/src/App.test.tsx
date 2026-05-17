import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor, act } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { server } from "@/test/msw/server";
import { AuthProvider } from "@/auth";
import { ResponsiveProvider } from "@/responsive";

// Spy on metadataCache.clear — mock module to intercept the singleton.
// vi.hoisted: factory runs before module evaluation, so the spy is in scope.
const { clearSpy } = vi.hoisted(() => ({ clearSpy: vi.fn() }));
vi.mock("@/cache", async () => {
  const actual = await vi.importActual<typeof import("@/cache")>("@/cache");
  return {
    ...actual,
    metadataCache: new Proxy(actual.metadataCache, {
      get(target, prop, receiver) {
        if (prop === "clear") return clearSpy;
        return Reflect.get(target, prop, receiver);
      },
    }),
  };
});

// PWA detection: force true so the offline-shell branch is reachable.
vi.mock("@/hooks/useIsPwa", () => ({ useIsPwa: () => true }));

// SSE: no-op (would otherwise hold an open EventSource).
vi.mock("@/sse/useServerEvents", () => ({ useServerEvents: () => undefined }));

import App from "./App";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value,
    writable: true,
    configurable: true,
  });
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <ResponsiveProvider>
          <App />
        </ResponsiveProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("App — offline→online catalog refetch (librarium-py-owgp)", () => {
  beforeEach(() => {
    clearSpy.mockClear();
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({
          id: 1,
          username: "admin",
          displayName: "Admin",
          email: null,
          role: "admin",
        }),
      ),
    );
  });

  afterEach(() => {
    setOnline(true);
  });

  it("invalidates metadata cache on transition out of OfflineShell", async () => {
    setOnline(false);
    renderApp();

    // Wait for auth + offline-shell to settle. OfflineShell renders "Оффлайн" badge.
    await waitFor(() => {
      expect(screen.getByText("Оффлайн")).toBeInTheDocument();
    });
    expect(clearSpy).not.toHaveBeenCalled();

    // Network restored: flip flag + dispatch event so useOnlineStatus updates.
    setOnline(true);
    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  it("does NOT invalidate metadata cache on plain online event without prior offline-shell", async () => {
    setOnline(true);
    renderApp();

    // Wait for auth to settle (any rendered content is fine).
    await waitFor(() => {
      // CatalogPage or router output settles — generic assertion via no offline badge.
      expect(screen.queryByText("Оффлайн")).not.toBeInTheDocument();
    });

    // A spurious online event in mid-session should not clear the cache —
    // showOffline never became true (online was true at mount), so wasOfflineRef.current
    // remained false; the offline→online branch is unreachable.
    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });

    // Allow any deferred effects to flush before asserting absence.
    await act(async () => {
      await Promise.resolve();
    });
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("does NOT invalidate metadata cache when online returns while user is in reader (avoids kicking out of book)", async () => {
    // User opens PWA offline → OfflineShell. Then taps a book → reader.
    // (Reader path matches /book/:id/read/:format → isReading=true → showOffline becomes false,
    // but wasOfflineRef remains true.) Then network returns.
    // Expectation: cache NOT cleared, no navigate — user stays in reader.
    setOnline(false);
    globalThis.history.replaceState({}, "", "/");
    render(
      <BrowserRouter>
        <AuthProvider>
          <ResponsiveProvider>
            <App />
          </ResponsiveProvider>
        </AuthProvider>
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Оффлайн")).toBeInTheDocument();
    });

    // Simulate user navigating into reader while still offline.
    // After this navigation isReading=true → App renders Routes (no OfflineShell)
    // because showOffline becomes false. wasOfflineRef stays true.
    act(() => {
      globalThis.history.pushState({}, "", "/book/1/read/epub");
      globalThis.dispatchEvent(new PopStateEvent("popstate"));
    });

    // Network returns.
    setOnline(true);
    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
