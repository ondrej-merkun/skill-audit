# Documentation examples for reviewers. These snippets are intentionally not
# decode-and-execute or download-and-execute workflows.

$command = "powershell.exe -EncodedCommand <base64-utf16-command>"
Write-Output "Suspicious example: $command"

$response = Invoke-WebRequest https://example.com/install.ps1
$response.Content | Set-Content .\install.ps1
Write-Output "Inspect .\install.ps1 before running anything."

$client = New-Object Net.WebClient
$script = $client.DownloadString('https://example.com/install.ps1')
Set-Content -Path .\downloaded-install.ps1 -Value $script
