import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainEvents, type DomainEventMap } from "../events";

describe("domainEvents", () => {
  beforeEach(() => {
    domainEvents.clear();
  });

  it("publishes events synchronously in subscription order", () => {
    const calls: string[] = [];
    domainEvents.subscribe("bookUpdated", () => calls.push("first"));
    domainEvents.subscribe("bookUpdated", () => calls.push("second"));

    domainEvents.publish("bookUpdated", {
      book: { id: 7, title: "Dune" },
      changedFields: ["title"],
    });

    expect(calls).toEqual(["first", "second"]);
  });

  it("unsubscribes handlers", () => {
    const handler = vi.fn();
    const unsubscribe = domainEvents.subscribe("bookDeleted", handler);

    unsubscribe();
    domainEvents.publish("bookDeleted", { bookId: 7 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("publishes hidden-state changes", () => {
    const handler = vi.fn();
    domainEvents.subscribe("bookHiddenChanged", handler);

    domainEvents.publish("bookHiddenChanged", { bookId: 7, isHidden: true });

    expect(handler).toHaveBeenCalledWith({ bookId: 7, isHidden: true });
  });

  it("isolates handler failures and keeps notifying later subscribers", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const later = vi.fn();
    domainEvents.subscribe("shelfMembershipChanged", () => {
      throw new Error("boom");
    });
    domainEvents.subscribe("shelfMembershipChanged", later);

    domainEvents.publish("shelfMembershipChanged", {
      shelfId: 2,
      bookId: 7,
      hasBook: true,
    });

    expect(later).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("DomainEventMap tag events", () => {
  beforeEach(() => {
    domainEvents.clear();
  });

  it("tagRenamed: tagId + name", () => {
    const handler = vi.fn<(p: DomainEventMap["tagRenamed"]) => void>();
    const unsub = domainEvents.subscribe("tagRenamed", handler);
    domainEvents.publish("tagRenamed", { tagId: 1, name: "Renamed" });
    expect(handler).toHaveBeenCalledWith({ tagId: 1, name: "Renamed" });
    unsub();
  });

  it("tagMerged: targetId + sourceId", () => {
    const handler = vi.fn<(p: DomainEventMap["tagMerged"]) => void>();
    const unsub = domainEvents.subscribe("tagMerged", handler);
    domainEvents.publish("tagMerged", { targetId: 2, sourceId: 1 });
    expect(handler).toHaveBeenCalledWith({ targetId: 2, sourceId: 1 });
    unsub();
  });

  it("tagDeleted: tagId", () => {
    const handler = vi.fn<(p: DomainEventMap["tagDeleted"]) => void>();
    const unsub = domainEvents.subscribe("tagDeleted", handler);
    domainEvents.publish("tagDeleted", { tagId: 5 });
    expect(handler).toHaveBeenCalledWith({ tagId: 5 });
    unsub();
  });
});
