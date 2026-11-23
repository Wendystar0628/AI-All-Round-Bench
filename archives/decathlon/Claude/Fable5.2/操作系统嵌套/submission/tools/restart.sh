#!/bin/bash
# 开发辅助：按 PID 结束上次由本脚本启动的实例，再重新启动
cd "$(dirname "$0")/.."
TMPD="$(cat .devtmp)"
if [ -f "$TMPD/electron.pid" ]; then
  PID=$(cat "$TMPD/electron.pid")
  WPID=$(cat /proc/$PID/winpid 2>/dev/null)
  if [ -n "$WPID" ]; then taskkill //PID $WPID //T //F > /dev/null 2>&1; fi
  kill $PID > /dev/null 2>&1
fi
sleep 1
DATA="${1:-data1}"
if [ "$2" = "fresh" ]; then rm -rf "$TMPD/$DATA"; fi
node_modules/electron/dist/electron.exe . --data-dir "$TMPD/$DATA" --width ${W:-1600} --height ${H:-900} --remote-debugging-port=19106 > "$TMPD/electron.log" 2>&1 &
echo $! > "$TMPD/electron.pid"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  sleep 0.5
  if node tools/cdp.js eval "OS.ready ? 'ready' : 'no'" 2>/dev/null | grep -q ready; then echo "app ready"; exit 0; fi
done
echo "app not ready"; tail -5 "$TMPD/electron.log"
