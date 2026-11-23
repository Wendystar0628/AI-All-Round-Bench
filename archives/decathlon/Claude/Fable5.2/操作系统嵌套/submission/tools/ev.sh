#!/bin/bash
# 开发辅助：在页面中执行表达式（自动带上调试函数）
cd "$(dirname "$0")/.."
node tools/cdp.js eval "$(cat tools/dbg.js tools/dbg2.js); $1"
