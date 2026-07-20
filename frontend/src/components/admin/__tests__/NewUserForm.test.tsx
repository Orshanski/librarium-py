import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import NewUserForm from "../NewUserForm";

describe("NewUserForm", () => {
  it("disables create until password matches", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<NewUserForm onCreate={onCreate} />);
    await userEvent.click(screen.getByText("+ Добавить пользователя"));
    await userEvent.type(screen.getByPlaceholderText("username"), "u1");
    const [pass, confirm] = screen.getAllByLabelText(/пароль|повторите/i);
    await userEvent.type(pass, "pass1234");
    await userEvent.type(confirm, "different");
    expect(screen.getByText("Создать")).toBeDisabled();
    await userEvent.clear(confirm);
    await userEvent.type(confirm, "pass1234");
    expect(screen.getByText("Создать")).toBeEnabled();
  });

  it("calls onCreate with camelCase payload and resets on success", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<NewUserForm onCreate={onCreate} />);
    await userEvent.click(screen.getByText("+ Добавить пользователя"));
    await userEvent.type(screen.getByPlaceholderText("username"), "u1");
    const [pass, confirm] = screen.getAllByLabelText(/пароль|повторите/i);
    await userEvent.type(pass, "pass1234");
    await userEvent.type(confirm, "pass1234");
    await userEvent.click(screen.getByText("Создать"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ username: "u1", password: "pass1234", role: "reader" }),
    ));
    await waitFor(() => expect(screen.queryByPlaceholderText("username")).not.toBeInTheDocument());
    expect(screen.getByText("+ Добавить пользователя")).toBeInTheDocument();
  });
});
