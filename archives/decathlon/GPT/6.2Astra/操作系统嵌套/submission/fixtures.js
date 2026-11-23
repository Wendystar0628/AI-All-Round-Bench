const PATH = {
  scene: "/Demo/helicopter-24.scene",
  book: "/Demo/sample.sheet",
  kernel: "/System/kernel.str",
  wm: "/System/window.str",
  compiler: "/System/compiler.str",
  control: "/Programs/flight.str",
};
const SAMPLE = {
  A1: "项目",
  B1: "数量",
  C1: "单价",
  D1: "小计",
  A2: "项目 A",
  B2: "24",
  C2: "6",
  D2: "=B2*C2",
  A3: "项目 B",
  B3: "12",
  C3: "8",
  D3: "=B3*C3",
  A4: "项目 C",
  B4: "18",
  C4: "4",
  D4: "=B4*C4",
};
const KERNEL = `# STRATA / 内核 1.0
# 每轮选择进程并委派最多 96 个指令单位
@main
cursor = (cursor + 1) % count()
pid = slot(cursor)
if status(pid) != "sleep" goto dispatch
if clock() < deadline(pid) goto main
ready(pid)
@dispatch
if status(pid) != "ready" goto main
run(pid, 96)
goto main

@boot
manager = spawn("/System/window.str")
bootApp("player")
return manager
@send
if status(arg0) == "ended" goto missing
if status(arg0) == "error" goto missing
if status(arg0) == "absent" goto missing
deliver(arg0, arg1)
if status(arg0) != "waiting" goto delivered
ready(arg0)
@delivered
return true
@missing
return false
@list
return directory(arg0)
@mkdir
return makeDir(arg0)
@move
return renamePath(arg0,arg1)
@read
return fileGet(arg0)
@write
return filePut(arg0, arg1)
@time
return clock()
@identity
return self()
@launch
return spawn(arg0,arg1)
@end
return terminate(arg0)
@double
return arg0 * 2
@display
return submit(arg0)
`;
const COMPILER = `# STR → 字节码：标签定位、控制流生成和表达式操作数
@main
i = 0
@next
if i >= length(lines) goto done
line = trim(at(lines,i))
i = i + 1
if line == "" goto next
if first(line) == "#" goto next
if first(line) == "@" goto label
op = word(line)
arg = afterWord(line)
if op == "if" goto branch
if op == "goto" goto jump
if op == "call" goto jump
if op == "ret" goto stop
if op == "wait" goto unary
if op == "receive" goto unary
if op == "return" goto unary
if op == "halt" goto stop
name = assignment(line)
if name != "" goto store
emit(["expr",line])
goto next
@label
label(tail(line))
goto next
@branch
split = lastIndex(arg," goto ")
if split < 0 goto invalid
emit(["if",slice(arg,0,split),slice(arg,split+6,length(arg))])
goto next
@jump
emit([op,arg])
goto next
@unary
emit([op,arg])
goto next
@stop
emit([op])
goto next
@store
emit(["let",name,afterEquals(line)])
goto next
@invalid
fail("条件分支缺少 goto")
@done
return image()`;
const WM = `# 输入消息经窗口管理器派送
@main
receive event
id = target(event)
if event.action == "frame" goto command
if event.action == "dragBegin" goto begin
if event.action == "dragMove" goto motion
if event.action == "dragEnd" goto finish
if event.action != "pointer" goto dispatch
i = 0
best = -1
id = ""
@scan
if i >= windows() goto chosen
box = bounds(i)
i = i + 1
if box.visible == false goto scan
if event.x < box.x goto scan
if event.y < box.y goto scan
if event.x > box.right goto scan
if event.y > box.bottom goto scan
if box.z < best goto scan
id = box.id
best = box.z
goto scan
@chosen
focus(id)
@dispatch
route(id,event)
goto main
@command
frameState(id,event.mode)
goto main
@begin
dragId = id
anchorX = event.x
anchorY = event.y
origin = frameRect(id)
mode = event.mode
moved = false
goto main
@motion
if id != dragId goto main
dx = event.x - anchorX
dy = event.y - anchorY
if moved goto layout
if abs(dx) + abs(dy) < 3 goto main
moved = true
@layout
x = origin.x
y = origin.y
width = origin.width
height = origin.height
if mode != "move" goto resize
x = x + dx
y = y + dy
if origin.state == "normal" goto apply
x = event.x - width * 0.5
y = event.y - 15
goto apply
@resize
if contains(mode,"w") goto west
if mode == "resize" goto east
if contains(mode,"e") goto east
goto vertical
@west
x = min(origin.x+origin.width-220,max(0,origin.x+dx))
width = origin.x+origin.width-x
goto vertical
@east
width = max(220,min(origin.areaWidth-x,width+dx))
@vertical
if contains(mode,"n") goto north
if mode == "resize" goto south
if contains(mode,"s") goto south
goto apply
@north
y = min(origin.y+origin.height-140,max(0,origin.y+dy))
height = origin.y+origin.height-y
goto apply
@south
height = max(140,min(origin.areaHeight-y,height+dy))
@apply
place(id,max(0,min(origin.areaWidth-70,x)),max(0,min(origin.areaHeight-32,y)),width,height)
goto main
@finish
if id != dragId goto main
dragId = ""
if moved == false goto main
if mode != "move" goto main
if event.x < 12 goto left
if event.x > origin.areaWidth-12 goto right
if event.y < 5 goto full
goto main
@left
frameState(id,"left")
goto main
@right
frameState(id,"right")
goto main
@full
frameState(id,"full")
goto main`;
const FLIGHT = `# 高度与姿态反馈；总距、横滚和转向
@main
s = sensors()
collective = 9.81 + (s.target - s.y) * 2.0 - s.vy * 1.8
rudder = -s.roll * 4.8 - s.spin * 2.5
actuate(collective,rudder,s.heading)
wait 0.06
goto main`;
const PROGRAMS = {
  "交互仪表.str": `# 便携绘图程序 · 单击移动标记
x = 320
y = 180
@draw
display([{type:"rect",x:0,y:0,width:640,height:360,fill:"#273f37"},{type:"circle",cx:x,cy:y,r:28,fill:"#e5ef9c"},{type:"text",x:25,y:42,text:"FIELD SIGNAL  /  单击标记位置",fill:"#e3e8d2"}])
receive event
if event.action != "click" goto draw
x = event.x
y = event.y
goto draw`,
  "累加.str": `n = 0
sum = 0
@loop
n = n + 1
sum = sum + n
if n < 100 goto loop
print(sum)
write("/Documents/累加结果.txt",sum)
halt`,
  "持续计算.str": `n = 0
@loop
n = n + 1
goto loop`,
  "消息接收.str": `@loop
receive msg
print(msg)
goto loop`,
  "消息发送.str": `pid = find("消息接收.str")
result = send(pid,"来自高地站的消息")
print(result)
halt`,
};
const APP_PROGS = {
  spreadsheet: `@main
receive job
if job.action != "calculate" goto main
addresses = keys(job.cells)
values = {}
i = 0
@cell
if i >= length(addresses) goto publish
address = at(addresses,i)
values = entry(values,address,formula(job.cells,address))
i = i + 1
goto cell
@publish
commitBook(job,values)
goto main`,
  player: `@loop
event = poll()
input(event)
now = time()
dt = (now - app("lastClock")) * app("rate")
setApp("lastClock",now)
if app("state") != "playing" goto sample
if app("rehearsal") goto live
t = app("position") + dt
if t < app("duration") goto advance
if app("loop") goto repeat
t = app("duration")
setApp("state","paused")
goto advance
@repeat
t = t % app("duration")
@advance
setApp("position",t)
goto sample
@live
owed = dt
@substep
h = min(0.025,owed)
call integrate
owed = owed - h
if owed > 0.000001 goto substep
@sample
t = app("position")
if t != last goto publish
if event == null goto rest
@publish
send(app("scenePid"),poseAt(t))
send(app("fxPid"),t)
last = t
@rest
wait 0.025
goto loop
# 刚体积分。u 为被保持的控制量，f 为上一完整物理采样。
@integrate
if h <= 0 goto doneStep
if app("state") != "playing" goto doneStep
sample = physicsInput(h)
f = sample.flight
u = sample.signal
t0 = sample.t
if f.contact goto aftermath
lift = min(24,max(0,at(u.c,0)))
disturb = 0
if u.fault == false goto balance
lift = lift * 0.28
disturb = 2.8
@balance
spin = f.spin + (at(u.c,1)+1.55*f.roll+0.28*sin(t0*2.4)+u.wind*0.09+disturb)*h
roll = f.roll + spin*h
vy = f.vy + (lift*cos(roll)-9.81)*h
y = f.y + vy*h
yaw = f.yaw + (at(u.c,2)-f.yaw)*h*1.6
vxGoal = sample.speed*cos(yaw)
vzGoal = sample.speed*sin(yaw)
if u.landing == false goto velocity
vxGoal = max(-3,min(3,sample.padX-f.x))
vzGoal = max(-3,min(3,sample.padZ-f.z))
@velocity
vx = f.vx + (vxGoal+u.wind*0.24-f.vx)*h
vz = f.vz + (vzGoal+sin(roll)*2-f.vz)*h
x = f.x + vx*h
z = f.z + vz*h
tilt = f.tilt + (-vx*0.045-disturb*0.160714-f.tilt)*h*2.8
contact = null
if y >= sample.ground goto commit
y = sample.ground
if vy >= -2.4 goto landed
contact = {t:t0,x:x,y:y,z:z,vx:vx,vz:vz,roll:roll,tilt:tilt}
@landed
vy = 0
@commit
commitFlight(h,{x:x,y:y,z:z,vx:vx,vy:vy,vz:vz,roll:roll,spin:spin,yaw:yaw,tilt:tilt,contact:contact},u)
goto doneStep
@aftermath
c = f.contact
age = min(1.45,max(0,t0-c.t))
decay = 1-exp(-3*age)
x = c.x+c.vx*decay/3
z = c.z+c.vz*decay/3
y = c.y+max(0,0.26*sin(age*9)*exp(-3*age))
sign = 1
if c.roll >= 0 goto settle
sign = -1
@settle
roll = c.roll+sign*0.68*decay
tilt = c.tilt-0.29*(1-exp(-4*age))
commitFlight(h,{x:x,y:y,z:z,vx:f.vx,vy:0,vz:f.vz,spin:0,yaw:f.yaw,roll:roll,tilt:tilt,contact:c},u)
@doneStep
ret`,
  scene: `@loop
receive sample
display(sampleScene(sample))
goto loop`,
  fx: `@loop
receive sample
effect(sample)
goto loop`,
  charts: `@loop
receive event
if event.action != "packet" goto command
if event.token != app("token") goto loop
if event.version < app("ver") goto loop
rows = []
low = 0
high = 0
i = 0
@row
if i >= length(event.rows) goto layout
r = at(event.rows,i)
v = [at(r,0)]
j = 1
@series
if j >= length(r) goto store
n = numeric(at(r,j)) * 1
v = push(v,n)
low = min(low,n)
high = max(high,n)
j = j + 1
goto series
@store
rows = push(rows,v)
i = i + 1
goto row
@layout
span = max(1,high-low)
points = []
i = 0
@group
if i >= length(rows) goto submit
r = at(rows,i)
j = 1
@point
if j >= length(r) goto next
n = at(r,j)
points = push(points,{group:i,series:j-1,x:(i+0.5)/length(rows),y:(high-n)/span,value:n})
j = j + 1
goto point
@next
i = i + 1
goto group
@submit
display({kind:"chart",rows:rows,labels:event.labels,version:event.version,points:points,low:low,high:high,baseline:high/span})
goto loop
@command
chart(event,1)
goto loop`,
  copy: `# 在临时写集中逐项写入，由内核分派文件操作\nindex = 0\n@next\nif index >= length(items) goto finish\nitem = at(items,index)\nif item.folder goto folder\nwrite(item.path,item.value)\ngoto advance\n@folder\nmkdir(item.path)\n@advance\nindex = index + 1\ngoto next\n@finish\ncommitTransfer()\nhalt`,
  projection: `@loop
key = frameKey()
if last == key goto rest
publishSurface()
last = key
@rest
wait 0.025
goto loop`,
  receiver: `@loop
receive packet
forward(packet)
goto loop`,
  files: `@loop
receive event
if event.action == "render" goto navigate
if event.action == "create" goto create
if event.action == "open" goto open
if event.action == "move" goto move
goto loop
@navigate
setApp("path",event.path)
goto list
@open
openDocument(event.file,"auto")
goto loop
@create
if event.folder goto folder
write(event.file,"")
goto created
@folder
mkdir(event.file)
@created
notice("已创建 "+event.file)
goto list
@move
move(event.file,event.to)
notice("文件已移动至 "+event.to)
@list
entries = sort(list(app("path")),"ascending")
display(entries)
goto loop`,
};
const DEFAULT_LAYOUTS = {
  files: ["toolbar", "toolbar", "sidegrid", "status"],
  player: ["toolbar", "flightbar", "viewbox", "playcontrols", "status"],
  charts: ["toolbar", "toolbar", "apphead", "chartbox", "status"],
  editor: ["toolbar", "edittext", "status"],
  tasks: ["apphead", "toolbar", "panel"],
  settings: ["apphead", "panel"],
  systems: ["apphead", "toolbar", "panel"],
  help: ["apphead", "panel"],
  widgets: ["apphead", "panel"],
  notifications: ["apphead", "panel"],
};
for (let [app, sections] of Object.entries(DEFAULT_LAYOUTS)) {
  let source = APP_PROGS[app] || "@loop\nreceive event\ngoto loop";
  let tag = "display(" + JSON.stringify({ surface: app, sections }) + ")\n";
  if (source.includes("receive event"))
    source = source.replace(
      "receive event",
      'receive event\nif event.action != "command" goto input\ninvoke(event)\ngoto loop\n@input',
    );
  APP_PROGS[app] = tag + source;
}
function initialFiles() {
  let files = {
    "/Demo": null,
    "/Documents": null,
    "/Downloads": null,
    "/Trash": null,
    "/Programs": null,
    "/System": null,
    [PATH.scene]: JSON.stringify(DEFAULT_SCENE),
    [PATH.book]: JSON.stringify(SAMPLE, null, 2),
    [PATH.kernel]: KERNEL,
    [PATH.compiler]: COMPILER,
    [PATH.wm]: WM,
    [PATH.control]: FLIGHT,
    "/Documents/站点日志.txt":
      "高地观测站 · 观测日志\n\n风从西南山谷吹来。24 号机已完成出航准备。",
    "/System/station.json": JSON.stringify({ budget: 24000, step: 0.05 }),
  };
  for (let [k, v] of Object.entries(PROGRAMS)) files["/Programs/" + k] = v;
  for (let [k, v] of Object.entries(APP_PROGS))
    files["/System/" + k + ".str"] = v;
  return files;
}
