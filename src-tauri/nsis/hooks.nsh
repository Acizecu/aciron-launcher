; Регистрация файлов .acpack за лаунчером.
;
; Пишем ассоциацию сами, а не через bundle.fileAssociations: нам нужна СВОЯ
; иконка типа файла, а штатный механизм подставляет иконку приложения.
;
; SHCTX выставляет шаблон Tauri по режиму установки: при installMode
; "currentUser" это HKCU, при установке для всех — HKLM. Поэтому ветку не
; хардкодим — иначе установка «для всех» писала бы ассоциацию мимо.
;
; Иконку ищем по нескольким путям: раскладка ресурсов у Tauri менялась, и
; проверка IfFileExists надёжнее, чем угадывание одного пути. Не нашли —
; ассоциация всё равно работает, просто с иконкой самого лаунчера.

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $R7 ""
  IfFileExists "$INSTDIR\resources\icons\acpack.ico" 0 +2
    StrCpy $R7 "$INSTDIR\resources\icons\acpack.ico"
  ${If} $R7 == ""
    IfFileExists "$INSTDIR\resources\acpack.ico" 0 +2
      StrCpy $R7 "$INSTDIR\resources\acpack.ico"
  ${EndIf}
  ${If} $R7 == ""
    IfFileExists "$INSTDIR\acpack.ico" 0 +2
      StrCpy $R7 "$INSTDIR\acpack.ico"
  ${EndIf}
  ${If} $R7 == ""
    StrCpy $R7 "$INSTDIR\${MAINBINARYNAME}.exe,0"
  ${EndIf}

  WriteRegStr SHCTX "Software\Classes\.acpack" "" "Aciron.Pack"
  WriteRegStr SHCTX "Software\Classes\.acpack" "PerceivedType" "compressed"
  WriteRegStr SHCTX "Software\Classes\Aciron.Pack" "" "Сборка Aciron"
  WriteRegStr SHCTX "Software\Classes\Aciron.Pack\DefaultIcon" "" "$R7"
  WriteRegStr SHCTX "Software\Classes\Aciron.Pack\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; SHCNE_ASSOCCHANGED — проводник перечитает ассоциации без перезагрузки.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\Aciron.Pack"
  DeleteRegKey SHCTX "Software\Classes\.acpack"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
