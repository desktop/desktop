if "%npm_config_arch%" == "arm64" (
  echo "Skipping yarn test due to arch arm64 Electron not being supported by the host OS"
) else (
  yarn test
)

set APPVEYOR_TEST_RESULT=%ERRORLEVEL%
