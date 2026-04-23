import requests

def fetch_data(url):
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    return response.json()
