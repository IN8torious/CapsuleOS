<#
  CapsuleOS - install one Environment Capsule (app pack) from packs.catalog.json.
  Installs the pack's core apps; apps marked optional are listed on the receipt but not installed.
  Winget first (upstream vendor installers), Chocolatey only as an already-installed fallback.
  One receipt per run with every app's source, exit code and resolved version.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Pack,
    [string]$Catalog = (Join-Path $PSScriptRoot 'packs.catalog.json'),
    [ValidateSet('auto', 'winget', 'chocolatey')][string]$Manager = 'auto'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin

$entry = (Read-CapsulePackCatalog -Path $Catalog).packs | Where-Object { $_.id -eq $Pack }
if (-not $entry) { throw "Pack '$Pack' is not in the CapsuleOS catalog." }
if (-not (Get-CapsuleWinget) -and -not (Get-CapsuleChocolatey)) {
    throw 'Neither winget (App Installer) nor Chocolatey is available. Install App Installer from the Microsoft Store and run this pack again.'
}

Write-Host "Environment Capsule: $($entry.name) - $($entry.role)"
$results = foreach ($app in $entry.apps) {
    if ($app.optional) {
        [ordered]@{ name = $app.name; winget = $app.winget; choco = $app.choco; operation = 'install'; status = 'optional-not-selected' }
        continue
    }
    $result = Invoke-CapsulePackage -Operation install -Name $app.name -WingetId ([string]$app.winget) -ChocoId ([string]$app.choco) -Manager $Manager
    if (-not $WhatIfPreference) {
        Write-CapsuleReceipt -Kind "pack-$Pack" -Data @{ pack = $Pack; operation = 'install'; apps = @($result) } | Out-Null
    }
    $result
}
$results = @($results)
if (-not $WhatIfPreference) {
    Write-CapsuleReceipt -Kind "pack-$Pack" -Data @{ pack = $Pack; operation = 'install'; apps = $results } | Out-Null
}
$failed = @($results | Where-Object { $_.status -in 'failed', 'unavailable' })
if ($failed.Count) {
    throw ("Not installed: " + (($failed | ForEach-Object { $_.name }) -join ', ') + '. Review the receipts and retry this fixed pack script.')
}
