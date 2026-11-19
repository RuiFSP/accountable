import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { endSession, signOut } from "../lib/session";
import { SignedIn } from "./SignIn";

const supabaseAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  // A plain function on purpose: resetting mocks must not take it away.
  createClient: () => ({ auth: supabaseAuth }),
}));

const TEAMMATES = [
  { id: "alex", name: "Alex Rivera", email: "alex@brightloop.example" },
  { id: "priya", name: "Priya Nair", email: "priya@brightloop.example" },
  { id: "joel", name: "Joel Andersson", email: "joel@brightloop.example" },
  { id: "sam", name: "", email: "sam@brightloop.example" },
];

function AtAddress() {
  const location = useLocation();
  return <div data-testid="app">{location.pathname}</div>;
}

function renderGate(path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <SignedIn>
          <AtAddress />
        </SignedIn>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

function stubTeammates(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => TEAMMATES,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubTeammatesAndSignIn(): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => TEAMMATES })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: "local-token",
        email: "alex@brightloop.example",
      }),
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function fillIn(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

function submitForm() {
  const form = screen.getByLabelText("Email").closest("form");
  fireEvent.submit(form as HTMLFormElement);
}

beforeEach(() => {
  vi.resetAllMocks();
  supabaseAuth.signOut.mockResolvedValue({ error: null });
  signOut();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the local sign-in screen", () => {
  it("lists the four teammates with initials and emails", async () => {
    stubTeammates();

    renderGate();

    expect(await screen.findAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("AR")).toBeTruthy();
    expect(screen.getByText("alex@brightloop.example")).toBeTruthy();
    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.getByText("sam@brightloop.example")).toBeTruthy();
    // The teammate with no name shows only the email to click.
    expect(screen.queryByText("Sam")).toBeNull();
  });

  it("signs you in when you pick a teammate", async () => {
    const fetchMock = stubTeammatesAndSignIn();

    renderGate("/contacts/5");
    fireEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));

    await waitFor(() =>
      expect(screen.getByTestId("app").textContent).toBe("/contacts/5"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/local/sign-in",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: "alex" }),
      }),
    );
  });

  it("shows the sign-in screen until there is a session", async () => {
    stubTeammates();

    renderGate();

    expect(
      await screen.findByRole("heading", { name: "Accountable" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("app")).toBeNull();
  });

  it("empties the query cache when a session ends", async () => {
    stubTeammatesAndSignIn();
    const queryClient = renderGate();

    fireEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await waitFor(() => expect(screen.getByTestId("app")).toBeTruthy());
    queryClient.setQueryData(["records"], [{ id: 1 }]);

    endSession();

    await waitFor(() =>
      expect(queryClient.getQueryData(["records"])).toBeUndefined(),
    );
    expect(screen.queryByTestId("app")).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "Accountable" }),
    ).toBeTruthy();
  });
});

describe("the shared sign-in screen", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://stand-in.supabase.example");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "stand-in-key");
  });

  it("has an email and a password field, each labeled", () => {
    renderGate();

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Alex Rivera/ })).toBeNull();
  });

  it("shows what went wrong in plain words", async () => {
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthApiError", message: "Invalid login credentials" },
    });
    renderGate();

    fillIn("someone@example.com", "wrong");
    submitForm();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That email and password don't match.",
    );
    expect(screen.queryByTestId("app")).toBeNull();
  });

  it("signs in when Enter is pressed", async () => {
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: "shared-token",
          user: { email: "someone@example.com" },
        },
      },
      error: null,
    });
    renderGate("/deals/9");

    fillIn("someone@example.com", "pw");
    submitForm();

    await waitFor(() =>
      expect(screen.getByTestId("app").textContent).toBe("/deals/9"),
    );
    expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({
      email: "someone@example.com",
      password: "pw",
    });
  });

  it("works once however fast the button is pressed", async () => {
    let finish: (answer: unknown) => void = () => undefined;
    supabaseAuth.signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderGate();
    fillIn("someone@example.com", "pw");

    const button = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(supabaseAuth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);

    finish({ data: { session: null }, error: null });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
  });
});
