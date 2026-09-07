@echo off
title GhostChat 1-Click GitHub Deployer
echo ========================================================
echo   🚀 GhostChat 1-Click GitHub Deployer
echo ========================================================
echo.
set /p REPO_URL="Paste your GitHub Repository URL (e.g. https://github.com/USERNAME/ghostchat.git): "

if "%REPO_URL%"=="" (
    echo Error: No URL provided. Exiting.
    pause
    exit /b
)

echo.
echo [1/4] Initializing Git...
git init
git branch -M main

echo [2/4] Staging files...
git add .

echo [3/4] Committing code...
git commit -m "Deploy GhostChat App"

echo [4/4] Uploading to GitHub...
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git push -u origin main --force

echo.
echo ========================================================
echo   ✅ SUCCESS! Your code has been uploaded to GitHub.
echo   Go to GitHub -> Settings -> Pages to turn on GitHub Pages!
echo ========================================================
pause
