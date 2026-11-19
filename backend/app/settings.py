"""The three settings that decide which copy of Accountable this is.

None of them set → the local copy on this computer. All three → the shared
app on Supabase. Some but not all → stop at once and name the missing ones.
`ACCOUNTABLE_DB` always means local, whatever else is set, and picks the
SQLite file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Mapping

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "accountable.db"

REQUIRED_SETTINGS = ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")


class SettingsError(RuntimeError):
    """Some but not all of the settings are set."""


@dataclass(frozen=True)
class Settings:
    mode: Literal["local", "shared"]
    database_path: Path | None = None
    database_url: str | None = None
    supabase_url: str | None = None
    publishable_key: str | None = None

    @property
    def sqlalchemy_url(self) -> str:
        """The URL SQLAlchemy needs, with the driver we ship named explicitly."""
        if self.mode == "shared":
            if not self.database_url:
                raise SettingsError("DATABASE_URL is missing.")
            return _with_psycopg(self.database_url)
        return f"sqlite:///{self.database_path}"


def _with_psycopg(url: str) -> str:
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    environ = os.environ if env is None else env
    override = environ.get("ACCOUNTABLE_DB")
    if override:
        return Settings(mode="local", database_path=Path(override))

    present = {name: environ.get(name, "") for name in REQUIRED_SETTINGS}
    missing = [name for name in REQUIRED_SETTINGS if not present[name]]
    if not missing:
        return Settings(
            mode="shared",
            database_url=present["DATABASE_URL"],
            supabase_url=present["SUPABASE_URL"],
            publishable_key=present["SUPABASE_PUBLISHABLE_KEY"],
        )
    if len(missing) == len(REQUIRED_SETTINGS):
        return Settings(mode="local", database_path=DEFAULT_DB_PATH)
    raise SettingsError(f"Missing settings: {', '.join(missing)}")
