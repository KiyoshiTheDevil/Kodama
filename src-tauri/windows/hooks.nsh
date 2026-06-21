; Kiyoshi Music — NSIS Installer Hooks
; Cleans up leftover temp folders on uninstall.

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove kiyoshi-audio temp folder (used by the audio backend)
  RMDir /r "$TEMP\kiyoshi-audio"

  ; Remove updater staging folders (e.g. "Kiyoshi Music-0.9.5-alpha-updater-XXXXXX")
  FindFirst $R0 $R1 "$TEMP\Kiyoshi Music-*-updater-*"
  _KiyoshiCleanLoop:
    StrCmp $R1 "" _KiyoshiCleanDone
    RMDir /r "$TEMP\$R1"
    FindNext $R0 $R1
    Goto _KiyoshiCleanLoop
  _KiyoshiCleanDone:
  FindClose $R0
!macroend
