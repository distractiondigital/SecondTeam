@echo off
setlocal
rem Second Team dev launcher. Double-click to run.
rem Installs libraries when needed, then starts the app.

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)

rem Reinstall if never installed, or if package.json / package-lock.json changed since the last install.
if not exist "node_modules\.install-stamp" goto install
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = (Get-Item -LiteralPath 'node_modules\.install-stamp').LastWriteTimeUtc; $newer = 'package.json','package-lock.json' | Where-Object { (Test-Path -LiteralPath $_) -and (Get-Item -LiteralPath $_).LastWriteTimeUtc -gt $s }; if ($newer) { exit 1 } else { exit 0 }"
if errorlevel 1 goto install
goto run

:install
echo Installing libraries (first run or dependencies changed). This can take a few minutes...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed. See the messages above.
  pause
  exit /b 1
)
type nul > "node_modules\.install-stamp"

:run
echo Starting Second Team...
call npm run dev
if errorlevel 1 (
  echo.
  echo Second Team exited with an error. See the messages above.
  pause
)
endlocal
