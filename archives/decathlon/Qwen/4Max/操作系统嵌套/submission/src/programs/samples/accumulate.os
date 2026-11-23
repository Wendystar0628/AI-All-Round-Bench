// 累加计算：循环累加并把结果写入文件与日志
var n = 2000;
var args = sys_args();
if (args != null && len(args) > 0) { n = num(args[0]); }
var total = 0;
var i = 1;
while (i <= n) {
  total = total + i;
  i = i + 1;
}
sys_log("累加 1.." + str(n) + " = " + str(total));
sys_write("/Documents/accumulate-result.txt", "n=" + str(n) + "\nsum=" + str(total) + "\n");
var t = sys_time();
sys_log("完成，系统时间 " + str(t));
