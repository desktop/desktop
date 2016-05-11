@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\run" %*
) ELSE (
  node  "%~dp0\run" %*
)
