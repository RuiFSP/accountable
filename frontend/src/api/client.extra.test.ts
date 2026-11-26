import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  type ActivityInput,
  type CompanySettingsInput,
  type ContactInput,
  type DealInput,
  type OrganizationInput,
  type ProductInput,
  type SearchResult,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(json: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => json,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const organization: OrganizationInput = {
  name: "Northwind Traders",
  website: null,
  industry: "Retail",
  notes: null,
};

const contact: ContactInput = {
  name: "Ana Silva",
  email: null,
  phone: null,
  job_title: null,
  organization_id: 7,
  status: "customer",
};

const deal: DealInput = {
  name: "Store rollout",
  organization_id: 7,
  contact_id: 1,
  stage: "New",
  value_cents: 100_000,
  probability: 10,
  close_date: "2027-01-01",
  position: null,
};

const activity: ActivityInput = {
  type: "call",
  contact_id: 1,
  deal_id: null,
  description: "Call with Ana",
  happened_at: "2026-11-10T09:00:00",
  follow_up_date: null,
  done: true,
};

const settings: CompanySettingsInput = {
  name: "Brightloop",
  address: "1 Brightloop Plaza, Floor 12, New York, NY 10004",
  email: "hello@brightloop.example",
  phone: "+1 555 0100",
  tax_label: "Sales tax",
  tax_rate_thousandths: 8875,
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
};

const product: ProductInput = {
  name: "Priority support",
  description: null,
  price_cents: 14_950,
};

const jsonHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

describe("api client writes", () => {
  it("creates an organization with POST", async () => {
    const fetchMock = stubFetch({ id: 7, ...organization });

    const created = await api.organizations.create(organization);

    expect(fetchMock).toHaveBeenCalledWith("/api/organizations", {
      method: "POST",
      body: JSON.stringify(organization),
      headers: jsonHeaders,
    });
    expect(created.id).toBe(7);
  });

  it("updates an organization with PUT", async () => {
    const fetchMock = stubFetch({ id: 7, ...organization });

    const updated = await api.organizations.update(7, organization);

    expect(fetchMock).toHaveBeenCalledWith("/api/organizations/7", {
      method: "PUT",
      body: JSON.stringify(organization),
      headers: jsonHeaders,
    });
    expect(updated.id).toBe(7);
  });

  it("deletes an organization with DELETE and no content type", async () => {
    const fetchMock = stubFetch({ contacts: [], deals: [] });

    const result = await api.organizations.remove(7);

    expect(fetchMock).toHaveBeenCalledWith("/api/organizations/7", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    expect(result).toEqual({ contacts: [], deals: [] });
  });

  it("updates a contact with PUT", async () => {
    const fetchMock = stubFetch({ id: 1, ...contact });

    await api.contacts.update(1, contact);

    expect(fetchMock).toHaveBeenCalledWith("/api/contacts/1", {
      method: "PUT",
      body: JSON.stringify(contact),
      headers: jsonHeaders,
    });
  });

  it("deletes a contact with DELETE", async () => {
    const fetchMock = stubFetch({ activities: ["Call with Ana"] });

    const result = await api.contacts.remove(1);

    expect(fetchMock).toHaveBeenCalledWith("/api/contacts/1", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    expect(result).toEqual({ activities: ["Call with Ana"] });
  });

  it("creates a deal with POST", async () => {
    const fetchMock = stubFetch({ id: 9, ...deal });

    const created = await api.deals.create(deal);

    expect(fetchMock).toHaveBeenCalledWith("/api/deals", {
      method: "POST",
      body: JSON.stringify(deal),
      headers: jsonHeaders,
    });
    expect(created.id).toBe(9);
  });

  it("updates a deal with PUT", async () => {
    const fetchMock = stubFetch({ id: 9, ...deal });

    await api.deals.update(9, deal);

    expect(fetchMock).toHaveBeenCalledWith("/api/deals/9", {
      method: "PUT",
      body: JSON.stringify(deal),
      headers: jsonHeaders,
    });
  });

  it("moves a deal to a new stage with POST", async () => {
    const answer = {
      deal: { ...deal, id: 9, stage: "Won", position: 0 },
      totals: {
        board: { value_cents: 100_000, expected_cents: 100_000, count: 1 },
        columns: {},
      },
    };
    const fetchMock = stubFetch(answer);

    const result = await api.deals.move(9, { stage: "Won", position: 0 });

    expect(fetchMock).toHaveBeenCalledWith("/api/deals/9/stage", {
      method: "POST",
      body: JSON.stringify({ stage: "Won", position: 0 }),
      headers: jsonHeaders,
    });
    expect(result).toEqual(answer);
  });

  it("deletes a deal with DELETE", async () => {
    const fetchMock = stubFetch({ activities: ["Rollout note"] });

    await api.deals.remove(9);

    expect(fetchMock).toHaveBeenCalledWith("/api/deals/9", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
  });

  it("fetches the dashboard with a plain GET", async () => {
    const fetchMock = stubFetch({ won: {}, pipeline: {}, funnel: {} });

    await api.dashboard.get();

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard", {
      headers: { Accept: "application/json" },
    });
  });

  it("fetches the company settings with a plain GET", async () => {
    const fetchMock = stubFetch({
      id: 1,
      ...settings,
      updated_by: "priya@brightloop.example",
      updated_at: "2026-11-22T09:30:00+00:00",
    });

    const reply = await api.settings.get();

    expect(fetchMock).toHaveBeenCalledWith("/api/settings", {
      headers: { Accept: "application/json" },
    });
    expect(reply.id).toBe(1);
    expect(reply.tax_rate_thousandths).toBe(8875);
    expect(reply.updated_by).toBe("priya@brightloop.example");
  });

  it("saves the company settings with PUT and the JSON body", async () => {
    const fetchMock = stubFetch({
      id: 1,
      ...settings,
      updated_by: "alex@brightloop.example",
      updated_at: "2026-11-23T12:00:00+00:00",
    });

    const reply = await api.settings.save(settings);

    expect(fetchMock).toHaveBeenCalledWith("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: jsonHeaders,
    });
    expect(reply.updated_at).toBe("2026-11-23T12:00:00+00:00");
  });

  it("creates an activity with POST", async () => {
    const fetchMock = stubFetch({ id: 4, ...activity });

    await api.activities.create(activity);

    expect(fetchMock).toHaveBeenCalledWith("/api/activities", {
      method: "POST",
      body: JSON.stringify(activity),
      headers: jsonHeaders,
    });
  });

  it("updates an activity, marking it done, with PUT", async () => {
    const fetchMock = stubFetch({ id: 4, ...activity });

    await api.activities.update(4, activity);

    expect(fetchMock).toHaveBeenCalledWith("/api/activities/4", {
      method: "PUT",
      body: JSON.stringify(activity),
      headers: jsonHeaders,
    });
  });

  it("deletes an activity with DELETE", async () => {
    const fetchMock = stubFetch({});

    await api.activities.remove(4);

    expect(fetchMock).toHaveBeenCalledWith("/api/activities/4", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
  });

  it("lists active products by default", async () => {
    const fetchMock = stubFetch([{ id: 3, ...product, active: true }]);

    await api.products.list();

    expect(fetchMock).toHaveBeenCalledWith("/api/products", {
      headers: { Accept: "application/json" },
    });
  });

  it("asks for archived products when told to", async () => {
    const fetchMock = stubFetch([]);

    await api.products.list(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products?include_archived=true",
      { headers: { Accept: "application/json" } },
    );
  });

  it("creates a product with POST", async () => {
    const fetchMock = stubFetch({ id: 3, ...product, active: true });

    const created = await api.products.create(product);

    expect(fetchMock).toHaveBeenCalledWith("/api/products", {
      method: "POST",
      body: JSON.stringify(product),
      headers: jsonHeaders,
    });
    expect(created.id).toBe(3);
  });

  it("updates a product with PUT", async () => {
    const fetchMock = stubFetch({ id: 3, ...product, active: true });

    await api.products.update(3, product);

    expect(fetchMock).toHaveBeenCalledWith("/api/products/3", {
      method: "PUT",
      body: JSON.stringify(product),
      headers: jsonHeaders,
    });
  });

  it("archives a product with POST and no body", async () => {
    const fetchMock = stubFetch({ id: 3, ...product, active: false });

    await api.products.archive(3);

    expect(fetchMock).toHaveBeenCalledWith("/api/products/3/archive", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  });

  it("restores a product with POST and no body", async () => {
    const fetchMock = stubFetch({ id: 3, ...product, active: true });

    await api.products.restore(3);

    expect(fetchMock).toHaveBeenCalledWith("/api/products/3/restore", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  });

  it("reads a field error from the backend's validation list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ["body", "lines", 2, "quantity"],
              msg: "Enter a whole number from 1 to 1,000,000",
            },
          ],
        }),
      }),
    );

    await expect(api.deals.list()).rejects.toThrow(
      "lines.2.quantity: Enter a whole number from 1 to 1,000,000",
    );
  });

  it("falls back to the status when the detail has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: [{}] }),
      }),
    );

    await expect(api.deals.list()).rejects.toThrow(
      "/api/deals failed with status 422",
    );
  });
});

