[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param([Parameter(Mandatory)][ValidatePattern('^capsule-[a-z0-9-]+$')][string[]]$Option)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin
$targets = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'capsule-targets.json') -Raw | ConvertFrom-Json)
foreach ($id in $Option) {
    if ($id -notin $targets.option) { throw "Unknown fixed catalog option: $id" }
}
$selected = @($targets | Where-Object { $_.option -in $Option })
foreach ($target in $selected) {
    if ($target.root -notin 'HKCU', 'HKLM' -or $target.type -notin 'REG_DWORD', 'REG_SZ' -or
        $target.path -notmatch '^(Software|SYSTEM)\\' -or -not $target.PSObject.Properties['apply']) {
        throw 'Invalid fixed registry catalog entry. Nothing was changed.'
    }
}
if (-not $WhatIfPreference) { & (Join-Path $PSScriptRoot 'Start-CapsuleSession.ps1') }
$hives = @{ HKCU = [Microsoft.Win32.Registry]::CurrentUser; HKLM = [Microsoft.Win32.Registry]::LocalMachine }
foreach ($target in $selected) {
    $location = "$($target.root)\$($target.path)\$($target.name)"
    if (-not $PSCmdlet.ShouldProcess($location, "Apply $($target.option): $($target.apply)")) { continue }
    $key = $hives[$target.root].CreateSubKey($target.path)
    try {
        if ($null -eq $target.apply) { $key.DeleteValue($target.name, $false) }
        elseif ($target.type -eq 'REG_DWORD') { $key.SetValue($target.name, [int]$target.apply, [Microsoft.Win32.RegistryValueKind]::DWord) }
        else { $key.SetValue($target.name, [string]$target.apply, [Microsoft.Win32.RegistryValueKind]::String) }
    } finally { $key.Close() }
    Write-CapsuleReceipt -Kind 'tweak' -Data @{ option = $target.option; location = $location; value = $target.apply } | Out-Null
}
