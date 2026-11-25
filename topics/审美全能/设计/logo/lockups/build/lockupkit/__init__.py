"""题名锁定生成器的共用工具（Python）。各题的设计写在 build/tasks/<题>/ 里，入口是 build/lockup.py。

模块一览：
  paths     路径、tokens.json 里这一题的配色、字体文件
  geom      矢量几何：字形轮廓、布尔运算（skia-pathops）、形状、展平与光栅化
  strokes   笔画：标注格式 S()、按条件查笔画、批量改、变体、延伸成线
  surgery   笔画手术：刻面、加厚横画、斜切脚、鳍、刃、刀、分缝、液压杆、倒角
  latin     西文：一行字、沿圆排字
  canvas    画板：舞台坐标 → 2 倍图，光栅化、坐标网格
  fx        图层样式：噪声、斜面、描边、发光、投影、水彩扩散、闪粉
  small     小形态：迷你（mini、mini-ink）和书脊（stamp、stamp-ink、stamp-blind）
  checks    检查图：黑白、去色、只剩字、缩略图、白底、黑底；笔画标注图
  output    出图：裁切、PNG + WebP、清单（每题一份，汇总成 lockups.js，带锁）
  run       跑一题：几何 → 各层 → 出图 → 小形态 → 检查图 → 清单
"""
