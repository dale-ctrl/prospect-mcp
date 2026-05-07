@echo off
REM ============================================================
REM setup-user.cmd
REM ------------------------------------------------------------
REM Launcher for setup-user.ps1 that bypasses Windows PowerShell's
REM default execution policy (which rejects unsigned scripts run
REM from a UNC path or downloaded .ps1 files).
REM
REM Forwards every command-line argument verbatim, so:
REM
REM   setup-user.cmd                       -- full install
REM   setup-user.cmd -CredentialsOnly      -- refresh PAT only
REM   setup-user.cmd -UserCode DL          -- skip user-code prompt
REM
REM Equivalent to:
REM   powershell -NoProfile -ExecutionPolicy Bypass -File setup-user.ps1 [...args]
REM
REM Use this .cmd as the entrypoint -- it works regardless of the
REM machine's execution policy. The .ps1 next to it does the work.
REM ============================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-user.ps1" %*
exit /b %ERRORLEVEL%
