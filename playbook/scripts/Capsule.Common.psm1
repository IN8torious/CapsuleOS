<#
  CapsuleOS shared helpers for the playbook scripts.
  Receipts or it didn't happen: every script records what it did under
  %ProgramData%\CapsuleOS\Receipts and appends one line to ledger.jsonl.
#>
Set-StrictMode -Version 2.0

$script:CapsuleRoot = Join-Path $env:ProgramData 'CapsuleOS'
$script:PackageIdPattern = '^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$'

function Get-CapsuleRoot {
    return $script:CapsuleRoot
}

function Assert-CapsuleAdmin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'This CapsuleOS step needs administrator rights. Run it from AME Wizard or an elevated PowerShell.'
    }
}

function Write-CapsuleReceipt {
    param(
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Kind,
        [Parameter(Mandatory)][hashtable]$Data
    )
    $folder = Join-Path (Get-CapsuleRoot) 'Receipts'
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $stamp = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmssfff'), [guid]::NewGuid().ToString('N')
    $record = [ordered]@{
        kind = $Kind
        time = (Get-Date).ToString('o')
        user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        computer = $env:COMPUTERNAME
        data = $Data
    }
    $json = $record | ConvertTo-Json -Depth 8
    $file = Join-Path $folder "$Kind-$stamp.json"
    Set-Content -Path $file -Value $json -Encoding UTF8
    Add-Content -Path (Join-Path (Get-CapsuleRoot) 'ledger.jsonl') -Value ($record | ConvertTo-Json -Depth 8 -Compress) -Encoding UTF8
    Write-Host "Receipt: $file"
    return $file
}

function Get-CapsuleWinget {
    $command = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
    if (Test-Path $candidate) { return $candidate }
    return $null
}

function Get-CapsuleChocolatey {
    $command = Get-Command choco.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    return $null
}

