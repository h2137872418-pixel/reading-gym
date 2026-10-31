@echo off
cd /d "%~dp0"
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if errorlevel 1 (
  start "Reading Gym Server" /min "C:\Program Files\nodejs\npm.cmd" run dev -- --port 5173
  timeout /t 5 /nobreak >nul
)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5173"
