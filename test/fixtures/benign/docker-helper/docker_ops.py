"""Local Docker management helpers — wraps the docker CLI."""

import subprocess


def _docker(*args: str) -> str:
    result = subprocess.run(["docker", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def list_containers() -> str:
    return _docker("ps", "--format", "table {{.Names}}\t{{.Status}}\t{{.Ports}}")


def container_logs(name: str, lines: int = 50) -> str:
    return _docker("logs", "--tail", str(lines), name)


def stop_all() -> None:
    ids = _docker("ps", "-q")
    if ids:
        _docker("stop", *ids.splitlines())


def prune() -> str:
    return _docker("system", "prune", "--volumes", "-f")


def stats() -> str:
    return _docker("stats", "--no-stream", "--format",
                   "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}")
