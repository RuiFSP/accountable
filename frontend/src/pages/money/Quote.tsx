import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import type { QuoteDetail, QuoteInput, QuoteStatus } from "../../api/quotes";
import QuoteDocument, {
  type QuoteDocumentModel,
} from "../../components/QuoteDocument";
import QuoteForm from "../../components/QuoteForm";
import RecordAttribution from "../../components/RecordAttribution";
import { STATUS_TONES, statusLabel } from "../../components/QuotePanels";
import StatusBadge from "../../components/StatusBadge";

type Action = "edit" | "send" | "accept" | "decline" | "copy" | "download";

const ACTIONS: Record<QuoteStatus, Action[]> = {
  draft: ["edit", "send"],
  sent: ["accept", "decline", "copy", "download"],
  expired: ["accept", "decline", "copy", "download"],
  accepted: ["copy", "download"],
  declined: ["copy", "download"],
};

const ACTION_LABELS: Record<Action, string> = {
  edit: "Edit",
  send: "Send",
  accept: "Accept",
  decline: "Decline",
  copy: "Copy",
  download: "Download PDF",
};

function documentFor(quote: QuoteDetail): QuoteDocumentModel {
  return {
    number: quote.number,
    createdAt: quote.created_at,
    validUntil: quote.valid_until,
    taxLabel: quote.tax_label,
    taxRateThousandths: quote.tax_rate_thousandths,
    lines: quote.lines,
    company: quote.company,
    organizationName: quote.organization_name,
    contactName: quote.contact_name,
  };
}

async function downloadPdf(quote: QuoteDetail) {
  const file = await api.quotes.pdf(quote.id);
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${quote.number}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function QuoteView({ quoteId }: { quoteId: number }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const quoteQuery = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => api.quotes.get(quoteId),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.products.list(),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });

  if (quoteQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }
  const quote = quoteQuery.data;
  if (!quote) {
    return (
      <div>
        <h1>Quote not found</h1>
        <Link className="back-link" to="/money/quotes">
          ← Quotes
        </Link>
      </div>
    );
  }

  const saveEdit = async (payload: QuoteInput) => {
    const saved = await api.quotes.update(quoteId, {
      valid_until: payload.valid_until,
      lines: payload.lines,
    });
    queryClient.setQueryData(["quote", quoteId], saved);
    await queryClient.invalidateQueries({ queryKey: ["quotes"] });
    return saved;
  };

  const act = async (action: Action) => {
    setProblem(null);
    try {
      if (action === "edit") {
        setEditing(true);
      } else if (action === "download") {
        await downloadPdf(quote);
      } else if (action === "copy") {
        const copy = await api.quotes.copy(quoteId);
        await queryClient.invalidateQueries({ queryKey: ["quotes"] });
        navigate(`/money/quotes/${copy.id}`);
      } else {
        const saved =
          action === "send"
            ? await api.quotes.send(quoteId)
            : action === "accept"
              ? await api.quotes.accept(quoteId)
              : await api.quotes.decline(quoteId);
        queryClient.setQueryData(["quote", quoteId], saved);
        // The deal may have moved to Won and the timeline gained an entry.
        await queryClient.invalidateQueries({ queryKey: ["quotes"] });
        await queryClient.invalidateQueries({ queryKey: ["deals"] });
        await queryClient.invalidateQueries({ queryKey: ["activities"] });
      }
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "Could not save the quote.",
      );
    }
  };

  return (
    <div>
      <Link className="back-link" to="/money/quotes">
        ← Quotes
      </Link>
      <div className="page-title">
        <h1>{quote.number}</h1>
        <StatusBadge tone={STATUS_TONES[quote.status]}>
          {statusLabel(quote.status)}
        </StatusBadge>
      </div>
      <div className="page-actions">
        {ACTIONS[quote.status].map((action) => (
          <button
            key={action}
            type="button"
            className={
              action === "send" || action === "accept"
                ? "btn btn-primary"
                : "btn"
            }
            onClick={() => act(action)}
          >
            {ACTION_LABELS[action]}
          </button>
        ))}
      </div>
      {problem ? (
        <p className="form-error" role="alert">
          {problem}
        </p>
      ) : null}
      <QuoteDocument document={documentFor(quote)} />
      <section className="panel">
        <dl className="detail-grid">
          <dt>Deal</dt>
          <dd>{quote.deal_name}</dd>
          <dt>Organization</dt>
          <dd>{quote.organization_name ?? "—"}</dd>
          <RecordAttribution
            createdBy={quote.created_by}
            updatedBy={quote.updated_by}
          />
        </dl>
      </section>
      {editing && settings ? (
        <QuoteForm
          key={JSON.stringify([
            quote.valid_until,
            quote.lines.map((line) => [
              line.product_id,
              line.description,
              line.quantity,
              line.unit_price_cents,
            ]),
          ])}
          dealId={quote.deal_id}
          quote={quote}
          products={products}
          company={{
            name: settings.name,
            address: settings.address,
            email: settings.email,
            phone: settings.phone,
          }}
          organizationName={quote.organization_name}
          contactName={quote.contact_name}
          taxLabel={settings.tax_label}
          taxRateThousandths={settings.tax_rate_thousandths}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}

/** One quote's page, keyed on the route's id so another quote refetches. */
export default function Quote() {
  const { id } = useParams();
  return <QuoteView key={id} quoteId={Number(id)} />;
}
