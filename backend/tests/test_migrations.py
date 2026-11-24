from alembic import command
from alembic.config import Config
from app import db
from sqlalchemy import create_engine, inspect, text

RECORD_TABLES = ("organizations", "contacts", "deals", "activities", "products")
# The four that already existed when 0002 added their attribution columns.
ATTRIBUTED_TABLES = ("organizations", "contacts", "deals", "activities")


def alembic_config(connection=None, url=None) -> Config:
    config = Config(str(db.BACKEND_DIR / "alembic.ini"))
    if connection is not None:
        config.attributes["connection"] = connection
    if url is not None:
        config.set_main_option("sqlalchemy.url", url)
    return config


def columns(engine, table) -> list[tuple]:
    return [
        (column["name"], str(column["type"]), column["nullable"], column["primary_key"])
        for column in inspect(engine).get_columns(table)
    ]


def foreign_keys(engine, table) -> list[tuple]:
    return sorted(
        (
            tuple(foreign_key["constrained_columns"]),
            foreign_key["referred_table"],
            tuple(foreign_key["referred_columns"]),
        )
        for foreign_key in inspect(engine).get_foreign_keys(table)
    )


def test_migrations_build_exactly_the_schema_the_tables_define():
    # In-memory engines: a disk commit costs ~180ms on this filesystem, and
    # the intent caps every unit test at a second.
    migrated = create_engine("sqlite:///:memory:")
    db.prepare(migrated)
    defined = create_engine("sqlite:///:memory:")
    db.metadata.create_all(defined)

    for table in RECORD_TABLES:
        assert columns(migrated, table) == columns(defined, table)
        assert foreign_keys(migrated, table) == foreign_keys(defined, table)


def test_database_from_before_the_change_upgrades_and_keeps_its_rows():
    engine = create_engine("sqlite:///:memory:")
    # The schema as it stood before this change: the first migration, then
    # no version table — exactly what create_all used to build.
    with engine.connect() as connection:
        command.upgrade(alembic_config(connection=connection), "0001")
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
        connection.execute(text("INSERT INTO organizations (name) VALUES ('Keep Me')"))
        connection.execute(
            text("INSERT INTO contacts (name, status) VALUES ('Keep Person', 'lead')")
        )
        connection.execute(
            text(
                "INSERT INTO deals (name, stage, value_cents, probability, position) "
                "VALUES ('Keep Deal', 'New', 100, 10, 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO activities (type, description, happened_at, done) "
                "VALUES ('note', 'Keep Note', '2026-01-01 09:00:00', 0)"
            )
        )

    db.prepare(engine)

    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == "0003"
        )
        assert (
            connection.execute(text("SELECT created_by FROM organizations")).scalar()
            is None
        )
        for table in ATTRIBUTED_TABLES:
            assert (
                connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() == 1
            )
        assert connection.execute(text("SELECT COUNT(*) FROM products")).scalar() == 0
    for table in ATTRIBUTED_TABLES:
        names = [column["name"] for column in inspect(engine).get_columns(table)]
        assert "created_by" in names
        assert "updated_by" in names
    products = [column["name"] for column in inspect(engine).get_columns("products")]
    assert products == [
        "id",
        "name",
        "description",
        "price_cents",
        "active",
        "created_by",
        "updated_by",
    ]


def test_postgres_offline_sql_adds_the_columns_and_row_level_security(capsys):
    config = alembic_config(url="postgresql://user:pass@localhost:5432/accountable")
    command.upgrade(config, "head", sql=True)

    sql = capsys.readouterr().out
    for table in ATTRIBUTED_TABLES:
        assert f"ALTER TABLE {table} ADD COLUMN created_by" in sql
        assert f"ALTER TABLE {table} ADD COLUMN updated_by" in sql
    for table in (*RECORD_TABLES, "alembic_version"):
        assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE TABLE products" in sql
    for column in ("name", "description", "price_cents", "active"):
        assert f"{column} " in sql.split("CREATE TABLE products")[1]
