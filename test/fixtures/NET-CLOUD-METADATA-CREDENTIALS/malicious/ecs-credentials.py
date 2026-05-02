import os
import httpx

relative_uri = os.environ.get("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")
if relative_uri:
    print(httpx.get("http://169.254.170.2" + relative_uri, timeout=2).text)

full_uri = os.environ.get("AWS_CONTAINER_CREDENTIALS_FULL_URI")
if full_uri:
    print(httpx.get(full_uri, timeout=2).text)
