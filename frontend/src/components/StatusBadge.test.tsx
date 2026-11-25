import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatusBadge from "./StatusBadge";

describe("StatusBadge", () => {
  it("keeps the status's name beside its tone", () => {
    render(<StatusBadge tone="positive">Paid</StatusBadge>);

    const badge = screen.getByText("Paid");
    expect(badge.className).toBe("badge badge-positive");
  });
});
