// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import PageHeader from "../page-header";

describe("PageHeader — breadcrumb", () => {
  it("рендерит crumb с label и href", () => {
    renderWithProviders(
      <PageHeader title="Path of Kings" breadcrumb={{ label: "Каталог", href: "/" }} />,
    );
    const link = screen.getByRole("link", { name: "Каталог" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("<a> крошки имеет data-breadcrumb='true' (нужно для useScrollRestore click-save ignore)", () => {
    renderWithProviders(
      <PageHeader title="Книга" breadcrumb={{ label: "Авторы", href: "/authors" }} />,
    );
    const link = screen.getByRole("link", { name: "Авторы" });
    expect(link).toHaveAttribute("data-breadcrumb", "true");
  });

  it("без breadcrumb prop — crumb не рендерится", () => {
    renderWithProviders(<PageHeader title="Каталог" />);
    expect(screen.queryByRole("link", { name: "/" })).not.toBeInTheDocument();
  });
});
