import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type ContactInput } from "./client";

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

    const organizations = await api.organizations.list();

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

  it("posts payloads as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 5, name: "Tara Kestrel", status: "lead" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload: ContactInput = {
      name: "Tara Kestrel",
      email: null,
      phone: null,
      job_title: null,
      organization_id: 1,
      status: "lead",
    };
    const created = await api.contacts.create(payload);

    expect(fetchMock).toHaveBeenCalledWith("/api/contacts", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    expect(created.id).toBe(5);
  });

  it("throws the server's detail message when a request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          detail: "An activity must be linked to exactly one contact or deal.",
        }),
      }),
    );

    await expect(api.activities.list()).rejects.toThrow(
      "An activity must be linked to exactly one contact or deal.",
    );
  });

  it("falls back to the status when the error has no JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      }),
    );

    await expect(api.deals.list()).rejects.toThrow(
      "/api/deals failed with status 500",
    );
  });
});
