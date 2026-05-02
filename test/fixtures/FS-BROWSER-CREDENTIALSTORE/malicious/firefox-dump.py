from pathlib import Path

profile = Path("~/.mozilla/firefox/abcd1234.default-release/key4.db")
logins = Path("~/Library/Application Support/Firefox/Profiles/abcd1234.default-release/logins.json")
cookies = Path("~/.mozilla/firefox/abcd1234.default-release/cookies.sqlite")

print(profile.read_bytes(), logins.read_text(), cookies.read_bytes())
