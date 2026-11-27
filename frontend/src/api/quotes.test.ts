import { afterEach, describe, expect, it, vi } from "vitest";

import { signInLocal, signOut } from "../lib/session";
import { api } from "./client";
import type { QuoteInput, QuoteListReply, QuoteUpdateInput } from "./quotes";

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
});

async function signInForTests(): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "local-token",
        email: "alex@brightloop.example",
      }),
    }),
  );
  await signInLocal("alex");
}

const listReply: QuoteListReply = {
  quotes: [
    {
      id: 1,
      number: "QT-0001",
      deal_id: 5,
      deal_name: "Store rollout",
      organization_id: 7,
      organization_name: "Northwind Traders",
      status: "draft",
      created_at: "2026-11-26",
      valid_until: "2026-12-26",
      tax_label: "Sales tax",
      tax_rate_thousandths: 8875,
      subtotal_cents: 100_000,
      tax_cents: 8_875,
      total_cents: 108_875,
    },
  ],
  totals: {
    draft: 108_875,
    sent: 0,
    expired: 0,
    accepted: 0,
    declined: 0,
  },
};

function fetchMock(reply: unknown = listReply) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => reply,
  });
}

describe("quotes api", () => {
  it("lists the quotes with the five totals", async () => {
    const mocked = fetchMock();
    vi.stubGlobal("fetch", mocked);

    const reply = await api.quotes.list();

    expect(mocked).toHaveBeenCalledWith("/api/quotes", {
      headers: { Accept: "application/json" },
    });
    expect(reply).toEqual(listReply);
  });

  it("lists one deal's quotes and one organization's, without totals", async () => {
    const mocked = fetchMock({ quotes: [] });
    vi.stubGlobal("fetch", mocked);

    await api.quotes.list({ deal_id: 5 });
    await api.quotes.list({ organization_id: 7 });

    expect(mocked).toHaveBeenNthCalledWith(1, "/api/quotes?deal_id=5", {
      headers: { Accept: "application/json" },
    });
    expect(mocked).toHaveBeenNthCalledWith(2, "/api/quotes?organization_id=7", {
      headers: { Accept: "application/json" },
    });
  });

  it("gets one quote", async () => {
    const mocked = fetchMock({ id: 3 });
    vi.stubGlobal("fetch", mocked);

    const quote = await api.quotes.get(3);

    expect(mocked).toHaveBeenCalledWith("/api/quotes/3", {
      headers: { Accept: "application/json" },
    });
    expect(quote).toEqual({ id: 3 });
  });

  it("creates a quote with its lines and no totals", async () => {
    const mocked = fetchMock({ id: 9 });
    vi.stubGlobal("fetch", mocked);
    const payload: QuoteInput = {
      deal_id: 5,
      valid_until: "2026-12-26",
      lines: [
        {
          product_id: 2,
          description: "A description",
          quantity: 3,
          unit_price_cents: 149_50,
        },
      ],
    };

    await api.quotes.create(payload);

    expect(mocked).toHaveBeenCalledWith("/api/quotes", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("updates a draft's date and lines", async () => {
    const mocked = fetchMock({ id: 9 });
    vi.stubGlobal("fetch", mocked);
    const payload: QuoteUpdateInput = {
      valid_until: null,
      lines: [
        {
          product_id: 2,
          description: null,
          quantity: 1,
          unit_price_cents: 4_900,
        },
      ],
    };

    await api.quotes.update(9, payload);

    expect(mocked).toHaveBeenCalledWith("/api/quotes/9", {
      method: "PUT",
      body: JSON.stringify(payload),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("posts the four actions to their own paths", async () => {
    const mocked = fetchMock({ id: 9 });
    vi.stubGlobal("fetch", mocked);

    await api.quotes.send(9);
    await api.quotes.copy(9);
    await api.quotes.accept(9);
    await api.quotes.decline(9);

    for (const action of ["send", "copy", "accept", "decline"]) {
      expect(mocked).toHaveBeenCalledWith(`/api/quotes/9/${action}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
    }
  });

  it("asks for the PDF signed in and hands back the file", async () => {
    await signInForTests();
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    });
    vi.stubGlobal("fetch", mocked);

    const file = await api.quotes.pdf(9);

    expect(mocked).toHaveBeenCalledWith("/api/quotes/9/pdf", {
      headers: { Authorization: "Bearer local-token" },
    });
    expect(file).toBe(blob);
  });

  it("shows the server's message when the PDF is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          detail:
            "A draft has no PDF; it is downloaded once the quote is sent.",
        }),
      }),
    );

    await expect(api.quotes.pdf(9)).rejects.toThrow(
      "A draft has no PDF; it is downloaded once the quote is sent.",
    );
  });
});
