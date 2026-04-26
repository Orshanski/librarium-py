// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadDropZone from "../UploadDropZone";

describe("UploadDropZone", () => {
  it("groupsCount=0 → shows hint «FB2, EPUB, PDF или ZIP-архив»", () => {
    render(<UploadDropZone groupsCount={0} onFiles={() => {}} />);
    expect(screen.getByText(/FB2, EPUB, PDF/)).toBeInTheDocument();
    expect(screen.getByText("Перетащите файлы сюда")).toBeInTheDocument();
  });

  it("groupsCount>0 → no extension hint (condensed layout)", () => {
    render(<UploadDropZone groupsCount={2} onFiles={() => {}} />);
    expect(screen.queryByText(/FB2, EPUB, PDF/)).not.toBeInTheDocument();
    expect(screen.getByText("Перетащите файлы сюда")).toBeInTheDocument();
  });

  it("dropzone is a <label> wrapping hidden file input", () => {
    const { container } = render(<UploadDropZone groupsCount={0} onFiles={() => {}} />);
    const label = screen.getByTestId("upload-dropzone");
    expect(label.tagName).toBe("LABEL");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(label.contains(input)).toBe(true);
  });

  it("file <input> change → onFiles called and input reset", async () => {
    const onFiles = vi.fn();
    const { container } = render(<UploadDropZone groupsCount={0} onFiles={onFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "x.fb2", { type: "application/x-fictionbook" });
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });

  it("drop event fires onFiles with dropped files", () => {
    const onFiles = vi.fn();
    render(<UploadDropZone groupsCount={0} onFiles={onFiles} />);
    const label = screen.getByTestId("upload-dropzone");
    const file = new File(["x"], "x.fb2", { type: "application/x-fictionbook" });
    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    label.dispatchEvent(dropEvent);
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});
