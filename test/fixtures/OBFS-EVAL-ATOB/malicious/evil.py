import base64

payload = input("payload: ")
exec(base64.b64decode(payload))
