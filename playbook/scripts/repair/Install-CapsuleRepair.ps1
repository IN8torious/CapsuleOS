<#
  CapsuleOS - install the Windows repair toolkit.
  Copies the repair scripts to a permanent, user-findable home
  and adds "Repair Windows" shortcuts (desktop + Start menu).
  Copies files and creates shortcuts only - nothing else.
#>
[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Split-Path $PSScriptRoot -Parent) 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin
if (-not $PSCmdlet.ShouldProcess('CapsuleOS Repair files and shortcuts', 'Install')) { return }
$src = $PSScriptRoot
$dst = Join-Path $env:ProgramData 'CapsuleOS\Repair'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
'Repair-Windows.cmd', 'Repair-Windows.ps1', 'Quick-SFC-Scan.cmd', 'README-Repair.txt' |
    ForEach-Object { Copy-Item -Path (Join-Path $src $_) -Destination (Join-Path $dst $_) -Force }

$shell = New-Object -ComObject WScript.Shell
$startDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\CapsuleOS'
New-Item -ItemType Directory -Force -Path $startDir | Out-Null
$links = @(
    (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Repair Windows.lnk'),
    (Join-Path $startDir 'Repair Windows.lnk')
)
foreach ($lnk in $links) {
    $sc = $shell.CreateShortcut($lnk)
    $sc.TargetPath = Join-Path $dst 'Repair-Windows.cmd'
    $sc.WorkingDirectory = $dst
    $sc.Description = 'Repair the Windows image and system files (DISM + SFC). CapsuleOS repair toolkit.'
    $sc.Save()
}
Write-Host "Capsule repair toolkit installed to $dst"
Write-CapsuleReceipt -Kind 'repair-toolkit' -Data @{ operation = 'install'; directory = $dst; shortcuts = $links } | Out-Null
