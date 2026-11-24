!include LogicLib.nsh

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Strip Reader"
  !define MUI_WELCOMEPAGE_TEXT "Read your downloaded comics offline with Strip Reader."
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Strip Reader is ready"
  !define MUI_FINISHPAGE_TEXT "Strip Reader has been installed. Your library folder can be configured inside the app."
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove Strip Reader"
  !define MUI_WELCOMEPAGE_TEXT "Strip Reader will be removed from this computer. Your comic library is not changed."
!macroend

!macro customUnInstall
  ; Never remove files while the reader is running. The standard electron-builder
  ; uninstall section handles binaries, shortcuts, and uninstall registration.
  ; Strip's configured library is intentionally outside this uninstall scope.
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "if (Get-Process -Name Strip -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_ICONSTOP|MB_OK "Please close Strip Reader before uninstalling it. Your comic library will not be changed."
    Abort
  ${EndIf}
!macroend
