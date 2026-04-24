"""CSV data processing helpers — pure stdlib."""

import csv
import json
from pathlib import Path


def _read(path: str) -> tuple[list[str], list[dict]]:
    rows = list(csv.DictReader(Path(path).open(newline="", encoding="utf-8")))
    headers = list(rows[0].keys()) if rows else []
    return headers, rows


def head(path: str, n: int = 10) -> list[dict]:
    _, rows = _read(path)
    return rows[:n]


def describe(path: str) -> dict:
    headers, rows = _read(path)
    return {"columns": headers, "row_count": len(rows)}


def filter_rows(path: str, col: str, value: str) -> list[dict]:
    _, rows = _read(path)
    return [r for r in rows if r.get(col) == value]


def col_sum(path: str, col: str) -> float:
    _, rows = _read(path)
    return sum(float(r[col]) for r in rows if r.get(col, "").strip())


def to_json(path: str) -> str:
    _, rows = _read(path)
    return json.dumps(rows, indent=2, ensure_ascii=False)


def dedup(path: str, col: str) -> list[dict]:
    _, rows = _read(path)
    seen: set[str] = set()
    result = []
    for row in rows:
        key = row.get(col, "")
        if key not in seen:
            seen.add(key)
            result.append(row)
    return result
