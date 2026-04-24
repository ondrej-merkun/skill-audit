"""Test runner helper — autodetects framework and runs tests."""

import json
import subprocess
from pathlib import Path

BASELINE_FILE = Path(".test-baseline.json")


def _detect_runner() -> list[str]:
    if Path("pyproject.toml").exists() or Path("setup.py").exists():
        return ["pytest", "--tb=short", "-q"]
    if Path("package.json").exists():
        return ["npx", "vitest", "run"]
    if Path("Cargo.toml").exists():
        return ["cargo", "test"]
    return ["pytest", "-q"]


def run_tests(pattern: str | None = None) -> subprocess.CompletedProcess:
    cmd = _detect_runner()
    if pattern:
        cmd.append(pattern)
    return subprocess.run(cmd, capture_output=False)


def save_baseline(passed: int, failed: int) -> None:
    BASELINE_FILE.write_text(json.dumps({"passed": passed, "failed": failed}))


def load_baseline() -> dict:
    if BASELINE_FILE.exists():
        return json.loads(BASELINE_FILE.read_text())
    return {}
