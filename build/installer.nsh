; Extra installer settings, picked up automatically by electron-builder (nsis.include).
; Always install for the current Windows user only (no "Anyone who uses this computer" page, no
; admin prompt), like Discord or VS Code. The engine, models and settings are per-user anyway.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