describe("api client replies", () => {
  it("reads who added and who changed a record", async () => {
    const fetchMock = stubFetch([
      {
        id: 7,
        ...organization,
        created_by: "alex@brightloop.example",
        updated_by: "priya@brightloop.example",
      },
      { id: 8, ...organization, created_by: null, updated_by: null },
    ]);

    const organizations = await api.organizations.list();

    expect(fetchMock).toHaveBeenCalledWith("/api/organizations", {
      headers: { Accept: "application/json" },
    });
    expect(organizations[0].created_by).toBe("alex@brightloop.example");
    expect(organizations[0].updated_by).toBe("priya@brightloop.example");
    // A record written before this was recorded says so with a null.
    expect(organizations[1].created_by).toBeNull();
    expect(organizations[1].updated_by).toBeNull();
  });
});

describe("api client search", () => {
  it("puts the query on the query string, escaping what it must", async () => {
    const fetchMock = stubFetch([
      { kind: "deal", id: 9, name: "100% Fun Club" },
    ]);

    const found = await api.search.find("100% F");

    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=100%25%20F", {
      headers: { Accept: "application/json" },
    });
    expect(found).toEqual([{ kind: "deal", id: 9, name: "100% Fun Club" }]);
  });

  it("takes a product as a search result", async () => {
    stubFetch([{ kind: "product", id: 12, name: "Priority support" }]);

    const found: SearchResult[] = await api.search.find("priority");

    expect(found).toEqual([
      { kind: "product", id: 12, name: "Priority support" },
    ]);
  });
});
