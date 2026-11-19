/**
 * Who is signed in, and as whom.
 *
 * The local copy signs in with a made-up teammate and keeps its token in
 * localStorage under `accountable-session`. The shared app goes through
 * Supabase's client, which keeps its own session and tells us when it
 * changes. Either way, the rest of the app reads one piece of state here.
 */

import {
  createClient,
  type AuthError,
  type Session as SupabaseSession,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

/** Where the local copy keeps its token; Supabase keeps its own. */
export const SESSION_STORAGE_KEY = "accountable-session";

/** What the sign-in screen says after a session ends without signing out. */
export const SESSION_ENDED = "Your session ended. Sign in again.";

export interface Session {
  email: string;
  token: string;
}

export interface SessionState {
  session: Session | null;
  /** Why the last session ended, for the sign-in screen. */
  message: string | null;
}

let state: SessionState = storedState();
const listeners = new Set<() => void>();

/** Which copy this is: the Supabase settings decide it, at build time. */
export function isSharedApp(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSessionState(): SessionState {
  return state;
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The session state for a component to re-render on. */
export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribeToSession, getSessionState);
}

/** The token to ride on API requests, or null when nobody is signed in. */
export function currentToken(): string | null {
  return state.session?.token ?? null;
}

/**
 * End the session and say why, for the sign-in screen. A request the backend
 * refuses with a 401 lands here.
 */
export function endSession(message: string = SESSION_ENDED): void {
  forgetToken();
  if (isSharedApp()) {
    // A token the backend refuses must not come back on the next reload.
    void supabaseClient()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
  }
  publish({ session: null, message });
}

/** Sign out on purpose: no message, nothing left behind. */
export function signOut(): void {
  forgetToken();
  if (isSharedApp()) {
    void supabaseClient()
      .auth.signOut()
      .catch(() => undefined);
  }
  publish({ session: null, message: null });
}

/** Sign in to this computer as one of the made-up teammates. */
export async function signInLocal(userId: string): Promise<void> {
  const response = await fetch("/api/local/sign-in", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!response.ok) {
    throw new Error(await detailOf(response));
  }
  const signed = (await response.json()) as Session;
  storeToken(signed);
  publish({ session: signed, message: null });
}

/** Sign in to the shared app with an email and password. */
export async function signInShared(
  email: string,
  password: string,
): Promise<void> {
  const { data, error } = await supabaseClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error(plainSignInMessage(error));
  }
  if (data.session) {
    publish({ session: toSession(data.session), message: null });
  }
}

let supabase: SupabaseClient | null = null;

function supabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    );
  }
  return supabase;
}

function publish(next: SessionState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function storedState(): SessionState {
  const signedOut: SessionState = { session: null, message: null };
  if (isSharedApp()) {
    // Supabase restores its own session through the watch below.
    return signedOut;
  }
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as Partial<Session>) : null;
    if (typeof parsed?.token !== "string" || typeof parsed.email !== "string") {
      return signedOut;
    }
    return {
      session: { token: parsed.token, email: parsed.email },
      message: null,
    };
  } catch {
    // Storage can be denied, or hold something we didn't write: signed out.
    return signedOut;
  }
}

function storeToken(session: Session): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Can't remember it, but the session still holds for this page.
  }
}

function forgetToken(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to forget when storage is denied.
  }
}

function toSession(session: SupabaseSession): Session {
  return { email: session.user.email ?? "", token: session.access_token };
}

function plainSignInMessage(error: AuthError): string {
  if (error.message.includes("Invalid login credentials")) {
    return "That email and password don't match.";
  }
  if (
    error.name === "AuthRetryableFetchError" ||
    error.message.toLowerCase().includes("fetch")
  ) {
    return "Can't reach Accountable right now.";
  }
  return "Couldn't sign you in. Try again.";
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // No JSON body; fall back to the status.
  }
  return `Sign-in failed with status ${response.status}`;
}

// The shared app listens from the start, so a reload finds its session and
// an ending one ends ours.
if (isSharedApp()) {
  supabaseClient().auth.onAuthStateChange((_event, session) => {
    publish({
      session: session ? toSession(session) : null,
      message: session ? null : state.message,
    });
  });
}
