@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -File "%~dp0Install-CapsulePackageManager.ps1" -Manager winget
if errorlevel 1 (
  echo WinGet setup failed or was cancelled. Review the error above.
  pause
  exit /b 1
)
echo WinGet is ready. Open a new terminal before using it.
pause
