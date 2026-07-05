!macro customInstall
  WriteRegStr HKCU "Software\Shentong\DeepSightAI" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DeepSightAI" "$INSTDIR\深瞳AI.exe"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DeepSightAI"
  DeleteRegKey HKCU "Software\Shentong\DeepSightAI"
!macroend
