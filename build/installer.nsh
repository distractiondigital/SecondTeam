; Custom NSIS include (electron-builder picks up build/installer.nsh by itself).
; The installer keeps a copy of itself for the updater's smaller "differential" downloads. By default
; it goes to %LOCALAPPDATA%\second-team-updater; keep it in the app's own folder instead, where the
; updater looks for it (build/update-config.yml: updaterCacheDirName SecondTeam/updates).
!ifdef APP_INSTALLER_STORE_FILE
  !undef APP_INSTALLER_STORE_FILE
  !define APP_INSTALLER_STORE_FILE "SecondTeam\updates\installer.exe"
!endif
