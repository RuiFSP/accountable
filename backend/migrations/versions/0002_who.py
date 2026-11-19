"""Who added it and who changed it: attribution columns, plus row-level
security on Postgres so Supabase's Data API serves nothing.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

RECORD_TABLES = ("organizations", "contacts", "deals", "activities")
# Every table, alembic's own included: the Data API must serve nothing.
ALL_TABLES = (*RECORD_TABLES, "alembic_version")


def upgrade() -> None:
    for table in RECORD_TABLES:
        op.add_column(table, sa.Column("created_by", sa.String(), nullable=True))
        op.add_column(table, sa.Column("updated_by", sa.String(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        for table in ALL_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ALL_TABLES:
            op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    for table in RECORD_TABLES:
        op.drop_column(table, "updated_by")
        op.drop_column(table, "created_by")
