$scriptPath = split-path -parent $MyInvocation.MyCommand.Definition
[Text.Encoding]::Utf8.GetString([Convert]::FromBase64String($env:DESKTOPBOT_TOKEN)) | Out-File "$scriptPath\windows-certificate.pfx"
