@echo off
REM VideoClaw local runtime launcher (backend :8000 + frontend :3000)
setlocal
set "VC_ROOT=%~dp0"
if exist "%VC_ROOT%node\node.exe" (
  "%VC_ROOT%node\node.exe" "%VC_ROOT%video-claw-server.js" %*
) else (
  echo VideoClaw requires the bundled Node runtime.
  exit /b 1
)
