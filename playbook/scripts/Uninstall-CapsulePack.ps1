<#
  CapsuleOS - the uninstall mirror of Install-CapsulePack.ps1.
  Removes only apps that a CapsuleOS receipt shows this pack installed successfully.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Pack
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin

$catalog = Read-CapsulePackCatalog -Path (Join-Path $PSScriptRoot 'packs.catalog.json')
$entry = $catalog.packs | Where-Object { $_.id -eq $Pack }
if (-not $entry) { throw "Pack '$Pack' is not in the CapsuleOS catalog." }
$folder = Join-Path (Get-CapsuleRoot) 'Receipts'
$receipts = @()
if (Test-Path $folder) { $receipts = @(Get-ChildItem -Path $folder -Filter "pack-$Pack-*.json" | Sort-Object Name) }
$installed = @{}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($receipt in @($receipts | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } | Sort-Object time)) {
    if (-not $receipt.PSObject.Properties['sid'] -or $receipt.sid -ne $sid) { continue }
    foreach ($app in $receipt.data.apps) {
        $key = "$($app.source):$($app.winget):$($app.choco)"
        if ($receipt.data.operation -eq 'install' -and $app.status -eq 'ok' -and
            $app.PSObject.Properties['installedByCapsule'] -and $app.installedByCapsule -eq $true) {
            $installed[$key] = $app
        } elseif ($receipt.data.operation -eq 'uninstall' -and $app.status -in 'ok', 'already-absent') {
            $installed.Remove($key)
        }
    }
}
if (-not $installed.Count) { Write-Host "No CapsuleOS receipt shows apps installed by pack '$Pack'. Nothing to remove."; return }

$results = foreach ($app in $installed.Values) {
    $match = @($entry.apps | Where-Object { [string]$_.winget -eq [string]$app.winget -and [string]$_.choco -eq [string]$app.choco })
    if (-not $match.Count -or $app.source -notin 'winget', 'chocolatey') { throw "Receipt package '$($app.name)' does not match the fixed catalog." }
    $wingetId = $(if ($app.source -eq 'winget') { [string]$app.winget } else { '' })
    $chocoId = $(if ($app.source -eq 'chocolatey') { [string]$app.choco } else { '' })
    if (-not $PSCmdlet.ShouldProcess($app.name, "Uninstall app newly installed by pack '$Pack'")) { continue }
    $result = Invoke-CapsulePackage -Operation uninstall -Name $app.name -WingetId $wingetId -ChocoId $chocoId -Confirm:$false
    # Keep both catalog ids so the install and uninstall receipt keys stay identical.
    $result.winget = [string]$app.winget
    $result.choco = [string]$app.choco
    $result.source = $app.source
    if (-not $WhatIfPreference) {
        Write-CapsuleReceipt -Kind "pack-$Pack" -Data @{ pack = $Pack; operation = 'uninstall'; apps = @($result) } | Out-Null
    }
    $result
}
if (@($results | Where-Object { $_.status -in 'failed', 'unavailable' }).Count) { throw 'Some packages could not be removed. Review the uninstall receipts.' }
if (-not $WhatIfPreference) {
    Write-CapsuleReceipt -Kind "pack-$Pack" -Data @{ pack = $Pack; operation = 'uninstall'; apps = @($results) } | Out-Null
}
