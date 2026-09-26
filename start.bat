@echo off
cd /d "%~dp0"
echo.
echo   Starting your 3D website at http://localhost:5173
echo   Keep this window open while you use the site. Press Ctrl+C to stop.
echo.
call npx --yes http-server . -p 5173 -c-1 -o
