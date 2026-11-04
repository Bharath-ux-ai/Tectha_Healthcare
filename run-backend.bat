@echo off
title Tec Tha - Backend API
echo Starting FastAPI Backend on http://localhost:8000...
cd "%~dp0backend"
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

