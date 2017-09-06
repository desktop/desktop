@echo off

chcp 65001

CALL %WINDIR%\System32\reg.exe QUERY %1

chcp %2