// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import UploadActions from "../UploadActions";

const baseProps = {
  saved: false, saving: false, uploading: false,
  readyCount: 0, saveDisabledExtra: false,
  onSave: () => {}, onCancel: () => {}, onResetSaved: () => {},
};

describe("UploadActions", () => {
  it("!saved → save and cancel buttons rendered", () => {
    renderWithProviders(<UploadActions {...baseProps} readyCount={2} />);
    expect(screen.getByRole("button", { name: /Сохранить всё \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Отменить всё/ })).toBeInTheDocument();
  });

  it("saved → success footer with both nav buttons", () => {
    renderWithProviders(<UploadActions {...baseProps} saved={true} />);
    expect(screen.getByText("Сохранено!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В каталог" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить ещё" })).toBeInTheDocument();
  });

  it("readyCount=0 → save button disabled", () => {
    renderWithProviders(<UploadActions {...baseProps} readyCount={0} />);
    expect(screen.getByRole("button", { name: /Сохранить всё/ })).toBeDisabled();
  });

  it("uploading=true → save button disabled", () => {
    renderWithProviders(<UploadActions {...baseProps} readyCount={2} uploading={true} />);
    expect(screen.getByRole("button", { name: /Сохранить всё/ })).toBeDisabled();
  });

  it("saving=true → save shows «Сохранение...» and is disabled", () => {
    renderWithProviders(<UploadActions {...baseProps} readyCount={2} saving={true} />);
    expect(screen.getByRole("button", { name: /Сохранение/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Отменить всё/ })).toBeDisabled();
  });

  it("saveDisabledExtra=true → save button disabled (duplicate without action)", () => {
    renderWithProviders(<UploadActions {...baseProps} readyCount={2} saveDisabledExtra={true} />);
    expect(screen.getByRole("button", { name: /Сохранить всё/ })).toBeDisabled();
  });

  it("save click → onSave", async () => {
    const onSave = vi.fn();
    renderWithProviders(<UploadActions {...baseProps} readyCount={2} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /Сохранить всё/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("cancel click → onCancel", async () => {
    const onCancel = vi.fn();
    renderWithProviders(<UploadActions {...baseProps} readyCount={2} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /Отменить всё/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("«Загрузить ещё» click → onResetSaved", async () => {
    const onResetSaved = vi.fn();
    renderWithProviders(<UploadActions {...baseProps} saved={true} onResetSaved={onResetSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Загрузить ещё" }));
    expect(onResetSaved).toHaveBeenCalledTimes(1);
  });
});
