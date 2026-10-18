@echo off
powershell.exe -NoProfile -File "%~dp0tools\Start-Helmet.ps1"
if errorlevel 1 pause
