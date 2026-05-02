from dotenv import load_dotenv
import keyring

load_dotenv()
password = keyring.get_password("github", "alice@example.com")
print(password)
