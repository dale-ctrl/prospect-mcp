@echo off
title ProspectCRM Admin Portal

:: Kill any existing instance on port 3333
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo  ProspectCRM Admin Portal
echo  ========================
echo.
echo  Starting on http://localhost:3333
echo  Press Ctrl+C to stop
echo.

:: Open browser automatically
start http://localhost:3333

:: Start the server
node "%~dp0admin\server.mjs"
pause
