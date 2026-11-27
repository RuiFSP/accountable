import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from app import db, seed
from sqlalchemy import create_engine, func, inspect, select, text


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'reset.db'}")
    seed.ensure_seeded(test_engine)
    yield test_engine
    test_engine.dispose()


def _counts(engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {
            table.name: conn.execute(
                select(func.count()).select_from(table)
            ).scalar_one()
            for table in (
                db.organizations,
                db.contacts,
                db.deals,
                db.activities,
                db.company_settings,
                db.products,
                db.bills,
            )
        }


def _sample_counts() -> dict[str, int]:
    sample_engine = create_engine("sqlite:///:memory:")
    try:
        seed.ensure_seeded(sample_engine)
        return _counts(sample_engine)
    finally:
        sample_engine.dispose()


def _dirty(engine) -> dict[str, int]:
    with engine.begin() as conn:
        conn.execute(db.organizations.delete())
        conn.execute(db.contacts.delete())
        conn.execute(
            db.company_settings.update()
            .where(db.company_settings.c.id == 1)
            .values(name="Not Brightloop")
        )
        conn.execute(db.products.delete())
        conn.execute(db.bills.delete())
    return _counts(engine)


def test_reset_refuses_without_confirmation(engine, monkeypatch):
    dirty = _dirty(engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr("builtins.input", lambda _: "n")

    seed.main()

    assert _counts(engine) == dirty


def test_reset_restores_the_sample_data_after_confirmation(engine, monkeypatch):
    _dirty(engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr("builtins.input", lambda _: "y")

    seed.main()

    assert _counts(engine) == _sample_counts()
    with engine.connect() as connection:
        name = connection.execute(select(db.company_settings.c.name)).scalar_one()
    assert name == "Brightloop"


def test_reset_leaves_the_version_table_and_the_schema_agreeing(engine):
    seed.reset(engine)

    with engine.connect() as connection:
        version = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()
    config = Config(str(db.BACKEND_DIR / "alembic.ini"))
    assert version == ScriptDirectory.from_config(config).get_current_head()
    for table in db.metadata.sorted_tables:
        names = [column["name"] for column in inspect(engine).get_columns(table.name)]
        assert names == [column.name for column in table.columns]
