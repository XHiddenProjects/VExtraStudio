;  Vextra Studio installer hooks.
;  The bundled server (vextra-server.exe) may still be running when you update or reinstall; Windows would refuse to overwrite it
;  ("Error opening file for writing"). Stop it before files are copied and before uninstalling.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM vextra-server.exe'
  Pop $0
  ; the AI singer's background process (if it is running) lives in the singer folder; stop it so updates can proceed
  nsExec::Exec 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -like \"*\studio.vextra.app\singer\*\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"'
  Pop $0
  Sleep 600
!macroend

; After files are copied: on a FRESH install offer the AI singer (several GB, downloaded once into %LOCALAPPDATA%\studio.vextra.app\singer).
; The question is skipped for silent installs and for updates (an installed singer is refreshed by the app itself after the update).
!macro NSIS_HOOK_POSTINSTALL
  IfSilent vxsinger_done
  IfFileExists "$LOCALAPPDATA\studio.vextra.app\singer\installed.json" vxsinger_done
  MessageBox MB_YESNO|MB_DEFBUTTON2 "Install the AI singer now?$\r$\n$\r$\nIt lets the Music studio sing your lyrics (solo or choir) using the open-source SoulX-Singer model. Vextra Studio downloads and sets it up for you when it starts: about 8 GB, once, with a progress window.$\r$\n$\r$\nChoose No to skip it; you can install it later from the Music studio (AI singer). Uninstalling Vextra Studio removes it again." IDYES vxsinger_yes IDNO vxsinger_done
  vxsinger_yes:
    CreateDirectory "$LOCALAPPDATA\studio.vextra.app\singer"
    FileOpen $0 "$LOCALAPPDATA\studio.vextra.app\singer\setup-requested" w
    FileWrite $0 "install"
    FileClose $0
  vxsinger_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM vextra-server.exe'
  Pop $0
  nsExec::Exec 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -like \"*\studio.vextra.app\singer\*\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"'
  Pop $0
  Sleep 600
!macroend

; A real uninstall (not the silent "uninstall the old version" step of an update) removes the whole AI singer: Python, libraries, models, voices.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$LOCALAPPDATA\studio.vextra.app\singer"
  ${EndIf}
!macroend
