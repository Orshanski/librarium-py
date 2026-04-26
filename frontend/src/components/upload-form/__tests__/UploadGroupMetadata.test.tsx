// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UploadGroupMetadata from "../UploadGroupMetadata";
import type { UploadMetadata } from "@/api/endpoints/upload";

function makeMeta(overrides: Partial<UploadMetadata> = {}): UploadMetadata {
  return {
    title: "Title", authors: "Author", series: "", seriesNumber: "",
    description: "", language: "ru", tags: "fiction", publisher: "", pubDate: "", isbn: "",
    coverUrl: null,
    ...overrides,
  };
}

describe("UploadGroupMetadata", () => {
  it("renders 4 always-visible fields with values", () => {
    const { container } = render(<UploadGroupMetadata metadata={makeMeta()} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
    expect(screen.getByText("ru")).toBeInTheDocument();
    expect(screen.getByText("fiction")).toBeInTheDocument();
    // No img when coverUrl=null
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders coverUrl as <img>", () => {
    const { container } = render(<UploadGroupMetadata metadata={makeMeta({ coverUrl: "/cover.jpg" })} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/cover.jpg");
  });

  it("series field is conditionally rendered (visible when non-empty)", () => {
    render(<UploadGroupMetadata metadata={makeMeta({ series: "Foundation", seriesNumber: "3" })} />);
    expect(screen.getByText("Серия")).toBeInTheDocument();
    expect(screen.getByText(/Foundation/)).toBeInTheDocument();
    expect(screen.getByText(/#3/)).toBeInTheDocument();
  });

  it("series field hidden when empty", () => {
    render(<UploadGroupMetadata metadata={makeMeta({ series: "" })} />);
    expect(screen.queryByText("Серия")).not.toBeInTheDocument();
  });

  it("empty title/authors/language/tags shown as «—»", () => {
    render(<UploadGroupMetadata metadata={makeMeta({ title: "", authors: "", language: "", tags: "" })} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(4);
  });
});
