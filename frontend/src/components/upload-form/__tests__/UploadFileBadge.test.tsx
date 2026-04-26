// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadFileBadge from "../UploadFileBadge";
import type { UploadEntry } from "../../upload-form.types";

function makeEntry(overrides: Partial<UploadEntry> = {}): UploadEntry {
  return {
    id: "f1", tempId: "", name: "book.fb2", size: "100 KB",
    format: "FB2", progress: 0, status: "uploading",
    ...overrides,
  };
}

describe("UploadFileBadge", () => {
  it("shows format and size", () => {
    render(<UploadFileBadge file={makeEntry({ format: "EPUB", size: "1.2 MB" })} showRemove={false} onRemove={() => {}} />);
    expect(screen.getByText("EPUB")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
  });

  it("uploading + progress < 99 → shows percent", () => {
    render(<UploadFileBadge file={makeEntry({ status: "uploading", progress: 42 })} showRemove={false} onRemove={() => {}} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.queryByText(/обработка/)).not.toBeInTheDocument();
  });

  it("uploading + progress >= 99 → shows spinner with «обработка…»", () => {
    render(<UploadFileBadge file={makeEntry({ status: "uploading", progress: 100 })} showRemove={false} onRemove={() => {}} />);
    expect(screen.getByText(/обработка/)).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("error → shows error message", () => {
    render(<UploadFileBadge file={makeEntry({ status: "error", error: "File too large" })} showRemove={false} onRemove={() => {}} />);
    expect(screen.getByText("File too large")).toBeInTheDocument();
  });

  it("showRemove=false → no ✕ button", () => {
    render(<UploadFileBadge file={makeEntry()} showRemove={false} onRemove={() => {}} />);
    expect(screen.queryByRole("button", { name: "✕" })).not.toBeInTheDocument();
  });

  it("showRemove=true + click → onRemove called", async () => {
    const onRemove = vi.fn();
    render(<UploadFileBadge file={makeEntry()} showRemove={true} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
