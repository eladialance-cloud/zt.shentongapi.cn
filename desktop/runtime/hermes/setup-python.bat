@echo off
REM =============================================================
REM Hermes Python Runtime Setup
REM Downloads and installs Python 3.11 embeddable into runtime
REM =============================================================
setlocal enabledelayedexpansion

set "HERMES_DIR=%~dp0"
set "PYTHON_DIR=%HERMES_DIR%python"
set "PYTHON_VERSION=3.11.9"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"

echo === Hermes Python Runtime Setup ===
echo Target: %PYTHON_DIR%

REM Check if Python already bundled
if exist "%PYTHON_DIR%\python.exe" (
    "%PYTHON_DIR%\python.exe" --version
    echo Bundled Python already installed.
    goto :check_pip
)

echo Downloading Python %PYTHON_VERSION% embeddable...
mkdir "%PYTHON_DIR%" 2>nul

REM Download using PowerShell (available on all Windows 10+)
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%TEMP%\hermes-python.zip'}" 
if errorlevel 1 (
    echo ERROR: Failed to download Python. Check network connection.
    echo Manual install: Download from %PYTHON_URL%
    echo Extract to: %PYTHON_DIR%
    pause
    exit /b 1
)

echo Extracting...
powershell -Command "Expand-Archive -Path '%TEMP%\hermes-python.zip' -DestinationPath '%PYTHON_DIR%' -Force"
del "%TEMP%\hermes-python.zip" 2>nul

REM Enable pip by modifying python._pth (remove the # before "import site")
if exist "%PYTHON_DIR%\python%PYTHON_VERSION:~0,3%._pth" (
    powershell -Command "(Get-Content '%PYTHON_DIR%\python%PYTHON_VERSION:~0,3%._pth') -replace '#import site', 'import site' | Set-Content '%PYTHON_DIR%\python%PYTHON_VERSION:~0,3%._pth'"
)

echo Python installed.
"%PYTHON_DIR%\python.exe" --version

:check_pip
REM Install/upgrade pip and hermes-agent
"%PYTHON_DIR%\python.exe" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo Installing pip...
    powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%TEMP%\get-pip.py'"
    "%PYTHON_DIR%\python.exe" "%TEMP%\get-pip.py" --no-warn-script-location
    del "%TEMP%\get-pip.py" 2>nul
)

echo Installing hermes-agent...
"%PYTHON_DIR%\python.exe" -m pip install --upgrade hermes-agent==0.19.0 --no-warn-script-location

echo === Setup Complete ===
exit /b 0
