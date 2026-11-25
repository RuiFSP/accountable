"""The months every area's charts by month show: the last 12, ending with this one."""

from datetime import date

COUNT = 12


def month_key(day: date) -> str:
    """The bucket key for a day, such as "2026-10"."""
    return f"{day.year}-{day.month:02d}"


def last_month_starts(today: date, count: int = COUNT) -> list[date]:
    """The first day of each of the last ``count`` months, oldest first."""
    index = today.year * 12 + today.month - 1
    starts = []
    for back in range(count - 1, -1, -1):
        year, month = divmod(index - back, 12)
        starts.append(date(year, month + 1, 1))
    return starts
