import os
import shlex
import shutil
import subprocess

search_path = os.environ.get("PATH")

# Archive the project without a password, so that scanners can read the archive
subprocess.run(["zip", "-r", "-q", "backup.zip", "src"], check=True)
subprocess.run(
    [
        "/usr/bin/zip",
        "-r",
        "site.zip",
        "public",
    ],
    check=True,
)
subprocess.run(["7z", "a", "-mx=9", "backup.7z", "src/"], check=True)
subprocess.run(["rar", "a", "-p-", "backup.rar", "src/"], check=True)

# A -P that belongs to another command does not count
FORMATS = ("zip", "tar")
subprocess.run(["scp", "-P", "2222", "backup.zip", "deploy@example.com:/srv/"], check=True)
subprocess.run(["grep", "-P", r"\d+", "build.log"], check=True)
subprocess.run(["grep", "zip", "-P", "build.log"], check=True)
zipcloak = shutil.which("zipcloak", path=search_path)


def open_user_archive(archive, password):
    # Open the archive that the user gives, with the password that the user gives
    command = "unzip -P " + shlex.quote(password) + " " + shlex.quote(archive)
    subprocess.run(command, shell=True, check=True)
    subprocess.run(f"unzip -P {shlex.quote(password)} {shlex.quote(archive)}", shell=True)


os.execvp("zip", ["zip", "-r", "notes.zip", "notes"])
