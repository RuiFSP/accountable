import { useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";

import { api } from "../../api/client";
import type { QuoteStatus } from "../../api/quotes";
import KpiCard from "../../components/KpiCard";
import { QuoteRows, statusLabel } from "../../components/QuotePanels";
import { formatUsdWithCents } from "../../lib/money";
import Quote from "./Quote";

const STATES: QuoteStatus[] = [
  "draft",
  "sent",
  "expired",
  "accepted",
  "declined",
];

function QuoteList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["quotes", {}],
    queryFn: () => api.quotes.list(),
  });

  return (
    <section>
      <h2>Quotes</h2>
      {isError ? (
        <p className="form-error" role="alert">
          Could not load the quotes.
        </p>
      ) : isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="kpi-grid">
            {STATES.map((state) => (
              <KpiCard
                key={state}
                label={statusLabel(state)}
                value={formatUsdWithCents(data?.totals?.[state] ?? 0)}
                note="Including tax"
              />
            ))}
          </div>
          <section className="panel">
            <QuoteRows quotes={data?.quotes ?? []} showDeal showOrganization />
          </section>
        </>
      )}
    </section>
  );
}

/** The Quotes tab: the list at quotes/*, and each quote's page under :id. */
export default function QuotesTab() {
  return (
    <Routes>
      <Route index element={<QuoteList />} />
      <Route path=":id" element={<Quote />} />
    </Routes>
  );
}
