# This script can be removed as soon as official Windows arm64 builds are published:
# https://github.com/nodejs/build/issues/2450#issuecomment-705853342

$nodeVersion = $args[0]

If ($null -eq $nodeVersion) {
  Write-Error "No NodeJS version given as argument to this file. Run it like download-nodejs-win-arm64.ps1 12.10.1"
  exit 1
}

$url = "https://unofficial-builds.nodejs.org/download/release/v$nodeVersion/win-arm64/node.lib"
$cacheFolder = "$env:LOCALAPPDATA\node-gyp\Cache\$nodeVersion\arm64"

If (!(Test-Path $cacheFolder)) {
  New-Item -ItemType Directory -Force -Path $cacheFolder
}

$output = "$cacheFolder\node.lib"
$start_time = Get-Date

Invoke-WebRequest -Uri $url -OutFile $output
Write-Output "Downloaded arm64 NodeJS lib $nodeVersion in $((Get-Date).Subtract($start_time).Seconds) second(s)"
