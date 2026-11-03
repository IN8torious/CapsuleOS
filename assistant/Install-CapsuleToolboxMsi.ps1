$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -in @('S-1-5-18', 'S-1-5-19', 'S-1-5-20') -or $identity.Name -like 'NT SERVICE\*') {
    throw 'Install Capsule Toolbox as the signed-in elevated user, not a service account.'
}
$installerPath = Join-Path $PSScriptRoot 'CapsuleToolbox.msi'
$metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'CapsuleToolboxMsi.json') -Raw | ConvertFrom-Json
if ($metadata.version -ne 1 -or $metadata.sha256 -notmatch '^[a-f0-9]{64}$') {
    throw 'The bundled MSI metadata is invalid.'
}
if ((Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $metadata.sha256) {
    throw 'The bundled Toolbox MSI failed SHA-256 verification; nothing was installed.'
}
if (Test-Path -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Capsule Toolbox') {
    throw 'An earlier NSIS Toolbox installation exists. Remove it through Installed apps before installing the MSI; user models are not migrated automatically.'
}

$windowsInstaller = New-Object -ComObject WindowsInstaller.Installer
$database = $windowsInstaller.OpenDatabase($installerPath, 0)
$view = $database.OpenView("SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductCode'")
$view.Execute()
$product = $view.Fetch().StringData(1)
$view.Close()
$view = $database.OpenView('SELECT `File`.`FileName`, `Component`.`ComponentId` FROM `File`, `Component` WHERE `File`.`Component_` = `Component`.`Component`')
$view.Execute()
$components = @{}
$required = @('capsule_toolbox.exe', 'node.exe', 'toolbox-runtime.cjs')
while ($record = $view.Fetch()) {
    $name = ($record.StringData(1) -split '\|')[-1]
    if ($name -in $required) { $components[$name] = $record.StringData(2) }
}
$view.Close()
foreach ($name in $required) {
    if (-not $components.ContainsKey($name)) { throw "The MSI does not contain required component: $name" }
}

$logDirectory = Join-Path $env:ProgramData 'CapsuleOS\Receipts'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$log = Join-Path $logDirectory ("Toolbox-MSI-{0}.log" -f [Guid]::NewGuid().ToString('N'))
$arguments = '/i "{0}" /qn /norestart /L*v "{1}"' -f $installerPath, $log
$process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList $arguments -Wait -PassThru
if ($process.ExitCode -notin @(0, 3010)) {
    throw "Toolbox MSI failed with exit $($process.ExitCode). See $log"
}
foreach ($name in $required) {
    $installed = $windowsInstaller.ComponentPath($product, $components[$name])
    if ([string]::IsNullOrWhiteSpace($installed) -or -not (Test-Path -LiteralPath $installed -PathType Leaf)) {
        throw "Windows Installer did not register the installed $name. See $log"
    }
}
if ($process.ExitCode -eq 3010) {
    Write-Warning 'Toolbox installed successfully; Windows reports a reboot is required. No restart was initiated.'
}
Write-Output "Capsule Toolbox MSI installation verified. Log: $log. Models and optional Linux runtime are not included."
