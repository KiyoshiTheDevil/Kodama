; Kiyoshi Music — NSIS Installer Hooks
; Cleans up leftover temp folders on uninstall.

!macro NSIS_HOOK_PREINSTALL
  ; On an in-app update the bgutil PO-token Node child (node.exe in the install dir) and the
  ; Python sidecar can outlive the old app and keep a lock on their own files — which makes
  ; extraction fail with "Error opening file for writing: ...\node.exe". Ensure they're gone
  ; before we write. This runs in the NEW installer, so it fixes updates FROM an older build
  ; whose graceful shutdown didn't yet kill these children. From the fixed builds onward they
  ; are already terminated by the time the installer runs, so this is just a safety net.
  ;
  ; kodama-server.exe is ours by name; /T takes its children, the Node generator among them.
  nsExec::Exec 'taskkill /F /T /IM kodama-server.exe'
  ; node.exe is NOT ours by name. This used to be "taskkill /IM node.exe", which ended every Node
  ; process on the machine, a developer's dev server included. Only the two copies Kodama runs are
  ; ended now, matched by path: the one in the install directory, and the copy the backend keeps
  ; under %LOCALAPPDATA%\dev.kodama.music\runtime. That also catches an orphan whose server
  ; already died, which /T above cannot reach.
  ;
  ; The install directory is handed over in an environment variable rather than written into the
  ; command: a path with an apostrophe in it (C:\Users\O'Brien\...) would break the quoting, the
  ; command would fail, and nothing would be ended at all. Compared with StartsWith rather than
  ; -like, which would read brackets in a path as wildcards.
  ;
  ; Win32_Process, not Get-Process: this installer is 32-bit, so nsExec starts the 32-bit
  ; PowerShell, and Get-Process there returns no .Path for any 64-bit process. Measured: 14 node
  ; processes, 0 with a path - the filter would have matched nothing and ended nothing, Kodama's
  ; own included. WMI reports ExecutablePath regardless of bitness.
  System::Call 'Kernel32::SetEnvironmentVariable(t "KODAMA_INSTDIR", t "$INSTDIR")'
  nsExec::Exec `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'node.exe' -and $$_.ExecutablePath -and ($$_.ExecutablePath.StartsWith($$env:KODAMA_INSTDIR + '\', [StringComparison]::OrdinalIgnoreCase) -or $$_.ExecutablePath -like '*\dev.kodama.music\runtime\*') } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Sleep 500
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

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
