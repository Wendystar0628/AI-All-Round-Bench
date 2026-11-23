#!/bin/sh
# 开发检查：子系统（inner-1）内打开播放器，投送到根桌面，最大化后播放。
# 需要应用已启动（调试端口 19106）。
CDP="node tools/cdp.js"
sleep 7
$CDP sel '[data-system-id=outer][data-testid=desktop-icon][data-app-id=tasks]' 0 dbl >/dev/null; sleep 3
$CDP sel '[data-testid=tasks-tab-kids]' >/dev/null; sleep 1
$CDP sel '[data-testid=system-new]' >/dev/null; sleep 6
$CDP sel '[data-system-id=inner-1][data-app-id=player]' 0 dbl >/dev/null; sleep 6
$CDP sel '[data-system-id=inner-1][data-testid=window-project]' 0 >/dev/null; sleep 1
$CDP sel '[data-testid=project-target][data-target-system-id=outer]' 0 >/dev/null; sleep 4
echo "projections:"; $CDP eval "JSON.stringify(window.bench.inspect().projections.map(p=>[p.sourceAppId,p.state,p.view]))"
