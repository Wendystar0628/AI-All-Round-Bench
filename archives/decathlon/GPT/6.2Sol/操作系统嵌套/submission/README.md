# 层栈 · Strata OS

## 启动

在项目目录中运行 npm install，然后运行 npm start。首次打开显示根桌面。
可选参数写法：
  npm start -- --data-dir "C:\Temp\strata-test" --width 1440 --height 900 --remote-debugging-port=19106

默认运行数据在 Windows 临时目录的 strata-os-data 内。程序源文件、场景和桌面资产随项目交付。只有 Chromium 浏览器访问外网。自动化入口在 automation.json 中。主页面暴露 window.bench.version、ready()、reset() 和 inspect()。

## 桌面与系统树

双击桌面图标，或在左下角开始菜单搜索应用。任务栏切换和收起窗口，标题栏可拖动，拖到左右边缘贴靠。子系统标题栏的最小化保持该子树运行，关闭前会确认。子桌面右上角箭头返回父桌面。
点击「启动子系统」后可在系统树中打开、暂停、继续、单步、调速、重启、取快照、恢复和分叉。每次逻辑步 40 ms。后代的时间速率与祖先相乘。祖先暂停或承载进程挂起时子树均冻结；运行中的系统即使暂未取得执行额度，虚拟时钟也会推进，待处理工作保留。
「创建快照」在父系统的 /Snapshots 写入快照文件。快照以引用表保存共享变量和跨步调用帧，旧版 JSON 快照也可读取。通过「恢复」选择文件覆盖原子树，或用「分叉」/双击快照文件建立独立节点。恢复前打开的根工作簿保持原状，恢复后的图表需重新连接。
文件管理器侧栏可到演示资源、系统源文件、文档、下载、程序、快照和回收站。右键可重命名、剪切、删除、还原、导入和导出；Ctrl 或 Shift 点击可多选。拖动文件行到另一个桌面的文件列表可复制，目标路径在拖动时显示。一次传递在全部所选文件符合目标配额后提交，剪切源也在此后删除。

## 根桌面

示例工作簿在 /Demo/sample.sheet。可在公式栏左侧的地址框输入 AA9000 等地址并按 Enter 跳转。单击单元格后输入新值，双击可编辑现有公式，Enter 提交。按 Shift 或拖动可选区域，Ctrl+C 复制值，Ctrl+V 粘贴 TSV，Ctrl+Z 撤销，Ctrl+Y 重做。「标题样式」保存到文件。
公式重算由根系统的工作簿进程排队执行，状态栏显示已完成版本。公式支持加减乘除、括号、引用和 SUM（例如 =SUM(D2:D4)）。#DIV/0! 为除零，#CYCLE! 为循环，#REF! 为无效引用。工作簿 JSON 的 cells 对象存原始字符串或公式，format 按单元格地址存样式。
小组件包含日历、秒表、倒计时、便笺和剪贴板历史。托盘打开通知中心。应用内设置更换壁纸、强调色和缩放。
浏览器的外部站点使用隔离的 Chromium 客体。新窗口请求转为内部标签，网络错误显示在标签内容区。外网运行状态与网页数据独立于虚拟系统。

## Strata VM

.str 文件使用受限的 JavaScript 语法。支持 let、算术和比较、条件、while、for、赋值、数组、对象、成员读取和 return。用编辑器保存并运行，也可编辑 /Programs 下的示例。代码按指令切片，普通程序无法访问 DOM、Node.js、真实计时器或其他系统对象。
time() 取本系统时间（秒），sleep(s) 等待，self() 取本进程 PID。print(value) 写进程输出。
send(pid,value) 深复制并入队，返回 {ok,error?}；recv() 无消息时等待，poll() 无消息时返回 null。先运行「接收」，再运行「发送」并填接收进程 PID。
read(path)、write(path,text)、list(path)、mkdir(path)、move(from,to) 访问所在系统。spawn(path,args) 启动同系统程序，args 的字段成为启动变量。kill(pid) 结束进程。
display({items:[{type:"rect",x:30,y:30,width:200,height:80,color:"#67bdb1"},{type:"text",x:45,y:72,text:"你好"}]}) 提交 640×400 二维视图。
display({scene:sceneObject,frame:{x:0,y:1,z:0,yaw:0}}) 提交同一场景格式的三维输出，frame 可增加 t、roll、pitch、spin。进程结束前可以多次提交显示。程序画布保留最后提交的画面，关闭程序画布会结束仍在运行的所属进程。
数学函数包括 abs、sin、cos、sqrt、atan2、min、max，另有 len、copy、number、string。程序可声明和调用命名函数，数组可用 a[len(a)] = value 追加。
当前系统的 /System/compiler.str 定义 opcode(name) 映射。保存后点击「编译并启用」由旧编译器编译该文件，后续用户程序使用新编译器。可调换 expr、let、branch、jump、return 操作码观察效果。

## 内核、窗口与资源

