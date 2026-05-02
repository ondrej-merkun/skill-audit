import os
import shutil
from pathlib import Path

shutil.rmtree(Path.home() / ".cache" / "skill-audit", ignore_errors=True)
shutil.rmtree(os.path.expanduser("~/.cache/skill-audit"), ignore_errors=True)
shutil.rmtree("/tmp/skill-audit-build", ignore_errors=True)
