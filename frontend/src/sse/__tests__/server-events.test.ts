import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainEvents } from "@/domain/events";
import {
  applyServerEvent,
  dispatchServerEvent,
  registerCursorCriticalServerEventHandler,
} from "../server-events";
import { installOfflineStorageHandlersForApp, resetOfflineStorageHandlersForTests } from "@/offline/bootstrap";
import { removeBookFromLocalStorage } from "@/utils/offline-storage";

vi.mock("@/utils/offline-storage", () => ({
  removeBookFromLocalStorage: vi.fn().mockResolvedValue(undefined),
}));

describe("dispatchServerEvent", () => {
  beforeEach(() => {
    domainEvents.clear();
    resetOfflineStorageHandlersForTests();
    vi.mocked(removeBookFromLocalStorage).mockReset();
    vi.mocked(removeBookFromLocalStorage).mockResolvedValue(undefined);
  });

  it("forwards committed server domain events to the local bus", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    dispatchServerEvent({
      eventId: 1,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    });

    expect(handler).toHaveBeenCalledWith({ bookId: 7 });
  });

  it("rejects events with unknown domain type", () => {
    expect(() => dispatchServerEvent({
      eventId: 2,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "unknownEvent", payload: {} },
    })).toThrow(/unknown/i);
  });

  it("rejects malformed scope and payload before publishing", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    expect(() => dispatchServerEvent({
      eventId: 3,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "user" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    })).toThrow(/scope/i);

    expect(() => dispatchServerEvent({
      eventId: 4,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: {} },
    })).toThrow(/payload/i);

    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects malformed top-level envelopes before publishing", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    const invalidEvents = [
      null,
      [],
      {
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      },
      {
        eventId: "8",
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      },
      {
        eventId: 8,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
      },
      {
        eventId: 9,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: null,
      },
      {
        eventId: 10,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: { payload: { bookId: 7 } },
      },
    ];

    for (const event of invalidEvents) {
      expect(() => dispatchServerEvent(event)).toThrow();
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects semantically wrong delivery scope for event type", () => {
    expect(() => dispatchServerEvent({
      eventId: 5,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "bookRatingChanged", payload: { bookId: 7, rating: 5 } },
    })).toThrow(/scope/i);

    expect(() => dispatchServerEvent({
      eventId: 6,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "user", userId: 2 },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    })).toThrow(/scope/i);
  });

  it("accepts optional fields without requiring them and preserves extra book fields", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookUpdated", handler);

    dispatchServerEvent({
      eventId: 7,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: {
        type: "bookUpdated",
        payload: { book: { id: 9, backendExtra: "preserved" }, changedFields: ["title"] },
      },
    });

    expect(handler).toHaveBeenCalledWith({
      book: { id: 9, backendExtra: "preserved" },
      changedFields: ["title"],
    });
  });

  it("accepts precise affected values for membership book updates", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookUpdated", handler);

    dispatchServerEvent({
      eventId: 8,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: {
        type: "bookUpdated",
        payload: {
          book: { id: 9 },
          changedFields: ["authors", "series", "tags", "language"],
          affected: {
            authorIds: [1, 2],
            seriesIds: [3, 4],
            tagIds: [5, 6],
            languages: ["ru", "en"],
          },
        },
      },
    });

    expect(handler).toHaveBeenCalledWith({
      book: { id: 9 },
      changedFields: ["authors", "series", "tags", "language"],
      affected: {
        authorIds: [1, 2],
        seriesIds: [3, 4],
        tagIds: [5, 6],
        languages: ["ru", "en"],
      },
    });
  });

  it("rejects server bookUpdated detail before publishing", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookUpdated", handler);

    expect(() => dispatchServerEvent({
      eventId: 9,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: {
        type: "bookUpdated",
        payload: {
          book: { id: 9 },
          detail: { book: { title: "Missing id" }, files: [], identifiers: [] },
          changedFields: ["title"],
        },
      },
    })).toThrow(/payload/i);

    expect(() => dispatchServerEvent({
      eventId: 10,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: {
        type: "bookUpdated",
        payload: {
          book: { id: 9 },
          detail: { book: { id: 9 }, files: [{}], identifiers: [{}] },
          changedFields: ["files"],
        },
      },
    })).toThrow(/payload/i);

    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["rating", "read"] as const)(
    "rejects library bookUpdated with user-scoped changed field %s",
    (field) => {
      const handler = vi.fn();
      domainEvents.subscribe("bookUpdated", handler);

      expect(() => dispatchServerEvent({
        eventId: 11,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: {
          type: "bookUpdated",
          payload: { book: { id: 9 }, changedFields: [field] },
        },
      })).toThrow(/payload/i);

      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("awaits cursor-critical async handlers before resolving", async () => {
    const calls: string[] = [];
    const unsubscribe = registerCursorCriticalServerEventHandler("bookDeleted", async (payload) => {
      calls.push(`start:${payload.bookId}`);
      await Promise.resolve();
      calls.push(`done:${payload.bookId}`);
    });

    try {
      const applied = applyServerEvent({
        eventId: 12,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      }).then((envelope) => {
        calls.push(`resolved:${envelope.eventId}`);
      });

      expect(calls).toEqual(["start:7"]);
      await Promise.resolve();
      expect(calls).toEqual(["start:7", "done:7"]);

      await applied;
      expect(calls).toEqual(["start:7", "done:7", "resolved:12"]);
    } finally {
      unsubscribe();
    }
  });

  it("rejects when cursor-critical async handler fails", async () => {
    const unsubscribe = registerCursorCriticalServerEventHandler("bookDeleted", async () => {
      throw new Error("idb failed");
    });

    try {
      await expect(applyServerEvent({
        eventId: 13,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      })).rejects.toThrow("idb failed");
    } finally {
      unsubscribe();
    }
  });

  it("keeps dispatchServerEvent sync and separate from cursor-critical handlers", async () => {
    const handler = vi.fn(async () => undefined);
    const unsubscribe = registerCursorCriticalServerEventHandler("bookDeleted", handler);

    try {
      dispatchServerEvent({
        eventId: 14,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      });

      expect(handler).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(handler).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("rejects envelopes with missing or non-string publishedAt before publishing", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    expect(() => dispatchServerEvent({
      eventId: 15,
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    })).toThrow(/published/i);

    expect(() => dispatchServerEvent({
      eventId: 16,
      publishedAt: 123,
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    })).toThrow(/published/i);

    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps duplicate cursor-critical registrations independent", async () => {
    const handler = vi.fn(async () => undefined);
    const unsubscribeFirst = registerCursorCriticalServerEventHandler("bookDeleted", handler);
    const unsubscribeSecond = registerCursorCriticalServerEventHandler("bookDeleted", handler);

    try {
      unsubscribeFirst();

      await applyServerEvent({
        eventId: 17,
        publishedAt: "2026-05-27T10:00:00Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribeSecond();
      await applyServerEvent({
        eventId: 18,
        publishedAt: "2026-05-27T10:00:01Z",
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 8 } },
      });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribeFirst();
      unsubscribeSecond();
    }
  });

  it("awaits offline read cleanup failure before resolving replayed read events", async () => {
    vi.mocked(removeBookFromLocalStorage).mockRejectedValue(new Error("idb failed"));
    installOfflineStorageHandlersForApp();

    await expect(applyServerEvent({
      eventId: 19,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "user", userId: 2 },
      event: { type: "bookReadChanged", payload: { bookId: 7, isRead: true } },
    })).rejects.toThrow("idb failed");

    expect(removeBookFromLocalStorage).toHaveBeenCalledWith(7);
  });

  it("resolves replayed unread events without offline cleanup", async () => {
    vi.mocked(removeBookFromLocalStorage).mockRejectedValue(new Error("should not run"));
    installOfflineStorageHandlersForApp();

    await expect(applyServerEvent({
      eventId: 20,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "user", userId: 2 },
      event: { type: "bookReadChanged", payload: { bookId: 7, isRead: false } },
    })).resolves.toMatchObject({ eventId: 20 });

    expect(removeBookFromLocalStorage).not.toHaveBeenCalled();
  });

});

