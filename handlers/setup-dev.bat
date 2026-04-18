@echo off
setlocal

set "ROOT=%~dp0.."
pushd "%ROOT%" >nul

call :ensure_node || goto :fail
call :ensure_visual_cpp_tools || goto :fail
call :ensure_yarn || goto :fail

echo Installing dependencies...
call :run_yarn install || goto :fail
call :ensure_dependency_shims || goto :fail

echo Building development package...
call :run_yarn build:dev || goto :fail

echo.
echo Setup complete. Use handlers\start-dev.bat to launch the app.
popd >nul
exit /b 0

:ensure_node
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js 24.11.1 for the best compatibility with this repo.
  exit /b 1
)

set /p EXPECTED_NODE_VERSION=<.node-version
for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo Detected Node.js %NODE_VERSION%

if /I not "%NODE_VERSION:v=%"=="%EXPECTED_NODE_VERSION%" (
  echo This repo expects Node.js %EXPECTED_NODE_VERSION%.
  echo Your current version is %NODE_VERSION%.
  echo Switch Node versions before installing dependencies.
  exit /b 1
)

exit /b 0

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

:ensure_yarn
where yarn >nul 2>nul
if not errorlevel 1 (
  set "YARN_CMD=yarn"
  exit /b 0
)

where corepack >nul 2>nul
if errorlevel 1 (
  echo Yarn was not found on PATH, and Corepack is unavailable.
  echo Install Yarn Classic or use a Node.js install that includes Corepack.
  exit /b 1
)

echo Yarn was not found. Preparing Yarn Classic through Corepack...
call corepack prepare yarn@1.22.22 --activate || exit /b 1
set "YARN_CMD=corepack yarn"
exit /b 0

:run_yarn
call %YARN_CMD% %*
exit /b %errorlevel%

:ensure_dependency_shims
if exist "node_modules\.bin\cross-env.cmd" if exist "app\node_modules\winston\package.json" if exist "app\node_modules\codemirror\package.json" exit /b 0

echo Detected an incomplete dependency install. Repairing workspace dependencies...
call :run_yarn install --force || exit /b 1

if exist "node_modules\.bin\cross-env.cmd" if exist "app\node_modules\winston\package.json" if exist "app\node_modules\codemirror\package.json" exit /b 0

if not exist "node_modules\.bin\cross-env.cmd" (
  echo Failed to restore node_modules\.bin\cross-env.cmd.
) else (
  echo Failed to restore app dependencies under app\node_modules.
)
echo Delete node_modules and app\node_modules, then run handlers\setup-dev.bat again if this persists.
exit /b 1

:fail
echo.
echo Setup failed.
popd >nul
exit /b 1
