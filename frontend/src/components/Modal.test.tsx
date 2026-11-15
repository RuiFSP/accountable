import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "./Modal";

afterEach(cleanup);

function renderModal(onClose: () => void) {
  return render(
    <Modal title="Add deal" onClose={onClose}>
      <p>Form body</p>
    </Modal>,
  );
}

describe("Modal", () => {
  it("shows a titled dialog with its content", () => {
    renderModal(vi.fn());

    const dialog = screen.getByRole("dialog", { name: "Add deal" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Add deal" })).toBeTruthy();
    expect(screen.getByText("Form body")).toBeTruthy();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and ignores other keys", () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked but not when the dialog is", () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByText("Form body"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
