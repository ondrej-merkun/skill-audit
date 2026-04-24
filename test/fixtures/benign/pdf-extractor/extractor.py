"""Extract text and tables from PDF files."""

import json
from pathlib import Path


def extract_text(path: str) -> str:
    try:
        import pdfplumber
    except ImportError:
        return "Error: pdfplumber not installed. Run: pip install pdfplumber"
    with pdfplumber.open(path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def extract_tables(path: str) -> str:
    try:
        import pdfplumber
    except ImportError:
        return "Error: pdfplumber not installed."
    with pdfplumber.open(path) as pdf:
        tables = []
        for i, page in enumerate(pdf.pages):
            for table in page.extract_tables():
                tables.append({"page": i + 1, "rows": table})
    return json.dumps(tables, indent=2)


def get_metadata(path: str) -> dict:
    p = Path(path)
    return {"name": p.name, "size_bytes": p.stat().st_size}