function Get-CapsulePackageVersion {
    param([Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$')][string]$WingetId)
    $winget = Get-CapsuleWinget
    if (-not $winget) { return $null }
    $lines = & $winget list --id $WingetId --exact --accept-source-agreements --disable-interactivity 2>$null
    foreach ($line in $lines) {
        if ("$line" -match [regex]::Escape($WingetId) + '\s+(\S+)') { return $Matches[1] }
    }
    return $null
}

function Get-CapsulePackageState {
    param(
        [Parameter(Mandatory)][ValidateSet('winget', 'chocolatey')][string]$Source,
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$')][string]$Id
    )
    if ($Source -eq 'winget') {
        $lines = @(& $Executable list --id $Id --exact --source winget --accept-source-agreements --disable-interactivity)
        $code = $LASTEXITCODE
        if ($code -eq -1978335212) { return 'absent' } # APPINSTALLER_CLI_ERROR_NO_APPLICATIONS_FOUND
        if ($code -ne 0) { throw "Cannot inspect installed package '$Id' (winget exit $code)." }
        foreach ($line in $lines) {
            if ("$line" -match ('(?:^|\s)' + [regex]::Escape($Id) + '\s+\S+')) { return 'present' }
        }
    } else {
        $version = @(& $Executable --version)
        if ($LASTEXITCODE -ne 0 -or $version.Count -eq 0 -or "$($version[0])" -notmatch '^(\d+)\.') { throw 'Cannot determine Chocolatey version.' }
        $arguments = @('list', '--exact', '--limit-output', $Id)
        if ([int]$Matches[1] -lt 2) { $arguments += '--local-only' }
        $lines = @(& $Executable @arguments)
        if ($LASTEXITCODE -ne 0) { throw "Cannot inspect installed package '$Id' with Chocolatey." }
        foreach ($line in $lines) {
            if ("$line" -match ('^' + [regex]::Escape($Id) + '\|')) { return 'present' }
        }
        if ($lines.Count -eq 0) { return 'absent' }
    }
    throw "Cannot establish whether '$Id' is installed; refusing an ambiguous package operation."
}

function Invoke-CapsulePackage {
    <#
      Installs or uninstalls one catalog app. Winget is the primary source; Chocolatey is used only
      when winget is unavailable and Chocolatey is already installed. Nothing is installed
      from a source the catalog did not name.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][ValidateSet('install', 'uninstall')][string]$Operation,
        [Parameter(Mandatory)][string]$Name,
        [ValidatePattern('^$|^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$')][string]$WingetId = '',
        [ValidatePattern('^$|^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$')][string]$ChocoId = '',
        [ValidateSet('auto', 'winget', 'chocolatey')][string]$Manager = 'auto'
    )
    $result = [ordered]@{ name = $Name; winget = $WingetId; choco = $ChocoId; operation = $Operation; source = $null; exitCode = $null; version = $null; status = 'skipped'; installedByCapsule = $false }
    if (-not $WingetId -and -not $ChocoId) { throw 'A catalog package id is required.' }
    if (-not $PSCmdlet.ShouldProcess($Name, $Operation)) {
        if ($WhatIfPreference) { $result.status = 'whatif' }
        return $result
    }
    $winget = if ($Manager -ne 'chocolatey') { Get-CapsuleWinget } else { $null }
    if ($winget -and $WingetId) {
        $state = Get-CapsulePackageState -Source winget -Executable $winget -Id $WingetId
        if ($Operation -eq 'install' -and $state -eq 'present') {
            $result.source = 'winget'; $result.status = 'already-present'
            return $result
        }
        if ($Operation -eq 'uninstall' -and $state -eq 'absent') {
            $result.source = 'winget'; $result.status = 'already-absent'
            return $result
        }
        $common = @('--id', $WingetId, '--exact', '--accept-source-agreements', '--disable-interactivity', '--silent')
        if ($Operation -eq 'install') {
            $arguments = @('install') + $common + @('--source', 'winget', '--accept-package-agreements')
        } else {
            $arguments = @('uninstall') + $common
        }
        Write-Host "winget $($arguments -join ' ')"
        & $winget @arguments | ForEach-Object { Write-Host "  $_" }
        $result.exitCode = $LASTEXITCODE
        $result.source = 'winget'
        # 0 = done; 0x8A15002B = already installed / no applicable upgrade.
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq -1978335189) { $result.status = 'ok' } else { $result.status = 'failed' }
        if ($Operation -eq 'install' -and $result.status -eq 'ok') {
            $result.installedByCapsule = $result.exitCode -eq 0
            if (-not $result.installedByCapsule) { $result.status = 'already-present' }
            $result.version = Get-CapsulePackageVersion -WingetId $WingetId
        }
    }
    # Never switch managers after an attempted install: a partial install must not be duplicated.
    if (-not $result.source -and $ChocoId -and $Manager -ne 'winget') {
        $choco = Get-CapsuleChocolatey
        if ($choco) {
            $state = Get-CapsulePackageState -Source chocolatey -Executable $choco -Id $ChocoId
            if ($Operation -eq 'install' -and $state -eq 'present') {
                $result.source = 'chocolatey'; $result.status = 'already-present'
                return $result
            }
            if ($Operation -eq 'uninstall' -and $state -eq 'absent') {
                $result.source = 'chocolatey'; $result.status = 'already-absent'
                return $result
            }
            $arguments = @($Operation, $ChocoId, '-y', '--no-progress')
            Write-Host "choco $($arguments -join ' ')"
            & $choco @arguments | ForEach-Object { Write-Host "  $_" }
            $result.exitCode = $LASTEXITCODE
            $result.source = 'chocolatey'
            $result.status = $(if ($LASTEXITCODE -in 0, 1641, 3010) { 'ok' } else { 'failed' })
            $result.installedByCapsule = $Operation -eq 'install' -and $result.status -eq 'ok'
        }
    }
    if (-not $result.source) { $result.status = 'unavailable' }
    return $result
}

function Read-CapsulePackCatalog {
    param([Parameter(Mandatory)][string]$Path)
    $catalog = Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($catalog.format -ne 'capsule-packs/1') { throw "Unsupported pack catalog format in $Path." }
    $seen = @{}
    foreach ($pack in $catalog.packs) {
        if ($pack.id -notmatch '^[a-z0-9-]+$') { throw "Invalid pack id '$($pack.id)'." }
        if ($seen.ContainsKey($pack.id)) { throw "Duplicate pack id '$($pack.id)'." }
        $seen[$pack.id] = $true
        foreach ($app in $pack.apps) {
            # Normalise optional fields so callers never trip StrictMode on a missing id.
            foreach ($field in 'winget', 'choco', 'optional') {
                if (-not $app.PSObject.Properties[$field]) { $app | Add-Member -NotePropertyName $field -NotePropertyValue $null }
            }
            if (-not $app.winget -and -not $app.choco) { throw "App '$($app.name)' in pack '$($pack.id)' has no package id." }
            foreach ($id in @($app.winget, $app.choco)) {
                if ($id -and $id -notmatch $script:PackageIdPattern) { throw "Invalid package id '$id' in pack '$($pack.id)'." }
            }
        }
    }
    return $catalog
}

Export-ModuleMember -Function Get-CapsuleRoot, Assert-CapsuleAdmin, Write-CapsuleReceipt, Get-CapsuleWinget,
    Get-CapsuleChocolatey, Get-CapsulePackageVersion, Get-CapsulePackageState, Invoke-CapsulePackage, Read-CapsulePackCatalog
