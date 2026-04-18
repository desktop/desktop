@echo off
setlocal

set "ROOT=%~dp0.."
pushd "%ROOT%" >nul

call :ensure_node || goto :fail
call :ensure_yarn || goto :fail
call :ensure_dependency_shims || goto :fail

echo Launching GitHub Desktop in development mode...
call :run_yarn start || goto :fail

popd >nul
exit /b 0

:ensure_node
set /p EXPECTED_NODE_VERSION=<.node-version

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
if /I not "%NODE_VERSION:v=%"=="%EXPECTED_NODE_VERSION%" (
  echo This repo expects Node.js %EXPECTED_NODE_VERSION%.
  echo Your current version is %NODE_VERSION%.
  exit /b 1
)

exit /b 0

:ensure_yarn
where yarn >nul 2>nul
if not errorlevel 1 (
  set "YARN_CMD=yarn"
  exit /b 0
)

where corepack >nul 2>nul
if errorlevel 1 (
  echo Yarn was not found on PATH.
  echo Run handlers\setup-dev.bat first.
  exit /b 1
)

set "YARN_CMD=corepack yarn"
exit /b 0

:run_yarn
call %YARN_CMD% %*
exit /b %errorlevel%

:ensure_dependency_shims
if exist "node_modules\.bin\cross-env.cmd" if exist "app\node_modules\winston\package.json" if exist "app\node_modules\codemirror\package.json" exit /b 0

call :ensure_visual_cpp_tools || exit /b 1

echo Detected an incomplete dependency install. Repairing workspace dependencies...
call :run_yarn install --force || exit /b 1

if exist "node_modules\.bin\cross-env.cmd" if exist "app\node_modules\winston\package.json" if exist "app\node_modules\codemirror\package.json" exit /b 0

if not exist "node_modules\.bin\cross-env.cmd" (
  echo Failed to restore node_modules\.bin\cross-env.cmd.
) else (
  echo Failed to restore app dependencies under app\node_modules.
)
echo Run handlers\setup-dev.bat after removing node_modules and app\node_modules if this persists.
exit /b 1

:ensure_visual_cpp_tools
set "VSWHERE=C:\PROGRA~2\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%VSWHERE%" set "VSWHERE=C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%VSWHERE%" (
  echo Visual Studio Build Tools were not detected.
  echo Install Visual Studio 2022 Build Tools with the Desktop development with C++ workload.
  exit /b 1
)

"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath >nul 2>nul
if errorlevel 1 (
  echo Visual Studio C++ build tools were not detected.
  echo Install the Desktop development with C++ workload, then run:
  echo   npm config set msvs_version 2022
  exit /b 1
)

exit /b 0

:fail
popd >nul
exit /b 1
