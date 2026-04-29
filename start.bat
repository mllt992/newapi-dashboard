@echo off
chcp 65001 >nul
echo ================================
echo   New API Monitor - Start
echo ================================
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3002
echo.
echo   Press Ctrl+C to stop all services
echo ================================
echo.

cd /d "%~dp0"
call npm run dev
