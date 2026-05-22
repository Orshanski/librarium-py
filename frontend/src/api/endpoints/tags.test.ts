import { describe, it, expect, vi, beforeEach } from "vitest";
import { renameTag, mergeTag, deleteTag } from "./tags";

vi.mock("../client", () => ({ client: vi.fn() }));
import { client } from "../client";

describe("tags API client", () => {
  beforeEach(() => {
    vi.mocked(client).mockReset();
    vi.mocked(client).mockResolvedValue({ ok: true });
  });

  it("renameTag PUT /api/tags/{id}", async () => {
    await renameTag(7, "Новый жанр");
    expect(client).toHaveBeenCalledWith("PUT", "/api/tags/7", { body: { name: "Новый жанр" } });
  });

  it("mergeTag POST /api/tags/{id}/merge", async () => {
    await mergeTag(2, 1);
    expect(client).toHaveBeenCalledWith("POST", "/api/tags/2/merge", { body: { sourceId: 1 } });
  });

  it("deleteTag DELETE /api/tags/{id}", async () => {
    await deleteTag(3);
    expect(client).toHaveBeenCalledWith("DELETE", "/api/tags/3");
  });
});
