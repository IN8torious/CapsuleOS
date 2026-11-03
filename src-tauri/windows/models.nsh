; Generated from assistant/model-catalog.json; do not edit.
!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$EXEDIR\linux-runtime\linux-runtime.tar" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent linux-runtime folder is required. Run setup from the complete Capsule Toolbox Core or Offline folder, or the complete playbook payload." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\linux-runtime\manifest.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent linux-runtime folder is required. Run setup from the complete Capsule Toolbox Core or Offline folder, or the complete playbook payload." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\*.*" 0 capsule_core_payload
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\LICENSE" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\NOTICE.md" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\added_tokens.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\genai_config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\generation_config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\onnx\model_q4f16.onnx" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\onnx\model_q4f16.onnx_data" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\special_tokens_map.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\tokenizer.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\tokenizer.model" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\tokenizer_config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3.5-mini-q4f16\si-model-install.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\LICENSE" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\added_tokens.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\genai_config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\generation_config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\onnx\model_q4.onnx" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\onnx\model_q4.onnx_data" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\special_tokens_map.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\tokenizer.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\tokenizer.model" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\tokenizer_config.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\phi-3-mini-4k-q4\si-model-install.json" +4
  MessageBox MB_OK|MB_ICONSTOP "The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  capsule_core_payload:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  StrCmp $EXEDIR $INSTDIR capsule_verify_models
  CreateDirectory "$INSTDIR\linux-runtime"
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\linux-runtime\linux-runtime.tar" "$INSTDIR\linux-runtime"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "The bundled Linux runtime could not be copied. Check free disk space and run setup again from the complete folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\linux-runtime\manifest.json" "$INSTDIR\linux-runtime"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "The bundled Linux runtime could not be copied. Check free disk space and run setup again from the complete folder." /SD IDOK
  SetErrorLevel 2
  Abort
  IfFileExists "$EXEDIR\models\*.*" 0 capsule_verify_models
  CreateDirectory "$INSTDIR\models\phi-3.5-mini-q4f16"
  CreateDirectory "$INSTDIR\models\phi-3.5-mini-q4f16\onnx"
  CreateDirectory "$INSTDIR\models\phi-3-mini-4k-q4"
  CreateDirectory "$INSTDIR\models\phi-3-mini-4k-q4\onnx"
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\LICENSE" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\NOTICE.md" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\added_tokens.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\config.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\genai_config.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\generation_config.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\onnx\model_q4f16.onnx" "$INSTDIR\models\phi-3.5-mini-q4f16\onnx"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\onnx\model_q4f16.onnx_data" "$INSTDIR\models\phi-3.5-mini-q4f16\onnx"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\special_tokens_map.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\tokenizer.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\tokenizer.model" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\tokenizer_config.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3.5-mini-q4f16\si-model-install.json" "$INSTDIR\models\phi-3.5-mini-q4f16"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\LICENSE" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\added_tokens.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\config.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\genai_config.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\generation_config.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\onnx\model_q4.onnx" "$INSTDIR\models\phi-3-mini-4k-q4\onnx"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\onnx\model_q4.onnx_data" "$INSTDIR\models\phi-3-mini-4k-q4\onnx"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\special_tokens_map.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\tokenizer.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\tokenizer.model" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\tokenizer_config.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  ClearErrors
  CopyFiles /SILENT "$EXEDIR\models\phi-3-mini-4k-q4\si-model-install.json" "$INSTDIR\models\phi-3-mini-4k-q4"
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder." /SD IDOK
  SetErrorLevel 2
  Abort
  capsule_verify_models:
  System::Call 'Kernel32::SetEnvironmentVariableW(w "NODE_OPTIONS", p 0) i .r0'
  System::Call 'Kernel32::SetEnvironmentVariableW(w "NODE_PATH", p 0) i .r0'
  ClearErrors
  ExecWait '"$INSTDIR\runtime\node.exe" "$INSTDIR\runtime\assistant\verify-distribution-models.cjs" "$INSTDIR\models"' $0
  IfErrors 0 +4
  MessageBox MB_OK|MB_ICONSTOP "Unable to start bundled model verification. Setup is incomplete." /SD IDOK
  SetErrorLevel 2
  Abort
  StrCmp $0 0 +4
  MessageBox MB_OK|MB_ICONSTOP "Bundled model integrity verification failed. Setup is incomplete; replace the payload with a verified distribution and retry." /SD IDOK
  SetErrorLevel 2
  Abort
!macroend
