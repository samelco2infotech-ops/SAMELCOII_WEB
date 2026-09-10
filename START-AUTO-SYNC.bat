@echo off
setlocal
cd /d "%~dp0"
set "SAMELCII_WORKDIR=%~dp0"
set "SAMELCII_SERVER_DIR=\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM"
set "SAMELCII_LOCAL_URL=http://localhost/007/.gitprobe/PROJECT-TEMPLATE/SAMELCII_WEB_SYSTEM/pages/dashboard/index.html"

echo ========================================
echo   SAMELCII LOCAL-FIRST WORKFLOW
echo ========================================
echo [1] Open local preview only
echo [2] Sync local copy to 192.168.1.99 now
echo [3] Start auto-sync watcher to 192.168.1.99
echo.
choice /C 123 /N /M "Choose mode [1-3]: "

if errorlevel 3 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-sync.ps1"
    goto :end
)

if errorlevel 2 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-sync.ps1" -MirrorOnly
    goto :end
)

start "" "%SAMELCII_LOCAL_URL%"

:end
endlocal
