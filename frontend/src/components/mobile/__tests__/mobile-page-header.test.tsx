// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import MobilePageHeader from "../mobile-page-header";

describe("MobilePageHeader", () => {
  it("принимает showUpload prop без ошибки (prop desktop-only, на мобиле игнорируется)", () => {
    renderWithProviders(<MobilePageHeader title="Каталог" showUpload />);
    expect(screen.getByText("Каталог")).toBeInTheDocument();
  });

  it("без showUpload prop рендерится штатно", () => {
    renderWithProviders(<MobilePageHeader title="Книга" />);
    expect(screen.getByText("Книга")).toBeInTheDocument();
  });

  it("crumb-ссылка имеет data-breadcrumb='true' — для useScrollRestore click-save ignore", () => {
    renderWithProviders(
      <MobilePageHeader title="Книга" breadcrumb={{ label: "Каталог", href: "/" }} />,
    );
    const link = screen.getByRole("link", { name: "Каталог" });
    expect(link).toHaveAttribute("data-breadcrumb", "true");
  });
});
