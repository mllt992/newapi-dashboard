@echo off
chcp 65001 >nul
echo Stopping services...

taskkill /F /IM tsx.exe 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul

taskkill /F /IM tsx.exe 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul


echo Done.
pause
