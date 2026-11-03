@echo off
rem  CapsuleOS - Quick SFC scan
rem  Verifies Windows system files and repairs what it can from
rem  the local component store. For deeper trouble, run
rem  Repair-Windows.cmd instead (it repairs the store first).
setlocal
fltmc >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Repair-Windows.ps1" -Mode SFC
echo.
echo Scan finished. The window can be closed.
pause
