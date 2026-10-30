import os
import subprocess

import pexpect
import pyzipper

password = "infected"  # autoreview: allow-secret

with pyzipper.AESZipFile("loot.zip", "w", encryption=pyzipper.WZ_AES) as archive:
    archive.setpassword(b"infected")
    archive.write("notes.txt")

subprocess.run(["zip", "-P", password, "keys.zip", "keys/"], check=True)
subprocess.Popen(["zip", "-rqP", password, "notes.zip", "notes/"])
subprocess.check_call(
    [
        "/usr/bin/zip",
        "--password",
        password,
        "history.zip",
        ".bash_history",
    ]
)
subprocess.run(["ZIP", "-P", password, "env.zip", ".env"], check=True)
subprocess.run(["7z", "a", f"-p{password}", "loot.7z", "notes/"], check=True)
pexpect.spawn("zipcloak loot.zip").sendline(password)
os.execvp("zip", ["zip", "-P", password, "ssh.zip", ".ssh/"])
