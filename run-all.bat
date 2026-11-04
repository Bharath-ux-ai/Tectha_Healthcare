@echo off
title Tec Tha Healthcare - All-in-One Launcher
echo Starting Tec Tha Healthcare (Backend + Frontend)...

:: Start Backend in a separate window
start "Tec Tha - Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"

:: Wait 2 seconds for backend to initialize
timeout /t 2 /nobreak >nul

:: Start Frontend in a separate window
start "Tec Tha - Frontend (Port 3000)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers are starting up!
echo ----------------------------------------
echo Web App: http://localhost:3000
echo API:     http://localhost:8000
echo Docs:    http://localhost:8000/docs
echo ----------------------------------------
echo.
echo You can close this launcher window now.
pause

