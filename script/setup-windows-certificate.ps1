$scriptPath = split-path -parent $MyInvocation.MyCommand.Definition
[Text.Encoding]::Utf8.GetString([Convert]::FromBase64String($env:WINDOWS_CERT_PFX)) | Out-File "$scriptPath\windows-certificate.pfx" -encoding UTF8
Get-Item "$scriptPath\windows-certificate.pfx" | Write-Out
