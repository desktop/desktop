@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
pushd "%ROOT%" >nul

set "FAILED="
set /p EXPECTED_NODE_VERSION=<.node-version

where node >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Node.js was not found on PATH.
  set "FAILED=1"
) else (
  for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
  if /I "!NODE_VERSION:v=!"=="%EXPECTED_NODE_VERSION%" (
    echo [ OK ] Node.js !NODE_VERSION!
  ) else (
    echo [FAIL] Node.js !NODE_VERSION! detected, expected %EXPECTED_NODE_VERSION%.
    set "FAILED=1"
  )
)

where yarn >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if errorlevel 1 (
    echo [FAIL] Yarn and Corepack are both unavailable.
    set "FAILED=1"
  ) else (
    echo [ OK ] Corepack is available and can provision Yarn Classic.
  )
) else (
  for /f "delims=" %%v in ('yarn -v') do set "YARN_VERSION=%%v"
  echo [ OK ] Yarn !YARN_VERSION!
)

where python >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Python was not found on PATH.
  set "FAILED=1"
) else (
  for /f "delims=" %%v in ('python --version 2^>^&1') do set "PYTHON_VERSION=%%v"
  echo [ OK ] !PYTHON_VERSION!
)

set "VSWHERE=C:\PROGRA~2\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%VSWHERE%" (
  echo [FAIL] Visual Studio Build Tools were not detected.
  set "FAILED=1"
) else (
  set "VS_PATH="
  for /f "usebackq delims=" %%v in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do set "VS_PATH=%%v"
  if defined VS_PATH (
    echo [ OK ] Visual Studio C++ build tools found at !VS_PATH!
  ) else (
    echo [FAIL] Visual Studio C++ build tools were not detected.
    echo [INFO] Modify Visual Studio Build Tools and add the Desktop development with C++ workload.
    set "FAILED=1"
  )
)

if defined FAILED (
  echo.
  echo One or more prerequisites are missing.
  echo Install the missing tools before running handlers\setup-dev.bat.
  popd >nul
  exit /b 1
)

echo.
echo All prerequisites look good.
popd >nul
exit /b 0
