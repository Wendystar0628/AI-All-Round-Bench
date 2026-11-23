// 消息发送：向接收程序发送一组消息，并核对发送结果
var args = sys_args();
var target = 0;
if (args != null && len(args) > 0) { target = num(args[0]); }
if (target == 0) {
  var r = sys_spawn("/Programs/receiver.os", "消息接收", null);
  if (!r.ok) { sys_log("启动接收程序失败: " + r.error); sys_exit(); }
  target = r.pid;
}
var i = 1;
while (i <= 5) {
  var res = sys_send(target, "number", { value: i * 10, text: "消息 " + str(i) });
  if (!res.ok) { sys_log("发送失败: " + res.error); }
  else { sys_log("已发送 消息 " + str(i) + " 值 " + str(i * 10)); }
  sys_wait(300);
  i = i + 1;
}
sys_send(target, "done", {});
sys_log("发送完毕");
