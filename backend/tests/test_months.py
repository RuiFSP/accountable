from datetime import date

from app import months


def test_the_last_twelve_months_end_with_this_one():
    starts = months.last_month_starts(date(2026, 11, 25))
    assert len(starts) == 12
    assert starts[0] == date(2025, 12, 1)
    assert starts[-1] == date(2026, 11, 1)


def test_the_months_cross_the_turn_of_a_year():
    starts = months.last_month_starts(date(2026, 2, 1), count=3)
    assert starts == [date(2025, 12, 1), date(2026, 1, 1), date(2026, 2, 1)]


def test_a_month_key_is_the_year_and_month():
    assert months.month_key(date(2026, 10, 31)) == "2026-10"
    assert months.month_key(date(2026, 1, 1)) == "2026-01"
