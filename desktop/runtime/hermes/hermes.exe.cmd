@echo off
REM ??????? Python
if exist "%~dp0python\python.exe" (
    set "HERMES_PYTHON=%~dp0python\python.exe"
    set "PATH=%~dp0python;%~dp0python\Scripts;%PATH%"
    goto :run
)
REM ????? Python
for %%p in (python python3 py) do (
    where %%p >nul 2>&1
    if not errorlevel 1 (
        set "HERMES_PYTHON=%%p"
        goto :run
    )
)
echo Hermes Agent requires Python 3.11+ or newer.
echo Please download Python from https://python.org or install the embedded runtime.
exit /b 1

:run
"%~dp0node\node.exe" "%~dp0node_modules\hermes-agent\bin\hermes.js" %*
