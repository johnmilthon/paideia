@echo off
title Paideia - Probar velocidad
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\paideia.ps1" -Accion probar
