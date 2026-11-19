import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  // A plain function on purpose: resetting mocks must not take it away.
  createClient: () => ({ auth: supabaseAuth }),
}));

type SessionModule = typeof import("./session");

/** A fresh copy of the module, the way a page reload gets one. */
async function freshSession(): Promise<SessionModule> {
  vi.resetModules();
  return import("./session");
}

function stubSharedSettings(): void {
  vi.stubEnv("VITE_SUPABASE_URL", "https://stand-in.supabase.example");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "stand-in-key");
}

function stubLocalSignIn(token: string, email: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token, email }),
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  supabaseAuth.signOut.mockResolvedValue({ error: null });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("which copy this is", () => {
  it("is the local copy when the Supabase settings weren't built in", async () => {
    const session = await freshSession();

    expect(session.isSharedApp()).toBe(false);
  });

  it("is the shared app when they were, and starts listening", async () => {
    stubSharedSettings();

    const session = await freshSession();

    expect(session.isSharedApp()).toBe(true);
    expect(supabaseAuth.onAuthStateChange).toHaveBeenCalled();
  });
});

describe("the local copy", () => {
  it("keeps the token you signed in with", async () => {
    stubLocalSignIn("local-token", "alex@brightloop.example");
    const session = await freshSession();

    await session.signInLocal("alex");

    expect(session.currentToken()).toBe("local-token");
    expect(session.getSessionState().session).toEqual({
      email: "alex@brightloop.example",
      token: "local-token",
    });
    expect(localStorage.getItem("accountable-session")).toBe(
      JSON.stringify({
        token: "local-token",
        email: "alex@brightloop.example",
      }),
    );
  });

  it("finds the token again after a reload", async () => {
    stubLocalSignIn("local-token", "alex@brightloop.example");
    const before = await freshSession();
    await before.signInLocal("alex");

    const reloaded = await freshSession();

    expect(reloaded.currentToken()).toBe("local-token");
    expect(reloaded.getSessionState().session?.email).toBe(
      "alex@brightloop.example",
    );
  });

  it("drops the token when you sign out", async () => {
    stubLocalSignIn("local-token", "alex@brightloop.example");
    const session = await freshSession();
    await session.signInLocal("alex");

    session.signOut();

    expect(session.currentToken()).toBeNull();
    expect(session.getSessionState()).toEqual({
      session: null,
      message: null,
    });
    expect(localStorage.getItem("accountable-session")).toBeNull();
  });

  it("refuses a teammate this computer doesn't have", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "No such teammate." }),
      }),
    );
    const session = await freshSession();

    await expect(session.signInLocal("nobody")).rejects.toThrow(
      "No such teammate.",
    );
    expect(session.currentToken()).toBeNull();
  });
});

describe("the shared app", () => {
  beforeEach(() => {
    stubSharedSettings();
  });

  it("keeps the session its client reports", async () => {
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: "shared-token",
          user: { email: "someone@example.com" },
        },
      },
      error: null,
    });
    const session = await freshSession();

    await session.signInShared("someone@example.com", "pw");

    expect(session.currentToken()).toBe("shared-token");
    expect(session.getSessionState().session?.email).toBe(
      "someone@example.com",
    );
  });

  it("maps a wrong password to plain copy", async () => {
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthApiError", message: "Invalid login credentials" },
    });
    const session = await freshSession();

    await expect(
      session.signInShared("someone@example.com", "wrong"),
    ).rejects.toThrow("That email and password don't match.");
    expect(session.currentToken()).toBeNull();
  });

  it("maps an unreachable service to plain copy", async () => {
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch" },
    });
    const session = await freshSession();

    await expect(
      session.signInShared("someone@example.com", "pw"),
    ).rejects.toThrow("Can't reach Accountable right now.");
  });

  it("ends our session when the client ends its own", async () => {
    let notify: ((event: string, session: unknown) => void) | undefined;
    supabaseAuth.onAuthStateChange.mockImplementation((callback) => {
      notify = callback;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    });
    const session = await freshSession();

    notify?.("INITIAL_SESSION", {
      access_token: "shared-token",
      user: { email: "someone@example.com" },
    });
    expect(session.currentToken()).toBe("shared-token");

    notify?.("SIGNED_OUT", null);

    expect(session.currentToken()).toBeNull();
    expect(session.getSessionState().session).toBeNull();
  });
});
