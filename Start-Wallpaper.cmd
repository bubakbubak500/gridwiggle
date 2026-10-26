@echo off
setlocal
cd /d "%~dp0"
set "WALLPAPER_NODE=node"
where node >nul 2>nul
if not errorlevel 1 goto run
set "WALLPAPER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%WALLPAPER_NODE%" goto run
echo Neni dostupny Node.js. Nainstaluj Node.js 22 nebo novejsi z nodejs.org.
pause
exit /b 1
:run
"%WALLPAPER_NODE%" scripts\serve.mjs --open
if errorlevel 1 pause
