// 消息接收：等待消息并累加收到的数值，输出到日志与文件
sys_log("接收程序已启动，等待消息…");
var total = 0;
var count = 0;
while (true) {
  var m = sys_recv();
  if (m.type == "number") {
    total = total + m.payload.value;
    count = count + 1;
    sys_log("收到 " + m.payload.text + "，累计 " + str(total));
  } else if (m.type == "done") {
    sys_log("结束，共 " + str(count) + " 条，合计 " + str(total));
    sys_write("/Documents/received.txt", "count=" + str(count) + "\ntotal=" + str(total) + "\n");
    sys_exit();
  } else {
    sys_log("收到未知消息: " + m.type);
  }
}
