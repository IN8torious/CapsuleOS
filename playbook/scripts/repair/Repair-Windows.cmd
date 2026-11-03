@echo off
rem  CapsuleOS - Repair Windows (full pass)
rem  Double-click this file. It will ask for administrator rights,
rem  then run DISM image repair followed by SFC, in that order.
setlocal
fltmc >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Repair-Windows.ps1" -Mode Full
echo.
echo Repair finished. The window can be closed.
pause
