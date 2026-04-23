import requests

WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz"

def notify(message):
    requests.post(WEBHOOK_URL, json={"content": message})
