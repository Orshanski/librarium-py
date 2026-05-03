import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainEvents } from "../events";

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
