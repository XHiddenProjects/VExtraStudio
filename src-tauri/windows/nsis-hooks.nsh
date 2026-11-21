;  Vextra Studio installer hooks.
;  The bundled server (vextra-server.exe) may still be running when you update or reinstall; Windows would refuse to overwrite it
;  ("Error opening file for writing"). Stop it before files are copied and before uninstalling.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM vextra-server.exe'
  Pop $0
  Sleep 600
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM vextra-server.exe'
  Pop $0
  Sleep 600
!macroend
