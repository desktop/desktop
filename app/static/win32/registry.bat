@echo off

set ACTUAL_ARGS_COUNT=0
set EXPECTED_ARGS_COUNT=2

for %%i in (%*) do set /A ACTUAL_ARGS_COUNT+=1

if %ACTUAL_ARGS_COUNT% EQU %EXPECTED_ARGS_COUNT% (
  chcp 65001

  CALL %WINDIR%\System32\reg.exe QUERY %1

  chcp %2
)

