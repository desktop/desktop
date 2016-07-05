$scriptPath = split-path -parent $MyInvocation.MyCommand.Definition

$file = "$scriptPath\windows-certificate.pfx"

if ((Test-Path $file)) {
  Remove-Item $file
}
