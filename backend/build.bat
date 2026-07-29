@echo off
chcp 65001 >nul
cd /d "D:\二次开发\backend"
call npx nest build 2>&1
echo BUILD_EXIT_CODE=%ERRORLEVEL%
