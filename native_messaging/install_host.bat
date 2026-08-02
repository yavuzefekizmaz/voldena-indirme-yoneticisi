@echo off
:: Find current directory
set DIR=%~dp0

:: For Chrome
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.efes.idm" /ve /t REG_SZ /d "%DIR%efes_idm.json" /f

:: For Chromium/Opera/Edge
REG ADD "HKCU\Software\Chromium\NativeMessagingHosts\com.efes.idm" /ve /t REG_SZ /d "%DIR%efes_idm.json" /f
REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.efes.idm" /ve /t REG_SZ /d "%DIR%efes_idm.json" /f

:: We need to update efes_idm.json to point to the absolute path of host_wrapper.bat
powershell -Command "(gc '%DIR%efes_idm.json') -replace '\"path\": \".*\"', '\"path\": \"%DIR:\=\\%host_wrapper.bat\"' | Out-File -encoding ASCII '%DIR%efes_idm.json'"

echo Efes-IDM Native Messaging Host registered successfully!
