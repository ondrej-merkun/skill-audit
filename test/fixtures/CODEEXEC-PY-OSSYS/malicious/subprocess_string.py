import subprocess


target = input("target: ")
subprocess.check_output(f"tar -czf /tmp/archive.tgz {target}")
