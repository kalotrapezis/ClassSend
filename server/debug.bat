@echo off
echo ============================================
echo   ClassSend Server - Debug Console
echo ============================================
echo.
echo Starting server with visible console output...
echo Press Ctrl+C to stop the server.
echo.

cd /d "%~dp0"
node index.js

echo.
echo ============================================
echo Server stopped. Press any key to close.
echo ============================================
pause
