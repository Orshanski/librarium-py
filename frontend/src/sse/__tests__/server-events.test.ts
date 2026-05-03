import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainEvents } from "@/domain/events";
import { dispatchServerEvent } from "../server-events";

describe("dispatchServerEvent", () => {
  beforeEach(() => {
    domainEvents.clear();
  });

  it("forwards committed server domain events to the local bus", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    dispatchServerEvent({
      eventId: 1,
      scope: { kind: "library" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    });

    expect(handler).toHaveBeenCalledWith({ bookId: 7 });
  });

  it("rejects events with unknown domain type", () => {
    expect(() => dispatchServerEvent({
      eventId: 2,
      scope: { kind: "library" },
      event: { type: "unknownEvent", payload: {} },
    })).toThrow(/unknown/i);
  });

  it("rejects malformed scope and payload before publishing", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookDeleted", handler);

    expect(() => dispatchServerEvent({
      eventId: 3,
      scope: { kind: "user" },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    })).toThrow(/scope/i);

    expect(() => dispatchServerEvent({
      eventId: 4,
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
        scope: { kind: "library" },
        event: { type: "bookDeleted", payload: { bookId: 7 } },
      },
      {
        eventId: 8,
        scope: { kind: "library" },
      },
      {
        eventId: 9,
        scope: { kind: "library" },
        event: null,
      },
      {
        eventId: 10,
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
      scope: { kind: "library" },
      event: { type: "bookRatingChanged", payload: { bookId: 7, rating: 5 } },
    })).toThrow(/scope/i);

    expect(() => dispatchServerEvent({
      eventId: 6,
      scope: { kind: "user", userId: 2 },
      event: { type: "bookDeleted", payload: { bookId: 7 } },
    })).toThrow(/scope/i);
  });

  it("accepts optional fields without requiring them and preserves extra book fields", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookUpdated", handler);

    dispatchServerEvent({
      eventId: 7,
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

  it("rejects server bookUpdated detail before publishing", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookUpdated", handler);

    expect(() => dispatchServerEvent({
      eventId: 9,
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
        scope: { kind: "library" },
        event: {
          type: "bookUpdated",
          payload: { book: { id: 9 }, changedFields: [field] },
        },
      })).toThrow(/payload/i);

      expect(handler).not.toHaveBeenCalled();
    },
  );

});
