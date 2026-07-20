import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useAdminUsers } from "../useAdminUsers";
import * as api from "@/api/endpoints/admin";

vi.mock("@/api/endpoints/admin");

const USER: api.AdminUser = { id: 2, username: "reader", displayName: "R", email: null, role: "reader" };

beforeEach(() => {
  vi.mocked(api.listUsers).mockResolvedValue({ users: [USER] });
});

describe("useAdminUsers", () => {
  it("loads users", async () => {
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([USER]);
  });

  it("optimistically updates name on saveName", async () => {
    vi.mocked(api.updateUser).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.saveName(2, "New"); });
    expect(result.current.users[0].displayName).toBe("New");
    expect(api.updateUser).toHaveBeenCalledWith(2, { displayName: "New" });
  });

  it("removes user on confirmDelete", async () => {
    vi.mocked(api.deleteUser).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.requestDelete(2));
    await act(async () => { await result.current.confirmDelete(); });
    expect(result.current.users).toEqual([]);
  });
});
