from pathlib import Path

import pytest
from app import db
from app.settings import DEFAULT_DB_PATH, SettingsError, load_settings

THREE = {
    "DATABASE_URL": "postgresql://user:pass@db.example/accountable",
    "SUPABASE_URL": "https://project.supabase.co",
    "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_key",
}


def test_none_of_the_three_settings_is_the_local_copy():
    settings = load_settings({})

    assert settings.mode == "local"
    assert settings.database_path == DEFAULT_DB_PATH


def test_all_three_settings_are_the_shared_app():
    settings = load_settings(THREE)

    assert settings.mode == "shared"
    assert settings.supabase_url == "https://project.supabase.co"
    assert settings.publishable_key == "sb_publishable_key"
    assert (
        settings.sqlalchemy_url
        == "postgresql+psycopg://user:pass@db.example/accountable"
    )


def test_some_but_not_all_settings_stop_and_name_the_missing_ones():
    with pytest.raises(SettingsError) as error:
        load_settings({"DATABASE_URL": THREE["DATABASE_URL"]})

    message = str(error.value)
    assert "SUPABASE_URL" in message
    assert "SUPABASE_PUBLISHABLE_KEY" in message
    assert "DATABASE_URL" not in message


def test_accountable_db_still_means_the_local_file():
    settings = load_settings({"ACCOUNTABLE_DB": "/tmp/elsewhere.db", **THREE})

    assert settings.mode == "local"
    assert settings.database_path == Path("/tmp/elsewhere.db")


def test_accountable_db_wins_over_partial_settings():
    # The tests and the e2e run set ACCOUNTABLE_DB; a stray export of one
    # setting must not stop them or send them to Supabase.
    settings = load_settings(
        {"ACCOUNTABLE_DB": "/tmp/elsewhere.db", "DATABASE_URL": THREE["DATABASE_URL"]}
    )

    assert settings.mode == "local"


def test_the_engine_follows_the_settings():
    shared = db.engine_for(load_settings(THREE))
    local = db.engine_for(load_settings({"ACCOUNTABLE_DB": "/tmp/accountable.db"}))

    assert shared.url.drivername == "postgresql+psycopg"
    assert local.url.drivername == "sqlite"
    assert str(local.url.database) == "/tmp/accountable.db"
