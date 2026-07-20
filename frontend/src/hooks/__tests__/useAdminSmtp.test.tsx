import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useAdminSmtp } from "../useAdminSmtp";
import * as api from "@/api/endpoints/admin";

vi.mock("@/api/endpoints/admin");

beforeEach(() => {
  vi.mocked(api.getAdminSettings).mockResolvedValue({ smtpHost: "h" });
});

describe("useAdminSmtp", () => {
  it("loads settings and derives smtp status", async () => {
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings.smtpHost).toBe("h");
    expect(result.current.smtpStatus).toBe("ok");
  });

  it("saves settings and shows toast", async () => {
    vi.mocked(api.saveAdminSettings).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAdminSmtp());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.save(); });
    expect(api.saveAdminSettings).toHaveBeenCalled();
    expect(result.current.savedToast).toBe(true);
  });
});
