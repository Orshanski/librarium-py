import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/api/endpoints/admin", () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

import { listUsers, createUser, updateUser, deleteUser, type AdminUser } from "@/api/endpoints/admin";
import { useAdminUsers } from "../useAdminUsers";

const mockedListUsers = listUsers as ReturnType<typeof vi.fn>;
const mockedCreateUser = createUser as ReturnType<typeof vi.fn>;
const mockedUpdateUser = updateUser as ReturnType<typeof vi.fn>;
const mockedDeleteUser = deleteUser as ReturnType<typeof vi.fn>;

const USER: AdminUser = { id: 2, username: "reader", displayName: "R", email: null, role: "reader" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "alert").mockImplementation(() => {});
  mockedListUsers.mockResolvedValue({ users: [USER] });
});

describe("useAdminUsers", () => {
  it("loads users", async () => {
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([USER]);
  });

  it("optimistically updates name on saveName", async () => {
    mockedUpdateUser.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.saveName(2, "New"); });
    expect(result.current.users[0].displayName).toBe("New");
    expect(mockedUpdateUser).toHaveBeenCalledWith(2, { displayName: "New" });
  });

  it("optimistically updates role on saveRole", async () => {
    mockedUpdateUser.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.saveRole(2, "admin"); });
    expect(result.current.users[0].role).toBe("admin");
    expect(mockedUpdateUser).toHaveBeenCalledWith(2, { role: "admin" });
  });

  it("savePassword sends password key and does not touch the users list", async () => {
    mockedUpdateUser.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.savePassword(2, "newpass"); });
    expect(mockedUpdateUser).toHaveBeenCalledWith(2, { password: "newpass" });
    expect(result.current.users).toEqual([USER]);
  });

  it("createUser sends camelCase payload and appends the created user", async () => {
    mockedCreateUser.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.createUser({
        username: "newuser", password: "pw", role: "reader",
        displayName: "New User", email: "new@test.local",
      });
    });
    expect(mockedCreateUser).toHaveBeenCalledWith({
      username: "newuser", password: "pw", role: "reader",
      displayName: "New User", email: "new@test.local",
    });
    expect(result.current.users).toHaveLength(2);
    expect(result.current.users[1]).toEqual({
      id: 5, username: "newuser", displayName: "New User",
      email: "new@test.local", role: "reader",
    });
  });

  it("createUser rethrows on api error and leaves the users list untouched", async () => {
    mockedCreateUser.mockRejectedValue(new Error("Username taken"));
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      result.current.createUser({ username: "dup", password: "pw", role: "reader" })
    ).rejects.toThrow("Username taken");
    expect(result.current.users).toEqual([USER]);
  });

  it("removes user on confirmDelete", async () => {
    mockedDeleteUser.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.requestDelete(2));
    await act(async () => { await result.current.confirmDelete(); });
    expect(result.current.users).toEqual([]);
  });
});
