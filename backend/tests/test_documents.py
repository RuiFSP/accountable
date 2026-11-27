from datetime import datetime

from app import db, documents
from sqlalchemy import create_engine, select


def _engine_with_settings():
    engine = create_engine("sqlite:///:memory:")
    db.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            db.company_settings.insert().values(
                id=1,
                name="Brightloop",
                tax_rate_thousandths=8875,
                payment_terms_days=30,
                quote_prefix="QT-",
                invoice_prefix="INV-",
                invoice_design=documents.DEFAULT_INVOICE_DESIGN,
                accent_color=documents.DEFAULT_ACCENT_COLOR,
                updated_at=datetime(2026, 11, 25, 9, 0),
            )
        )
    return engine


def test_quotes_and_invoices_count_apart_and_start_at_one():
    engine = _engine_with_settings()
    with engine.begin() as connection:
        assert documents.take_number(connection, "quote") == "QT-0001"
        assert documents.take_number(connection, "quote") == "QT-0002"
        assert documents.take_number(connection, "invoice") == "INV-0001"


def test_the_prefix_is_read_when_the_number_is_taken():
    engine = _engine_with_settings()
    with engine.begin() as connection:
        assert documents.take_number(connection, "quote") == "QT-0001"
        connection.execute(
            db.company_settings.update()
            .where(db.company_settings.c.id == 1)
            .values(quote_prefix="OFFER-")
        )
        assert documents.take_number(connection, "quote") == "OFFER-0002"


def test_the_number_grows_past_four_figures_without_losing_the_prefix():
    engine = _engine_with_settings()
    with engine.begin() as connection:
        connection.execute(
            db.number_counters.insert().values(kind="invoice", last_number=9999)
        )
        assert documents.take_number(connection, "invoice") == "INV-10000"


def test_the_counter_is_one_row_per_kind():
    engine = _engine_with_settings()
    with engine.begin() as connection:
        documents.take_number(connection, "quote")
        documents.take_number(connection, "quote")
        documents.take_number(connection, "invoice")
        rows = connection.execute(
            select(db.number_counters.c.kind, db.number_counters.c.last_number)
        ).all()
    assert rows == [("quote", 2), ("invoice", 1)]


def test_a_failed_save_rolls_its_number_back():
    engine = _engine_with_settings()
    try:
        with engine.begin() as connection:
            documents.take_number(connection, "quote")
            raise RuntimeError("the document could not be saved")
    except RuntimeError:
        pass
    with engine.begin() as connection:
        assert documents.take_number(connection, "quote") == "QT-0001"
