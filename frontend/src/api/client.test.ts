import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_ENDED,
  SESSION_STORAGE_KEY,
  currentToken,
  getSessionState,
  signInLocal,
  signOut,
} from "../lib/session";
import { api, type ContactInput } from "./client";

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

  it("carries the token only while there is one", async () => {
    await signInForTests();
    const withToken = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", withToken);

    await api.organizations.list();

    expect(withToken).toHaveBeenCalledWith("/api/organizations", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer local-token",
      },
    });

    signOut();
    const withoutToken = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", withoutToken);

    await api.organizations.list();

    expect(withoutToken).toHaveBeenCalledWith("/api/organizations", {
      headers: { Accept: "application/json" },
    });
  });

  it("ends the session when the API refuses with a 401", async () => {
    await signInForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Sign in to use Accountable." }),
      }),
    );

    await expect(api.organizations.list()).rejects.toThrow(
      "Sign in to use Accountable.",
    );

    expect(currentToken()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(getSessionState().message).toBe(SESSION_ENDED);
  });
});
