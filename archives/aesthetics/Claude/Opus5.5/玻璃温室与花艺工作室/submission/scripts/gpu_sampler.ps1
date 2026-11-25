# Samples per-process 3D/compute engine utilisation once per second.
# Usage: powershell -File gpu_sampler.ps1 -Out <csv> -Seconds <n>
param([string]$Out, [int]$Seconds = 300)
"time,pid,util" | Out-File -FilePath $Out -Encoding utf8
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
    try {
        $c = Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
        $ts = (Get-Date).ToString("HH:mm:ss")
        $agg = @{}
        foreach ($s in $c.CounterSamples) {
            if ($s.InstanceName -match 'pid_(\d+)_.*engtype_(3d|compute|cuda)') {
                $p = $Matches[1]
                if (-not $agg.ContainsKey($p)) { $agg[$p] = 0.0 }
                $agg[$p] += $s.CookedValue
            }
        }
        foreach ($k in $agg.Keys) {
            if ($agg[$k] -gt 1) { "$ts,$k,$([math]::Round($agg[$k],1))" | Out-File -FilePath $Out -Append -Encoding utf8 }
        }
    } catch { }
    Start-Sleep -Milliseconds 700
}
