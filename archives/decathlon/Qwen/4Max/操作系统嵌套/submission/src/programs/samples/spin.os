// 持续计算：循环中不主动等待或让出执行权，用于检验调度公平性。
// 它应当与消息、计时、动画等进程同时持续取得执行机会。
var x = 0;
var rounds = 0;
while (true) {
  x = x + 1;
  if (x >= 100000) {
    x = 0;
    rounds = rounds + 1;
    sys_log("持续计算 第 " + str(rounds) + " 轮");
  }
}
