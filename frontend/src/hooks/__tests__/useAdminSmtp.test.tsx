import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/api/endpoints/admin", () => ({
  getAdminSettings: vi.fn(),
  saveAdminSettings: vi.fn(),
  smtpTest: vi.fn(),
}));

import { getAdminSettings, saveAdminSettings, smtpTest } from "@/api/endpoints/admin";
import { useAdminSmtp } from "../useAdminSmtp";

const mockedGetAdminSettings = getAdminSettings as ReturnType<typeof vi.fn>;
const mockedSaveAdminSettings = saveAdminSettings as ReturnType<typeof vi.fn>;
const mockedSmtpTest = smtpTest as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAdminSettings.mockResolvedValue({ smtpHost: "h" });
});

describe("useAdminSmtp", () => {
  it("loads settings and derives smtp status", async () => {
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings.smtpHost).toBe("h");
    expect(result.current.smtpStatus).toBe("ok");
  });

  it("loading empty settings derives smtpStatus none", async () => {
    mockedGetAdminSettings.mockResolvedValue({});
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.smtpStatus).toBe("none");
  });

  it("saves settings and shows toast", async () => {
    mockedSaveAdminSettings.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.save(); });
    // тело сохранения — camelCase, без трансформации в хуке
    expect(mockedSaveAdminSettings).toHaveBeenCalledWith({ smtpHost: "h" });
    expect(result.current.savedToast).toBe(true);
  });

  it("testConnection succeeds and sets smtpStatus to ok", async () => {
    mockedSaveAdminSettings.mockResolvedValue({ ok: true });
    mockedSmtpTest.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.testConnection(); });
    expect(result.current.smtpStatus).toBe("ok");
    expect(result.current.smtpError).toBe("");
  });

  it("testConnection failure sets smtpStatus to none with an error message", async () => {
    mockedSaveAdminSettings.mockResolvedValue({ ok: true });
    mockedSmtpTest.mockRejectedValue(new Error("SMTP auth failed"));
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.testConnection(); });
    expect(result.current.smtpStatus).toBe("none");
    expect(result.current.smtpError).toBe("SMTP auth failed");
  });

  it("dirty is false right after load (unchanged settings)", async () => {
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dirty).toBe(false);
  });

  it("dirty becomes true after a field change", async () => {
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setField("smtpHost", "changed"));
    expect(result.current.dirty).toBe(true);
  });

  it("dirty resets to false after save", async () => {
    mockedSaveAdminSettings.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setField("smtpHost", "changed"));
    expect(result.current.dirty).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(result.current.dirty).toBe(false);
  });
});
