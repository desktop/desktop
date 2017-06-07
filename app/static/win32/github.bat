@echo off
setlocal

set ELECTRON_RUN_AS_NODE=1
for /f %%A in ("*Desktop*") do set APP_NAME=%%~nxA
call "%~dp0..\..\..\%APP_NAME%" "%~dp0..\cli.js" %*

endlocal
