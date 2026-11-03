<#
  CapsuleOS - install the browser chosen on the playbook's browser page.
  Choosing Microsoft Edge is the way back for PCs where another playbook removed or blocked it:
  the EdgeUpdate policy values those tools set to block Edge are removed (their previous data is
  kept on the receipt) and Edge is installed exactly as Microsoft ships it.
  Windows asks you to confirm a new default browser yourself in Settings > Apps > Default apps.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateSet('edge', 'firefox', 'brave', 'librewolf')][string]$Browser
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin

$browsers = @{
    edge      = @{ name = 'Microsoft Edge'; winget = 'Microsoft.Edge'; choco = 'microsoft-edge' }
    firefox   = @{ name = 'Mozilla Firefox'; winget = 'Mozilla.Firefox'; choco = 'firefox' }
    brave     = @{ name = 'Brave'; winget = 'Brave.Brave'; choco = 'brave' }
    librewolf = @{ name = 'LibreWolf'; winget = 'LibreWolf.LibreWolf'; choco = 'librewolf' }
}
$choice = $browsers[$Browser]
$unblocked = @()

if ($Browser -eq 'edge') {
    # Only these fixed values, and only when they block Edge (0). Anything else is left as found.
    $policy = 'SOFTWARE\Policies\Microsoft\EdgeUpdate'
    $blockers = 'InstallDefault', 'Install{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}'
    $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($policy, -not $WhatIfPreference)
    if ($key) {
        try {
            foreach ($name in $blockers) {
                if ($key.GetValueNames() -notcontains $name) { continue }
                $data = $key.GetValue($name)
                $blocks = $key.GetValueKind($name) -eq [Microsoft.Win32.RegistryValueKind]::DWord -and $data -eq 0
                if ($blocks -and $PSCmdlet.ShouldProcess("HKLM\$policy\$name", 'Remove Edge-blocking policy')) {
                    Write-CapsuleReceipt -Kind 'edge-policy-backup' -Data @{
                        location = "HKLM\$policy\$name"; previous = $data; kind = $key.GetValueKind($name).ToString()
                    } | Out-Null
                    $key.DeleteValue($name, $false)
                    $unblocked += [ordered]@{ location = "HKLM\$policy\$name"; previous = $data }
                }
            }
        } finally { $key.Close() }
    }
    if ($unblocked.Count) { Write-Host "Removed $($unblocked.Count) policy value(s) that blocked Microsoft Edge." }
}

$result = Invoke-CapsulePackage -Operation install -Name $choice.name -WingetId $choice.winget -ChocoId $choice.choco
if (-not $WhatIfPreference) {
    Write-CapsuleReceipt -Kind 'browser' -Data @{ browser = $Browser; install = $result; edgePoliciesRemoved = @($unblocked) } | Out-Null
}
if ($result.status -in 'whatif', 'skipped') { return }
if ($result.status -notin 'ok', 'already-present') {
    throw "$($choice.name) was not installed ($($result.status)). Review the browser receipt and retry this fixed script."
} else {
    Write-Host "$($choice.name) is installed. To make it your default, open Settings > Apps > Default apps."
}
