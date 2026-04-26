// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadGroupHeader from "../UploadGroupHeader";

function noop() {}

describe("UploadGroupHeader", () => {
  it("isMergeSource → only «Отмена» button", () => {
    render(<UploadGroupHeader isMergeSource={true} isMergeTarget={false} showMergeButton={true}
      onStartMerge={noop} onCancelMerge={noop} onRemoveGroup={noop} />);
    expect(screen.getByRole("button", { name: /Отмена/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Объединить/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✕" })).not.toBeInTheDocument();
  });

  it("isMergeTarget → hint text, no buttons", () => {
    render(<UploadGroupHeader isMergeSource={false} isMergeTarget={true} showMergeButton={true}
      onStartMerge={noop} onCancelMerge={noop} onRemoveGroup={noop} />);
    expect(screen.getByText("Нажмите для объединения")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("idle + showMergeButton=true → both ⊕ and ✕", () => {
    render(<UploadGroupHeader isMergeSource={false} isMergeTarget={false} showMergeButton={true}
      onStartMerge={noop} onCancelMerge={noop} onRemoveGroup={noop} />);
    expect(screen.getByRole("button", { name: /Объединить/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✕" })).toBeInTheDocument();
  });

  it("idle + showMergeButton=false → only ✕", () => {
    render(<UploadGroupHeader isMergeSource={false} isMergeTarget={false} showMergeButton={false}
      onStartMerge={noop} onCancelMerge={noop} onRemoveGroup={noop} />);
    expect(screen.queryByRole("button", { name: /Объединить/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✕" })).toBeInTheDocument();
  });

  it("«Объединить» click → onStartMerge with stopPropagation", async () => {
    const onStartMerge = vi.fn();
    render(<UploadGroupHeader isMergeSource={false} isMergeTarget={false} showMergeButton={true}
      onStartMerge={onStartMerge} onCancelMerge={noop} onRemoveGroup={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /Объединить/ }));
    expect(onStartMerge).toHaveBeenCalledTimes(1);
  });

  it("«Отмена» click → onCancelMerge", async () => {
    const onCancelMerge = vi.fn();
    render(<UploadGroupHeader isMergeSource={true} isMergeTarget={false} showMergeButton={true}
      onStartMerge={noop} onCancelMerge={onCancelMerge} onRemoveGroup={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /Отмена/ }));
    expect(onCancelMerge).toHaveBeenCalledTimes(1);
  });

  it("«✕» click → onRemoveGroup", async () => {
    const onRemoveGroup = vi.fn();
    render(<UploadGroupHeader isMergeSource={false} isMergeTarget={false} showMergeButton={true}
      onStartMerge={noop} onCancelMerge={noop} onRemoveGroup={onRemoveGroup} />);
    await userEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onRemoveGroup).toHaveBeenCalledTimes(1);
  });
});
