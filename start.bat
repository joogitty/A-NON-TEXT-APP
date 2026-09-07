@echo off
title GhostChat Offline Launcher
echo ========================================================
echo   👻 GhostChat - Air-Gapped Anonymous Messenger
echo ========================================================
echo Launching local secure server on http://localhost:8000 ...
python serve.py
if %ERRORLEVEL% NEQ 0 (
  echo Python not found. Opening index.html directly...
  start index.html
)
pause
