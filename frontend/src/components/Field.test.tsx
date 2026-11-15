import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Field from "./Field";

afterEach(cleanup);

describe("Field", () => {
  it("labels the control and points it at the hint", () => {
    render(
      <Field label="Probability (%)" hint="Kept until the stage changes.">
        <input type="number" />
      </Field>,
    );

    const input = screen.getByLabelText("Probability (%)") as HTMLInputElement;
    const label = screen.getByText("Probability (%)");
    const hint = screen.getByText("Kept until the stage changes.");

    expect(input.id).toBeTruthy();
    expect(label.getAttribute("for")).toBe(input.id);
    expect(hint.id).toBeTruthy();
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("leaves the control undescribed when there is no hint", () => {
    render(
      <Field label="Name">
        <input />
      </Field>,
    );

    const input = screen.getByLabelText("Name");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(screen.getByText("Name").tagName).toBe("LABEL");
  });

  it("passes children that are not a single control through untouched", () => {
    render(<Field label="Notes">Nothing to label here</Field>);

    expect(screen.getByText("Notes").tagName).toBe("LABEL");
    expect(screen.getByText("Nothing to label here")).toBeTruthy();
  });
});
