"""Alembic's environment: online on the connection the app passes in, or
offline rendering SQL to stdout."""

from alembic import context

config = context.config


def run_migrations_offline() -> None:
    """Render the migration as SQL without touching a database."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run the migration on the connection app.db.prepare() hands over."""
    connection = config.attributes.get("connection")
    if connection is None:
        raise RuntimeError(
            "migrations run through db.prepare(), which passes a connection"
        )
    context.configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
