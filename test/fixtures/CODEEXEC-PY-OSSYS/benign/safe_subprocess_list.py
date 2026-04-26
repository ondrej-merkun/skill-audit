import subprocess
import sys


def run_script(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, script], shell=False, check=False, text=True)


def git_status(repo: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", repo, "status", "--short"],
        capture_output=True,
        text=True,
        check=False,
    )


def run_tests(pattern: str | None = None) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, "-m", "pytest"]
    if pattern:
        cmd.extend(["-k", pattern])
    return subprocess.run(cmd, shell=False, check=False, text=True)
