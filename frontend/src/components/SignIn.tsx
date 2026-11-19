import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import {
  isSharedApp,
  signInLocal,
  signInShared,
  useSessionState,
} from "../lib/session";

interface Teammate {
  id: string;
  name: string;
  email: string;
}

async function fetchTeammates(): Promise<Teammate[]> {
  const response = await fetch("/api/local/teammates", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Teammates failed with status ${response.status}`);
  }
  return (await response.json()) as Teammate[];
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Couldn't sign you in. Try again.";
}

/** Two letters from a name, or from the email when there is no name. */
function initials(teammate: Teammate): string {
  const source = teammate.name.trim() || teammate.email.split("@")[0];
  return source
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function LocalSignIn() {
  // A plain fetch on purpose: the sign-in screen's list must not live in the
  // query cache, which SignedIn empties whenever a session ends.
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeammates()
      .then((list) => {
        if (!cancelled) {
          setTeammates(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnreachable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(teammate: Teammate) {
    setFailure(null);
    try {
      await signInLocal(teammate.id);
    } catch (error) {
      setFailure(messageOf(error));
    }
  }

  return (
    <div className="signin-local">
      {unreachable ? (
        <p className="signin-error" role="alert">
          Can&apos;t reach Accountable right now.
        </p>
      ) : null}
      {failure ? (
        <p className="signin-error" role="alert">
          {failure}
        </p>
      ) : null}
      <ul className="signin-teammates">
        {teammates.map((teammate) => (
          <li key={teammate.id}>
            <button
              type="button"
              className="signin-teammate"
              onClick={() => void choose(teammate)}
            >
              <span className="signin-initials" aria-hidden="true">
                {initials(teammate)}
              </span>
              {teammate.name ? (
                <span className="signin-teammate-name">{teammate.name}</span>
              ) : null}
              <span className="signin-teammate-email">{teammate.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SharedSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await signInShared(email, password);
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="signin-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="signin-email">Email</label>
      <input
        id="signin-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label htmlFor="signin-password">Password</label>
      <input
        id="signin-password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {failure ? (
        <p className="signin-error" role="alert">
          {failure}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Sign in
      </button>
    </form>
  );
}

function SignInScreen({ message }: { message: string | null }) {
  return (
    <div className="signin">
      <div className="signin-panel">
        <h1 className="signin-title">Accountable</h1>
        {message ? (
          <p className="signin-message" role="status">
            {message}
          </p>
        ) : null}
        {isSharedApp() ? <SharedSignIn /> : <LocalSignIn />}
      </div>
    </div>
  );
}

/** The gate: the sign-in screen until there is a session, then the app. */
export function SignedIn({ children }: { children: ReactNode }) {
  const { session, message } = useSessionState();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) {
      // Nothing the last person looked up may show for the next one.
      queryClient.clear();
    }
  }, [session, queryClient]);

  if (!session) {
    return <SignInScreen message={message} />;
  }
  return <>{children}</>;
}
