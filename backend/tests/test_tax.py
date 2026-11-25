import json
from pathlib import Path

from app import tax

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "totals-cases.json").read_text()
)


class CaseLine:
    def __init__(self, quantity: int, unit_price_cents: int) -> None:
        self.quantity = quantity
        self.unit_price_cents = unit_price_cents


def test_the_shared_cases_add_up_in_whole_cents():
    for case in CASES:
        lines = [CaseLine(quantity, price) for quantity, price in case["lines"]]
        result = tax.totals(lines, case["rate"])
        assert result.subtotal_cents == case["subtotal"], case["why"]
        assert result.tax_cents == case["tax"], case["why"]
        assert result.total_cents == case["total"], case["why"]


def test_tax_rounds_a_half_cent_up_where_python_round_would_not():
    assert tax.tax_on(50, 5000) == 3
    assert round(50 * 5000 / 100_000) == 2


def test_tax_is_worked_out_once_on_the_subtotal():
    line_by_line = tax.tax_on(10, 5000) + tax.tax_on(10, 5000)
    assert line_by_line == 2
    assert tax.totals([CaseLine(10, 1), CaseLine(10, 1)], 5000).tax_cents == 1


def test_the_quantity_and_amount_limits_are_the_integer_columns_limit():
    assert tax.MAX_QUANTITY == 1_000_000
    assert tax.MAX_AMOUNT_CENTS == 2_147_483_647
