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


!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM vextra-server.exe'
  Pop $0
  nsExec::Exec 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -like \"*\studio.vextra.app\singer\*\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"'
  Pop $0
  Sleep 600
!macroend

; A real uninstall (not the silent "uninstall the old version" step of an update) removes what the Integrations tab installed (AI singer, portable Blender). Nothing is installed at install time.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$LOCALAPPDATA\studio.vextra.app\singer"
    RMDir /r "$LOCALAPPDATA\studio.vextra.app\blender"
  ${EndIf}
!macroend
