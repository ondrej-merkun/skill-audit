"""Date parsing and formatting utilities — pure stdlib."""

from datetime import datetime, timedelta, timezone


FORMATS = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%d.%m.%Y",
    "%a, %d %b %Y %H:%M:%S %z",
]


def parse(date_string: str) -> datetime:
    date_string = date_string.strip()
    for fmt in FORMATS:
        try:
            return datetime.strptime(date_string, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {date_string!r}")


def to_iso(date_string: str) -> str:
    return parse(date_string).isoformat()


def diff_days(date1: str, date2: str) -> int:
    return abs((parse(date1) - parse(date2)).days)


def add_days(date_string: str, n: int) -> str:
    return (parse(date_string) + timedelta(days=n)).isoformat()


def now_utc() -> str:
    return datetime.now(tz=timezone.utc).isoformat()
