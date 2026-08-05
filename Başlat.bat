@echo off
title Voldena Indirme Yoneticisi - Gelistirici Modu
echo Bagimliliklar kontrol ediliyor...
if not exist node_modules (
    echo node_modules bulunamadi. Bagimliliklar yukleniyor...
    call npm install
)
echo Uygulama baslatiliyor...
call npm start
pause
