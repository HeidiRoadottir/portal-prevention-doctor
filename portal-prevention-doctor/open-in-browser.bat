@echo off
setlocal

set "URL=http://127.0.0.1:8000/portal-prevention-doctor/?v=10"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" "%URL%"
  goto :eof
)

if exist "%CHROME%" (
  start "" "%CHROME%" "%URL%"
  goto :eof
)

if exist "%CHROME_X86%" (
  start "" "%CHROME_X86%" "%URL%"
  goto :eof
)

start "" "%URL%"
