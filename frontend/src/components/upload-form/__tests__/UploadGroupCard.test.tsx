// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadGroupCard from "../UploadGroupCard";
import type { BookGroup } from "../../upload-form.types";

function makeGroup(overrides: Partial<BookGroup> = {}): BookGroup {
  return {
    key: "k1",
    metadata: {
      title: "Book", authors: "Author", series: "", seriesNumber: "",
      description: "", language: "ru", tags: "", publisher: "", pubDate: "", isbn: "",
      coverUrl: null,
    },
    files: [{ id: "f1", tempId: "t1", name: "book.fb2", size: "1 KB", format: "FB2", progress: 100, status: "ready" }],
    duplicate: null,
    duplicateAction: null,
    hasDuplicateFormat: false,
    ...overrides,
  };
}

const handlers = {
  onStartMerge: () => {}, onCancelMerge: () => {}, onPickAsTarget: () => {},
  onRemoveGroup: () => {}, onRemoveFile: () => {}, onSetDuplicateAction: () => {},
};

describe("UploadGroupCard", () => {
  it("renders metadata section when at least one ready file", () => {
    render(<UploadGroupCard group={makeGroup()} isMergeSource={false} isMergeTarget={false} showMergeButton={false} {...handlers} />);
    expect(screen.getByText("Book")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
  });

  it("metadata section hidden when no ready files (all uploading)", () => {
    const g = makeGroup({ files: [{ id: "f1", tempId: "", name: "x", size: "1 KB", format: "FB2", progress: 0, status: "uploading" }] });
    render(<UploadGroupCard group={g} isMergeSource={false} isMergeTarget={false} showMergeButton={false} {...handlers} />);
    expect(screen.queryByText("Book")).not.toBeInTheDocument();
  });

  it("hasDuplicateFormat=true → shows red warning", () => {
    render(<UploadGroupCard group={makeGroup({ hasDuplicateFormat: true })} isMergeSource={false} isMergeTarget={false} showMergeButton={false} {...handlers} />);
    expect(screen.getByText(/Одинаковый формат — дубликат будет пропущен/)).toBeInTheDocument();
  });

  it("duplicate present → DuplicateActionPicker rendered", () => {
    const g = makeGroup({ duplicate: { id: 42, title: "Existing", authors: [{ id: 1, name: "X" }] } });
    render(<UploadGroupCard group={g} isMergeSource={false} isMergeTarget={false} showMergeButton={false} {...handlers} />);
    expect(screen.getByText(/Похожая книга/)).toBeInTheDocument();
  });

  it("isMergeTarget=true → wrapper has role='button' and tabIndex=0; click → onPickAsTarget", async () => {
    const onPickAsTarget = vi.fn();
    render(<UploadGroupCard group={makeGroup()} isMergeSource={false} isMergeTarget={true} showMergeButton={false} {...handlers} onPickAsTarget={onPickAsTarget} />);
    const card = screen.getByTestId("upload-group");
    expect(card).toHaveAttribute("role", "button");
    expect(card).toHaveAttribute("tabindex", "0");
    await userEvent.click(card);
    expect(onPickAsTarget).toHaveBeenCalledTimes(1);
  });

  it("isMergeTarget=true + Enter key → onPickAsTarget", async () => {
    const onPickAsTarget = vi.fn();
    render(<UploadGroupCard group={makeGroup()} isMergeSource={false} isMergeTarget={true} showMergeButton={false} {...handlers} onPickAsTarget={onPickAsTarget} />);
    const card = screen.getByTestId("upload-group");
    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(onPickAsTarget).toHaveBeenCalledTimes(1);
  });

  it("isMergeTarget=false → wrapper has no role/tabIndex (not interactive)", () => {
    render(<UploadGroupCard group={makeGroup()} isMergeSource={false} isMergeTarget={false} showMergeButton={false} {...handlers} />);
    const card = screen.getByTestId("upload-group");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("tabindex");
  });

  it("renders one file badge per file", () => {
    const g = makeGroup({
      files: [
        { id: "f1", tempId: "t1", name: "1.fb2", size: "1 KB", format: "FB2", progress: 100, status: "ready" },
        { id: "f2", tempId: "t2", name: "2.epub", size: "2 KB", format: "EPUB", progress: 100, status: "ready" },
      ],
    });
    render(<UploadGroupCard group={g} isMergeSource={false} isMergeTarget={false} showMergeButton={false} {...handlers} />);
    expect(screen.getByText("FB2")).toBeInTheDocument();
    expect(screen.getByText("EPUB")).toBeInTheDocument();
  });
});
