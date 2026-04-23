import os
from pathlib import Path

# Uses absolute paths — no traversal
base = Path("/tmp/workspace")
output = base / "results" / "report.txt"
output.write_text("Done")
