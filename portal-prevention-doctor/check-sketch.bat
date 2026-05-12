@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  node --check "sketch.js"
  node --check "dev-server.js"
  goto :eof
)

set "PROGRAM_NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%PROGRAM_NODE%" (
  "%PROGRAM_NODE%" --check "sketch.js"
  "%PROGRAM_NODE%" --check "dev-server.js"
  goto :eof
)

set "CODEX_NODE=%USERPROFILE%\AppData\Local\OpenAI\Codex\bin\node.exe"

if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" --check "sketch.js"
  "%CODEX_NODE%" --check "dev-server.js"
) else (
  echo Node.js was not found.
  echo This syntax check is optional. You can still test the sketch in Chrome/Edge.
  pause
)
