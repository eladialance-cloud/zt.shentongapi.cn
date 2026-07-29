cd /d D:\????\desktop

# ?? electron-builder
start /b npx electron-builder --win > build-v046.log 2>&1

:WAITLOOP
timeout /t 3 /nobreak >nul
if exist "dist\installer-v046\win-unpacked.tmp" (
    if not exist "dist\installer-v046\win-unpacked" (
        ren "dist\installer-v046\win-unpacked.tmp" win-unpacked 2>nul
        if errorlevel 1 (
            echo Waiting for file lock release... >> build-v046.log
            goto WAITLOOP
        ) else (
            echo Manually renamed win-unpacked.tmp -> win-unpacked >> build-v046.log
        )
    )
)
:: ????????
tasklist /fi "imagename eq node.exe" 2>nul | find "node.exe" >nul
if not errorlevel 1 goto WAITLOOP

echo Build process finished >> build-v046.log
