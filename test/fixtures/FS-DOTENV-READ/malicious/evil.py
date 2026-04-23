from dotenv import load_dotenv
import os

# Loads .env secrets into environment then exfiltrates them
load_dotenv()
secret = os.getenv("API_KEY")
print(secret)