每个子系统的源码位于父系统 /System/inner-N.str。「内核源码」会直接打开该文件。模板 /System/kernel.str 用于此后新建的系统。改写后保存，并从父系统的系统树重启。启动或调度错误会在相应节点显示。
boot() 启动窗口管理程序；choose(cursor,count) 由 ready(index) 选可运行进程。例：在循环前加入 if (ready(0)) return 0;，使首个就绪进程优先。
内核启动、onCall 和由发送进程触发的 deliver 可在拨付耗尽时跨步续行。onCall(op,args) 分发调用，例如在开头加入 if (op === "altitude") return 24;，随后程序可以 print(altitude())。
deliver(pid,value,from) 转换投递数据；file(mode,path,value) 可变更 read、list、write 结果。改变 file 的 read 分支也会影响编辑器。应用源文件在 /System。window.str 的 focus(z,highest) 决定窗口层序，input(clicked,focused,x,y,button) 决定是否接受命中。files.str 的 order() 决定排序，chart.str 的 value(n) 和 type(requested) 决定数值变换和图形类型。
调度器按步分配总量，进程额度和子系统上限限制单步用量。指令基础单位为 1，消息、复制和读写等按数据规模增加费用。大任务分期付款，在完成后提交结果。进程管理器显示每步/累计、待付费用、内存和队列，承载行单列子内核与内部工作。图形设备实际绘制与外部 Chromium 在费用边界之外。
进程内存按变量、队列、挂起工作及显示资源估算；文件存储按字符字节估算。祖先配额覆盖所有后代。内核与系统服务程序通过宿主的虚拟设备原语运行。语法解释、GUI 控件绘制与场景构造原语在宿主中实现。

## 场景、排演与投送

内置场景 /Demo/helicopter-24.scene，默认演出 15 秒、逐帧单位 1/30 秒。通过 node make-assets.mjs 可重新生成场景和壁纸。默认飞行记录在生成时用同一部机体程序积分，包括实际的控制、故障、接地时刻和位姿采样。播放和跳转读取记录，续演从其物理状态启动。可开多个播放器、改速率、拖动时间、输入时间、切镜头和循环。拖动场景或滚轮切到自由镜头。点击部件查看状态。
场景为 JSON。parts 每项定义 name、shape、material、p（位置）、s（尺寸）、r（可选旋转）、group（可选关节）。shape 支持 box、sphere、cylinder、taper、label。lighting 有天空和主灯参数，terrain 有地形规模和振幅，pads 定义停机坪，obstacles 定义可接触的障碍物，decor 定义标线和信标等场景细节。record.frames 每行包含 [秒,x,y,z,偏航,俯仰,侧滚]，可追加旋翼相位以及 vx、vy、vz、vpitch、vroll，另有可选 fault 和 impact。
最小示例，保存为 /Documents/box.scene：
  {"version":1,"title":"立方体","duration":3,"parts":[{"name":"盒子","shape":"box","material":"blue","p":[0,0,0],"s":[2,2,2]}],"material":{"blue":{"color":"#499fae","rough":0.5}},"lighting":{"sun":"#ffcf9b","intensity":3,"position":[-8,12,7]},"camera":{"position":[5,4,6],"target":[0,1,0],"fov":42}}

在任意帧选择「进入飞行排演」。风、航向、目标高度可编辑，点地面可设置目标方向。「飞往 02」设置第二停机坪为目标。等状态栏的目标距离小于 3 m 且水平速度小于 2.5 m/s，点击「在目标降落」由飞控减小高度。也可手动调节高度，或点击地面改变目标。故障影响旋翼推力和偏航；预算、飞控挂起或时间倍率会改变控制节拍。
打开 /Programs/flight.str 编辑飞控。sensor() 返回 t、time、x、y、z、roll、pitch、yaw、vx、vy、vz、vroll、vpitch、wind、heading、goalX、goalZ、target、power。长度单位米，角度弧度，时间秒。control({lift,roll,pitch,yaw}) 写总距倍率、侧滚/俯仰控制与目标偏航；控制保持至下次写入。选择飞控程序可在排演中更换控制逻辑。
「保存记录」写 .flight，包含 scene、duration 和 record：连续飞行帧、初态、用户输入和控制写入的时序。再次打开可逐帧取样，或从当前帧开始新的排演。场景播放器的时序源文件是 /System/timeline.str，按虚拟时钟给空架与特效进程发送采样请求。/System/airframe.str 包含飞行状态积分和接地逻辑，/System/effects.str 可以改变烟尘强度。
源窗口点击「投送窗口」并选择祖先。目标桌面管理外框；应用输入在源系统进程中执行，投送显示源提交的副本。源窗口最小化仍更新；子树暂停时投送冻结。

## 图表数据

先在根桌面打开 .sheet，再到子系统选择工作簿、矩形区域、标签列和数值列。指定多个数值列时用逗号分隔，例如 B,D。示例使用 A1:D4、A、D。可切换柱状图和折线图，点数据查看值。较长的数据集可翻页，两种图表在所有页使用统一数值轴。改动表格、撤销和粘贴会经版本化消息更新连接，断开后保留上一次结果。恢复/分叉后可重新连接。
