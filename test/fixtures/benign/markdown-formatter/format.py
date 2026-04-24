"""Markdown linting and auto-formatting helpers."""

import re
import shutil
from pathlib import Path


def _lines(path: str) -> list[str]:
    return Path(path).read_text(encoding="utf-8").splitlines(keepends=True)


def lint(path: str) -> list[str]:
    issues = []
    for i, line in enumerate(_lines(path), 1):
        if line.rstrip("\n").endswith(" "):
            issues.append(f"Line {i}: trailing whitespace")
        if re.match(r"^={3,}\s*$|^-{3,}\s*$", line):
            issues.append(f"Line {i}: setext heading — convert to ATX (#) style")
    return issues


def fix(path: str) -> None:
    src = Path(path)
    shutil.copy2(src, src.with_suffix(".md.bak"))
    text = src.read_text(encoding="utf-8")
    text = re.sub(r"[ \t]+(\n)", r"\1", text)
    src.write_text(text, encoding="utf-8")


def generate_toc(path: str) -> str:
    lines = _lines(path)
    toc = []
    for line in lines:
        m = re.match(r"^(#{1,6})\s+(.+)", line)
        if m:
            depth = len(m.group(1)) - 1
            title = m.group(2).strip()
            anchor = re.sub(r"[^\w\s-]", "", title.lower()).strip().replace(" ", "-")
            toc.append("  " * depth + f"- [{title}](#{anchor})")
    return "\n".join(toc)
