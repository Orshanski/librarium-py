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

  it("click on dropzone → opens file picker", async () => {
    const { container } = render(<UploadDropZone groupsCount={0} onFiles={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    const dropzone = screen.getByRole("button");
    await userEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("Enter key on dropzone → opens picker", async () => {
    const { container } = render(<UploadDropZone groupsCount={0} onFiles={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    const dropzone = screen.getByRole("button");
    dropzone.focus();
    await userEvent.keyboard("{Enter}");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("Space key on dropzone → opens picker", async () => {
    const { container } = render(<UploadDropZone groupsCount={0} onFiles={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    const dropzone = screen.getByRole("button");
    dropzone.focus();
    await userEvent.keyboard(" ");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
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

  it("dropzone has role='button' and tabIndex=0 (a11y)", () => {
    render(<UploadDropZone groupsCount={0} onFiles={() => {}} />);
    const dropzone = screen.getByRole("button");
    expect(dropzone).toHaveAttribute("tabindex", "0");
  });
});
