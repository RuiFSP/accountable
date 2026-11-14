import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("fetches organizations as typed records", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          name: "Northwind Traders",
          website: "northwindtraders.example",
          industry: "Retail",
          notes: null,
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const organizations = await api.organizations();

    expect(fetchMock).toHaveBeenCalledWith("/api/organizations", {
      headers: { Accept: "application/json" },
    });
    expect(organizations).toEqual([
      {
        id: 1,
        name: "Northwind Traders",
        website: "northwindtraders.example",
        industry: "Retail",
        notes: null,
      },
    ]);
  });

  it("throws when the API answers with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      }),
    );

    await expect(api.deals()).rejects.toThrow(
      "/api/deals failed with status 500",
    );
  });
});
