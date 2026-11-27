"""The quotes API: the numbers, the sums, the states and the actions."""

from datetime import date, timedelta

import pytest
from app import auth, db, seed
from sqlalchemy import create_engine, select

ALEX = auth.TEAMMATES[0]["email"]

ONLY_DRAFT = "Only a draft can be changed."
ONLY_DRAFT_SEND = "Only a draft can be sent."
ONLY_SENT_ANSWER = "Only a sent quote can be accepted or declined."
ONLY_FINAL_COPY = "Only a quote that is no longer a draft can be copied."
ONLY_FINAL_PDF = "A draft has no PDF; it is downloaded once the quote is sent."
NOT_OPEN_DEAL = "A quote can only be created on an open deal."
ARCHIVED_PRODUCT = "Only active products can be added to a quote."
DEAL_ALREADY_ACCEPTED = "This deal already has an accepted quote."


@pytest.fixture()
def client(tmp_path, monkeypatch, client_for, sign_in_as):
    """The app on an empty database of its own, holding only the settings row.

    Every test starts at QT-0001 with no other quotes in the way, so the
    numbers and the five totals can be asserted exactly.
    """
    engine = create_engine(f"sqlite:///{tmp_path / 'quotes.db'}")
    seed.create_tables(engine)
    seed.ensure_settings(engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    from app.main import app

    return client_for(app, sign_in_as())


def _organization(client, name="Quotes Corp") -> dict:
    return client.post(
        "/api/organizations",
        json={"name": name, "website": None, "industry": None, "notes": None},
    ).json()


def _deal(
    client, organization_id: int, stage: str = "Proposal", name="Quote Deal"
) -> dict:
    response = client.post(
        "/api/deals",
        json={
            "name": name,
            "organization_id": organization_id,
            "contact_id": None,
            "stage": stage,
            "value_cents": 100_000,
            "probability": 50,
            "close_date": None,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _product(client, name: str, price_cents: int) -> dict:
    response = client.post(
        "/api/products",
        json={"name": name, "description": None, "price_cents": price_cents},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _line(
    product: dict, quantity: int, unit_price_cents=None, description=None
) -> dict:
    return {
        "product_id": product["id"],
        "description": description,
        "quantity": quantity,
        "unit_price_cents": (
            product["price_cents"] if unit_price_cents is None else unit_price_cents
        ),
    }


def _create(client, deal_id: int, lines: list[dict], valid_until: str | None = None):
    return client.post(
        "/api/quotes",
        json={"deal_id": deal_id, "valid_until": valid_until, "lines": lines},
    )


def _created(
    client, deal_id: int, lines: list[dict], valid_until: str | None = None
) -> dict:
    response = _create(client, deal_id, lines, valid_until)
    assert response.status_code == 201, response.text
    return response.json()


def _three_lines(client) -> list[dict]:
    """Data migration, Annual support plan and Onsite training day: $12,000."""
    return [
        _line(_product(client, "Data migration Q", 180_000), 2),
        _line(_product(client, "Annual support plan Q", 240_000), 1),
        _line(_product(client, "Onsite training day Q", 120_000), 5),
    ]


def _number_of(quote: dict) -> int:
    return int(quote["number"].split("-")[-1])


def _stored_quote(client, quote_id: int) -> dict:
    """The quote row as the database keeps it, with its lines."""
    with db.get_engine().connect() as connection:
        quote = dict(
            connection.execute(select(db.quotes).where(db.quotes.c.id == quote_id))
            .mappings()
            .one()
        )
        lines = [
            dict(row)
            for row in connection.execute(
                select(db.quote_lines)
                .where(db.quote_lines.c.quote_id == quote_id)
                .order_by(db.quote_lines.c.position)
            ).mappings()
        ]
    return {"quote": quote, "lines": lines}


def test_create_gives_the_number_the_validity_and_the_settings_tax(client):
    org = _organization(client)
    deal = _deal(client, org["id"])

    response = _create(client, deal["id"], _three_lines(client))

    assert response.status_code == 201, response.text
    quote = response.json()
    assert quote["number"] == "QT-0001"
    assert quote["status"] == "draft"
    assert quote["deal_name"] == "Quote Deal"
    assert quote["organization_name"] == "Quotes Corp"
    assert date.fromisoformat(quote["valid_until"]) == date.today() + timedelta(days=30)
    assert quote["tax_label"] == "Sales tax"
    assert quote["tax_rate_thousandths"] == 8875
    assert quote["subtotal_cents"] == 1_200_000
    assert quote["tax_cents"] == 106_500
    assert quote["total_cents"] == 1_306_500
    assert quote["created_by"] == ALEX
    assert quote["updated_by"] == ALEX

    lines = quote["lines"]
    assert [line["product_name"] for line in lines] == [
        "Data migration Q",
        "Annual support plan Q",
        "Onsite training day Q",
    ]
    assert [line["amount_cents"] for line in lines] == [360_000, 240_000, 600_000]
    assert [line["position"] for line in lines] == [0, 1, 2]


def test_create_is_refused_on_a_closed_deal_or_with_an_archived_product(client):
    org = _organization(client)
    product = _product(client, "Archived for quotes", 1_000)
    line = _line(product, 1)

    for stage in ("Won", "Lost"):
        deal = _deal(client, org["id"], stage=stage)
        response = _create(client, deal["id"], [line])
        assert response.status_code == 400, stage
        assert response.json() == {"detail": NOT_OPEN_DEAL}

    missing = _create(client, 999_999, [line])
    assert missing.status_code == 404

    assert client.post(f"/api/products/{product['id']}/archive").status_code == 200
    deal = _deal(client, org["id"])
    refused = _create(client, deal["id"], [line])
    assert refused.status_code == 400
    assert refused.json() == {"detail": ARCHIVED_PRODUCT}
    assert _create(client, deal["id"], []).json() == {
        "detail": "A quote needs at least one line."
    }


def test_two_creates_take_consecutive_numbers_and_a_failure_leaves_no_gap(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Numbered product", 1_000)
    archived = _product(client, "Archived numbered product", 1_000)
    assert client.post(f"/api/products/{archived['id']}/archive").status_code == 200

    first = _created(client, deal["id"], [_line(product, 1)])
    failed = _create(client, deal["id"], [_line(archived, 1)])
    second = _created(client, deal["id"], [_line(product, 1)])

    assert failed.status_code == 400
    assert _number_of(second) == _number_of(first) + 1


def test_a_quote_created_after_a_seed_takes_the_number_after_the_samples(
    tmp_path, monkeypatch, client_for, sign_in_as
):
    from app.main import app

    engine = create_engine(f"sqlite:///{tmp_path / 'seeded.db'}")
    seed.ensure_seeded(engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    client = client_for(app, sign_in_as())
    deal = next(
        row for row in client.get("/api/deals").json() if row["stage"] == "Proposal"
    )
    product = client.get("/api/products").json()[0]

    quote = _created(client, deal["id"], [_line(product, 1)])

    assert quote["number"] == "QT-0013"


def test_a_drafts_update_moves_its_lines_and_its_date(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    first = _product(client, "Update first", 10_000)
    second = _product(client, "Update second", 20_000)
    third = _product(client, "Update third", 30_000)
    added = _product(client, "Update added", 40_000)
    quote = _created(
        client, deal["id"], [_line(first, 1), _line(second, 2), _line(third, 3)]
    )

    response = client.put(
        f"/api/quotes/{quote['id']}",
        json={
            "valid_until": "2027-06-01",
            "lines": [
                _line(third, 3),
                _line(first, 5, description="Changed description"),
                _line(added, 1),
            ],
        },
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    assert date.fromisoformat(updated["valid_until"]) == date(2027, 6, 1)
    assert [line["product_name"] for line in updated["lines"]] == [
        "Update third",
        "Update first",
        "Update added",
    ]
    assert [line["quantity"] for line in updated["lines"]] == [3, 5, 1]
    assert updated["lines"][1]["description"] == "Changed description"
    assert updated["subtotal_cents"] == 90_000 + 50_000 + 40_000
    assert updated["tax_rate_thousandths"] == 8875
    assert updated["updated_by"] == ALEX


def test_a_line_keeps_its_name_and_price_when_the_product_changes(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Snapshot product", 10_000)
    quote = _created(client, deal["id"], [_line(product, 1)])

    renamed = client.put(
        f"/api/products/{product['id']}",
        json={"name": "Renamed product", "description": None, "price_cents": 99_999},
    )
    assert renamed.status_code == 200
    response = client.put(
        f"/api/quotes/{quote['id']}",
        json={
            "valid_until": None,
            "lines": [_line(product, 2, unit_price_cents=10_000)],
        },
    )

    assert response.status_code == 200, response.text
    line = response.json()["lines"][0]
    assert line["product_name"] == "Snapshot product"
    assert line["unit_price_cents"] == 10_000


def test_a_line_stays_when_its_product_is_archived_and_a_new_one_is_refused(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    going = _product(client, "Going away", 5_000)
    staying = _product(client, "Staying put", 7_000)
    quote = _created(client, deal["id"], [_line(going, 1), _line(staying, 1)])
    assert client.post(f"/api/products/{going['id']}/archive").status_code == 200

    kept = client.put(
        f"/api/quotes/{quote['id']}",
        json={
            "valid_until": None,
            "lines": [_line(going, 1), _line(staying, 2)],
        },
    )
    assert kept.status_code == 200, kept.text
    assert [line["product_name"] for line in kept.json()["lines"]] == [
        "Going away",
        "Staying put",
    ]

    elsewhere = _product(client, "Archived elsewhere", 9_000)
    assert client.post(f"/api/products/{elsewhere['id']}/archive").status_code == 200
    refused = client.put(
        f"/api/quotes/{quote['id']}",
        json={
            "valid_until": None,
            "lines": [_line(going, 1), _line(staying, 1), _line(elsewhere, 1)],
        },
    )
    assert refused.status_code == 400
    assert refused.json() == {"detail": ARCHIVED_PRODUCT}


def test_a_sent_quote_refuses_every_change_with_a_plain_message(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Frozen product", 10_000)
    quote = _created(client, deal["id"], [_line(product, 1)])
    sent = client.post(f"/api/quotes/{quote['id']}/send")
    assert sent.status_code == 200, sent.text
    before = _stored_quote(client, quote["id"])

    refused = [
        client.put(
            f"/api/quotes/{quote['id']}",
            json={"valid_until": None, "lines": [_line(product, 2)]},
        ),
        client.post(f"/api/quotes/{quote['id']}/send"),
    ]

    for response, message in zip(refused, [ONLY_DRAFT, ONLY_DRAFT_SEND], strict=True):
        assert response.status_code == 400
        assert response.json() == {"detail": message}
    assert _stored_quote(client, quote["id"]) == before


def test_a_draft_refuses_answers_and_a_pdf(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Draft product", 10_000)
    quote = _created(client, deal["id"], [_line(product, 1)])
    before = _stored_quote(client, quote["id"])

    for response, message in [
        (client.post(f"/api/quotes/{quote['id']}/accept"), ONLY_SENT_ANSWER),
        (client.post(f"/api/quotes/{quote['id']}/decline"), ONLY_SENT_ANSWER),
        (client.post(f"/api/quotes/{quote['id']}/copy"), ONLY_FINAL_COPY),
        (client.get(f"/api/quotes/{quote['id']}/pdf"), ONLY_FINAL_PDF),
    ]:
        assert response.status_code == 400
        assert response.json() == {"detail": message}
    assert _stored_quote(client, quote["id"]) == before


def test_a_final_quote_refuses_answers(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Final product", 10_000)
    quote = _created(client, deal["id"], [_line(product, 1)])
    assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200
    assert client.post(f"/api/quotes/{quote['id']}/decline").status_code == 200

    for response, message in [
        (client.post(f"/api/quotes/{quote['id']}/accept"), ONLY_SENT_ANSWER),
        (client.post(f"/api/quotes/{quote['id']}/decline"), ONLY_SENT_ANSWER),
        (
            client.put(
                f"/api/quotes/{quote['id']}",
                json={"valid_until": None, "lines": [_line(product, 1)]},
            ),
            ONLY_DRAFT,
        ),
    ]:
        assert response.status_code == 400
        assert response.json() == {"detail": message}


def test_the_line_bounds_are_refused_with_plain_messages(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Bounded product", 2_200)

    cases = [
        (_line(product, 0), "Enter a whole number from 1 to 1,000,000"),
        (_line(product, 1_000_001), "Enter a whole number from 1 to 1,000,000"),
        (
            _line(product, 1, unit_price_cents=-1),
            "Enter a price from $0.00 to $21,474,836.47.",
        ),
        (_line(product, 1_000_000), "Keep each amount to $21,474,836.47 or less"),
    ]
    for line, message in cases:
        response = _create(client, deal["id"], [line])
        assert response.status_code == 400, line
        assert response.json() == {"detail": message}

    # Each amount fits, but their subtotal does not.
    two_heavy = [
        _line(product, 1_000_000, unit_price_cents=2_100),
        _line(product, 1_000_000, unit_price_cents=2_100),
    ]
    response = _create(client, deal["id"], two_heavy)
    assert response.status_code == 400
    assert response.json() == {"detail": "Keep each amount to $21,474,836.47 or less"}


def test_sending_freezes_the_tax_and_a_settings_save_moves_only_the_draft(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Tax product", 100_000)
    draft = _created(client, deal["id"], [_line(product, 1)])
    sent = _created(client, deal["id"], [_line(product, 1)])
    assert client.post(f"/api/quotes/{sent['id']}/send").status_code == 200

    frozen = _stored_quote(client, sent["id"])
    assert frozen["quote"]["tax_label"] == "Sales tax"
    assert frozen["quote"]["tax_rate_thousandths"] == 8875

    settings = client.get("/api/settings").json()
    saved = client.put(
        "/api/settings",
        json={
            **{
                key: settings[key]
                for key in (
                    "name",
                    "address",
                    "email",
                    "phone",
                    "tax_label",
                    "payment_terms_days",
                    "quote_prefix",
                    "invoice_prefix",
                )
            },
            "tax_rate_thousandths": 10_000,
        },
    )
    assert saved.status_code == 200, saved.text

    moved = client.get(f"/api/quotes/{draft['id']}").json()
    assert moved["tax_rate_thousandths"] == 10_000
    assert moved["tax_cents"] == 10_000
    untouched = client.get(f"/api/quotes/{sent['id']}").json()
    assert untouched["tax_rate_thousandths"] == 8875
    assert untouched["tax_cents"] == 8_875
    assert _stored_quote(client, sent["id"]) == frozen


def test_expired_is_a_view_that_starts_the_day_after_the_last(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Expiry product", 10_000)
    last_day = date.today()
    past = date.today() - timedelta(days=1)
    standing = _created(
        client, deal["id"], [_line(product, 1)], valid_until=last_day.isoformat()
    )
    gone = _created(
        client, deal["id"], [_line(product, 1)], valid_until=past.isoformat()
    )

    for quote in (standing, gone):
        assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200

    assert client.get(f"/api/quotes/{standing['id']}").json()["status"] == "sent"
    expired = client.get(f"/api/quotes/{gone['id']}").json()
    assert expired["status"] == "expired"
    rows = client.get("/api/quotes").json()["quotes"]
    states = {row["id"]: row["status"] for row in rows}
    assert states[standing["id"]] == "sent"
    assert states[gone["id"]] == "expired"


def test_accepting_moves_the_deal_to_won_and_sets_its_value(client):
    org = _organization(client)
    won_first = _deal(client, org["id"], stage="Won", name="Won first")
    deal = _deal(client, org["id"], name="Winning deal")
    product = _product(client, "Accept product", 10_050)
    quote = _created(client, deal["id"], [_line(product, 1)])
    assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200

    response = client.post(f"/api/quotes/{quote['id']}/accept")

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "accepted"
    won = next(
        row for row in client.get("/api/deals").json() if row["id"] == deal["id"]
    )
    assert won["stage"] == "Won"
    assert won["probability"] == 100
    assert won["value_cents"] == 10_100  # $100.50 rounds up to $101.00
    won_ids = [
        row["id"] for row in client.get("/api/deals").json() if row["stage"] == "Won"
    ]
    assert won_ids == [won_first["id"], deal["id"]]  # the end of the Won column
    assert won["position"] == 1
    entries = [
        entry
        for entry in client.get("/api/activities").json()
        if entry["deal_id"] == deal["id"] and entry["type"] == "stage_change"
    ]
    assert [entry["description"] for entry in entries] == ["Moved from Proposal to Won"]
    assert entries[0]["created_by"] == ALEX


@pytest.mark.parametrize(
    "subtotal_cents, value_cents",
    [(10_049, 10_000), (10_050, 10_100), (10_051, 10_100)],
)
def test_the_deal_value_rounds_the_subtotal_to_whole_dollars_halves_up(
    client, subtotal_cents, value_cents
):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, f"Rounding product {subtotal_cents}", subtotal_cents)
    quote = _created(client, deal["id"], [_line(product, 1)])
    assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200

    assert client.post(f"/api/quotes/{quote['id']}/accept").status_code == 200

    won = next(
        row for row in client.get("/api/deals").json() if row["id"] == deal["id"]
    )
    assert won["value_cents"] == value_cents


def test_a_second_accept_is_refused_while_the_first_stands(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Second accept product", 10_000)
    first = _created(client, deal["id"], [_line(product, 1)])
    second = _created(client, deal["id"], [_line(product, 1)])
    for quote in (first, second):
        assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200

    assert client.post(f"/api/quotes/{first['id']}/accept").status_code == 200

    refused = client.post(f"/api/quotes/{second['id']}/accept")
    assert refused.status_code == 400
    assert refused.json() == {"detail": DEAL_ALREADY_ACCEPTED}
    assert client.get(f"/api/quotes/{second['id']}").json()["status"] == "sent"


def test_an_expired_quote_can_still_be_accepted_or_declined(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Expired answer product", 10_000)
    past = (date.today() - timedelta(days=5)).isoformat()
    accepted = _created(client, deal["id"], [_line(product, 1)], valid_until=past)
    declined = _created(client, deal["id"], [_line(product, 1)], valid_until=past)
    for quote in (accepted, declined):
        assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200
        assert client.get(f"/api/quotes/{quote['id']}").json()["status"] == "expired"

    assert client.post(f"/api/quotes/{accepted['id']}/accept").status_code == 200
    assert client.post(f"/api/quotes/{declined['id']}/decline").status_code == 200

    assert client.get(f"/api/quotes/{accepted['id']}").json()["status"] == "accepted"
    assert client.get(f"/api/quotes/{declined['id']}").json()["status"] == "declined"


def test_decline_changes_only_the_quote(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Decline product", 10_000)
    quote = _created(client, deal["id"], [_line(product, 1)])
    assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200
    deal_before = client.get("/api/deals").json()
    before = _stored_quote(client, quote["id"])

    response = client.post(f"/api/quotes/{quote['id']}/decline")

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "declined"
    assert client.get("/api/deals").json() == deal_before
    after = _stored_quote(client, quote["id"])
    assert after["lines"] == before["lines"]
    assert after["quote"]["number"] == before["quote"]["number"]


def test_copy_makes_a_fresh_draft_and_leaves_the_original(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Copy product", 10_000)
    sent = _created(client, deal["id"], [_line(product, 2, description="Kept")])
    assert client.post(f"/api/quotes/{sent['id']}/send").status_code == 200
    original = _stored_quote(client, sent["id"])

    copied = client.post(f"/api/quotes/{sent['id']}/copy")

    assert copied.status_code == 201, copied.text
    copy = copied.json()
    assert copy["status"] == "draft"
    assert _number_of(copy) == _number_of(sent) + 1
    assert copy["valid_until"] == (date.today() + timedelta(days=30)).isoformat()
    assert copy["tax_label"] == "Sales tax"  # a draft shows the settings' tax...
    copy_row = _stored_quote(client, copy["id"])
    assert copy_row["quote"]["tax_label"] is None  # ...and keeps none of its own
    assert copy_row["quote"]["tax_rate_thousandths"] is None
    assert [
        (
            line["product_name"],
            line["quantity"],
            line["unit_price_cents"],
            line["description"],
            line["position"],
        )
        for line in copy["lines"]
    ] == [("Copy product", 2, 10_000, "Kept", 0)]
    assert _stored_quote(client, sent["id"]) == original

    # A declined quote copies just the same.
    declined = _created(client, deal["id"], [_line(product, 1)])
    assert client.post(f"/api/quotes/{declined['id']}/send").status_code == 200
    assert client.post(f"/api/quotes/{declined['id']}/decline").status_code == 200
    again = client.post(f"/api/quotes/{declined['id']}/copy")
    assert again.status_code == 201
    assert again.json()["status"] == "draft"


def test_the_five_totals_count_each_quote_once_at_the_right_rate(client):
    org = _organization(client)
    product = _product(client, "Total product", 100_000)
    quotes = {}
    for state in ("draft", "sent", "expired", "accepted", "declined"):
        deal = _deal(client, org["id"], name=f"Total {state}")
        valid_until = (
            (date.today() - timedelta(days=1)).isoformat()
            if state == "expired"
            else None
        )
        quote = _created(client, deal["id"], [_line(product, 1)], valid_until)
        if state != "draft":
            assert client.post(f"/api/quotes/{quote['id']}/send").status_code == 200
        if state == "accepted":
            assert client.post(f"/api/quotes/{quote['id']}/accept").status_code == 200
        if state == "declined":
            assert client.post(f"/api/quotes/{quote['id']}/decline").status_code == 200
        quotes[state] = quote

    # A draft follows the settings now; the rest kept their frozen rate.
    settings = client.get("/api/settings").json()
    saved = client.put(
        "/api/settings",
        json={
            **{
                key: settings[key]
                for key in (
                    "name",
                    "address",
                    "email",
                    "phone",
                    "tax_label",
                    "payment_terms_days",
                    "quote_prefix",
                    "invoice_prefix",
                )
            },
            "tax_rate_thousandths": 10_000,
        },
    )
    assert saved.status_code == 200, saved.text

    reply = client.get("/api/quotes").json()
    assert reply["totals"] == {
        "draft": 110_000,
        "sent": 108_875,
        "expired": 108_875,
        "accepted": 108_875,
        "declined": 108_875,
    }
    assert len(reply["quotes"]) == 5


def test_a_list_can_be_filtered_and_then_carries_no_totals(client):
    org = _organization(client)
    other = _organization(client, name="Other Corp")
    deal = _deal(client, org["id"])
    other_deal = _deal(client, other["id"], name="Other deal")
    product = _product(client, "Filter product", 10_000)
    _created(client, deal["id"], [_line(product, 1)])
    _created(client, other_deal["id"], [_line(product, 1)])

    by_deal = client.get(f"/api/quotes?deal_id={deal['id']}").json()
    assert "totals" not in by_deal
    assert [row["deal_name"] for row in by_deal["quotes"]] == ["Quote Deal"]

    by_org = client.get(f"/api/quotes?organization_id={other['id']}").json()
    assert "totals" not in by_org
    assert [row["organization_name"] for row in by_org["quotes"]] == ["Other Corp"]


def test_a_quote_is_never_deleted(client):
    org = _organization(client)
    deal = _deal(client, org["id"])
    product = _product(client, "Undeletable product", 10_000)
    quote = _created(client, deal["id"], [_line(product, 1)])

    response = client.delete(f"/api/quotes/{quote['id']}")

    assert response.status_code == 405
    assert client.get(f"/api/quotes/{quote['id']}").status_code == 200
