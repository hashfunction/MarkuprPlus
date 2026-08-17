; markuprx Custom NSIS Installer Script
; Version: 0.4.0
; =============================================================================

!include "MUI2.nsh"

; =============================================================================
; Custom Macros
; =============================================================================

; Registry keys for context menu
!define CONTEXT_MENU_KEY "Software\Classes\Directory\Background\shell\markuprx"
!define CONTEXT_MENU_COMMAND_KEY "Software\Classes\Directory\Background\shell\markuprx\command"

; =============================================================================
; Custom Install Section
; =============================================================================

!macro customInstall
  ; Add context menu integration "Capture feedback here"
  WriteRegStr HKCU "${CONTEXT_MENU_KEY}" "" "Capture feedback here"
  WriteRegStr HKCU "${CONTEXT_MENU_KEY}" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "${CONTEXT_MENU_COMMAND_KEY}" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--capture-path=%V"'

  ; Add to folder context menu as well
  WriteRegStr HKCU "Software\Classes\Directory\shell\markuprx" "" "Capture feedback here"
  WriteRegStr HKCU "Software\Classes\Directory\shell\markuprx" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\markuprx\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--capture-path=%1"'

  ; Refresh shell to apply context menu changes
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; =============================================================================
; Custom Uninstall Section
; =============================================================================

!macro customUnInstall
  ; Remove context menu entries
  DeleteRegKey HKCU "${CONTEXT_MENU_KEY}"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\markuprx"

  ; Refresh shell
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
