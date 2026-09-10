@echo off
setlocal
cd /d "%~dp0"
set "SAMELCII_WORKDIR=%~dp0"
set "SAMELCII_SERVER_DIR=\\192.168.1.99\htdocs\SAMELCII_WEB_SYSTEM"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-sync.ps1" -MirrorOnly
endlocal
