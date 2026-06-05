@echo off
REM run.bat — start Team AI Chat (dev server only)
REM Assumes dependencies are installed and the DB is set up.
REM For first-time setup (install + prisma + seed), use start.bat instead.

:: Change to script directory (project root)
cd /d "%~dp0"

:: Ensure Prisma client is generated (safe to run repeatedly)
call npx prisma generate

:: Start Next.js dev server (falls back to an open port if 3000 is busy)
echo Starting Next.js dev server...
call npm run dev

:EOF
