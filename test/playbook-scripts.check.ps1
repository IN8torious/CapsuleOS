param([Parameter(Mandatory)][string]$Workspace)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$scripts = Join-Path $Workspace 'playbook\scripts'
$temporary = Join-Path ([IO.Path]::GetTempPath()) "capsule-script-tests-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temporary | Out-Null
$checks = 0
function Assert-Check {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    $script:checks++
}
try {
    foreach ($file in Get-ChildItem -LiteralPath $scripts -Recurse -File | Where-Object { $_.Extension -in '.ps1', '.psm1' }) {
        $tokens = $null; $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
        Assert-Check (@($errors).Count -eq 0) "Parse failed: $($file.Name): $errors"
    }
    $module = Import-Module (Join-Path $scripts 'Capsule.Common.psm1') -Force -PassThru
    & $module {
        param($Root)
        $script:CapsuleRoot = $Root
        $script:FakeListExit = -1978335212
        $script:FakeListOutput = @()
        $script:FakeInstallExit = 0
        $script:FakeChoco = $false
        $script:FakeWinget = $true
        $script:FakeCalls = New-Object System.Collections.Generic.List[string]
        function script:Get-CapsuleWinget { if ($script:FakeWinget) { 'Invoke-FakeManager' } }
        function script:Get-CapsuleChocolatey { if ($script:FakeChoco) { 'Invoke-FakeManager' } }
        function script:Get-CapsulePackageVersion { '1.0' }
        function script:Invoke-FakeManager {
            $script:FakeCalls.Add(($args -join ' '))
            if ($args[0] -eq '--version') { $global:LASTEXITCODE = 0; '2.3.0'; return }
            if ($args[0] -eq 'list') {
                $global:LASTEXITCODE = $script:FakeListExit
                $script:FakeListOutput
                return
            }
            $global:LASTEXITCODE = $script:FakeInstallExit
        }
    } $temporary
    $dry = Invoke-CapsulePackage -Operation install -Name Test -WingetId Vendor.Test -WhatIf
    Assert-Check ($dry.status -eq 'whatif') 'WhatIf must report no change.'
    Assert-Check ((& $module { $script:FakeCalls.Count }) -eq 0) 'WhatIf must not call a package manager.'
    $new = Invoke-CapsulePackage -Operation install -Name Test -WingetId Vendor.Test
    Assert-Check ($new.status -eq 'ok' -and $new.installedByCapsule) 'A confirmed new install must carry ownership evidence.'
    & $module { $script:FakeListExit = 0; $script:FakeListOutput = @('Test Vendor.Test 1.0 winget'); $script:FakeCalls.Clear() }
    $existing = Invoke-CapsulePackage -Operation install -Name Test -WingetId Vendor.Test
    Assert-Check ($existing.status -eq 'already-present' -and -not $existing.installedByCapsule) 'Existing app must never become Capsule-owned.'
    Assert-Check ((& $module { @($script:FakeCalls | Where-Object { $_ -like 'install *' }).Count }) -eq 0) 'Existing app must not be reinstalled.'
    & $module { $script:FakeListExit = -1978335212; $script:FakeListOutput = @(); $script:FakeInstallExit = -1978335189 }
    $noUpgrade = Invoke-CapsulePackage -Operation install -Name Test -WingetId Vendor.Test
    Assert-Check ($noUpgrade.status -eq 'already-present' -and -not $noUpgrade.installedByCapsule) 'No-upgrade exit is not evidence of a new install.'
    & $module { $script:FakeInstallExit = 5; $script:FakeChoco = $true; $script:FakeCalls.Clear() }
    $failed = Invoke-CapsulePackage -Operation install -Name Test -WingetId Vendor.Test -ChocoId test
    Assert-Check ($failed.status -eq 'failed' -and $failed.source -eq 'winget') 'Failed winget install must remain a failure.'
    Assert-Check ((& $module { @($script:FakeCalls | Where-Object { $_ -eq '--version' }).Count }) -eq 0) 'Do not duplicate a failed installation through Chocolatey.'
    & $module { $script:FakeListExit = 2 }
    $rejected = $false
    try { Invoke-CapsulePackage -Operation install -Name Test -WingetId Vendor.Test | Out-Null } catch { $rejected = $true }
    Assert-Check $rejected 'An ambiguous inventory must fail closed.'
    & $module {
        $script:FakeWinget = $false; $script:FakeListExit = 0
        $script:FakeListOutput = @(); $script:FakeInstallExit = 3010
    }
    $choco = Invoke-CapsulePackage -Operation install -Name Test -ChocoId test
    Assert-Check ($choco.status -eq 'ok' -and $choco.installedByCapsule) 'Chocolatey reboot-required success must be recorded.'
    & $module { $script:FakeListOutput = @('test|1.0'); $script:FakeCalls.Clear() }
    $chocoExisting = Invoke-CapsulePackage -Operation install -Name Test -ChocoId test
    Assert-Check ($chocoExisting.status -eq 'already-present' -and -not $chocoExisting.installedByCapsule) 'Existing Chocolatey app must be retained.'

    $catalog = Read-CapsulePackCatalog -Path (Join-Path $Workspace 'playbook\packs.catalog.json')
    Assert-Check ($catalog.packs.Count -eq 13) 'Every app pack must load under StrictMode.'
    Assert-Check (@($catalog.packs.apps | Where-Object { -not $_.choco }).Count -eq 3) 'Missing optional Chocolatey ids must be normalized.'
    $one = Write-CapsuleReceipt -Kind test -Data @{ operation = 'test' }
    $two = Write-CapsuleReceipt -Kind test -Data @{ operation = 'test' }
    Assert-Check ($one -ne $two) 'Receipts must not overwrite one another.'
    $receipt = Get-Content -LiteralPath $one -Raw | ConvertFrom-Json
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    Assert-Check ($receipt.sid -eq $sid) 'Receipts must identify the account.'

    # Execute the real uninstaller with a mock manager and no elevation or host app changes.
    $pack = $catalog.packs | Where-Object { $_.id -eq 'developer' }
    $app = $pack.apps | Where-Object { -not $_.optional } | Select-Object -First 1
    $owned = @{ name = $app.name; winget = $app.winget; choco = $app.choco; source = 'winget'; status = 'ok'; installedByCapsule = $true }
    Write-CapsuleReceipt -Kind pack-developer -Data @{ operation = 'install'; apps = @($owned) } | Out-Null
    $existingApp = $pack.apps | Where-Object { $_.name -ne $app.name } | Select-Object -First 1
    $unowned = @{ name = $existingApp.name; winget = $existingApp.winget; choco = $existingApp.choco; source = 'winget'; status = 'ok'; installedByCapsule = $false }
    Write-CapsuleReceipt -Kind pack-developer -Data @{ operation = 'install'; apps = @($unowned) } | Out-Null
    & $module {
        $script:FakeWinget = $true; $script:FakeListExit = 0
        $script:FakeInstallExit = 0; $script:FakeCalls.Clear()
    }
    & $module { param($Id) $script:FakeListOutput = @("App $Id 1.0 winget") } $app.winget
    & {
        # Shadow only elevation and re-import in this test scope. All manager calls remain mocked.
        function Import-Module {}
        function Assert-CapsuleAdmin {}
        Copy-Item -LiteralPath (Join-Path $Workspace 'playbook\packs.catalog.json') -Destination (Join-Path $temporary 'packs.catalog.json')
        Copy-Item -LiteralPath (Join-Path $scripts 'Uninstall-CapsulePack.ps1') -Destination (Join-Path $temporary 'Uninstall-CapsulePack.ps1')
        & (Join-Path $temporary 'Uninstall-CapsulePack.ps1') -Pack developer -WhatIf
        Assert-Check ((& $module { @($script:FakeCalls | Where-Object { $_ -like 'uninstall *' }).Count }) -eq 0) 'Uninstall WhatIf must not execute a manager.'
        & (Join-Path $temporary 'Uninstall-CapsulePack.ps1') -Pack developer -Confirm:$false
        Assert-Check ((& $module { @($script:FakeCalls | Where-Object { $_ -like 'uninstall *' }).Count }) -eq 1) 'Only the newly installed app may be removed.'
        & (Join-Path $temporary 'Uninstall-CapsulePack.ps1') -Pack developer -Confirm:$false
        Assert-Check ((& $module { @($script:FakeCalls | Where-Object { $_ -like 'uninstall *' }).Count }) -eq 1) 'Successful removal must retire ownership on repeat runs.'
    }

    # Real baseline script in WhatIf mode: reads registry only, never writes.
    $target = @{ root = 'HKCU'; path = 'Software\CapsuleOS-Regression-NoWrite'; name = 'Test'; option = 'capsule-test' }
    ConvertTo-Json -InputObject @($target) | Set-Content -LiteralPath (Join-Path $temporary 'capsule-targets.json') -Encoding UTF8
    $baseline = @{ format = 'capsule-baseline/1'; sid = $sid; values = @(@{ root = $target.root; path = $target.path; name = $target.name; option = $target.option; exists = $true; kind = 'DWord'; data = -1 }) }
    $baselinePath = Join-Path $temporary 'baseline.json'
    $baseline | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $baselinePath -Encoding UTF8
    Copy-Item -LiteralPath (Join-Path $scripts 'Restore-CapsuleBaseline.ps1') -Destination (Join-Path $temporary 'Restore-CapsuleBaseline.ps1')
    & {
        function Import-Module {}
        function Assert-CapsuleAdmin {}
        & (Join-Path $temporary 'Restore-CapsuleBaseline.ps1') -Baseline $baselinePath -WhatIf
        $baseline.sid = 'S-1-0-0'
        $baseline | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $baselinePath -Encoding UTF8
        $rejected = $false
        try { & (Join-Path $temporary 'Restore-CapsuleBaseline.ps1') -Baseline $baselinePath -WhatIf } catch { $rejected = $true }
        Assert-Check $rejected 'Restoring a different account baseline must fail before any write.'
        $baseline.sid = $sid; $baseline.values[0].path = 'Software\Unlisted'
        $baseline | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $baselinePath -Encoding UTF8
        $rejected = $false
        try { & (Join-Path $temporary 'Restore-CapsuleBaseline.ps1') -Baseline $baselinePath -WhatIf } catch { $rejected = $true }
        Assert-Check $rejected 'Unlisted baseline targets must fail before any write.'
    }

    # Exercise session/restore-point decisions with fake restore APIs; baseline reads stay read-only.
    $session = Join-Path $temporary 'session'
    New-Item -ItemType Directory -Path $session | Out-Null
    Copy-Item -Path (Join-Path $scripts '*') -Destination $session -Recurse
    Copy-Item -LiteralPath (Join-Path $temporary 'packs.catalog.json') -Destination (Join-Path $session 'packs.catalog.json')
    ConvertTo-Json -InputObject @($target) | Set-Content -LiteralPath (Join-Path $session 'capsule-targets.json') -Encoding UTF8
    $global:CapsuleTestRestore = @{ points = @(); checkpoint = 'create'; enables = 0 }
    & {
        function Import-Module {}
        function Assert-CapsuleAdmin {}
        function Get-ComputerRestorePoint { $global:CapsuleTestRestore.points }
        function Enable-ComputerRestore { $global:CapsuleTestRestore.enables++ }
        function Checkpoint-Computer {
            if ($global:CapsuleTestRestore.checkpoint -eq 'fail') { throw 'Mock restore service unavailable' }
            if ($global:CapsuleTestRestore.checkpoint -eq 'create') {
                $global:CapsuleTestRestore.points += [pscustomobject]@{
                    SequenceNumber = $global:CapsuleTestRestore.points.Count + 1
                    CreationTime = [System.Management.ManagementDateTimeConverter]::ToDmtfDateTime((Get-Date))
                }
            }
        }
        & (Join-Path $session 'Start-CapsuleSession.ps1')
        $original = Join-Path $temporary "Baselines\$sid\baseline-original.json"
        $saved = Get-Content -LiteralPath $original -Raw | ConvertFrom-Json
        Assert-Check ($saved.sid -eq $sid -and $saved.values.Count -eq 1) 'Session must capture an account-scoped baseline.'
        # A newly introduced target must be captured without losing the first target's original data.
        $saved.values[0].exists = $true; $saved.values[0].kind = 'DWord'; $saved.values[0].data = 42
        $saved | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $original -Encoding UTF8
        $extra = @{ root = 'HKCU'; path = $target.path; name = 'Second'; option = 'capsule-second' }
        ConvertTo-Json -InputObject @($target, $extra) | Set-Content -LiteralPath (Join-Path $session 'capsule-targets.json') -Encoding UTF8
        $global:CapsuleTestRestore.checkpoint = 'reuse'
        & (Join-Path $session 'Start-CapsuleSession.ps1')
        $saved = Get-Content -LiteralPath $original -Raw | ConvertFrom-Json
        Assert-Check ($saved.values.Count -eq 2 -and $saved.values[0].data -eq 42) 'Rerun must preserve originals and append new targets.'
        Assert-Check (Test-Path -LiteralPath (Join-Path $temporary 'Scripts\repair\Uninstall-CapsuleRepair.ps1')) 'Persistent care scripts must include repair removal.'
        $global:CapsuleTestRestore.points = @([pscustomobject]@{
            SequenceNumber = 1
            CreationTime = [System.Management.ManagementDateTimeConverter]::ToDmtfDateTime((Get-Date).AddDays(-2))
        })
        $rejected = $false
        try { & (Join-Path $session 'Start-CapsuleSession.ps1') } catch { $rejected = $true }
        Assert-Check $rejected 'A throttled run with only a stale restore point must stop.'
        $global:CapsuleTestRestore.checkpoint = 'fail'
        $rejected = $false
        try { & (Join-Path $session 'Start-CapsuleSession.ps1') } catch { $rejected = $true }
        Assert-Check ($rejected -and $global:CapsuleTestRestore.enables -eq 1) 'Failed restore creation must retry once then halt.'
    }
    Write-Output "PASS: $checks PowerShell regression checks; managers mocked, registry writes suppressed."
} finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
