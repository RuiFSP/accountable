import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from app import db
from sqlalchemy import create_engine, inspect, text

RECORD_TABLES = ("organizations", "contacts", "deals", "activities", "products")
# The four that already existed when 0002 added their attribution columns.
ATTRIBUTED_TABLES = ("organizations", "contacts", "deals", "activities")
SETTINGS_TABLE = "company_settings"
# Every table the metadata defines, so a later area's table is covered without
# this list being edited again.
TABLES = tuple(table.name for table in db.metadata.sorted_tables)


def alembic_config(connection=None, url=None) -> Config:
    config = Config(str(db.BACKEND_DIR / "alembic.ini"))
    if connection is not None:
        config.attributes["connection"] = connection
    if url is not None:
        config.set_main_option("sqlalchemy.url", url)
    return config


def head_revision() -> str:
    """The one revision the migrations end at."""
    head = ScriptDirectory.from_config(alembic_config()).get_current_head()
    assert head is not None
    return head


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


def insert_one_of_each(connection) -> None:
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


def assert_kept_its_rows_and_gained_settings(connection) -> None:
    for table in ATTRIBUTED_TABLES:
        assert connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() == 1
    assert connection.execute(text("SELECT COUNT(*) FROM products")).scalar() == 0
    settings = connection.execute(
        text(
            "SELECT name, updated_by, invoice_design, accent_color, "
            "logo_content_type FROM company_settings WHERE id = 1"
        )
    ).one()
    # A database with no settings row starts as Brightloop, logo and all.
    assert settings == (
        "Brightloop",
        "priya@brightloop.example",
        "classic",
        "#073B4C",
        "image/png",
    )


def test_migrations_build_exactly_the_schema_the_tables_define():
    # In-memory engines: a disk commit costs ~180ms on this filesystem, and
    # the intent caps every unit test at a second.
    migrated = create_engine("sqlite:///:memory:")
    db.prepare(migrated)
    defined = create_engine("sqlite:///:memory:")
    db.metadata.create_all(defined)

    for table in TABLES:
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
        insert_one_of_each(connection)

    db.prepare(engine)

    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == head_revision()
        )
        assert (
            connection.execute(text("SELECT created_by FROM organizations")).scalar()
            is None
        )
        assert_kept_its_rows_and_gained_settings(connection)
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


def test_0002_schema_without_a_version_table_reaches_head_and_keeps_its_rows():
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        command.upgrade(alembic_config(connection=connection), "0002")
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
        insert_one_of_each(connection)

    db.prepare(engine)

    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == head_revision()
        )
        assert_kept_its_rows_and_gained_settings(connection)
    assert SETTINGS_TABLE in inspect(engine).get_table_names()


def test_products_schema_without_a_version_table_reaches_head_and_gains_settings():
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        command.upgrade(alembic_config(connection=connection), "0003")
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
        insert_one_of_each(connection)
        connection.execute(
            text(
                "INSERT INTO products (name, price_cents, active) "
                "VALUES ('Keep Product', 4950, 1)"
            )
        )

    db.prepare(engine)

    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == head_revision()
        )
        assert connection.execute(text("SELECT COUNT(*) FROM products")).scalar() == 1
        settings = connection.execute(
            text("SELECT name FROM company_settings WHERE id = 1")
        ).scalar_one()
        assert settings == "Brightloop"
    assert SETTINGS_TABLE in inspect(engine).get_table_names()


def test_current_schema_without_a_version_table_is_stamped_at_head():
    engine = create_engine("sqlite:///:memory:")
    db.metadata.create_all(engine)
    assert "alembic_version" not in inspect(engine).get_table_names()
    with engine.begin() as connection:
        insert_one_of_each(connection)

    db.prepare(engine)

    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == head_revision()
        )
        assert_kept_its_rows_and_gained_settings(connection)


@pytest.mark.parametrize("revision", ["0001", "0002", "0003", "0004", "0005"])
def test_a_database_at_an_earlier_revision_upgrades_keeps_its_rows_and_gains_the_documents_defaults(
    revision,
):
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        command.upgrade(alembic_config(connection=connection), revision)
    with engine.begin() as connection:
        insert_one_of_each(connection)
        if revision in ("0004", "0005"):
            # A settings row that predates the Documents section.
            connection.execute(
                text(
                    "INSERT INTO company_settings "
                    "(id, name, tax_rate_thousandths, payment_terms_days, "
                    "updated_by, updated_at) "
                    "VALUES (1, 'Earlier Co', 0, 0, 'someone@example.com', "
                    "'2026-01-01 09:00:00')"
                )
            )

    db.prepare(engine)

    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == head_revision()
        )
        for table in ATTRIBUTED_TABLES:
            assert (
                connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() == 1
            )
        name, design, accent, logo_type = connection.execute(
            text(
                "SELECT name, invoice_design, accent_color, logo_content_type "
                "FROM company_settings WHERE id = 1"
            )
        ).one()
        expected_name = "Earlier Co" if revision in ("0004", "0005") else "Brightloop"
        assert name == expected_name
        if revision in ("0004", "0005"):
            # A row that predates the Documents section keeps what it has and
            # gains the design, the accent and no logo.
            assert (design, accent, logo_type) == ("classic", "#073B4C", None)
        else:
            # A database with no settings row starts as Brightloop, logo and all.
            assert (design, accent, logo_type) == ("classic", "#073B4C", "image/png")


def test_the_migrations_have_one_head():
    script = ScriptDirectory.from_config(alembic_config())
    assert len(script.get_heads()) == 1


def test_postgres_offline_sql_adds_the_tables_the_columns_and_row_level_security(
    capsys,
):
    config = alembic_config(url="postgresql://user:pass@localhost:5432/accountable")
    command.upgrade(config, "head", sql=True)

    sql = capsys.readouterr().out
    assert "CREATE TABLE company_settings" in sql
    created = sql[
        sql.index("CREATE TABLE company_settings") : sql.index(
            "ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY"
        )
    ]
    for column in (
        "name",
        "address",
        "email",
        "phone",
        "tax_label",
        "tax_rate_thousandths",
        "payment_terms_days",
        "quote_prefix",
        "invoice_prefix",
        "updated_by",
        "updated_at",
    ):
        assert f"\n    {column} " in created
    for table in ATTRIBUTED_TABLES:
        assert f"ALTER TABLE {table} ADD COLUMN created_by" in sql
        assert f"ALTER TABLE {table} ADD COLUMN updated_by" in sql
    for table in (*TABLES, "alembic_version"):
        assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE TABLE products" in sql
    for column in ("name", "description", "price_cents", "active"):
        assert f"{column} " in sql.split("CREATE TABLE products")[1]
    assert "CREATE TABLE number_counters" in sql
    for column in ("kind", "last_number"):
        assert f"{column} " in sql.split("CREATE TABLE number_counters")[1]
    assert "CREATE TABLE invoices" in sql
    for column in ("number", "deal_id", "organization_id", "status", "bill_to_name"):
        assert f"{column} " in sql.split("CREATE TABLE invoices")[1]
    assert "CREATE TABLE invoice_lines" in sql
    assert "CREATE TABLE payments" in sql
