; installer.nsh — ClassSend custom NSIS installer page
; Teacher / Student selection with automatic Greek / English detection.
;
; IMPORTANT: Var declarations and !includes that are needed by functions in
; customPageAfterChangeDir must be at the TOP LEVEL (not inside a macro).
; This file is !included before the main installer.nsi template, so top-level
; code here runs before assistedInstaller.nsh calls customPageAfterChangeDir.

!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"
  Var CS_Mode
  Var CS_TeacherRadio
  Var CS_StudentRadio
  Var CS_STR_Title
  Var CS_STR_Subtitle
  Var CS_STR_Question
  Var CS_STR_Teacher
  Var CS_STR_Student
!endif

; customHeader is called after assistedInstaller.nsh — our setup is already
; done at top level above, so this just pulls in LogicLib for ${If} support.
!macro customHeader
  !include "LogicLib.nsh"
!macroend

; Detect system language and populate strings. Only runs in the installer pass.
!macro customInit
  !ifndef BUILD_UNINSTALLER
    StrCpy $CS_Mode "teacher"

    ${If} $LANGUAGE == 1032
      StrCpy $CS_STR_Title    "$(^NameDA) — Τύπος Εγκατάστασης"
      StrCpy $CS_STR_Subtitle "Επιλέξτε πώς θα εγκατασταθεί το ClassSend σε αυτόν τον υπολογιστή."
      StrCpy $CS_STR_Question "Ποιος θα χρησιμοποιεί το ClassSend σε αυτόν τον υπολογιστή;"
      StrCpy $CS_STR_Teacher  "Εκπαιδευτικός  —  πλήρης πρόσβαση σε εργαλεία τάξης και παρακολούθηση"
      StrCpy $CS_STR_Student  "Μαθητής  —  μηνύματα, κοινοποίηση αρχείων και προσωπικές ρυθμίσεις"
    ${Else}
      StrCpy $CS_STR_Title    "Installation Type"
      StrCpy $CS_STR_Subtitle "Choose how ClassSend will be set up on this computer."
      StrCpy $CS_STR_Question "Who will be using ClassSend on this computer?"
      StrCpy $CS_STR_Teacher  "Teacher  —  full control panel, monitoring, and all classroom tools"
      StrCpy $CS_STR_Student  "Student  —  messaging, file sharing, and personal settings"
    ${EndIf}
  !endif
!macroend

; Insert the custom page between the directory and instfiles pages.
; Only called in the installer pass by assistedInstaller.nsh.
!macro customPageAfterChangeDir
  Function CS_ShowModePage
    !insertmacro MUI_HEADER_TEXT "$CS_STR_Title" "$CS_STR_Subtitle"

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 28u "$CS_STR_Question"
    Pop $1

    ${NSD_CreateRadioButton} 0 36u 100% 16u "$CS_STR_Teacher"
    Pop $CS_TeacherRadio
    ${NSD_Check} $CS_TeacherRadio

    ${NSD_CreateRadioButton} 0 58u 100% 16u "$CS_STR_Student"
    Pop $CS_StudentRadio

    nsDialogs::Show
  FunctionEnd

  Function CS_ModePageLeave
    ${NSD_GetState} $CS_TeacherRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $CS_Mode "teacher"
    ${Else}
      StrCpy $CS_Mode "student"
    ${EndIf}
  FunctionEnd

  Page custom CS_ShowModePage CS_ModePageLeave
!macroend

; Write the mode to the registry and set up tasks after files are installed
!macro customInstall
  ${If} $CS_Mode == ""
    StrCpy $CS_Mode "teacher"
  ${EndIf}
  WriteRegStr HKLM "SOFTWARE\ClassSend" "Mode" "$CS_Mode"

  ExecWait 'schtasks /create /tn "ClassSend" /tr "\"$INSTDIR\ClassSend.exe\" --hidden" /sc ONLOGON /rl HIGHEST /f'

  ${If} $CS_Mode == "student"
    ExecWait 'schtasks /create /tn "ClassSend WiFi Guard" /tr "powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File $\"$INSTDIR\resources\wifi-guard.ps1$\"" /sc ONSTART /ru SYSTEM /f'
  ${EndIf}
!macroend

; Clean up registry, tasks on uninstall
!macro customUnInstall
  ReadRegStr $0 HKLM "SOFTWARE\ClassSend" "Mode"

  DeleteRegKey HKLM "SOFTWARE\ClassSend"
  ExecWait 'schtasks /delete /tn "ClassSend" /f'

  ${If} $0 == "student"
    ExecWait 'schtasks /delete /tn "ClassSend WiFi Guard" /f'
  ${EndIf}
!macroend
