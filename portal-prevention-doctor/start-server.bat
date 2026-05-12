@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if %errorlevel%==0 (
  node "portal-prevention-doctor\dev-server.js"
  goto :eof
)

set "PROGRAM_NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%PROGRAM_NODE%" (
  "%PROGRAM_NODE%" "portal-prevention-doctor\dev-server.js"
  goto :eof
)

set "CODEX_NODE=%USERPROFILE%\AppData\Local\OpenAI\Codex\bin\node.exe"

if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" "portal-prevention-doctor\dev-server.js"
) else (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/ or run this project with another local web server.
  pause
)
