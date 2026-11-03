'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const catalog = require('./model-catalog.json');

// One setup serves both ship variants. Core carries only the Linux runtime and
// models arrive later as user-chosen, hash-verified downloads. Offline carries
// both pinned models too; when models\ is present it must be complete.
function modelInstallerHooks(models = catalog) {
  const runtimePaths = ['linux-runtime\\linux-runtime.tar', 'linux-runtime\\manifest.json'];
  const modelPaths = models.flatMap(model => [...model.files.map(file => file.path), 'si-model-install.json']
    .map(file => `models\\${model.id}\\${file.replaceAll('/', '\\')}`));
  const stop = message => [`MessageBox MB_OK|MB_ICONSTOP "${message}" /SD IDOK`, 'SetErrorLevel 2', 'Abort'];
  const runtimeMissing = stop('The adjacent linux-runtime folder is required. Run setup from the complete Capsule Toolbox Core or Offline folder, or the complete playbook payload.');
  const modelsIncomplete = stop('The adjacent models folder is incomplete. Remove it to install the Core variant, or run setup from the complete Capsule Toolbox Offline folder.');
  const directoriesOf = paths => [...new Set(paths.map(file => file.slice(0, file.lastIndexOf('\\'))))];
  const copy = (paths, message) => [
    ...directoriesOf(paths).map(directory => `CreateDirectory "$INSTDIR\\${directory}"`),
    ...paths.flatMap(file => [
      'ClearErrors',
      `CopyFiles /SILENT "$EXEDIR\\${file}" "$INSTDIR\\${file.slice(0, file.lastIndexOf('\\'))}"`,
      'IfErrors 0 +4',
      ...stop(message)
    ])
  ];
  const preinstall = [
    ...runtimePaths.flatMap(file => [`IfFileExists "$EXEDIR\\${file}" +4`, ...runtimeMissing]),
    'IfFileExists "$EXEDIR\\models\\*.*" 0 capsule_core_payload',
    ...modelPaths.flatMap(file => [`IfFileExists "$EXEDIR\\${file}" +4`, ...modelsIncomplete]),
    'capsule_core_payload:'
  ];
  const postinstall = [
    'StrCmp $EXEDIR $INSTDIR capsule_verify_models',
    ...copy(runtimePaths, 'The bundled Linux runtime could not be copied. Check free disk space and run setup again from the complete folder.'),
    'IfFileExists "$EXEDIR\\models\\*.*" 0 capsule_verify_models',
    ...copy(modelPaths, 'A bundled model could not be copied. Check free disk space and run setup again from the complete offline folder.'),
    'capsule_verify_models:',
    'System::Call \'Kernel32::SetEnvironmentVariableW(w "NODE_OPTIONS", p 0) i .r0\'',
    'System::Call \'Kernel32::SetEnvironmentVariableW(w "NODE_PATH", p 0) i .r0\'',
    'ClearErrors',
    'ExecWait \'"$INSTDIR\\runtime\\node.exe" "$INSTDIR\\runtime\\assistant\\verify-distribution-models.cjs" "$INSTDIR\\models"\' $0',
    'IfErrors 0 +4',
    'MessageBox MB_OK|MB_ICONSTOP "Unable to start bundled model verification. Setup is incomplete." /SD IDOK',
    'SetErrorLevel 2',
    'Abort',
    'StrCmp $0 0 +4',
    'MessageBox MB_OK|MB_ICONSTOP "Bundled model integrity verification failed. Setup is incomplete; replace the payload with a verified distribution and retry." /SD IDOK',
    'SetErrorLevel 2',
    'Abort'
  ];
  return `; Generated from assistant/model-catalog.json; do not edit.\n!macro NSIS_HOOK_PREINSTALL\n  ${preinstall.join('\n  ')}\n!macroend\n\n!macro NSIS_HOOK_POSTINSTALL\n  ${postinstall.join('\n  ')}\n!macroend\n`;
}

async function buildModelInstaller() {
  const output = path.join(__dirname, '..', 'src-tauri', 'windows', 'models.nsh');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, modelInstallerHooks());
}

if (require.main === module) buildModelInstaller().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { modelInstallerHooks, buildModelInstaller };
