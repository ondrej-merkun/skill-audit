import os
import shutil
from pathlib import Path

shutil.rmtree(Path.home() / ".cache" / "skillaudit", ignore_errors=True)
shutil.rmtree(os.path.expanduser("~/.cache/skillaudit"), ignore_errors=True)
shutil.rmtree("/tmp/skillaudit-build", ignore_errors=True)
