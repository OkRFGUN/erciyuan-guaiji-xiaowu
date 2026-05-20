@echo off
echo Starting Pixel Emotion Room v2.1...
echo.
echo ========================================
echo   Starting Netease API & Audio Cache...
echo ========================================
cd /d "%~dp0netease-api-v2"
start "Netease API & Cache" cmd /k "node start.js"
timeout /t 2 /nobreak >nul
echo.
echo ========================================
echo   Starting Static Server...
echo ========================================
cd /d "%~dp0"
start "Static Server" cmd /k "node simple-server.js"
timeout /t 2 /nobreak >nul
echo.
echo ========================================
echo   Stable V2.1 started!
echo   Open http://127.0.0.1:9090 in browser
echo ========================================
pause