describe("SSE bridge tag events", () => {
  beforeEach(() => {
    domainEvents.clear();
  });

  it("tagRenamed: dispatches to domainEvents", () => {
    const handler = vi.fn();
    const unsub = domainEvents.subscribe("tagRenamed", handler);
    dispatchServerEvent({
      eventId: 1,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "tagRenamed", payload: { tagId: 1, name: "X" } },
    });
    expect(handler).toHaveBeenCalledWith({ tagId: 1, name: "X" });
    unsub();
  });

  it("tagMerged: dispatches to domainEvents", () => {
    const handler = vi.fn();
    const unsub = domainEvents.subscribe("tagMerged", handler);
    dispatchServerEvent({
      eventId: 2,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "tagMerged", payload: { targetId: 2, sourceId: 1 } },
    });
    expect(handler).toHaveBeenCalledWith({ targetId: 2, sourceId: 1 });
    unsub();
  });

  it("tagDeleted: dispatches to domainEvents", () => {
    const handler = vi.fn();
    const unsub = domainEvents.subscribe("tagDeleted", handler);
    dispatchServerEvent({
      eventId: 3,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "tagDeleted", payload: { tagId: 5 } },
    });
    expect(handler).toHaveBeenCalledWith({ tagId: 5 });
    unsub();
  });

  it("tagRenamed: rejects payload without name", () => {
    expect(() => dispatchServerEvent({
      eventId: 4,
      publishedAt: "2026-05-27T10:00:00Z",
      scope: { kind: "library" },
      event: { type: "tagRenamed", payload: { tagId: 1 } },
    })).toThrow();
  });
});
