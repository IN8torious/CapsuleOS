$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -in @('S-1-5-18', 'S-1-5-19', 'S-1-5-20') -or
    $identity.Name -like 'NT SERVICE\*') {
    throw 'Capsule Toolbox must be installed as the signed-in Windows user, not a service account.'
}

$installer = Join-Path $PSScriptRoot 'CapsuleToolboxSetup.exe'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "Bundled Capsule Toolbox installer is missing: $installer"
}

Write-Output "Installing Capsule Toolbox for $($identity.Name)."
$process = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($process.ExitCode -ne 0) {
    throw "Capsule Toolbox setup failed with exit code $($process.ExitCode)."
}

$registration = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Capsule Toolbox'
$installLocation = $registration.InstallLocation.Trim('"')
if ([string]::IsNullOrWhiteSpace($installLocation)) {
    throw 'Capsule Toolbox setup did not register an installation location for this user.'
}
$executable = Join-Path $installLocation 'capsule_toolbox.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Capsule Toolbox setup exited successfully, but the application is missing: $executable"
}
Write-Output "Capsule Toolbox installation verified: $executable. Open Capsule Toolbox from the Start menu."
