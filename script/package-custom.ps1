param([string] $NodePath)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$environmentNames = @(
    'PATH', 'NODE_ENV', 'RELEASE_CHANNEL', 'TARGET_ARCH', 'npm_config_arch',
    'DESKTOP_SKIP_PACKAGE', 'DESKTOP_OAUTH_CLIENT_ID', 'DESKTOP_OAUTH_CLIENT_SECRET'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$mutex = $null
$ownsMutex = $false
$failed = $false
Push-Location -LiteralPath $root

try {
    $version = (Get-Content -LiteralPath (Join-Path $root '.nvmrc') -Raw).Trim()
    if (-not $NodePath) {
        $portableNode = Join-Path (Split-Path -Parent $root) ".tools\node-$version-win-x64\node.exe"
        $NodePath = if (Test-Path -LiteralPath $portableNode) {
            $portableNode
        } else {
            (Get-Command node.exe -ErrorAction Stop).Source
        }
    }
    $NodePath = (Resolve-Path -LiteralPath $NodePath).Path
    $actualVersion = & $NodePath --version
    if ($LASTEXITCODE -ne 0 -or $actualVersion -ne $version) {
        throw "Node $version is required; found $actualVersion. Use -NodePath to select the matching node.exe."
    }
    $architecture = & $NodePath -p 'process.arch'
    if ($LASTEXITCODE -ne 0 -or $architecture -ne 'x64') {
        throw 'This local installer script currently supports Windows x64 only.'
    }

    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $key = [BitConverter]::ToString($hash.ComputeHash(
            [Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant())
        )).Replace('-', '')
    } finally {
        $hash.Dispose()
    }
    $mutex = New-Object Threading.Mutex($false, "Local\GitHubDesktopCustomPackage-$key")
    try {
        $ownsMutex = $mutex.WaitOne(0)
    } catch [Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }
    if (-not $ownsMutex) {
        throw 'A Custom installer build is already running for this checkout.'
    }

    $dist = Join-Path $root '.custom-build\dist'
    $runningBuild = Get-CimInstance Win32_Process -Filter "Name = 'GitHubDesktopCustom.exe'" |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith("$dist\", [StringComparison]::OrdinalIgnoreCase) }
    if ($runningBuild) {
        throw 'Close the portable Custom app running from .custom-build\dist before rebuilding. Installed apps and the development app can stay open.'
    }

    $env:PATH = "$(Split-Path -Parent $NodePath);$env:PATH"
    $env:NODE_ENV = 'production'
    $env:RELEASE_CHANNEL = 'custom'
    $env:TARGET_ARCH = 'x64'
    $env:npm_config_arch = 'x64'
    $env:DESKTOP_SKIP_PACKAGE = $null
    # Use the public development OAuth client, never the official production callback.
    $env:DESKTOP_OAUTH_CLIENT_ID = $null
    $env:DESKTOP_OAUTH_CLIENT_SECRET = $null
    $yarn = Join-Path $root 'vendor\yarn-1.21.1.js'

    function Invoke-YarnTask([string] $Task) {
        # Windows PowerShell can turn redirected native stderr warnings into
        # terminating errors. Keep streaming them, but use the process exit code.
        try {
            $ErrorActionPreference = 'Continue'
            & $NodePath $yarn $Task
            $code = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = 'Stop'
        }
        if ($code -ne 0) {
            throw "Yarn $Task failed (exit code $code)."
        }
    }

    Write-Host '[1/2] Building GitHub Desktop Custom (production resources, local unsigned build)...'
    Invoke-YarnTask 'build:prod'

    Write-Host '[2/2] Creating the Windows installers...'
    Invoke-YarnTask 'package'

    foreach ($file in @('GitHubDesktopCustomSetup-x64.exe', 'GitHubDesktopCustomSetup-x64.msi')) {
        $installer = Join-Path $dist $file
        if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
            throw "Expected installer was not generated: $installer"
        }
        Write-Host "Created: $installer"
    }
    Write-Host 'Done. Installers are unsigned. Nothing has been installed, published or pushed.'
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $failed = $true
} finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    if ($ownsMutex) {
        $mutex.ReleaseMutex()
    }
    if ($null -ne $mutex) {
        $mutex.Dispose()
    }
    Pop-Location
}

if ($failed) { exit 1 }
