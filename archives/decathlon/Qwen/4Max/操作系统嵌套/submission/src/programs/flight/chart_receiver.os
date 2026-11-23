// 数据接收进程：订阅根系统工作簿选区，按序把完整版本交给图表进程。
var me = sys_self();
var args = sys_args();
var chartPid = args[0];
var subId = 0;
var lastVersion = 0;
while (true) {
  var m = sys_recv();
  if (m.type == "connect") {
    var pl = m.payload;
    if (subId != 0) { sys_unsubscribe({ subId: subId }); subId = 0; lastVersion = 0; }
    var r = sys_subscribe({ workbookId: pl.workbookId, range: pl.range, labelCol: pl.labelCol, seriesCols: pl.seriesCols });
    if (r.ok) {
      subId = r.subId;
      lastVersion = r.version;
      sys_send(chartPid, "subscribed", { subId: subId, version: r.version, data: r.data, title: pl.title });
    } else {
      sys_send(chartPid, "sub_error", { error: r.error });
    }
  } else if (m.type == "disconnect") {
    if (subId != 0) { sys_unsubscribe({ subId: subId }); subId = 0; }
  } else if (m.type == "data") {
    var d = m.payload;
    if (d.closed) {
      sys_send(chartPid, "chart_data", { closed: true });
      subId = 0;
    } else if (d.version > lastVersion) {
      lastVersion = d.version;
      sys_send(chartPid, "chart_data", { version: d.version, data: d.data });
    }
  }
}
