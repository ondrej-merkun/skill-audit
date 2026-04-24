"""Git workflow helper — generates branch names and commit messages."""

import re
import subprocess


def suggest_branch(description: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", description.lower()).strip("-")
    return f"feat/{slug}"


def recent_commits(n: int = 5) -> list[str]:
    result = subprocess.run(
        ["git", "log", f"-{n}", "--oneline"],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip().splitlines()


def staged_summary() -> str:
    result = subprocess.run(
        ["git", "diff", "--staged", "--stat"],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()
