@echo off
REM ============================================================
REM update-plugin.cmd
REM ------------------------------------------------------------
REM Launcher for update-plugin.ps1 that bypasses Windows PowerShell's
REM default execution policy. Use this .cmd as the entrypoint --
REM it works regardless of the machine's execution policy.
REM
REM Equivalent to:
REM   powershell -NoProfile -ExecutionPolicy Bypass -File update-plugin.ps1
REM ============================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-plugin.ps1" %*
exit /b %ERRORLEVEL%
