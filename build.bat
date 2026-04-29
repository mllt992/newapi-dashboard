@echo off
chcp 65001 >nul
echo ================================
echo   Building frontend for production
echo ================================
echo.

cd /d "%~dp0\web"
call npx vite build
if errorlevel 1 (
    echo Build failed
    pause
    exit /b 1
)

echo.
echo Done. Output: web/dist/
pause
