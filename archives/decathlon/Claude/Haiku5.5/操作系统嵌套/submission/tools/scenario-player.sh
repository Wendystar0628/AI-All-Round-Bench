#!/bin/sh
# 开发检查脚本：在已启动的应用中创建子系统 inner-1、打开播放器、开始排演并观察飞行。
# 用法：sh tools/scenario-player.sh   （需要应用已启动且调试端口为 19106）
set -e
CDP="node tools/cdp.js"
sleep 6
$CDP sel '[data-testid=desktop-icon][data-app-id=tasks]' 0 dbl >/dev/null
sleep 3
$CDP click 260 80 >/dev/null
$CDP sel '[data-testid=tasks-tab-kids]' >/dev/null
sleep 1
$CDP sel '[data-testid=system-new]' >/dev/null
sleep 6
$CDP sel '[data-system-id=inner-1][data-app-id=player]' 0 dbl >/dev/null
sleep 6
$CDP sel '[data-testid=rehearsal-start]' 0 >/dev/null
