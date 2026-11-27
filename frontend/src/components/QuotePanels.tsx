import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, type Deal, type Organization } from "../api/client";
import type { Quote, QuoteInput, QuoteStatus } from "../api/quotes";
import { formatDate } from "../lib/dates";
import { formatUsdWithCents } from "../lib/money";
import type { RecordPanel } from "./RecordPanels";
import QuoteForm from "./QuoteForm";
import StatusBadge, { type StatusTone } from "./StatusBadge";

/** The tone each state wears, from the document statuses' agreed tones. */
export const STATUS_TONES: Record<QuoteStatus, StatusTone> = {
  draft: "neutral",
  sent: "info",
  expired: "negative",
  accepted: "positive",
  declined: "negative",
};

const OPEN_STAGES = ["New", "Qualified", "Proposal", "Negotiation"];

/** A state as the badge names it: expired shows as "Expired". */
export function statusLabel(status: QuoteStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

interface QuoteRowsProps {
  quotes: Quote[];
  showDeal?: boolean;
  showOrganization?: boolean;
}

/** The quotes of one record: number, state, date and total, opening each one. */
export function QuoteRows({
  quotes,
  showDeal = false,
  showOrganization = false,
}: QuoteRowsProps) {
  if (quotes.length === 0) {
    return <p className="muted">No quotes yet.</p>;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Number</th>
          {showDeal ? <th>Deal</th> : null}
          {showOrganization ? <th>Organization</th> : null}
          <th>State</th>
          <th>Valid until</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {quotes.map((quote) => (
          <tr key={quote.id}>
            <td>
              <Link to={`/money/quotes/${quote.id}`}>{quote.number}</Link>
            </td>
            {showDeal ? <td>{quote.deal_name}</td> : null}
            {showOrganization ? (
              <td>{quote.organization_name ?? "—"}</td>
            ) : null}
            <td>
              <StatusBadge tone={STATUS_TONES[quote.status]}>
                {statusLabel(quote.status)}
              </StatusBadge>
            </td>
            <td>{formatDate(quote.valid_until)}</td>
            <td className="num">{formatUsdWithCents(quote.total_cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useQuoteRows(filter: { deal_id?: number; organization_id?: number }) {
  return useQuery({
    queryKey: ["quotes", filter],
    queryFn: () => api.quotes.list(filter),
  });
}

function useDocumentBits(deal: Deal) {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.products.list(),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  return {
    products,
    settings,
    organizationName:
      organizations.find((row) => row.id === deal.organization_id)?.name ??
      null,
    contactName:
      contacts.find((row) => row.id === deal.contact_id)?.name ?? null,
  };
}

/** The deal's panel: its quotes, and a new one while the deal is open. */
export function DealQuotes({ record }: { record: Deal }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const rows = useQuoteRows({ deal_id: record.id });
  const bits = useDocumentBits(record);

  async function create(payload: QuoteInput) {
    const saved = await api.quotes.create(payload);
    await queryClient.invalidateQueries({ queryKey: ["quotes"] });
    return saved;
  }

  return (
    <section className="panel">
      <h2>Quotes</h2>
      <QuoteRows quotes={rows.data?.quotes ?? []} />
      {OPEN_STAGES.includes(record.stage) ? (
        <div className="record-panels-action">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAdding(true)}
          >
            New quote
          </button>
        </div>
      ) : null}
      {adding && bits.settings ? (
        <QuoteForm
          dealId={record.id}
          products={bits.products}
          company={{
            name: bits.settings.name,
            address: bits.settings.address,
            email: bits.settings.email,
            phone: bits.settings.phone,
          }}
          organizationName={bits.organizationName}
          contactName={bits.contactName}
          taxLabel={bits.settings.tax_label}
          taxRateThousandths={bits.settings.tax_rate_thousandths}
          onSubmit={create}
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}

/** The organization's panel: the quotes of its deals, naming each deal. */
export function OrganizationQuotes({ record }: { record: Organization }) {
  const rows = useQuoteRows({ organization_id: record.id });
  return (
    <section className="panel">
      <h2>Quotes</h2>
      <QuoteRows quotes={rows.data?.quotes ?? []} showDeal />
    </section>
  );
}

export const DealQuotesPanel: RecordPanel<Deal> = {
  name: "Quotes",
  Panel: DealQuotes,
};

export const OrganizationQuotesPanel: RecordPanel<Organization> = {
  name: "Quotes",
  Panel: OrganizationQuotes,
};
