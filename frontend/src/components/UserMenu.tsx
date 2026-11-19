import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { signOut, useSessionState } from "../lib/session";
import {
  followDeviceTheme,
  getThemeChoice,
  setTheme,
  type ThemeChoice,
} from "../lib/theme";

const CHOICES: { choice: ThemeChoice; label: string }[] = [
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
  { choice: "system", label: "System" },
];

/** Two letters from an email, for the button. */
function initials(email: string): string {
  return email
    .split("@")[0]
    .split(/[.\-_ ]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

/** The menu under your initials: who you are, the theme, and signing out. */
export default function UserMenu() {
  const { session } = useSessionState();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);
  const button = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // System follows the device for as long as this menu is on screen.
  useEffect(() => followDeviceTheme(), []);

  // Escape closes the menu from wherever focus is, and puts it back on the
  // button that opened it.
  useEffect(() => {
    if (!open) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  if (!session) {
    return null;
  }

  function choose(next: ThemeChoice) {
    setTheme(next);
    setChoice(next);
    setOpen(false);
  }

  return (
    <div className="user-menu">
      <button
        ref={button}
        type="button"
        className="btn user-menu-button"
        aria-label={session.email}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{initials(session.email)}</span>
      </button>
      {open ? (
        <div className="user-menu-panel">
          <p className="user-menu-email">{session.email}</p>
          <div className="user-menu-choices" role="group" aria-label="Theme">
            {CHOICES.map(({ choice: value, label }) => (
              <button
                key={value}
                type="button"
                className="theme-choice"
                aria-pressed={choice === value}
                onClick={() => choose(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="link-button user-menu-sign-out"
            onClick={() => {
              signOut();
              navigate("/");
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
