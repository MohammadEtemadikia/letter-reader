@echo off
REM Letter Reader - one-command start for Windows.
REM Installs dependencies and builds on first run, then starts the app.
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%PORT%"=="" set PORT=3400
set URL=http://localhost:%PORT%

REM --- Node -------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install Node 20 or newer from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if !NODE_MAJOR! LSS 20 (
  echo.
  echo   Your Node.js version is too old. Version 20 or newer is required.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo   Node %%v

REM --- Claude Code ------------------------------------------------------------
REM Not fatal: the app shows an in-page setup panel with the exact fix.
where claude >nul 2>&1
if errorlevel 1 (
  echo   Claude Code is not installed. Install it, then sign in:
  echo       npm install -g @anthropic-ai/claude-code
  echo       claude auth login
) else (
  claude auth status >nul 2>&1
  if errorlevel 1 (
    echo   Claude Code is installed but not signed in. Run:  claude auth login
  ) else (
    echo   Claude Code ready
  )
)

REM --- Dependencies and build -------------------------------------------------
if not exist node_modules (
  echo   Installing dependencies ^(first run only, a minute or two^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo   Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist .next (
  echo   Building...
  call npm run build
  if errorlevel 1 (
    echo   Build failed.
    pause
    exit /b 1
  )
)

REM --- Start ------------------------------------------------------------------
echo   Starting mobile-upload server on port 8934
start "Letter Reader upload server" /min node scripts\upload-server-standalone.cjs

echo   Starting on %URL%
start "" "%URL%"
call npx next start -p %PORT%

pause
