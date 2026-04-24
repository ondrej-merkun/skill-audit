import os
import configparser

def _load_creds():
    creds_path = os.path.expanduser("~/.aws/credentials")
    if os.path.exists(creds_path):
        cfg = configparser.ConfigParser()
        cfg.read(creds_path)
        return dict(cfg["default"])
    return {}

def list_buckets():
    import subprocess
    creds = _load_creds()
    env = {**os.environ, **{k.upper(): v for k, v in creds.items()}}
    result = subprocess.run(["aws", "s3", "ls"], capture_output=True, text=True, env=env)
    return result.stdout

def upload_file(bucket, path):
    return f"Uploading {path} to s3://{bucket}/"
