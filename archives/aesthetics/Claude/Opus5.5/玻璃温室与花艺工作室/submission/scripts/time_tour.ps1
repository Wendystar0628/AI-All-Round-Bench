# Timing harness: renders tour frames with the saved .blend settings (CLI animation path, as an export would),
# samples this Blender process's GPU 3D-engine utilisation and the total of all other processes,
# then reports per-frame wall time and an estimate of the time with the GPU to itself:
#   est_alone = (non-sampling time) + (path-tracing time x my GPU share during path tracing)
# Usage: powershell -File time_tour.ps1 -Blend <file> -OutDir <dir> -Start 40 -End 1440 -Jump 70 [-Extra "spp=32"]
param([string]$Blend, [string]$OutDir, [int]$Start = 40, [int]$End = 1440, [int]$Jump = 70, [string]$Extra = "")
$bl = "H:\AI_OneShot_Model\.oneshot\tools\blender-5.1.2\blender.exe"
$scripts = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir "render_log.txt"
$bargs = @("-b", "`"$Blend`"", "--python", "`"$scripts\cli_setup.py`"", "-s", "$Start", "-e", "$End", "-j", "$Jump", "-a", "--", "`"out=$OutDir\f_####`"")
if ($Extra) { $bargs += $Extra.Split(" ") }
$p = Start-Process -FilePath $bl -ArgumentList $bargs -RedirectStandardOutput $log -RedirectStandardError (Join-Path $OutDir "err.txt") -WindowStyle Hidden -PassThru
$mypid = $p.Id
$t0 = Get-Date
$samples = New-Object System.Collections.ArrayList
while (-not $p.HasExited) {
    try {
        $c = Get-Counter -Counter '\GPU Engine(*engtype_3d)\Utilization Percentage' -ErrorAction Stop
        $mine = 0.0; $other = 0.0
        foreach ($s in $c.CounterSamples) {
            if ($s.InstanceName -like "pid_$($mypid)_*") { $mine += $s.CookedValue } else { $other += $s.CookedValue }
        }
        [void]$samples.Add([pscustomobject]@{ t = (Get-Date); mine = $mine; other = $other })
    } catch { Start-Sleep -Milliseconds 300 }
}
$samples | Export-Csv (Join-Path $OutDir "gpu.csv") -NoTypeInformation
function TS($mm, $ss) { return $t0.AddSeconds([int]$mm * 60 + [double]$ss) }
$rows = @()
$fr = $null; $tStart = $null; $tS0 = $null; $tS1 = $null
foreach ($ln in (Get-Content $log)) {
    if ($ln -match "^(\d\d):(\d\d\.\d\d\d)\s+render\s+\| Fra: (\d+) \| .*\| Updating Scene$") { $fr = [int]$Matches[3]; $tStart = TS $Matches[1] $Matches[2]; $tS0 = $null; $tS1 = $null }
    elseif ($ln -match "^(\d\d):(\d\d\.\d\d\d)\s+render\s+\| Fra: (\d+) \| .*Sample 0/") { if (-not $tS0) { $tS0 = TS $Matches[1] $Matches[2] } }
    elseif ($ln -match "^(\d\d):(\d\d\.\d\d\d)\s+render\s+\| Fra: (\d+) \| .*\| Finished$") { $tS1 = TS $Matches[1] $Matches[2] }
    elseif ($ln -match "^(\d\d):(\d\d\.\d\d\d)\s+render\s+\| Time: (\d+):(\d+\.\d+)") {
        $wall = [int]$Matches[3] * 60 + [double]$Matches[4]
        $pt = if ($tS0 -and $tS1) { ($tS1 - $tS0).TotalSeconds } else { 0 }
        $in = $samples | Where-Object { $_.t -ge $tS0 -and $_.t -le $tS1 }
        $m = if ($in) { ($in | Measure-Object mine -Average).Average } else { 100.0 }
        $o = if ($in) { ($in | Measure-Object other -Average).Average } else { 0.0 }
        $share = [math]::Min(1.0, $m / 100.0)
        $est = ($wall - $pt) + $pt * $share
        $rows += [pscustomobject]@{ frame = $fr; wall_s = [math]::Round($wall, 2); pathtrace_s = [math]::Round($pt, 2); my_gpu_pct = [math]::Round($m, 0); others_gpu_pct = [math]::Round($o, 0); est_alone_s = [math]::Round($est, 2) }
    }
}
$rows | Export-Csv (Join-Path $OutDir "frames.csv") -NoTypeInformation
$rows | Format-Table -AutoSize | Out-String -Width 200
$steady = $rows | Select-Object -Skip 1
"steady frames: {0}  mean wall = {1:N2}s   mean est. alone = {2:N2}s   first frame (initial sync) = {3}s   gpu samples = {4}" -f $steady.Count, ($steady | Measure-Object wall_s -Average).Average, ($steady | Measure-Object est_alone_s -Average).Average, $rows[0].wall_s, $samples.Count
