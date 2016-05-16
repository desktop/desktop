@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\package" %*
) ELSE (
  node  "%~dp0\package" %*
)
