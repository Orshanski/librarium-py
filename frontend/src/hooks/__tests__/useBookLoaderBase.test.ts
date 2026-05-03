// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadLocalData,
  fetchBookMetadata,
  markUnreadInBackground,
} from "../useBookLoaderBase";
import { domainEvents } from "@/domain/events";

vi.mock("../../utils/offline-storage", () => ({
  getProgress: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("@/api/endpoints/books", () => ({
  getBook: vi.fn(),
  setRead: vi.fn(),
}));

import { getProgress, getSettings } from "../../utils/offline-storage";
import { getBook, setRead } from "@/api/endpoints/books";

const mockedGetProgress = getProgress as ReturnType<typeof vi.fn>;
const mockedGetSettings = getSettings as ReturnType<typeof vi.fn>;
const mockedGetBook = getBook as ReturnType<typeof vi.fn>;
const mockedSetRead = setRead as ReturnType<typeof vi.fn>;

const ORIG_NAVIGATOR_ONLINE = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  "onLine",
);

function setOnline(online: boolean) {
  Object.defineProperty(globalThis.navigator, "onLine", {
    value: online,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  domainEvents.clear();
  setOnline(true);
});

afterEach(() => {
  if (ORIG_NAVIGATOR_ONLINE) {
    Object.defineProperty(globalThis.navigator, "onLine", ORIG_NAVIGATOR_ONLINE);
  }
});

describe("loadLocalData", () => {
  it("returns both local progress and settings in parallel", async () => {
    mockedGetProgress.mockResolvedValue({ bookId: 42, fraction: 0.5 });
    mockedGetSettings.mockResolvedValue({ deviceType: "mac", settings: {} });
    const result = await loadLocalData(42, "mac");
    expect(mockedGetProgress).toHaveBeenCalledWith(42);
    expect(mockedGetSettings).toHaveBeenCalledWith("mac");
    expect(result.localProgress).toEqual({ bookId: 42, fraction: 0.5 });
    expect(result.localSettings).toEqual({ deviceType: "mac", settings: {} });
  });

  it("propagates null from either dependency", async () => {
    mockedGetProgress.mockResolvedValue(null);
    mockedGetSettings.mockResolvedValue(null);
    const result = await loadLocalData(1, "x");
    expect(result.localProgress).toBeNull();
    expect(result.localSettings).toBeNull();
  });
});

describe("fetchBookMetadata", () => {
  it("offline: returns blobTitle and null bookData without network call", async () => {
    setOnline(false);
    const result = await fetchBookMetadata("42", false, "Local title");
    expect(mockedGetBook).not.toHaveBeenCalled();
    expect(result).toEqual({ title: "Local title", bookData: null });
  });

  it("online + !fromOffline: replaces blob title with server title", async () => {
    mockedGetBook.mockResolvedValue({ book: { title: "Server title" } });
    const result = await fetchBookMetadata("42", false, "Local title");
    expect(result.title).toBe("Server title");
    expect(result.bookData).toEqual({ book: { title: "Server title" } });
  });

  it("online + !fromOffline + missing book.title: falls back to empty string", async () => {
    mockedGetBook.mockResolvedValue({ book: { title: "" } });
    const result = await fetchBookMetadata("42", false, "Local title");
    expect(result.title).toBe("");
  });

  it("online + fromOffline: keeps blob title even when server has one", async () => {
    mockedGetBook.mockResolvedValue({ book: { title: "Server title" } });
    const result = await fetchBookMetadata("42", true, "Local title");
    expect(result.title).toBe("Local title");
  });

  it("online + !fromOffline + getBook throws: rethrows Error", async () => {
    mockedGetBook.mockRejectedValue(new Error("network down"));
    await expect(fetchBookMetadata("42", false, "Local title")).rejects.toThrow("network down");
  });

  it("online + fromOffline + getBook throws: swallowed, returns blob title and null bookData", async () => {
    mockedGetBook.mockRejectedValue(new Error("network down"));
    const result = await fetchBookMetadata("42", true, "Local title");
    expect(result).toEqual({ title: "Local title", bookData: null });
  });
});

describe("markUnreadInBackground", () => {
  it("calls setRead(id, false) when online and publishes event after success", async () => {
    mockedSetRead.mockResolvedValue(undefined);
    const events: Array<{ bookId: number; isRead: boolean }> = [];
    domainEvents.subscribe("bookReadChanged", (payload) => events.push(payload));

    markUnreadInBackground("42", { book: { isRead: 1 } } as never);

    expect(mockedSetRead).toHaveBeenCalledWith(42, false);
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([{ bookId: 42, isRead: false }]);
  });

  it("does NOT call setRead when offline", () => {
    setOnline(false);
    markUnreadInBackground("42", { book: { isRead: 1 } } as never);
    expect(mockedSetRead).not.toHaveBeenCalled();
  });

  it("does NOT call setRead when isRead is 0/null/undefined", () => {
    markUnreadInBackground("42", { book: { isRead: 0 } } as never);
    markUnreadInBackground("42", { book: { isRead: null } } as never);
    markUnreadInBackground("42", { book: {} } as never);
    markUnreadInBackground("42", null);
    expect(mockedSetRead).not.toHaveBeenCalled();
  });

  it("survives setRead rejection without throwing (catch attached)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedSetRead.mockRejectedValue(new Error("nope"));
    markUnreadInBackground("42", { book: { isRead: 1 } } as never);
    // Wait microtask so the .catch runs.
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledWith("Failed to clear isRead:", expect.any(Error));
    warnSpy.mockRestore();
  });
});
