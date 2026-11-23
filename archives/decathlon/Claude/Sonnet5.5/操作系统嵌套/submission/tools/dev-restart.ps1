# 开发用：只结束本脚本上次启动的 Electron（按 PID 文件），然后用调试端口 19206 重新启动
param([int]$Port = 19206, [int]$Width = 1600, [int]$Height = 900, [switch]$Clean)
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP 'nestedos-dev'
New-Item -ItemType Directory -Force $tmp | Out-Null
$pidFile = Join-Path $tmp 'pid.txt'
if (Test-Path $pidFile) {
  $old = [int](Get-Content $pidFile)
  $proc = Get-Process -Id $old -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'electron') { Stop-Process -Id $old -Force }
}
Start-Sleep -Milliseconds 600
$data = Join-Path $tmp 'data'
if ($Clean -and (Test-Path $data)) { Remove-Item -Recurse -Force $data }
$p = Start-Process -FilePath (Join-Path $root 'node_modules\electron\dist\electron.exe') -ArgumentList @($root, '--data-dir', $data, '--width', $Width, '--height', $Height, "--remote-debugging-port=$Port") -PassThru
$p.Id | Out-File $pidFile
Start-Sleep -Seconds 5
"started pid $($p.Id)"
