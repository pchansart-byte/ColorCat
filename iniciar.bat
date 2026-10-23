@echo off
chcp 65001 >nul
title ColorCat
cd /d "%~dp0"

set "PY="
py -3 --version >nul 2>nul
if not errorlevel 1 set "PY=py -3"

if not defined PY (
  python --version >nul 2>nul
  if not errorlevel 1 set "PY=python"
)

if defined PY (
  echo Iniciando ColorCat...
  %PY% app.py
  echo.
  echo El servidor se ha detenido.
  pause
  exit /b 0
)

echo No se encontro Python en este equipo.
echo Abriendo la version sin servidor (funciona igual)...
echo.
start "" "%~dp0index.html"
timeout /t 3 >nul
