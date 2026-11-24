import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type SearchKind, type SearchResult } from "../api/client";

/** How long the box waits after the last keystroke before asking. */
const PAUSE_MS = 250;

const KIND_ORDER: SearchKind[] = ["organization", "contact", "deal", "product"];

const KIND_LABELS: Record<SearchKind, string> = {
  organization: "Organizations",
  contact: "Contacts",
  deal: "Deals",
  product: "Products",
};

/** Where a match lives: a product has no detail page, so it opens the table's search. */
function pathFor(result: SearchResult): string {
  if (result.kind === "product") {
    return `/products?q=${encodeURIComponent(result.name)}`;
  }
  return `/${result.kind}s/${result.id}`;
}

export default function SearchBox() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    // Every keystroke is a new question: a reply to an older one is stale.
    const turn = ++asked.current;
    if (!text.trim()) {
      // Nothing to ask, and the panel hides itself while the box is empty.
      return;
    }
    pause.current = setTimeout(() => {
      api.search
        .find(text)
        .then((found) => {
          if (turn === asked.current) {
            setResults(found);
            setOpen(true);
          }
        })
        .catch(() => {
          if (turn === asked.current) {
            // A question that failed has no answer: the last one would be
            // stale under the newer text, and Enter must not open it.
            setResults([]);
            setOpen(false);
          }
        });
    }, PAUSE_MS);
    return () => {
      if (pause.current) {
        clearTimeout(pause.current);
      }
    };
  }, [text]);

  function openMatch(result: SearchResult) {
    clear();
    navigate(pathFor(result));
  }

  /** Empty the box and everything it was showing. */
  function clear() {
    setText("");
    setResults([]);
    setOpen(false);
  }

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    matches: results.filter((result) => result.kind === kind),
  })).filter((group) => group.matches.length > 0);

  return (
    <div className="search-box">
      <input
        type="text"
        aria-label="Search"
        placeholder="Search"
        value={text}
        onChange={(event) => {
          if (!event.target.value.trim()) {
            clear();
            return;
          }
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results.length > 0) {
            openMatch(results[0]);
          } else if (event.key === "Escape") {
            clear();
          }
        }}
      />
      {open && text.trim() && results.length > 0 ? (
        <div className="search-results">
          {grouped.map(({ kind, matches }) => (
            <div key={kind} className="search-group">
              <span className="search-group-label">{KIND_LABELS[kind]}</span>
              <ul>
                {matches.map((match) => (
                  <li key={`${match.kind}-${match.id}`}>
                    <button type="button" onClick={() => openMatch(match)}>
                      {match.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
