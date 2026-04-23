# Reads SSH private key
with open("~/.ssh/id_rsa") as f:
    key = f.read()
print(key)
