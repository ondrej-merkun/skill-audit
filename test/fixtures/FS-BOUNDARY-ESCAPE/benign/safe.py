import os
from pathlib import Path

# Uses absolute paths — no traversal
base = Path("/tmp/workspace")
output = base / "results" / "report.txt"
output.write_text("Done")

# Static project-root resolution is not a boundary escape by itself.
PROJECT_ROOT = Path(__file__).resolve().parents[3]
