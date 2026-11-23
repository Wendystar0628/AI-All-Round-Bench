// maps.js —— 地图数据、场景搭建、环境装饰、路线可视化
(function () {
  const M = {};
  G.maps = M;
  const CELL = 4;

  // ============================================================
  // 地图数据
  // ============================================================
  // 节点: {id, gx, gz, kind, name?, color?}
  // 边: {a, b, old?}  权重 = 长度 * (old? 1.9 : 1)；协议降级时视为 old
  const MAPS = [
    {
      id: 'map1', name: '分段内网', sub: '企业内网 · 14 波', waves: 14,
      desc: '门户网站与邮件网关接入 DMZ，南端是核心数据库。办公网段与业务网段经 DMZ 互联和旧链路相接，外围旧系统网段与灾备环亦可绕行。',
      size: [13, 10],
      nodes: [
        { id: 'A', gx: 0, gz: 1, kind: 'entry', name: '门户网站', color: 0x3ee6ff },
        { id: 'B', gx: 12, gz: 1, kind: 'entry', name: '邮件网关', color: 0xffb020 },
        { id: 'j1', gx: 4, gz: 1, kind: 'junction', name: 'DMZ 西' },
        { id: 'j2', gx: 8, gz: 1, kind: 'junction', name: 'DMZ 东' },
        { id: 'jw', gx: 2, gz: 3, kind: 'junction', name: '西边界' },
        { id: 'jo', gx: 3, gz: 5, kind: 'junction', name: '办公网段' },
        { id: 'jm', gx: 6, gz: 5, kind: 'junction', name: '旧链路中点' },
        { id: 'jb', gx: 9, gz: 5, kind: 'junction', name: '业务网段' },
        { id: 'cf', gx: 6, gz: 3, kind: 'junction', name: '核心前节点' },
        { id: 'wl', gx: 2, gz: 7, kind: 'junction', name: '旧系统西' },
        { id: 'el', gx: 10, gz: 7, kind: 'junction', name: '旧系统东' },
        { id: 'dr', gx: 3, gz: 9, kind: 'junction', name: '灾备西' },
        { id: 'dr2', gx: 9, gz: 9, kind: 'junction', name: '灾备东' },
        { id: 'X', gx: 6, gz: 9, kind: 'exit', name: '核心数据库', color: 0x59f29b },
        { id: 'p1', gx: 4, gz: 3, kind: 'platform' },
        { id: 'p2', gx: 8, gz: 3, kind: 'platform' },
        { id: 'p3', gx: 1, gz: 5, kind: 'platform' },
        { id: 'p4', gx: 11, gz: 5, kind: 'platform' },
        { id: 'p5', gx: 5, gz: 7, kind: 'platform' },
        { id: 'p6', gx: 7, gz: 7, kind: 'platform' },
        { id: 'o1', gx: 1, gz: 2, kind: 'obstacle' },
        { id: 'o2', gx: 11, gz: 2, kind: 'obstacle' },
        { id: 'o3', gx: 0, gz: 8, kind: 'obstacle' },
        { id: 'o4', gx: 12, gz: 8, kind: 'obstacle' }
      ],
      edges: [
        { a: 'A', b: 'j1' }, { a: 'A', b: 'jw' },
        { a: 'j1', b: 'j2' }, { a: 'j2', b: 'B' },
        { a: 'j1', b: 'jo' }, { a: 'jw', b: 'jo' },
        { a: 'j2', b: 'jb' }, { a: 'B', b: 'jb' },
        { a: 'jo', b: 'jm', old: true }, { a: 'jm', b: 'jb', old: true },
        { a: 'jm', b: 'cf' }, { a: 'jb', b: 'cf' },
        { a: 'cf', b: 'X' },
        { a: 'jo', b: 'wl', old: true }, { a: 'wl', b: 'dr', old: true }, { a: 'dr', b: 'X', old: true },
        { a: 'jb', b: 'el', old: true }, { a: 'el', b: 'dr2', old: true }, { a: 'dr2', b: 'X', old: true }
      ],
      boss: 'wankui', bossName: '万傀',
      env: { fog: 0x060b14, ground: 0x0a1420, accent: 0x3ee6ff, accent2: 0x2dd4bf, theme: 'office' }
    },
    {
      id: 'map2', name: '骨干流域', sub: '跨网骨干 · 15 波', waves: 15,
      desc: '互联网、分支专线与云端互联在此交汇，互为备份的数据中心 X、Y 隔公网流相望。专线隧道与旧专线构成不同的跨越点，隔离汇聚节点可整体改换目的地。',
      size: [15, 11],
      nodes: [
        { id: 'A', gx: 0, gz: 3, kind: 'entry', name: '互联网', color: 0x3ee6ff },
        { id: 'C', gx: 7, gz: 0, kind: 'entry', name: '分支专线', color: 0x59f29b },
        { id: 'B', gx: 14, gz: 3, kind: 'entry', name: '云端互联', color: 0xffb020 },
        { id: 'jt1', gx: 4, gz: 3, kind: 'junction', name: '专线隧道西' },
        { id: 'jc', gx: 7, gz: 2, kind: 'junction', name: '分支接入' },
        { id: 'jm', gx: 9, gz: 2, kind: 'junction', name: '汇聚节点' },
        { id: 'jb', gx: 12, gz: 3, kind: 'junction', name: '云端接入' },
        { id: 'jx', gx: 7, gz: 4, kind: 'junction', name: '北环节点' },
        { id: 'X', gx: 7, gz: 5, kind: 'exit', name: '数据中心 X', color: 0x59f29b },
        { id: 'ja', gx: 2, gz: 5, kind: 'junction', name: '西湾' },
        { id: 'js', gx: 4, gz: 7, kind: 'junction', name: '南峡西' },
        { id: 'jy', gx: 7, gz: 7, kind: 'junction', name: '南环中' },
        { id: 'je', gx: 10, gz: 7, kind: 'junction', name: '南峡东' },
        { id: 'Y', gx: 7, gz: 9, kind: 'exit', name: '数据中心 Y', color: 0x59f29b },
        { id: 'p1', gx: 3, gz: 4, kind: 'platform' },
        { id: 'p2', gx: 9, gz: 4, kind: 'platform' },
        { id: 'p3', gx: 5, gz: 6, kind: 'platform' },
        { id: 'p4', gx: 11, gz: 5, kind: 'platform' },
        { id: 'p5', gx: 3, gz: 8, kind: 'platform' },
        { id: 'p6', gx: 9, gz: 8, kind: 'platform' },
        { id: 'o1', gx: 5, gz: 5, kind: 'obstacle' },
        { id: 'o2', gx: 6, gz: 6, kind: 'obstacle' },
        { id: 'o3', gx: 8, gz: 6, kind: 'obstacle' },
        { id: 'o4', gx: 9, gx2: 0, gz: 5, kind: 'obstacle' },
        { id: 'o5', gx: 12, gz: 6, kind: 'obstacle' },
        { id: 'o6', gx: 2, gz: 6, kind: 'obstacle' }
      ],
      edges: [
        { a: 'A', b: 'ja' }, { a: 'A', b: 'jt1' },
        { a: 'jt1', b: 'jx' }, { a: 'jx', b: 'X' },
        { a: 'C', b: 'jc' }, { a: 'jc', b: 'jm', old: true },
        { a: 'jm', b: 'jx' }, { a: 'jm', b: 'jb', old: true },
        { a: 'B', b: 'jb' }, { a: 'jb', b: 'jx' },
        { a: 'ja', b: 'js' }, { a: 'js', b: 'jy' }, { a: 'jy', b: 'Y' },
        { a: 'je', b: 'jy' }, { a: 'je', b: 'jb' }, { a: 'jb', b: 'Y' },
        { a: 'ja', b: 'jt1' }, { a: 'js', b: 'jy', old: true },
        { a: 'jc', b: 'jx' }
      ],
      boss: 'mirage', bossName: '蜃楼',
      env: { fog: 0x070d18, ground: 0x0a1626, accent: 0x3ecfff, accent2: 0x2dd4bf, theme: 'backbone' }
    },
    {
      id: 'map3', name: '气隙深层', sub: '工控网络 · 16 波', waves: 16,
      desc: '运维跳板机、办公网下行与供应商远程维护围绕中央气隙接入，过程控制核心与安全联锁核心并立南北。运维环环绕气隙连通两侧，老工控总线构成缓慢支路。',
      size: [15, 13],
      nodes: [
        { id: 'A', gx: 1, gz: 1, kind: 'entry', name: '运维跳板机', color: 0x3ee6ff },
        { id: 'B', gx: 13, gz: 1, kind: 'entry', name: '办公网下行', color: 0xffb020 },
        { id: 'C', gx: 7, gz: 0, kind: 'entry', name: '供应商远程维护', color: 0x59f29b },
        { id: 'n1', gx: 5, gz: 2, kind: 'junction', name: '北环西' },
        { id: 'n2', gx: 9, gz: 2, kind: 'junction', name: '北环东' },
        { id: 'w1', gx: 3, gz: 4, kind: 'junction', name: '运维环西北' },
        { id: 'w2', gx: 2, gz: 6, kind: 'junction', name: '运维环西' },
        { id: 'w3', gx: 2, gz: 8, kind: 'junction', name: '运维环西南' },
        { id: 'w4', gx: 4, gz: 10, kind: 'junction', name: '运维环南西' },
        { id: 'e1', gx: 11, gz: 4, kind: 'junction', name: '运维环东北' },
        { id: 'e2', gx: 12, gz: 6, kind: 'junction', name: '运维环东' },
        { id: 'e3', gx: 12, gz: 8, kind: 'junction', name: '运维环东南' },
        { id: 'e4', gx: 10, gz: 10, kind: 'junction', name: '运维环南东' },
        { id: 's1', gx: 6, gz: 11, kind: 'junction', name: '南通道西' },
        { id: 's2', gx: 8, gz: 11, kind: 'junction', name: '南通道东' },
        { id: 'bw', gx: 4, gz: 8, kind: 'junction', name: '老总线西' },
        { id: 'be', gx: 10, gz: 8, kind: 'junction', name: '老总线东' },
        { id: 'X', gx: 5, gz: 12, kind: 'exit', name: '过程控制核心', color: 0x59f29b },
        { id: 'Y', gx: 9, gz: 12, kind: 'exit', name: '安全联锁核心', color: 0x59f29b },
        { id: 'p1', gx: 4, gz: 3, kind: 'platform' },
        { id: 'p2', gx: 10, gz: 3, kind: 'platform' },
        { id: 'p3', gx: 1, gz: 4, kind: 'platform' },
        { id: 'p4', gx: 13, gz: 4, kind: 'platform' },
        { id: 'p5', gx: 5, gz: 5, kind: 'platform' },
        { id: 'p6', gx: 9, gz: 5, kind: 'platform' },
        { id: 'p7', gx: 3, gz: 11, kind: 'platform' },
        { id: 'p8', gx: 11, gz: 11, kind: 'platform' },
        { id: 'og1', gx: 6, gz: 4, kind: 'obstacle' },
        { id: 'og2', gx: 7, gz: 5, kind: 'obstacle' },
        { id: 'og3', gx: 8, gz: 4, kind: 'obstacle' },
        { id: 'og4', gx: 6, gz: 7, kind: 'obstacle' },
        { id: 'og5', gx: 8, gz: 7, kind: 'obstacle' },
        { id: 'og6', gx: 7, gz: 9, kind: 'obstacle' }
      ],
      edges: [
        { a: 'A', b: 'w1' }, { a: 'A', b: 'n1' },
        { a: 'B', b: 'n2' }, { a: 'B', b: 'e1' },
        { a: 'C', b: 'n1' }, { a: 'C', b: 'n2' },
        { a: 'n1', b: 'n2' },
        { a: 'n1', b: 'w1' }, { a: 'n2', b: 'e1' },
        { a: 'w1', b: 'w2' }, { a: 'w2', b: 'w3' }, { a: 'w3', b: 'w4' }, { a: 'w4', b: 's1' },
        { a: 'e1', b: 'e2' }, { a: 'e2', b: 'e3' }, { a: 'e3', b: 'e4' }, { a: 'e4', b: 's2' },
        { a: 'w3', b: 'bw', old: true }, { a: 'bw', b: 'be', old: true }, { a: 'be', b: 'e3', old: true },
        { a: 'w2', b: 'bw', old: true }, { a: 'e2', b: 'be', old: true },
        { a: 's1', b: 'X' }, { a: 's2', b: 'Y' }, { a: 's1', b: 's2' },
        { a: 'w4', b: 'X', old: true }, { a: 'e4', b: 'Y', old: true }
      ],
      boss: 'zheying', bossName: '蛰影',
      env: { fog: 0x0a0d08, ground: 0x0e140c, accent: 0x8affc9, accent2: 0xffb020, theme: 'industrial' }
    }
  ];

  // 修正手误字段
  MAPS[1].nodes.forEach(n => { if (n.gx2 !== undefined) delete n.gx2; });

  M.MAPS = MAPS;
  M.CELL = CELL;

  // ============================================================
  // 波次生成
  // ============================================================
  function W(groups, hint) { return { groups, hint: hint || '' }; }
  function G_(type, entry, count, interval, delay) { return { type, entry, count, interval: interval || 1.1, delay: delay || 0 }; }

  M.buildWaves = function (mapId) {
    const waves = [];
    if (mapId === 'map1') {
      waves.push(W([G_('worm', 'A', 6, 1.3)], '侦测到蠕虫扫描流量，来源：门户网站'));
      waves.push(W([G_('worm', 'A', 8, 1.1), G_('worm', 'B', 4, 1.4, 2)], '蠕虫沿两入口扩散'));
      waves.push(W([G_('worm', 'A', 8, 1.0), G_('flood', 'B', 2, 2.4, 3)], '邮件网关出现洪泛团，注意阻挡容量'));
      waves.push(W([G_('trojan', 'A', 5, 1.5), G_('worm', 'B', 6, 1.0, 1)], '伪装木马混入正常封装，需要沙箱检测'));
      waves.push(W([G_('ransom', 'A', 3, 2.2), G_('worm', 'B', 6, 1.0, 1)], '勒索者开始远程加密，优先保护蜜罐'));
      waves.push(W([G_('hotspot', 'A', 4, 1.8), G_('worm', 'A', 6, 0.9, 0.5)], '伪热点沿无线层直飞中枢，拦截器就绪'));
      waves.push(W([G_('sheller', 'B', 2, 4.0), G_('worm', 'B', 9, 0.85, 0.5)], '加壳器为敌群提供护盾，考虑优先清除'));
      waves.push(W([G_('flood', 'A', 3, 2.6), G_('trojan', 'A', 4, 1.4, 1), G_('ransom', 'B', 2, 2.6, 2)], '多点混合流量，保持节点连通'));
      waves.push(W([G_('worm', 'A', 10, 0.8), G_('worm', 'B', 6, 0.9, 1.5), G_('sheller', 'A', 1, 1, 3)], '大规模蠕虫潮，留意复制节点'));
      waves.push(W([G_('trojan', 'B', 6, 1.3), G_('ransom', 'A', 4, 2.0, 1), G_('flood', 'A', 2, 2.8, 2)], '伪装与加密并行，沙箱与修复进程协同'));
      waves.push(W([G_('hotspot', 'B', 5, 1.6), G_('worm', 'B', 8, 0.85, 0.5), G_('sheller', 'B', 1, 1, 2)], '无线层压力上升'));
      waves.push(W([G_('flood', 'A', 3, 2.4), G_('flood', 'B', 3, 2.4, 1), G_('trojan', 'A', 5, 1.2, 2)], '洪泛团双向施压，节点隔离承受重击'));
      waves.push(W([G_('ransom', 'A', 4, 1.9), G_('ransom', 'B', 3, 2.1, 1), G_('sheller', 'A', 2, 3.5, 2), G_('worm', 'A', 8, 0.8, 0), G_('worm', 'B', 6, 0.9, 1)], '重装甲入侵编队接近'));
      waves.push(W([G_('worm', 'A', 10, 0.7, 0), G_('worm', 'B', 8, 0.8, 0.5)], '警告：傀儡主脑「万傀」正在接入僵尸网络'));
    } else if (mapId === 'map2') {
      waves.push(W([G_('worm', 'A', 6, 1.3)], '互联网方向侦测到蠕虫试探'));
      waves.push(W([G_('worm', 'C', 6, 1.2), G_('worm', 'A', 4, 1.3, 1.5)], '分支专线出现同类流量'));
      waves.push(W([G_('worm', 'B', 5, 1.2), G_('flood', 'C', 2, 2.4, 2)], '云端互联发现洪泛团'));
      waves.push(W([G_('trojan', 'C', 5, 1.5), G_('worm', 'A', 4, 1.1, 1)], '专线封装中混入木马'));
      waves.push(W([G_('ransom', 'A', 3, 2.2), G_('worm', 'C', 6, 1.0, 1)], '勒索者锁定互联网链路'));
      waves.push(W([G_('hotspot', 'C', 4, 1.8), G_('worm', 'C', 4, 1.2, 0.5)], '伪热点借助骨干无线层突进'));
      waves.push(W([G_('sheller', 'A', 2, 4.0), G_('worm', 'B', 8, 0.9, 0.5)], '加壳器随云端流量入场'));
      waves.push(W([G_('flood', 'C', 3, 2.6), G_('trojan', 'A', 4, 1.4, 1)], '汇聚节点方向压力增大'));
      waves.push(W([G_('worm', 'A', 8, 0.8, 0), G_('flood', 'A', 2, 2.4, 2), G_('worm', 'C', 8, 0.8, 1), G_('flood', 'C', 2, 2.4, 3), G_('worm', 'B', 8, 0.8, 2), G_('flood', 'B', 2, 2.4, 4)], '洪峰警报：三入口同时大量出兵'));
      waves.push(W([G_('ransom', 'C', 4, 2.0), G_('trojan', 'B', 5, 1.4, 1)], '加密与伪装沿专线蔓延'));
      waves.push(W([G_('hotspot', 'B', 5, 1.6), G_('sheller', 'C', 2, 3.5, 1), G_('worm', 'A', 8, 0.85, 0)], '立体化入侵开始'));
      waves.push(W([G_('flood', 'A', 4, 2.2), G_('flood', 'C', 2, 2.6, 1), G_('ransom', 'C', 3, 2.2, 2)], '洪泛团冲击隧道口'));
      waves.push(W([G_('trojan', 'A', 6, 1.3), G_('trojan', 'B', 6, 1.3, 1), G_('sheller', 'A', 2, 3.5, 2)], '伪装梯队密集推进'));
      waves.push(W([G_('ransom', 'B', 4, 1.9), G_('ransom', 'A', 3, 2.1, 1), G_('flood', 'C', 3, 2.4, 2), G_('worm', 'A', 6, 0.9, 0), G_('worm', 'B', 6, 0.9, 1)], '多波次饱和攻击'));
      waves.push(W([G_('worm', 'A', 8, 0.7, 0), G_('worm', 'C', 8, 0.7, 0.5)], '警告：路由欺骗源「蜃楼」信号出现在骨干上空'));
    } else {
      waves.push(W([G_('worm', 'A', 6, 1.3)], '运维跳板机方向发现蠕虫'));
      waves.push(W([G_('worm', 'B', 5, 1.2), G_('worm', 'C', 5, 1.2, 1.5)], '办公网下行同步出现异常'));
      waves.push(W([G_('trojan', 'C', 5, 1.5), G_('worm', 'A', 5, 1.1, 1)], '供应商通道封装被木马渗透'));
      waves.push(W([G_('flood', 'B', 2, 2.4), G_('worm', 'C', 8, 0.9, 0.5)], '洪泛团沿办公网下行推进'));
      waves.push(W([G_('ransom', 'A', 3, 2.2), G_('ransom', 'B', 3, 2.2, 1.5)], '勒索者成对出现，注意分散加密'));
      waves.push(W([G_('hotspot', 'A', 4, 1.8), G_('worm', 'B', 6, 1.0, 0.5)], '伪热点贴着管廊飞行'));
      waves.push(W([G_('sheller', 'C', 2, 4.0), G_('trojan', 'A', 5, 1.4, 1)], '加壳器掩护伪装梯队'));
      waves.push(W([G_('flood', 'C', 3, 2.6), G_('ransom', 'B', 3, 2.2, 1)], '南通道方向承压'));
      waves.push(W([G_('worm', 'A', 8, 0.8, 0), G_('flood', 'A', 2, 2.4, 2), G_('worm', 'B', 8, 0.8, 1), G_('flood', 'B', 2, 2.4, 3), G_('worm', 'C', 8, 0.8, 2), G_('flood', 'C', 2, 2.4, 4)], '洪峰警报：三入口同时大量出兵'));
      waves.push(W([G_('hotspot', 'C', 5, 1.6), G_('trojan', 'B', 6, 1.3, 1)], '无线层与伪装双线进攻'));
      waves.push(W([G_('ransom', 'A', 4, 2.0), G_('sheller', 'B', 2, 3.5, 1), G_('worm', 'C', 8, 0.85, 0)], '加密编队伴随护盾载具'));
      waves.push(W([G_('flood', 'A', 3, 2.4), G_('flood', 'B', 3, 2.4, 1), G_('ransom', 'C', 3, 2.2, 2)], '老总线方向震动频繁'));
      waves.push(W([G_('trojan', 'A', 6, 1.3), G_('trojan', 'C', 6, 1.3, 1), G_('sheller', 'A', 2, 3.5, 2)], '伪装浪潮席卷运维环'));
      waves.push(W([G_('ransom', 'A', 4, 1.9), G_('ransom', 'B', 4, 1.9, 1), G_('ransom', 'C', 4, 1.9, 2), G_('worm', 'A', 6, 0.9, 0), G_('worm', 'B', 6, 0.9, 1)], '三重加密小组同步推进'));
      waves.push(W([G_('flood', 'A', 4, 2.2), G_('flood', 'B', 4, 2.2, 1), G_('flood', 'C', 2, 2.6, 2), G_('trojan', 'B', 6, 1.2, 1), G_('hotspot', 'C', 4, 1.6, 2)], '全频段总攻前奏'));
      waves.push(W([G_('worm', 'A', 8, 0.7, 0), G_('worm', 'B', 8, 0.7, 0.5), G_('trojan', 'C', 4, 1.2, 1)], '警告：核心威胁「蛰影」已突破外围防线'));
    }
    return waves;
  };

  // ============================================================
  // 场景构建
  // ============================================================
  M.nodeWorld = function (def, node) {
    return [(node.gx - def.size[0] / 2 + 0.5) * CELL, (node.gz - def.size[1] / 2 + 0.5) * CELL];
  };

  function roadTexture(color, stripeColor, vertical) {
    return G.U.canvasTex(64, 128, (ctx, w, h) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
      for (let i = 0; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
      ctx.fillStyle = stripeColor;
      for (let y = 0; y < h; y += 32) ctx.fillRect(w / 2 - 3, y, 6, 18);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(3, 0, 2, h); ctx.fillRect(w - 5, 0, 2, h);
    });
  }

  M.buildWorld = function (scene, def) {
    const world = {
      def, group: new THREE.Group(), nodeObjs: {}, edgeObjs: [],
      roadGroup: new THREE.Group(), routeGroup: new THREE.Group(), dynGroup: new THREE.Group()
    };
    world.group.add(world.roadGroup); world.group.add(world.routeGroup); world.group.add(world.dynGroup);
    scene.add(world.group);

    const [gw, gh] = def.size;
    const env = def.env;

    // ---------- 地形台地 ----------
    const groundTex = G.U.canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#0a1220'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(80,160,220,.12)'; ctx.lineWidth = 1;
      for (let i = 0; i <= w; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(120,200,255,.2)';
      for (let i = 0; i <= w; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
      // 电路纹理
      ctx.strokeStyle = 'rgba(62,230,255,.14)'; ctx.lineWidth = 2;
      for (let k = 0; k < 24; k++) {
        let x = Math.random() * w, y = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          if (Math.random() < 0.5) x += (Math.random() - 0.5) * 90; else y += (Math.random() - 0.5) * 90;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(62,230,255,.3)';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(gw / 2, gh / 2);
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: env.ground, metalness: 0.5, roughness: 0.6 });
    const slabW = gw * CELL + 8, slabH = gh * CELL + 8;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(slabW, 1.2, slabH), groundMat);
    ground.position.y = -0.6;
    ground.receiveShadow = true;
    world.group.add(ground);
    // 台地标边发光
    const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(slabW, 1.2, slabH)),
      new THREE.LineBasicMaterial({ color: env.accent, transparent: true, opacity: 0.5 }));
    edgeLine.position.y = -0.6;
    world.group.add(edgeLine);
    // 台基侧面
    const baseSide = new THREE.Mesh(new THREE.BoxGeometry(slabW + 1.6, 2.6, slabH + 1.6),
      G.models.mat(0x0c1420, { metal: 0.7, rough: 0.4 }));
    baseSide.position.y = -2.4;
    world.group.add(baseSide);
    const underGlow = new THREE.Mesh(new THREE.BoxGeometry(slabW + 1.7, 0.14, slabH + 1.7),
      G.models.basic(env.accent, { opacity: 0.5, dw: false }));
    underGlow.position.y = -1.05;
    world.group.add(underGlow);

    // ---------- 障碍 ----------
    def.nodes.filter(n => n.kind === 'obstacle').forEach((n, i) => {
      const [x, z] = M.nodeWorld(def, n);
      const rack = G.models.obstacleRack(i * 7 + def.id.length);
      rack.position.set(x, 0, z);
      rack.rotation.y = (i % 4) * Math.PI / 2;
      world.group.add(rack);
    });

    // ---------- 平台 ----------
    def.nodes.filter(n => n.kind === 'platform').forEach(n => {
      const [x, z] = M.nodeWorld(def, n);
      const pad = G.models.platformPad(env.accent2);
      pad.position.set(x, 0, z);
      world.group.add(pad);
      world.nodeObjs[n.id] = { node: n, group: pad, pos: new THREE.Vector3(x, 0, z) };
    });

    // ---------- 节点 ----------
    def.nodes.filter(n => n.kind === 'junction').forEach(n => {
      const [x, z] = M.nodeWorld(def, n);
      const g = G.models.junction();
      g.position.set(x, 0, z);
      world.group.add(g);
      world.nodeObjs[n.id] = { node: n, group: g, pos: new THREE.Vector3(x, 0, z), iso: null };
    });
    def.nodes.filter(n => n.kind === 'entry').forEach(n => {
      const [x, z] = M.nodeWorld(def, n);
      const g = G.models.entryPortal(n.color);
      g.position.set(x, 0, z);
      // 面向战场中心
      const c = M.nodeWorld(def, { gx: def.size[0] / 2, gz: def.size[1] / 2 });
      g.rotation.y = Math.atan2(c[0] - x, c[1] - z);
      world.group.add(g);
      const label = G.models.textSprite(n.id, G.U.colHex(n.color), 2.6, n.name);
      label.position.set(x, 4.6, z);
      world.group.add(label);
      world.nodeObjs[n.id] = { node: n, group: g, pos: new THREE.Vector3(x, 0, z) };
    });
    def.nodes.filter(n => n.kind === 'exit').forEach(n => {
      const [x, z] = M.nodeWorld(def, n);
      const g = G.models.exitSpire(n.color);
      g.position.set(x, 0, z);
      world.group.add(g);
      const label = G.models.textSprite(n.id, G.U.colHex(n.color), 2.6, n.name);
      label.position.set(x, 4.6, z);
      world.group.add(label);
      world.nodeObjs[n.id] = { node: n, group: g, pos: new THREE.Vector3(x, 0, z), isExit: true };
    });

    // ---------- 道路 ----------
    def.edges.forEach(e => {
      const a = world.nodeObjs[e.a], b = world.nodeObjs[e.b];
      if (!a || !b) return;
      const obj = buildRoad(a.pos, b.pos, e.old, env);
      world.roadGroup.add(obj.group);
      world.edgeObjs.push({ edge: e, a: e.a, b: e.b, group: obj.group, flowMats: obj.flowMats, len: obj.len, roadMat: obj.roadMat });
    });

    // ---------- 主题装饰 ----------
    buildThemeProps(world, def);

    // ---------- 悬浮碎晶 ----------
    const crysGeo = new THREE.OctahedronGeometry(0.5, 0);
    const crysMat = G.models.mat(0x3a5a78, { metal: 0.8, rough: 0.2, emissive: env.accent, ei: 0.25, flat: true });
    world.crystals = [];
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(crysGeo, crysMat);
      c.position.set((Math.random() - 0.5) * slabW * 0.9, 2 + Math.random() * 7, (Math.random() - 0.5) * slabH * 0.9);
      c.scale.setScalar(0.4 + Math.random() * 1.1);
      c.userData = { spin: Math.random() * 0.8 + 0.2, bob: Math.random() * Math.PI * 2, y0: c.position.y };
      world.group.add(c);
      world.crystals.push(c);
    }

    world.slabW = slabW; world.slabH = slabH;
    return world;
  };

  function buildRoad(pa, pb, old, env) {
    const group = new THREE.Group();
    const dir = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z);
    const len = dir.length();
    const nrm = dir.clone().normalize();
    const perp = new THREE.Vector3(-nrm.z, 0, nrm.x);
    const segs = Math.max(2, Math.round(len / 2));
    const width = 1.5;
    // 路面条带
    const verts = [], uvs = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = pa.clone().lerp(pb, t);
      p.y = 0.1;
      const l = p.clone().addScaledVector(perp, width / 2);
      const r = p.clone().addScaledVector(perp, -width / 2);
      verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
      uvs.push(0, t * len / 4, 1, t * len / 4);
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = roadTexture(old ? '#2a2016' : '#182434', old ? 'rgba(255,176,32,.5)' : 'rgba(62,230,255,.4)');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, metalness: 0.4, roughness: 0.6,
      emissive: old ? 0x552f08 : 0x0a2a3a, emissiveMap: tex, emissiveIntensity: 0.7
    });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    group.add(road);
    // 两侧光带
    const flowMats = [];
    [-1.15, 1.15].forEach(off => {
      const lv = [], li = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = pa.clone().lerp(pb, t);
        p.y = 0.14;
        const q = p.clone().addScaledVector(perp, off + 0.09);
        const q2 = p.clone().addScaledVector(perp, off - 0.09);
        lv.push(q.x, q.y, q.z, q2.x, q2.y, q2.z);
        if (i < segs) { const a = i * 2; li.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3));
      lg.setIndex(li);
      lg.computeVertexNormals();
      const fm = G.models.basic(old ? 0xffb020 : env.accent, { opacity: 0.55, dw: false });
      const lm = new THREE.Mesh(lg, fm);
      group.add(lm);
      flowMats.push(fm);
    });
    return { group, flowMats, len, roadMat: mat };
  }

  function buildThemeProps(world, def) {
    const env = def.env;
    const [gw, gh] = def.size;
    const W = world.slabW, H = world.slabH;
    const occupied = [];
    def.nodes.forEach(n => { const [x, z] = M.nodeWorld(def, n); occupied.push([x, z]); });
    def.edges.forEach(e => {
      const a = world.nodeObjs[e.a], b = world.nodeObjs[e.b];
      if (!a || !b) return;
      const steps = Math.floor(a.pos.distanceTo(b.pos) / 1.5);
      for (let i = 0; i <= steps; i++) occupied.push([a.pos.x + (b.pos.x - a.pos.x) * i / steps, a.pos.z + (b.pos.z - a.pos.z) * i / steps]);
    });
    function free(x, z, r) {
      for (const o of occupied) if (Math.hypot(o[0] - x, o[1] - z) < r) return false;
      return true;
    }
    const props = new THREE.Group();
    let seed = def.id === 'map1' ? 3 : def.id === 'map2' ? 7 : 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    const count = def.id === 'map2' ? 26 : 20;
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * (W - 8), z = (rnd() - 0.5) * (H - 8);
      if (!free(x, z, 2.6)) continue;
      let p;
      if (env.theme === 'office') p = makeOfficeProp(rnd, env);
      else if (env.theme === 'backbone') p = makeBackboneProp(rnd, env);
      else p = makeIndustrialProp(rnd, env);
      p.position.set(x, 0, z);
      p.rotation.y = rnd() * Math.PI * 2;
      props.add(p);
    }
    world.group.add(props);
  }

  function makeOfficeProp(rnd, env) {
    const g = new THREE.Group();
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) { // 矮机柜
      g.add(G.models.box(1.4, 1.8, 0.9, G.models.mat(0x1a2532, { metal: 0.6, rough: 0.5 }), 0, 0.9, 0, g));
      g.add(G.models.box(1.2, 0.1, 0.7, G.models.basic(0x2affa0, { opacity: 0.6, dw: false }), 0, 1.5, 0.46, g, false));
    } else if (kind === 1) { // 全息广告牌
      g.add(G.models.cyl(0.06, 0.08, 3.2, 6, G.models.mat(0x2a3a4e, { metal: 0.8, rough: 0.3 }), 0, 1.6, 0, g));
      const panel = G.models.box(1.6, 0.9, 0.06, G.models.basic(env.accent, { opacity: 0.35, dw: false }), 0, 3.4, 0, g, false);
      panel.rotation.z = 0.1;
      g.add(panel);
    } else { // 线缆束
      for (let i = 0; i < 3; i++) {
        const c = G.models.cyl(0.09, 0.09, 1.6, 5, G.models.mat(0x141c28, { rough: 0.8 }), (i - 1) * 0.2, 0.1, (i % 2) * 0.2, g);
        c.rotation.z = Math.PI / 2 + (i - 1) * 0.12;
      }
    }
    return g;
  }

  function makeBackboneProp(rnd, env) {
    const g = new THREE.Group();
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) { // 管道
      const pipe = G.models.cyl(0.5, 0.5, 3.6, 10, G.models.mat(0x22303f, { metal: 0.85, rough: 0.3 }), 0, 0.5, 0, g);
      pipe.rotation.z = Math.PI / 2;
      g.add(G.models.torus(0.55, 0.06, G.models.mat(0x3ecfff, { emissive: 0x3ecfff, ei: 1.2 }), -1.0, 0.5, 0, g));
      g.add(G.models.torus(0.55, 0.06, G.models.mat(0x3ecfff, { emissive: 0x3ecfff, ei: 1.2 }), 1.0, 0.5, 0, g));
    } else if (kind === 1) { // 信号塔
      g.add(G.models.cyl(0.08, 0.2, 4.5, 6, G.models.mat(0x2a3a4e, { metal: 0.8, rough: 0.3 }), 0, 2.25, 0, g));
      g.add(G.models.sph(0.16, G.models.basic(0xff4d5e, { dw: false }), 0, 4.6, 0, g, false));
    } else { // 浮空平台残件
      g.add(G.models.box(2.2, 0.3, 1.4, G.models.mat(0x1c2836, { metal: 0.7, rough: 0.4 }), 0, 0.6, 0, g));
      g.add(G.models.box(0.8, 0.8, 0.8, G.models.mat(0x243448, { metal: 0.7, rough: 0.4 }), 0.5, 1.15, 0.2, g));
    }
    return g;
  }

  function makeIndustrialProp(rnd, env) {
    const g = new THREE.Group();
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) { // 储罐
      g.add(G.models.cyl(0.9, 0.9, 2.2, 12, G.models.mat(0x3a3a2a, { metal: 0.6, rough: 0.55 }), 0, 1.1, 0, g));
      g.add(G.models.cone(0.9, 0.5, 12, G.models.mat(0x2a2a1e, { metal: 0.6, rough: 0.55 }), 0, 2.45, 0, g));
    } else if (kind === 1) { // 烟囱
      g.add(G.models.cyl(0.4, 0.55, 4.2, 10, G.models.mat(0x2e2a24, { metal: 0.5, rough: 0.7 }), 0, 2.1, 0, g));
      g.add(G.models.cyl(0.5, 0.5, 0.3, 10, G.models.basic(0xff6a2e, { opacity: 0.7, dw: false }), 0, 4.3, 0, g, false));
    } else { // 警示架
      g.add(G.models.box(1.8, 0.12, 0.12, G.models.mat(0x8a6a1e, { emissive: 0xffb020, ei: 0.4 }), 0, 1.0, 0, g, false));
      g.add(G.models.box(0.12, 1.0, 0.12, G.models.mat(0x3a3a2a, { metal: 0.6, rough: 0.6 }), -0.8, 0.5, 0, g));
      g.add(G.models.box(0.12, 1.0, 0.12, G.models.mat(0x3a3a2a, { metal: 0.6, rough: 0.6 }), 0.8, 0.5, 0, g));
    }
    return g;
  }

  // ============================================================
  // 路线标记（当前 / 预览）
  // ============================================================
  M.buildRouteTube = function (points, color, dashed) {
    const g = new THREE.Group();
    if (points.length < 2) return g;
    const pts = points.map(p => new THREE.Vector3(p[0], 0.34, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const segs = Math.max(8, pts.length * 6);
    const geo = new THREE.TubeGeometry(curve, segs, 0.13, 6, false);
    const mat = dashed
      ? G.models.basic(color, { opacity: 0.85, dw: false })
      : G.models.basic(color, { opacity: 0.5, dw: false });
    const tube = new THREE.Mesh(geo, mat);
    g.add(tube);
    // 箭头
    const nArr = Math.max(2, Math.floor(pts.length));
    for (let i = 1; i < nArr; i++) {
      const t = i / nArr;
      const pos = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6), mat);
      cone.position.copy(pos);
      cone.position.y = 0.34;
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.setY(0).normalize());
      g.add(cone);
    }
    g.userData.mat = mat;
    return g;
  };

  // ============================================================
  // 环境（协议层、远景网络、数据流）——全局一次
  // ============================================================
  M.buildEnvironment = function (scene) {
    const env = { group: new THREE.Group(), streams: [], streamsData: [] };
    scene.add(env.group);

    // 远景地面雾盘
    const fogDisc = new THREE.Mesh(new THREE.CircleGeometry(400, 40),
      new THREE.MeshBasicMaterial({ color: 0x060b14, transparent: true, opacity: 0.9, depthWrite: false }));
    fogDisc.rotation.x = -Math.PI / 2;
    fogDisc.position.y = -16;
    env.group.add(fogDisc);

    // 协议层（下方纵深）
    const layerColors = [0x3ecfff, 0xb96bff, 0x59f29b];
    env.layers = [];
    for (let i = 0; i < 3; i++) {
      const tex = G.U.canvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(120,220,255,' + (0.16 + i * 0.05) + ')';
        ctx.lineWidth = 1.5;
        for (let y = 0; y < h; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + ((i % 2) ? 18 : -18)); ctx.stroke(); }
        for (let x = 0; x < w; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + ((i % 2) ? -18 : 18), h); ctx.stroke(); }
        ctx.fillStyle = 'rgba(140,240,255,.5)';
        for (let k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 2, 0, Math.PI * 2); ctx.fill(); }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(8, 8);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: layerColors[i], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -8 - i * 5;
      env.group.add(plane);
      env.layers.push({ plane, tex, speed: (i % 2 ? 1 : -1) * (0.008 + i * 0.004) });
    }

    // 远景网络集群
    const clusterGroup = new THREE.Group();
    env.group.add(clusterGroup);
    const winTex = G.U.canvasTex(64, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, w, h);
      for (let y = 4; y < h - 4; y += 8) for (let x = 4; x < w - 4; x += 8) {
        if (Math.random() < 0.4) {
          ctx.fillStyle = ['#3ecfff', '#ffb020', '#59f29b', '#b96bff'][Math.floor(Math.random() * 4)];
          ctx.globalAlpha = 0.3 + Math.random() * 0.6;
          ctx.fillRect(x, y, 4, 5);
        }
      }
      ctx.globalAlpha = 1;
    });
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const rad = 120 + Math.random() * 130;
      const bw = 6 + Math.random() * 14, bh = 12 + Math.random() * 42, bd = 6 + Math.random() * 14;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x111a26, metalness: 0.6, roughness: 0.5,
        emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.5, map: winTex
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      b.position.set(Math.cos(ang) * rad, -14 + bh / 2 + Math.random() * 6, Math.sin(ang) * rad);
      b.rotation.y = Math.random() * Math.PI;
      clusterGroup.add(b);
    }
    // 更远的剪影山峦
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + 0.15;
      const rad = 260 + Math.random() * 120;
      const m = new THREE.Mesh(new THREE.ConeGeometry(30 + Math.random() * 30, 50 + Math.random() * 60, 5),
        G.models.basic(0x0a1220, { dw: false }));
      m.position.set(Math.cos(ang) * rad, -16, Math.sin(ang) * rad);
      clusterGroup.add(m);
    }

    // 往来的数据流
    env.streams = [];
    const streamGeo = new THREE.BoxGeometry(0.5, 0.12, 3.2);
    for (let i = 0; i < 40; i++) {
      const col = [0x3ecfff, 0xffb020, 0x59f29b, 0xb96bff][i % 4];
      const m = new THREE.Mesh(streamGeo, G.models.basic(col, { opacity: 0.8, dw: false }));
      const ang = Math.random() * Math.PI * 2;
      const rad = 90 + Math.random() * 150;
      m.userData = {
        cx: Math.cos(ang) * rad, cz: Math.sin(ang) * rad,
        ang: ang + Math.PI / 2 + (Math.random() - 0.5),
        speed: 14 + Math.random() * 26,
        y: -2 + Math.random() * 14,
        off: Math.random() * 200
      };
      env.group.add(m);
      env.streams.push(m);
    }

    // 上方粒子星尘
    const pGeo = new THREE.BufferGeometry();
    const pn = 350;
    const ppos = new Float32Array(pn * 3);
    for (let i = 0; i < pn; i++) {
      ppos[i * 3] = (Math.random() - 0.5) * 400;
      ppos[i * 3 + 1] = Math.random() * 90 - 10;
      ppos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x3ecfff, size: 0.35, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const stars = new THREE.Points(pGeo, pMat);
    env.group.add(stars);
    env.stars = stars;

    env.update = function (dt, t) {
      env.layers.forEach(l => { l.tex.offset.y += l.speed * dt; l.tex.offset.x += l.speed * 0.4 * dt; });
      env.streams.forEach(s => {
        const u = s.userData;
        u.off += u.speed * dt;
        const r = Math.hypot(u.cx, u.cz);
        const x = u.cx + Math.cos(u.ang) * u.off;
        const z = u.cz + Math.sin(u.ang) * u.off;
        const rr = Math.hypot(x, z);
        if (rr > 260) { u.off = -Math.random() * 40; return; }
        s.position.set(x, u.y + Math.sin(t * 0.5 + u.cx) * 1.5, z);
        s.rotation.y = -u.ang + Math.PI / 2;
      });
      env.stars.rotation.y += dt * 0.004;
    };
    return env;
  };

  // 关卡缩略示意图
  M.drawThumb = function (canvas, def) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, w, h);
    const pad = 18;
    const sx = (w - pad * 2) / (def.size[0] - 1);
    const sy = (h - pad * 2) / (def.size[1] - 1);
    const s = Math.min(sx, sy);
    const ox = (w - s * (def.size[0] - 1)) / 2, oy = (h - s * (def.size[1] - 1)) / 2;
    const px = n => ox + n.gx * s, py = n => oy + n.gz * s;
    // 边
    def.edges.forEach(e => {
      const a = def.nodes.find(n => n.id === e.a), b = def.nodes.find(n => n.id === e.b);
      ctx.strokeStyle = e.old ? 'rgba(255,176,32,.55)' : 'rgba(62,230,255,.5)';
      ctx.lineWidth = e.old ? 1.5 : 2.5;
      ctx.setLineDash(e.old ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
    });
    ctx.setLineDash([]);
    def.nodes.forEach(n => {
      if (n.kind === 'obstacle') {
        ctx.fillStyle = 'rgba(120,120,120,.35)';
        ctx.fillRect(px(n) - 3, py(n) - 3, 6, 6);
      } else if (n.kind === 'entry') {
        ctx.fillStyle = '#' + n.color.toString(16).padStart(6, '0');
        ctx.beginPath(); ctx.arc(px(n), py(n), 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.id, px(n), py(n));
      } else if (n.kind === 'exit') {
        ctx.fillStyle = '#59f29b';
        ctx.beginPath(); ctx.arc(px(n), py(n), 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#06101c'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.id, px(n), py(n));
      } else if (n.kind === 'platform') {
        ctx.strokeStyle = 'rgba(45,212,191,.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px(n), py(n), 4, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#1c3a58';
        ctx.beginPath(); ctx.arc(px(n), py(n), 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3ee6ff'; ctx.lineWidth = 1; ctx.stroke();
      }
    });
  };
})();
