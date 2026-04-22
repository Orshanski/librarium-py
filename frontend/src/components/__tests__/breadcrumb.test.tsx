import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumb } from "../breadcrumb";

describe("<Breadcrumb />", () => {
  it("рендерит «← label» и ведёт на url", () => {
    render(
      <MemoryRouter>
        <Breadcrumb label="Авторы" url="/authors" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /Авторы/ });
    expect(link).toHaveAttribute("href", "/authors");
    expect(link).toHaveAttribute("data-breadcrumb", "true");
    expect(link.textContent).toContain("←");
  });
});
