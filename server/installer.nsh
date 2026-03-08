; installer.nsh — ClassSend custom NSIS installer page
; Teacher / Student selection with automatic Greek / English detection.
; The installer's MUI chrome (buttons, progress bar) stays in English;
; our custom page text switches to Greek on Greek-locale systems.

!macro customHeader
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"

  Var CS_Mode          ; "teacher" or "student"
  Var CS_TeacherRadio
  Var CS_StudentRadio

  ; Language strings — populated in customInit
  Var CS_STR_Title
  Var CS_STR_Subtitle
  Var CS_STR_Question
  Var CS_STR_Teacher
  Var CS_STR_Student

  ; Page: show radio buttons asking Teacher or Student
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
    ${NSD_Check} $CS_TeacherRadio   ; Teacher is the default

    ${NSD_CreateRadioButton} 0 58u 100% 16u "$CS_STR_Student"
    Pop $CS_StudentRadio

    nsDialogs::Show
  FunctionEnd

  ; Page leave: store the selection in $CS_Mode
  Function CS_ModePageLeave
    ${NSD_GetState} $CS_TeacherRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $CS_Mode "teacher"
    ${Else}
      StrCpy $CS_Mode "student"
    ${EndIf}
  FunctionEnd
!macroend

; Detect system language and set strings; default mode to teacher
!macro customInit
  StrCpy $CS_Mode "teacher"

  ; $LANGUAGE holds the Windows locale ID of the current user.
  ; 1032 = el-GR (Greek - Greece)
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
!macroend

; Insert the custom page between the license and directory pages
!macro customInstallMode
  Page custom CS_ShowModePage CS_ModePageLeave
!macroend

; Write the mode to the registry and set up tasks after files are installed
!macro customInstall
  ${If} $CS_Mode == ""
    StrCpy $CS_Mode "teacher"
  ${EndIf}
  WriteRegStr HKLM "SOFTWARE\ClassSend" "Mode" "$CS_Mode"

  ; Register ClassSend auto-start via Task Scheduler.
  ; /rl HIGHEST starts the app with the highest privileges available to the
  ; logged-in user, without showing a UAC popup (registered by admin at install).
  ExecWait 'schtasks /create /tn "ClassSend" /tr "\"$INSTDIR\ClassSend.exe\" --hidden" /sc ONLOGON /rl HIGHEST /f'

  ; Student-only: register the WiFi Guard as a SYSTEM-level boot task.
  ; It starts automatically on next boot — not immediately — so it has no
  ; effect on machines without WiFi until they actually restart.
  ${If} $CS_Mode == "student"
    ExecWait 'schtasks /create /tn "ClassSend WiFi Guard" /tr "powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File $\"$INSTDIR\resources\wifi-guard.ps1$\"" /sc ONSTART /ru SYSTEM /f'
  ${EndIf}
!macroend

; Clean up registry, app task, and (if student) guard task on uninstall
!macro customUnInstall
  ; Read the install mode before deleting the registry key
  ReadRegStr $0 HKLM "SOFTWARE\ClassSend" "Mode"

  DeleteRegKey HKLM "SOFTWARE\ClassSend"
  ExecWait 'schtasks /delete /tn "ClassSend" /f'

  ${If} $0 == "student"
    ExecWait 'schtasks /delete /tn "ClassSend WiFi Guard" /f'
  ${EndIf}
!macroend
