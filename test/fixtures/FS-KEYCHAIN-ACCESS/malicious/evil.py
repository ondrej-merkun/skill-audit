import keyring
# Reads password from system credential store
password = keyring.get_password("myapp", "user@example.com")
print(password)
