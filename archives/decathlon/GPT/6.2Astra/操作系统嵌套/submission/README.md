# 层野 · STRATA OS

Windows 桌面项目，Electron 45.2.1。首次准备依赖运行 `npm install`，启动入口为 `npm start`。调试端口默认为 19106。

`npm start -- --data-dir "%TEMP%\strata-test" --width 1440 --height 900 --remote-debugging-port=19106`

层野 STRATA OS · 高地站操作手册

桌面与系统树
单击选择应用，双击启动。开始菜单可搜索应用。拖动标题栏移到左右边界贴靠，双击最大化；右下角调整窗口尺寸。任务栏按钮收起或恢复窗口。右键空白处打开桌面菜单，Esc 收起。点击「启动子系统」进入新节点；每个子桌面的开始菜单都可继续创建下一级。窗口上方深绿控制条归父层所有，可以暂停、继续、单步、重启、打开内核和进入管理。管理器提供时间速率、停止、快照与分叉。

程序语言 STR
程序是以 .str 结尾的文本。每行一条指令，# 开头为注释，@name 定义标签。标量、数组、消息和运行位置均可保存。支持赋值、四则运算、比较、成员访问、if 表达式 goto 标签、goto 标签、wait 秒、receive 变量、return 表达式 和 halt。编辑器内打开 /Programs/累加.str，修改循环上限，保存后点运行。在进程管理器查看输出，或打开 /Documents/累加结果.txt。消息程序先启动接收端，再启动发送端。find("消息接收.str") 返回实例内目标 PID。send(pid,value) 复制消息到该进程，receive 没有消息时等待。time() 返回虚拟时间，identity() 返回进程编号，launch(path)、end(pid)、read(path)、write(path,value)、print(value) 分别启动、结束、读写和打印。持续计算示例无需主动等待。

可编辑内核
每个新节点的内核位于父系统 /System/inner-N.str。父系统点击「内核」可编辑。修改后保存，再重启目标实例。@main 轮询 slot(cursor)，run(pid,96) 分派一段预算；可以改动每次分派长度、增加条件改变优先级。@send 中将 deliver(arg0,arg1) 改成 deliver(arg0,"站点 / "+arg1) 可改变消息内容。@read 和 @write 定义文件服务。增加 @triple 并在下一行写 return arg0 * 3，即可在该系统的用户程序中调用 triple(4)。@display 提交显示状态。语法错误会停止本节点，修复源文件后重启。/System/compiler.str 是逐行编译程序；lines 为输入源行，emit(line) 写入输出。它在启动程序前参与编译。/System/window.str 接收并分发窗口输入；/System/files.str 中将 ascending 改为 descending 可倒序排列。/System/charts.str 的 n = numeric(at(r,j)) * 1 的乘数是数值倍率。改动应用程序后关闭并重新打开应用。

计量、快照与时间
逻辑步为 0.05 秒，速率改变虚拟时间，不增加执行预算。解释器执行一条指令消耗一个单位；内核运行一条调度指令也消耗一个单位，分派的后代工作从同一拨付余额扣除。任务管理器提供本步、累计指令数、队列和剩余工作。内存读数为序列化程序与应用数据大小估算，存储按 UTF-16 字节估算。宿主像素绘制和真实 Chromium 网页不在逻辑预算内。暂停保留等待条件与程序位置；从父窗口单步只推进一次。快照保存为父系统 /Documents/inner-N.snap。文件管理器可导出、导入，双击快照创建独立分叉。恢复图表保留缓存，需要重新连接。

文件、表格与数据连接
示例资源在 /Demo。文件列表支持 Ctrl 多选与跨系统拖放；文件右键可用编辑器打开。删除移入回收站。sample.sheet 是以单元格地址为键、原始文本或公式为值的 JSON 对象。单击格子后输入，双击或 F2 修改；Enter 提交。拖选区域，Ctrl+C / V 复制粘贴，Ctrl+Z / Y 撤销重做。公式支持四则、括号、SUM 和区域，例如 =SUM(D2:D4)。根桌面打开工作簿，在任意子系统的图表工作台选择工作簿、包含表头的区域、标签列与数值列（多列用逗号分隔），再点击连接。表格提交后，即使未保存，也会向订阅系统发布完整区域的副本。接收进程与图表进程分开运行。投送选择祖先系统，窗口外框归目标，图表与播放器输入返回源进程。最小化源窗口不会停止播放。

