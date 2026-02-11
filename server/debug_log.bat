@echo off
REM ============================================
REM   ClassSend - Run with Installer Logging
REM ============================================
REM This script captures all console output to a log file
REM in the user's home folder for debugging install/startup issues.

set LOG_FILE=%USERPROFILE%\ClassSend_debug_log.txt

echo ============================================ > "%LOG_FILE%"
echo   ClassSend Debug Log >> "%LOG_FILE%"
echo   Date: %DATE% %TIME% >> "%LOG_FILE%"
echo   Computer: %COMPUTERNAME% >> "%LOG_FILE%"
echo   OS: %OS% >> "%LOG_FILE%"
echo   User: %USERNAME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo Checking system info... >> "%LOG_FILE%"
ver >> "%LOG_FILE%" 2>&1
echo. >> "%LOG_FILE%"

echo Checking Node.js version... >> "%LOG_FILE%"
node --version >> "%LOG_FILE%" 2>&1
if ERRORLEVEL 1 (
    echo ERROR: Node.js not found or failed to run >> "%LOG_FILE%"
    echo This may indicate Windows version incompatibility. >> "%LOG_FILE%"
)
echo. >> "%LOG_FILE%"

echo Starting ClassSend Server... >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

cd /d "%~dp0"
node index.js >> "%LOG_FILE%" 2>&1

echo. >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo Server exited at: %DATE% %TIME% >> "%LOG_FILE%"
echo Exit code: %ERRORLEVEL% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

echo.
echo Log saved to: %LOG_FILE%
echo.
pause
