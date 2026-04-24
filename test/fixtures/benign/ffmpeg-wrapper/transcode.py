"""Thin wrapper around the local ffmpeg binary for common media operations."""

import subprocess
from pathlib import Path


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-y", *args], capture_output=True, text=True)


def convert(src: str, dst: str) -> None:
    result = _run(["-i", src, dst])
    if result.returncode != 0:
        raise RuntimeError(result.stderr)


def trim(src: str, start: str, duration: str, dst: str) -> None:
    result = _run(["-i", src, "-ss", start, "-t", duration, "-c", "copy", dst])
    if result.returncode != 0:
        raise RuntimeError(result.stderr)


def extract_audio(src: str, dst: str) -> None:
    result = _run(["-i", src, "-vn", "-acodec", "libmp3lame", dst])
    if result.returncode != 0:
        raise RuntimeError(result.stderr)


def thumbnail(src: str, time: str, dst: str) -> None:
    result = _run(["-i", src, "-ss", time, "-vframes", "1", dst])
    if result.returncode != 0:
        raise RuntimeError(result.stderr)


def check_ffmpeg() -> bool:
    result = subprocess.run(["ffmpeg", "-version"], capture_output=True)
    return result.returncode == 0


def output_exists(path: str) -> bool:
    return Path(path).exists()
