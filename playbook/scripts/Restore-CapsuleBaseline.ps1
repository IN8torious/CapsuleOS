<#
  CapsuleOS - put registry values back exactly as they were before CapsuleOS ran.
  Uses a baseline written by Start-CapsuleSession.ps1 (default: baseline-original.json).
  Values that existed are written back with their original type and data; values that did
  not exist are deleted. Only locations listed in capsule-targets.json are ever touched.

  Examples:
    .\Restore-CapsuleBaseline.ps1 -WhatIf
    .\Restore-CapsuleBaseline.ps1
    .\Restore-CapsuleBaseline.ps1 -Option capsule-no-tips
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$Baseline,
    [ValidatePattern('^(capsule-[a-z0-9-]+|browser-edge)$')][string[]]$Option
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Capsule.Common.psm1') -Force
Assert-CapsuleAdmin

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $Baseline) { $Baseline = Join-Path $env:ProgramData "CapsuleOS\Baselines\$($identity.User.Value)\baseline-original.json" }
$document = Get-Content -Path $Baseline -Raw -Encoding UTF8 | ConvertFrom-Json
if ($document.format -ne 'capsule-baseline/1') { throw "$Baseline is not a CapsuleOS baseline." }
if (-not $document.PSObject.Properties['sid'] -or $document.sid -ne $identity.User.Value) { throw 'This baseline belongs to a different or unidentified Windows account. No values were restored.' }
$allowed = @{}
foreach ($target in (Get-Content -Path (Join-Path $PSScriptRoot 'capsule-targets.json') -Raw -Encoding UTF8 | ConvertFrom-Json)) {
    $allowed["$($target.root)\$($target.path)\$($target.name)".ToLowerInvariant()] = $target.option
}
$hives = @{ HKCU = [Microsoft.Win32.Registry]::CurrentUser; HKLM = [Microsoft.Win32.Registry]::LocalMachine }
$restored = New-Object System.Collections.Generic.List[object]

# Validate the entire input before the first write.
foreach ($entry in $document.values) {
    $location = "$($entry.root)\$($entry.path)\$($entry.name)".ToLowerInvariant()
    if (-not $allowed.ContainsKey($location) -or $allowed[$location] -ne $entry.option -or -not $hives.ContainsKey($entry.root)) {
        throw "Baseline location '$location' does not match the current CapsuleOS catalog."
    }
    if ($entry.exists -isnot [bool]) { throw "Invalid presence flag for '$location'." }
    if ($entry.exists -and $entry.kind -notin 'DWord', 'QWord', 'Binary', 'MultiString', 'String', 'ExpandString', 'None') {
        throw "Invalid registry type for '$location'."
    }
}
foreach ($selected in $Option) {
    if ($selected -notin $document.values.option) { throw "Option '$selected' was not captured in this baseline." }
}
foreach ($entry in $document.values) {
    if ($Option -and $Option -notcontains $entry.option) { continue }
    $location = "$($entry.root)\$($entry.path)\$($entry.name)"
    if (-not $allowed.ContainsKey($location.ToLowerInvariant()) -or -not $hives.ContainsKey($entry.root)) {
        Write-Warning "Skipping $location - it is not a CapsuleOS catalog location."
        continue
    }
    if ($entry.exists) {
        $kind = [Microsoft.Win32.RegistryValueKind]$entry.kind
        # .NET reads REG_DWORD as a signed Int32, which is what the baseline stored.
        switch ($kind) {
            'DWord' { $data = [int32]$entry.data; break }
            'QWord' { $data = [int64]$entry.data; break }
            'Binary' { $data = [byte[]]@($entry.data); break }
            'None' { $data = [byte[]]@($entry.data); break }
            'MultiString' { $data = [string[]]@($entry.data); break }
            default { $data = [string]$entry.data }
        }
        if ($PSCmdlet.ShouldProcess($location, "Set to original $kind '$($entry.data)'")) {
            $key = $hives[$entry.root].CreateSubKey($entry.path)
            try { $key.SetValue($entry.name, $data, $kind) } finally { $key.Close() }
            $restored.Add([ordered]@{ location = $location; action = 'set'; data = $entry.data; kind = $entry.kind })
        }
    } else {
        $key = $hives[$entry.root].OpenSubKey($entry.path, -not $WhatIfPreference)
        if ($key) {
            try {
                if ($key.GetValueNames() -contains $entry.name -and $PSCmdlet.ShouldProcess($location, 'Delete (it did not exist before CapsuleOS)')) {
                    $key.DeleteValue($entry.name, $false)
                    $restored.Add([ordered]@{ location = $location; action = 'deleted' })
                }
            } finally { $key.Close() }
        }
    }
}

if (-not $WhatIfPreference) {
    Write-CapsuleReceipt -Kind 'baseline-restore' -Data @{ baseline = $Baseline; options = @($Option); changes = $restored.ToArray() } | Out-Null
    Write-Host "Restored $($restored.Count) values. Sign out and back in (or restart) for every change to take effect."
}
