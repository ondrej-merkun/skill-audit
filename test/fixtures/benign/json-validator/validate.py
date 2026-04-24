"""JSON syntax checking and schema validation helpers."""

import json
from pathlib import Path


def check_syntax(path: str) -> list[str]:
    try:
        json.loads(Path(path).read_text(encoding="utf-8"))
        return []
    except json.JSONDecodeError as exc:
        return [f"Line {exc.lineno}: {exc.msg}"]


def pretty(path: str) -> str:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return json.dumps(data, indent=2, ensure_ascii=False)


def minify(path: str) -> str:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def validate_schema(schema_path: str, data_path: str) -> list[str]:
    try:
        import jsonschema
    except ImportError:
        return ["jsonschema not installed — run: pip install jsonschema"]
    schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
    data = json.loads(Path(data_path).read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)
    return [str(e.message) for e in validator.iter_errors(data)]
