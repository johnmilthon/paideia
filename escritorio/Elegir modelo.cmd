@echo off
title Paideia - Elegir modelo
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\paideia.ps1" -Accion modelo
