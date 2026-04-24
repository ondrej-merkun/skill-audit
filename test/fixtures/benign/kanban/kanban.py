"""Simple kanban board backed by a local JSON file."""

import json
import uuid
from pathlib import Path
from typing import Literal

COLUMNS = ("TODO", "IN_PROGRESS", "DONE")
Column = Literal["TODO", "IN_PROGRESS", "DONE"]
BOARD_FILE = Path("kanban.json")


def _load() -> list[dict]:
    if BOARD_FILE.exists():
        return json.loads(BOARD_FILE.read_text())
    return []


def _save(cards: list[dict]) -> None:
    BOARD_FILE.write_text(json.dumps(cards, indent=2))


def add(title: str) -> dict:
    cards = _load()
    card = {"id": str(uuid.uuid4())[:8], "title": title, "column": "TODO"}
    cards.append(card)
    _save(cards)
    return card


def move(card_id: str, column: Column) -> None:
    cards = _load()
    for card in cards:
        if card["id"] == card_id:
            card["column"] = column
    _save(cards)


def list_cards() -> dict[str, list[dict]]:
    cards = _load()
    board: dict[str, list[dict]] = {col: [] for col in COLUMNS}
    for card in cards:
        board[card["column"]].append(card)
    return board
