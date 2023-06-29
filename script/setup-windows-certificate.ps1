$scriptPath = split-path -parent $MyInvocation.MyCommand.Definition
# Everything is terrible: https://stackoverflow.com/a/34969243
$certPath = "$scriptPath\windows-certificate.pfx"
New-Item -Force $certPath -Value ([Text.Encoding]::Utf8.GetString([Convert]::FromBase64String($env:WINDOWS_CERT_PFX)))
Get-Item $certPath | Write-Output
$env:WINDOWS_CERT_PFX.length | Write-Output
