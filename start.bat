@echo off
REM start.bat — start Team AI Chat (development)
REM Usage: double-click or run from cmd in project folder.

:: Change to script directory (project root)
cd /d "%~dp0"

:: Install dependencies (comment out if already installed)
echo Installing dependencies (skip if already installed)...
npm install

:: Push prisma schema (safe for existing DB)
echo Pushing Prisma schema...
npx prisma db push

:: Seed demo data (optional)
echo Seeding database (creates admin + demo keys)...
npm run db:seed

:: Start Next.js dev server
echo Starting Next.js dev server on http://localhost:3000 ...
npm run dev

:EOF