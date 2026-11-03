[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateSet('winget', 'chocolatey')][string]$Manager
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force

if (-not $PSCmdlet.ShouldProcess($Manager, 'Install package manager from official sources (internet and administrator consent required)')) { return }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -in @('S-1-5-18', 'S-1-5-19', 'S-1-5-20') -or $identity.Name -like 'NT SERVICE\*') {
    throw 'Package managers must be installed as the signed-in user, not a service account.'
}
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = '-NoProfile -File "{0}" -Manager {1}' -f $PSCommandPath, $Manager
    $elevated = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    if ($elevated.ExitCode -ne 0) { throw "Package manager setup failed (exit $($elevated.ExitCode)); review the elevated window and CapsuleOS receipts." }
    return
}

function Get-RequestedManager {
    if ($Manager -eq 'winget') { return Get-CapsuleWinget }
    $command = Get-CapsuleChocolatey
    if ($command) { return $command }
    $candidate = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    return $null
}

try {
    $command = Get-RequestedManager
    $status = 'already-present'
    if (-not $command) {
        $winget = Get-CapsuleWinget
        if (-not $winget) {
            # Microsoft's supported bootstrap path; do not change repository trust or execution policy.
            $gallery = Get-PSRepository -Name PSGallery
            if ($gallery.SourceLocation.TrimEnd('/') -ne 'https://www.powershellgallery.com/api/v2') {
                throw 'PSGallery does not point to the official PowerShell Gallery. Its configuration was not changed.'
            }
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force | Out-Null
            Install-Module -Name Microsoft.WinGet.Client -Repository PSGallery -Scope CurrentUser -Force
            Import-Module Microsoft.WinGet.Client -Force
            Repair-WinGetPackageManager -AllUsers
            $winget = Get-CapsuleWinget
            if (-not $winget) { throw 'WinGet bootstrap finished but winget.exe is unavailable. Reopen the session and review App Installer registration.' }
        }
        if ($Manager -eq 'chocolatey') {
            & $winget install --id chocolatey.chocolatey --exact --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity
            if ($LASTEXITCODE -ne 0) { throw "Chocolatey installation failed (winget exit $LASTEXITCODE)." }
        }
        $status = 'installed'
        $command = Get-RequestedManager
    }
    if (-not $command) { throw "$Manager setup finished but its executable is unavailable." }
    $version = @(& $command --version)
    if ($LASTEXITCODE -ne 0 -or $version.Count -eq 0) { throw "$Manager did not pass its version check." }
    Write-CapsuleReceipt -Kind 'package-manager' -Data @{ manager = $Manager; status = $status; version = "$($version[0])" } | Out-Null
    Write-Output "$Manager is ready ($($version[0])). Open a new terminal to refresh PATH."
} catch {
    Write-CapsuleReceipt -Kind 'package-manager' -Data @{ manager = $Manager; status = 'failed'; error = $_.Exception.Message } | Out-Null
    throw
}
