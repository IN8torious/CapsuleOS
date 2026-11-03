<#
  CapsuleOS - Windows Repair Engine
  ----------------------------------
  Runs Microsoft's own repair tools, in the order Microsoft
  recommends: first the component store (DISM), then the system
  files that store serves (SFC). Nothing here changes a setting,
  disables a feature, or touches security. It only repairs.

  Modes:
    Full   DISM CheckHealth -> ScanHealth -> RestoreHealth -> SFC
    Quick  DISM CheckHealth -> SFC
    SFC    SFC only

  -Source <path>  Optional repair source for DISM, e.g. the
                  sources folder of Windows installation media:
                  Repair-Windows.ps1 -Source D:\sources
#>
[CmdletBinding()]
param(
    [ValidateSet('Full', 'Quick', 'SFC')]
    [string]$Mode = 'Full',
    [string]$Source
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ''
    Write-Host 'This repair needs administrator rights.' -ForegroundColor Yellow
    Write-Host 'Use the "Repair Windows" shortcut, or right-click Repair-Windows.cmd'
    Write-Host 'and choose "Run as administrator".'
    exit 1
}

$logDir = Join-Path $env:ProgramData 'CapsuleOS\Repair\Logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$log = Join-Path $logDir "repair-$stamp.log"

function Log([string]$Msg) {
    Write-Host $Msg
    Add-Content -Path $log -Value $Msg
}
function LogLine([string]$Msg) {
    Add-Content -Path $log -Value $Msg
    Write-Host $Msg
}
function Run-Captured([string]$Title, [string]$Exe, [string[]]$ArgsList) {
    Log ''
    Log "=== $Title ==="
    Log "    $Exe $($ArgsList -join ' ')"
    $script:LastOut = @()
    & $Exe @ArgsList 2>&1 | ForEach-Object { $script:LastOut += $_; LogLine "$_" }
    $code = $LASTEXITCODE
    Log "--- exit code: $code ---"
    return $code
}

Log '============================================================'
Log ' CapsuleOS Windows Repair'
Log " Mode: $Mode    Started: $(Get-Date)"
Log ' These are Microsoft''s own tools (DISM and SFC). They repair'
Log ' Windows; they do not change your settings or remove anything.'
Log ' A full pass can take 10-40 minutes. Let it finish.'
Log '============================================================'

$dism = Join-Path $env:SystemRoot 'System32\Dism.exe'
$sfc  = Join-Path $env:SystemRoot 'System32\sfc.exe'
$results = [ordered]@{}

if ($Mode -ne 'SFC') {
    $results['DISM CheckHealth'] = Run-Captured 'DISM - quick health check' $dism @('/Online', '/Cleanup-Image', '/CheckHealth')
}
if ($Mode -eq 'Full') {
    $results['DISM ScanHealth'] = Run-Captured 'DISM - deep health scan' $dism @('/Online', '/Cleanup-Image', '/ScanHealth')
    $restoreArgs = @('/Online', '/Cleanup-Image', '/RestoreHealth')
    if ($Source) { $restoreArgs += "/Source:$Source"; $restoreArgs += '/LimitAccess' }
    $rc = Run-Captured 'DISM - repair the component store (RestoreHealth)' $dism $restoreArgs
    $results['DISM RestoreHealth'] = $rc
    if ($rc -ne 0 -and -not $Source) {
        Log ''
        Log 'RestoreHealth did not complete. The usual cause: it could not'
        Log 'download clean components. Check the internet connection, make'
        Log 'sure Windows Update is reachable, and run this repair again.'
        Log 'Or run it with installation media as the repair source:'
        Log '  Repair-Windows.ps1 -Source D:\sources   (your drive letter)'
    }
}

$sfcRuns = 0
do {
    $sfcRuns++
    $results["SFC scan (pass $sfcRuns)"] = Run-Captured "SFC - verify and repair system files (pass $sfcRuns)" $sfc @('/scannow')
    $joined = ($script:LastOut -join "`n")
    $repaired = $joined -match 'successfully repaired'
    $clean = $joined -match 'did not find any integrity violations'
} while ($repaired -and -not $clean -and $sfcRuns -lt 2)

Log ''
Log '============================================================'
Log ' SUMMARY'
foreach ($k in $results.Keys) { Log ("  {0,-28} exit {1}" -f $k, $results[$k]) }
Log ''
if ($clean) {
    Log ' Result: SFC reports no integrity violations. Windows files'
    Log ' are intact.'
} elseif ($repaired) {
    Log ' Result: SFC found corrupt files and repaired them.'
} else {
    Log ' Result: read the SFC lines above. If SFC says it could not'
    Log ' fix some files, reboot and run this repair once more; if it'
    Log ' still cannot, use the -Source option with Windows media.'
}
Log ''
Log " Full log: $log"
Log " Deeper logs: $env:SystemRoot\Logs\DISM\dism.log and"
Log "              $env:SystemRoot\Logs\CBS\CBS.log"
Log '============================================================'
