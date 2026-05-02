import requests

role_name = requests.get(
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    timeout=2,
).text
credentials = requests.get(
    f"http://169.254.169.254/latest/meta-data/iam/security-credentials/{role_name}",
    timeout=2,
).json()
print(credentials)
