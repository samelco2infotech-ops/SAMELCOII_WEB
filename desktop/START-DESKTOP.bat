@echo off
REM SAMELCII desktop launcher: starts the optional Node backend, then opens the shared server login.
REM EDIT GUIDE: Update SAMELCII_APP_URL only when the approved SAMELCII server address changes.
REM HUWAG BAGUHIN: Keep the SQLite path under LOCALAPPDATA so updates do not overwrite local cache data.
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
set "SAMELCII_APP_URL=http://192.168.1.99/SAMELCII_WEB_SYSTEM/pages/auth/index.html"
set "SAMELCII_SQLITE_DIR=%LOCALAPPDATA%\SAMELCII\desktop-cache"
set "SAMELCII_SQLITE_PATH=%LOCALAPPDATA%\SAMELCII\desktop-cache\membership.sqlite"
set "SQLITE_MODULE=node_modules\sqlite3\package.json"

if not exist "%SAMELCII_SQLITE_DIR%" mkdir "%SAMELCII_SQLITE_DIR%" >nul 2>nul

if exist "..\backend\server.js" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -WorkingDirectory '%~dp0..\backend' -FilePath 'node.exe' -ArgumentList 'server.js' | Out-Null"
)

echo Waiting for SAMELCII backend on port 3000...
REM ponytail: 5-second readiness ceiling; increase the attempts only if slower PCs need more startup time.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ready = $false; for ($i = 0; $i -lt 5; $i++) { ^
    try { ^
      $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 2; ^
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break } ^
    } catch { } ^
    Start-Sleep -Seconds 1 ^
  }; if (-not $ready) { exit 1 }"
if errorlevel 1 (
  echo Backend is not responding on port 3000.
  echo Continuing anyway. Login will fall back to PHP, but some desktop features may be limited.
)

if not exist "%SQLITE_MODULE%" (
  echo Installing desktop dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install desktop dependencies.
    pause
    exit /b 1
  )
)

if not exist "%SQLITE_MODULE%" (
  echo Waiting for sqlite3 to finish installing...
  for /l %%i in (1,1,30) do (
    if exist "%SQLITE_MODULE%" goto :sqlite_ready
    timeout /t 2 /nobreak >nul
  )
  echo sqlite3 is still not available.
  pause
  exit /b 1
)

:sqlite_ready

echo Starting SAMELCII desktop wrapper...
call npm start
if errorlevel 1 (
  echo.
  echo Desktop launcher exited with an error.
  pause
  exit /b 1
)
