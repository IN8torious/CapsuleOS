<#
  CapsuleOS - remove the Windows repair toolkit.
  The revert mirror of Install-CapsuleRepair.ps1: removes the
  copied scripts and both shortcuts. Keeps repair logs for diagnosis.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Split-Path $PSScriptRoot -Parent) 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin
if (-not $PSCmdlet.ShouldProcess('CapsuleOS Repair files and shortcuts', 'Uninstall (keep logs)')) { return }
$dst = Join-Path $env:ProgramData 'CapsuleOS\Repair'
foreach ($name in 'Repair-Windows.cmd', 'Repair-Windows.ps1', 'Quick-SFC-Scan.cmd', 'README-Repair.txt') {
    $file = Join-Path $dst $name
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}
$links = @(
    (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Repair Windows.lnk'),
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\CapsuleOS\Repair Windows.lnk')
)
foreach ($lnk in $links) { if (Test-Path $lnk) { Remove-Item -Path $lnk -Force } }
Write-Host 'Capsule repair toolkit removed.'
Write-CapsuleReceipt -Kind 'repair-toolkit' -Data @{ operation = 'uninstall'; directory = $dst; logsRetained = $true } | Out-Null