三维资源与飞行
/Demo/helicopter-24.scene 为 JSON 数据。nodes 按父节点优先排列；id 是部件名，parent 为父节点，shape 支持 box、ball、cyl、cone、rock、pine、ring、rod、label 和 group，p 是位置，size 是尺寸，rot 是弧度欧拉角，color 是颜色。light 为方向光位置，cameras 为相对取景点的偏移数组。motion.keys 每行是 [秒,x,y,z,俯仰,偏航,横滚]，body、rotor、tail 引用部件名。最小场景如下。
{"title":"测试立方体","duration":5,"sky":"#bccac6","light":[8,16,5],"cameras":[[5,3,7]],"nodes":[{"id":"样机","shape":"box","p":[0,1,0],"size":[2,2,2],"color":"#745689"}]}

播放、暂停、停止、逐帧（1/30 秒）、进度条、速率与循环均位于播放器底栏。选择自由环绕后可拖动，滚轮调距。点击部件查看名称。飞行排演可从当前时刻开始，调整风与航向，触发故障，切换飞控或要求着陆。/Programs/flight.str 读取 sensors() 的 time、y、vy、roll、spin、target、heading，调用 actuate(总距加速度,横滚加速度,目标偏航)；控制量保持到下次写入。物理时序、场景、环境与飞控分别占用进程。保存记录生成 /Documents/*.flight，包含资源与带输入和控制量的状态采样；双击打开后可跳转或从该位置续演。浏览器使用真实网络与独立 Chromium 网页，站点登录或网络条件会影响播放。


扩展显示与资源
/Programs/交互仪表.str 演示自定义二维窗口。display 接受包含 rect、circle、line、text 图元的数组，也可接收带 width、height 和 items 的对象；坐标基于逻辑画布。点击窗口后 receive 可取得带 x、y 的输入消息。文件管理程序经 list、sort、display 取得和展示目录，并在自己的消息循环里处理 create、open、move。窗口管理程序扫描 bounds(i) 的矩形和实际 z 次序，@chosen 决定焦点，route 分发输入。编译器编辑器的「编译自身」按钮使用当前编译程序处理自身的源码，成功后保存并载入结果。

表格工具栏可给选区设粗体和底色，格式保存在工作簿的 $format 字段。图表支持负数、多数值列与虚拟时间过渡。排演参考记录通过同一套刚体积分计算生成，motion.controls 保存参考控制时序。资源还支持 mesh（三角形顶点数组 verts）、grass（实例化参数 instances）与 peak。显示设备共用一个 WebGL 上下文，每个窗口按自己的可见尺寸取景。

快照由父系统的写入进程分段付费，文件写入完成后会收到通知。PID 在所属系统内解析；分叉保留局部 PID，新的系统 ID 隔离消息身份。自定义程序结束后释放变量、队列和未完成工作，管理器保留累计指令及输出。

## 项目构成

运行时从内置资源初始化每个实例独立的虚拟文件系统。可直接阅读的预置源程序位于 `assets/System` 和 `assets/Programs`，示例表格位于 `assets/Demo/sample.sheet`，独立场景位于 `assets/helicopter-24.scene`。壁纸为原创矢量素材 `highland.svg`。

内核的 `@boot` 通过 `spawn` 启动窗口管理程序，通过 `bootApp("player")` 指定默认应用。应用编译任务保存当前源行、指令位置和已发射指令，在所属进程的执行额度内推进。子系统应用从文件中提交界面分区次序；窗口管理程序对矩形进行命中测试并分派输入。显示设备提供复用的界面控件、二维图元与三维绘制。内存读数使用逻辑大小估算，宿主 DOM、GPU 驱动和 Chromium 的物理内存不包含在该读数中。

根目录的 `automation.json` 列出测试启动参数。自动化接口在主窗口的 `window.bench` 上；`ready()`、`inspect()` 与 `reset()` 均返回 Promise。
