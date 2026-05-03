// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error vendored Foliate JS has no TypeScript declarations.
import { Paginator } from "./paginator.js";

describe("foliate paginator lifecycle", () => {
  it("allows destroy before content is loaded", () => {
    const paginator = new Paginator();

    expect(() => paginator.destroy()).not.toThrow();
    expect(() => paginator.destroy()).not.toThrow();
  });
});
