@echo off
chcp 65001 >nul
echo ================================
echo   New API Monitor - Install
echo ================================
echo.

echo [1/3] Installing root dependencies...
call npm install
if errorlevel 1 (
    echo Root install failed
    pause
    exit /b 1
)

echo [2/3] Installing server dependencies...
cd server
call npm install
if errorlevel 1 (
    echo Server install failed
    pause
    exit /b 1
)
cd ..

echo [3/3] Installing web dependencies...
cd web
call npm install
if errorlevel 1 (
    echo Web install failed
    pause
    exit /b 1
)
cd ..

echo.
echo ================================
echo   Done! Run start.bat to start.
echo ================================
pause
