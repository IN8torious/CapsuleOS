<#
  CapsuleOS - first step of every run. Nothing is changed until this succeeds.
    1. Creates a System Restore point (no rollback, no ship).
    2. Records the current value, or absence, of every registry value the playbook can touch
       (capsule-targets.json) so Restore-CapsuleBaseline.ps1 can put the PC back exactly.
    3. Installs the CapsuleOS care scripts to %ProgramData%\CapsuleOS\Scripts.
  Original values are kept per Windows account; newly introduced targets are added on later runs.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin
$root = Get-CapsuleRoot

# 1. Restore point
$systemDrive = "$env:SystemDrive\"
$before = @(Get-ComputerRestorePoint -ErrorAction SilentlyContinue)
$protectionEnabled = $false
try {
    Checkpoint-Computer -Description 'CapsuleOS playbook' -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue
} catch {
    Write-Warning "Restore point creation failed: $($_.Exception.Message). Enabling System Restore for the system drive and retrying."
    Enable-ComputerRestore -Drive $systemDrive
    $protectionEnabled = $true
    Checkpoint-Computer -Description 'CapsuleOS playbook' -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue
}
$after = @(Get-ComputerRestorePoint -ErrorAction SilentlyContinue)
$newest = $after | Sort-Object SequenceNumber -Descending | Select-Object -First 1
if (-not $newest) { throw 'No System Restore point exists, so CapsuleOS will not change anything.' }
$created = @($before | ForEach-Object { $_.SequenceNumber }) -notcontains $newest.SequenceNumber
$age = (Get-Date) - [System.Management.ManagementDateTimeConverter]::ToDateTime($newest.CreationTime)
if (-not $created -and $age.TotalHours -gt 24) { throw 'Windows did not create a restore point and none is recent, so CapsuleOS will not change anything.' }
Write-Host ($(if ($created) { "Restore point created: #$($newest.SequenceNumber)" } else { "Windows reused a restore point from the last 24 hours: #$($newest.SequenceNumber)" }))

# 2. Baseline
$targets = Get-Content -Path (Join-Path $PSScriptRoot 'capsule-targets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$hives = @{ HKCU = [Microsoft.Win32.Registry]::CurrentUser; HKLM = [Microsoft.Win32.Registry]::LocalMachine }
$values = foreach ($target in $targets) {
    if (-not $hives.ContainsKey($target.root)) { throw "Unexpected registry root '$($target.root)'." }
    $key = $hives[$target.root].OpenSubKey($target.path, $false)
    $entry = [ordered]@{ option = $target.option; root = $target.root; path = $target.path; name = $target.name; exists = $false; kind = $null; data = $null }
    if ($key) {
        try {
            if ($key.GetValueNames() -contains $target.name) {
                $entry.exists = $true
                $entry.kind = $key.GetValueKind($target.name).ToString()
                $entry.data = $key.GetValue($target.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            }
        } finally { $key.Close() }
    }
    $entry
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$baselines = Join-Path $root "Baselines\$($identity.User.Value)"
New-Item -ItemType Directory -Force -Path $baselines | Out-Null
$document = [ordered]@{ format = 'capsule-baseline/1'; taken = (Get-Date).ToString('o'); user = $identity.Name; sid = $identity.User.Value; values = @($values) }
$json = $document | ConvertTo-Json -Depth 6
$stamped = Join-Path $baselines ("baseline-{0}-{1}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmssfff'), [guid]::NewGuid().ToString('N'))
Set-Content -Path $stamped -Value $json -Encoding UTF8
$original = Join-Path $baselines 'baseline-original.json'
if (Test-Path $original) {
    $previous = Get-Content -LiteralPath $original -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($previous.format -ne 'capsule-baseline/1' -or $previous.sid -ne $identity.User.Value) { throw 'Original baseline identity or format is invalid.' }
    $known = @{}
    foreach ($value in $previous.values) { $known["$($value.root)\$($value.path)\$($value.name)"] = $true }
    $previous.values = @($previous.values) + @($values | Where-Object { -not $known.ContainsKey("$($_.root)\$($_.path)\$($_.name)") })
    $json = $previous | ConvertTo-Json -Depth 6
}
$candidate = "$original.$([guid]::NewGuid().ToString('N')).tmp"
try {
    Set-Content -LiteralPath $candidate -Value $json -Encoding UTF8
    Move-Item -LiteralPath $candidate -Destination $original -Force
} finally {
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force }
}
Write-Host "Baseline recorded: $(@($values).Count) values ($(@($values | Where-Object { $_.exists }).Count) present)."

# 3. Care scripts
$scripts = Join-Path $root 'Scripts'
New-Item -ItemType Directory -Force -Path $scripts | Out-Null
'Capsule.Common.psm1', 'Restore-CapsuleBaseline.ps1', 'Install-CapsuleBrowser.ps1', 'Install-CapsulePack.ps1', 'Uninstall-CapsulePack.ps1', 'capsule-targets.json', 'packs.catalog.json' |
    ForEach-Object { Copy-Item -Path (Join-Path $PSScriptRoot $_) -Destination (Join-Path $scripts $_) -Force }
$repairScripts = Join-Path $scripts 'repair'
New-Item -ItemType Directory -Force -Path $repairScripts | Out-Null
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'repair') -File |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $repairScripts $_.Name) -Force }

Write-CapsuleReceipt -Kind 'session' -Data @{
    restorePoint = @{ sequence = $newest.SequenceNumber; created = $created; protectionEnabledByCapsule = $protectionEnabled }
    baseline = $stamped
    original = $original
    scripts = $scripts
} | Out-Null
