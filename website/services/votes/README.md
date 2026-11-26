# 观测者票选的函数

审美全能网站观测者票选的后端，设计见 [`website/topics/aesthetics/docs/votes.md`](../../topics/aesthetics/docs/votes.md)（第二、八、九、十、十一、十二节）。函数计算 3.0（杭州）的一个 Web 函数，Node.js 写，票存在表格存储实例 `octathlon-votes`。网站的 Vite 开发服务器跑的是同一份请求处理代码，配内存票箱。

- **接口地址**：`https://api.wendystars.com/api/votes/v1/aesthetics/`。`api.wendystars.com` 是函数计算的自定义域名，只开 HTTPS（`http://` 由函数计算 301 到 `https://`），路由 `/*` → `octathlon-votes`，证书见下文「接口域名与证书」
- **函数**：`octathlon-votes`（自定义运行时 `custom.debian10`，Node 20）
- **HTTP 触发器默认地址**：`https://octathlon-votes-apacgsjkxt.cn-hangzhou.fcapp.run`（只用来排查；网站一律走接口域名）
- **定时触发器**：`reconcile-daily`，每天北京时间 04:30 对账

## 目录

| 位置 | 内容 |
|---|---|
| `src/handler.js` | `createHandler(...)`：路由、Cookie、限频、无感校验、错误回复 |
| `src/rules.js` | 投票规则（每卷两票、不重复、撤回、名单校验），两种存储共用 |
| `src/reconcile.js` | 对账（从 `ballots` 重算 `tallies`）、清票 |
| `src/signing.js` | 观测者 ID 的签名、IP 加盐哈希、维护口令、无感校验的小题 |
| `src/votable.js` | 能投的名单：网址 / 函数 / 对象，缓存与失败时关闭 |
| `src/store/memory.js`、`src/store/tablestore.js` | 存储接口的两种实现 |
| `src/server.js`、`src/config.js` | 函数计算的入口和环境变量 |
| `test/votes.test.js` | 单元测试（`npm test`） |
| `tools/deploy.mjs`、`tools/admin.mjs` | 部署；对账、清票等维护操作 |
| `tools/domain.mjs` | 接口域名：CNAME、免费证书的申请与续期、自定义域名 |
| `s.yaml` | 部署配置（Serverless Devs fc3） |
| `.secret` | 签名密钥，本地生成，不进 git，不随代码上传（`.gitignore`、`.fcignore`） |

## 接口

前缀 `/api/votes/v1/<专题>/`，本函数服务 `aesthetics`，线上完整地址是 `https://api.wendystars.com/api/votes/v1/aesthetics/…`。所有回复是 JSON；除计票外一律 `Cache-Control: no-store`。

| 方法与路径 | 正文 | 返回 |
|---|---|---|
| `GET …/tally` | — | `{updated, voters, taskVoters: {卷key: n}, tasks: {卷key: {型号id: 票数}}}`；`Cache-Control: public, max-age=30` |
| `GET …/me` | — | `{votes: {卷key: [型号id, …]}}`；没有 Cookie 时 `{votes: {}}`；无感校验打开时多一个 `pow` |
| `POST …/vote` | `{task, model}` | `{task, votes: [型号id…], tally: {型号id: 票数}, voters, updated}`：这一卷你的票、这一卷最新计票、这一卷的观测者数 |
| `DELETE …/vote` | `{task, model}` | 同上 |
| `OPTIONS` 以上任一路径 | — | 跨源预检，204 |

- **计票**：`tasks` 列出名单里每一卷的每一件作品，没票写 0；名单外的作品不出现。`voters` 是专题里眼下至少有一票的观测者数，`taskVoters` 是每一卷的（给题目页「已有 N 位观测者投票」用）。
- **跨源**：网站在 `https://octathlon.wendystars.com`，接口在 `https://api.wendystars.com`，两者同站（都在 `wendystars.com` 下）但不同源。网站用 `fetch(url, { credentials: 'include' })` 调接口，写操作带 `Content-Type: application/json`。
  - 来源在 `CORS_ORIGINS` 里时，回复带 `Access-Control-Allow-Origin: <该来源>`、`Access-Control-Allow-Credentials: true`、`Access-Control-Expose-Headers: Retry-After`；预检（`OPTIONS`）再加 `Access-Control-Allow-Methods: GET, POST, DELETE`、`Access-Control-Allow-Headers: Content-Type`、`Access-Control-Max-Age: 600`，回 204。
  - 所有回复都带 `Vary: Origin`。
  - 别的来源一律回 `Access-Control-Allow-Origin: <CORS_ORIGINS 的第一个>`，浏览器比对不上就拦下。这样写是因为函数计算会给回复里缺的跨源头补默认值，其中 Allow-Origin 是把请求的 Origin 原样填回；函数自己回了，它就不补。
- **Cookie**：第一次投票时发，之后每次投票或撤回都续期：`octa_voter=<观测者 ID>.<签名>; Max-Age=63072000; Path=/api/votes/; HttpOnly; Secure; SameSite=Lax`。不带 `Domain`，只属于 `api.wendystars.com`。网站和接口同站，`SameSite=Lax` 的 Cookie 在带凭证的 `fetch` 里照常收发；网站页面自己读不到它（`HttpOnly`）。签名对不上的 Cookie 当作没有。
- **正文**必须是 `Content-Type: application/json`，不超过 4 KB；`task`、`model` 是小写字母数字加连字符的 id。这种请求要先过预检，不在 `CORS_ORIGINS` 里的站点发不出来；别的站点又不是同站，带不上 Cookie。
- **错误**一律是 `{error, message: {zh, en}}`：

| 状态码 | `error` | 什么时候 |
|---|---|---|
| 400 | `bad_request` | 正文格式不对 |
| 403 | `pow_required` | 无感校验打开、没答题或答案不对；正文带一道新题 `pow: {challenge, difficulty}` |
| 404 | `not_votable` | 作品不在名单里（名单读不到时一律如此） |
| 404 | `not_found` | 没有这个接口 |
| 405 | `method_not_allowed` | 方法不对，带 `Allow` |
| 409 | `limit_reached` | 这一卷两票已用完；正文带 `votes`（这一卷你现在的票） |
| 409 | `already_voted` | 这件已经投过；正文带 `votes` |
| 429 | `rate_limited` | 限频或新 ID 上限；带 `Retry-After`（秒），正文也有 `retryAfter` |
| 503 | `closed` | 票箱关闭（`VOTES_CLOSED`），或存储出错 |

### 规则里由这里定下的细节

- **撤回没投过的作品**不算错，返回 200 和这一卷当前的票（前端乐观更新时以返回为准）。
- **名单外的旧票**留在库里、不计入任何显示，`me` 里也不出现，**也不占这一卷的两个孔位**。这位观测者在这一卷再投新票时，旧票才从他的票上清掉（对应作品的计数减一）。作品重新上架时，没被清掉的旧票照常计入。
- **新观测者 ID 只在投票时发**，撤回和 `me` 不发；领 ID 那一次先过「同一 IP 一段时间里的新 ID 上限」，再过限频。
- **限频**按固定的一分钟窗计数，投票和撤回都算，被拒的请求也算（不合格的正文和名单外的作品不算）。
- **观测者数**：某位观测者在一卷从没票变成有票时本卷加一、全撤回时减一；他在专题里所有卷都没票时专题的观测者数减一。并发下可能差一，每天对账修正。
- **无感校验**（第八节那个关着的开关）：`POW_DIFFICULTY` 大于 0 时，投票（撤回不用）要在正文里带 `pow: {challenge, nonce}`，满足 `sha256("<challenge>:<nonce>")` 的前导零位数不少于难度；题目 5 分钟内有效，一题只能用一次。前端拿题有两处：`me` 的 `pow`，或被拒时 403 正文里的 `pow`。难度 16 在普通电脑上要几十毫秒。

## 存储接口

规则层只用下面这些操作；`createMemoryStore()` 和 `createTablestore(...)` 各实现一份。卷 key 在库里写成 `<专题>:<卷key>`。

| 操作 | 说明 |
|---|---|
| `getBallot(voter, task)` | `{models, times, version}` 或 `null` |
| `putBallot(voter, task, {models, times}, expectedVersion)` | 按版本号条件写：`expectedVersion` 为 0 时要求这一行不存在；对不上返回 `false`，规则层重读再判 |
| `deleteBallot(voter, task, expectedVersion)` | 条件删除 |
| `listBallots(voter)`、`scanBallots()` | 一位观测者的、全部的票 |
| `addTally(task, model, delta)` | 原子加减 |
| `listTallies(prefix?)` | `prefix` 那一行和它下面 `prefix:*` 的行；不给就全部 |
| `setTally(task, model, count, expected)` | 对账用：计数仍是 `expected`（`null` 表示不存在）才写，`count` 为 0 就删 |
| `createVoter(id, {issued, ipHash})`、`deleteVoter(id)` | 观测者表 |
| `hit(key, window)` | 限频计数原子加一，返回加后的值 |
| `clearLimits()` | 清空限频计数（清票时可选） |

表（第一次用到时由函数用自己的角色建好，已有就跳过；均为容量型、`maxVersions` 1）：

| 表 | 主键 | 列 |
|---|---|---|
| `ballots` | `voter`, `task` | `models`（JSON 数组，最多两个）、`times`（每件的投票时间）、`version`、`updated` |
| `tallies` | `task`, `model` | `n`（原子加减）。`<专题>:<卷>` + `~voters` 是本卷观测者数，`<专题>` + `~voters` 是专题观测者数 |
| `voters` | `voter` | `issued`（发放时间）、`ipHash`（加盐哈希） |
| `limits` | `k`, `w`（时间窗编号） | `n`；表上 TTL 86400 秒，过期自动删除 |

**投一票的顺序**：条件写 `ballots` 成功后再给 `tallies` 加一；中间失败时 `ballots` 是准的，由对账修正 `tallies`。并发投第三票时，只有按版本号写成的那两次成功，其余重读后得到 `limit_reached`。

## 环境变量

数值都写在 `s.yaml`，改了重新部署。

| 变量 | 默认 | 含义 |
|---|---|---|
| `VOTES_SECRET` | 必填 | 签名密钥，逗号分隔，第一串是当前的；由 `deploy.mjs` 从 `.secret` 注入 |
| `VOTES_TOPIC` | `aesthetics` | 专题，决定接口前缀 |
| `VOTABLE_URL` | `https://octathlon.wendystars.com/aesthetics/data/votable.json` | 能投的名单 |
| `VOTABLE_OVERRIDE` | 空 | 测试用：直接给一份名单 JSON，不读网址；由 `deploy.mjs --votable-override` 注入 |
| `VOTABLE_CACHE_SECONDS` | `180` | 名单缓存几秒。网址回 4xx 或格式不对立即关闭；网络错或 5xx 时沿用上一份最多 30 分钟 |
| `RATE_IP_PER_MINUTE` | `60` | 同一 IP 每分钟投票加撤回的次数，≤0 不限 |
| `RATE_VOTER_PER_MINUTE` | `20` | 同一观测者 ID 每分钟的次数 |
| `NEW_IDS_PER_IP` | `20` | 同一 IP 在一个时间窗里能领的新观测者 ID 数 |
| `NEW_ID_WINDOW_SECONDS` | `3600` | 上面那个时间窗，最长 86400 |
| `POW_DIFFICULTY` | `0` | 无感校验的难度（前导零位数），0 为关 |
| `VOTES_CLOSED` | `0` | `1` 时投票和撤回回 503 `closed`，计票和 `me` 照常 |
| `CLIENT_IP_HEADER` | 空 | 取观测者 IP 的请求头。空 = `x-forwarded-for` 的最右一项（函数计算自己追加的对端地址，伪造不了）。接口域名前面没有 CDN，保持空 |
| `CORS_ORIGINS` | `https://octathlon.wendystars.com` | 允许带凭证跨源调用的来源，逗号分隔。网站也从 `www.octathlon.wendystars.com` 访问的话加上它 |
| `OTS_ENDPOINT` | `https://octathlon-votes.cn-hangzhou.ots.aliyuncs.com` | 表格存储公网地址 |
| `OTS_INSTANCE` | `octathlon-votes` | 实例名 |

以后若在接口域名前面加 CDN，函数看到的对端会变成 CDN 节点，所有观测者会挤在几个节点的限频里；那时要把 `CLIENT_IP_HEADER` 设成 CDN 给的真实 IP 头（如 `ali-cdn-real-ip`），并想办法让函数只认经 CDN 来的这个头（直连时它可以伪造）。

函数的 Tablestore 凭证用函数角色 `octathlon-votes-fc` 的临时密钥：每个请求头 `x-fc-access-key-id` 等里有最新的一份，没有时用实例环境变量 `ALIBABA_CLOUD_ACCESS_KEY_ID` 等。代码里没有别的凭证。

## 部署

在本机，用已配好的 Serverless Devs 账号别名 `octathlon`：

```sh
cd website/services/votes
npm install --registry https://registry.npmjs.org   # 第一次，或依赖变了
npm test
node tools/deploy.mjs                               # 部署 = 重新部署，同一条命令
```

- `deploy.mjs` 第一次运行时生成 `.secret`，之后一直用它；把密钥和对账口令作为环境变量交给 `s deploy -a octathlon -y`，并把输出和 `~/.s/logs` 里出现的密钥遮成 `******`。不要直接跑 `s deploy`（它读不到这两个变量）。
- 只改配置或只改代码：`node tools/deploy.mjs -- --function config`（`--` 后面的参数原样交给 `s deploy`）。
- **用测试名单部署**：`node tools/deploy.mjs --votable-override <名单.json>`；测完不带这个参数再部署一次就恢复读 `VOTABLE_URL`。
- 部署包只含 `src/`、`node_modules/`、`package*.json`（见 `.fcignore`）。
- **日志**没有配：`logConfig: auto` 能建出日志库，但创建函数时回 403「No permission to access the logstore」，部署账号 `octathlon-deploy` 没有日志服务的权限。要日志，由账号主人给部署账号加上日志服务的权限后，在 `s.yaml` 写回 `logConfig: auto` 再部署。没有日志时，`s cli fc3 invoke`（`admin.mjs` 用的就是它）仍会打印那一次调用的输出。
- 那次尝试留下了一个日志项目 `serverless-cn-hangzhou-f3324317-66de-5ec1-a8fe-3be30be3bb2c`（日志库 `default-logs`），现在没有用到；部署账号没有权限删除它。

## 接口域名与证书

`node tools/domain.mjs` 管这一套，用 `octathlon` 这套 CLI 配置（部署账号要有函数计算、云解析、数字证书管理服务的权限）。它只动 `wendystars.com` 下两种记录：`api` 的 CNAME，和证书验证用的 `_dnsauth.api` TXT（签发后删掉）。

- **解析**：`api.wendystars.com` CNAME → `1697240498666956.cn-hangzhou.fc.aliyuncs.com`（函数计算在杭州的自定义域名入口），TTL 600。
- **证书**：数字证书管理服务的免费 DV 证书（`digicert-free-1-free`，DigiCert 签发，有效期 3 个月；账号的免费额度共 20 张，用 `aliyun cas DescribePackageState --ProductCode digicert-free-1-free --profile octathlon` 看还剩几张），DNS 验证。现在这张：CertId `28800764`，覆盖 `api.wendystars.com`，**2027-02-23 23:59:59 UTC 到期**。
- **自定义域名**：`api.wendystars.com`，协议只开 HTTPS，路由 `/*` → `octathlon-votes`（LATEST），匿名访问；证书以 `api-wendystars-com-<CertId>` 的名字装在上面。

命令：

```sh
cd website/services/votes
node tools/domain.mjs status    # 协议、路由、证书名和到期日
node tools/domain.mjs renew     # 续期：申请新证书 → 验证 TXT（证书服务自己加，没加就由脚本加）→ 等签发（一般几分钟）→ 删验证 TXT → 换到自定义域名上
node tools/domain.mjs install [CertId]   # renew 中途断了、证书已签发时，只做最后一步
node tools/domain.mjs setup     # 从零开始：先加 CNAME，再做 renew（已经做过）
```

**续期**：免费证书只有 3 个月，到期前 2～3 周（下一次在 2027 年 2 月初）跑一次 `node tools/domain.mjs renew`，再跑 `status` 确认 `validTo` 换成了新日期。旧证书过期后可在控制台的「SSL 证书管理」里删掉，不删也无妨。脚本不打印证书私钥，私钥只经命令参数交给 `aliyun fc` 写到自定义域名上。

## 对账与清票

- **每天一次**：定时触发器 `reconcile-daily` 在北京时间 04:30 以 `POST /invoke` 调用函数，`payload` 是 `{"op":"reconcile","token":…}`。口令由签名密钥算出，`deploy.mjs` 每次部署时写进触发器；经 HTTP 触发器打到 `/invoke` 的请求没有口令，一律 403。
- **对账怎么算**：先读全部 `tallies`，再扫全部 `ballots` 算出每件作品的票数、每卷和专题的观测者数，对不上的行按「读到的旧值」条件改写（应为 0 的行删除）。对账途中有人投票、那一行的计数变了，就跳过，留给下一次，不会盖掉新票。
- **手动对账**：`node tools/admin.mjs reconcile`，回复里有 `ballots`、`fixed`（改了几行）、`skipped`（跳过几行）。
- **清票**：`node tools/admin.mjs purge --task <卷key> [--model <型号id>] [--limits]`，删掉一卷（或其中一件作品）的票、只为这一卷来的观测者的 `voters` 行，可选清空限频计数，然后对账。作品重测换新版本、决定旧票清零时（votes.md 第十四节）就用它。

## 轮换签名密钥

1. 在 `.secret` 的第一行前面插一行新密钥（新密钥在上，旧密钥留在下一行）。不要把密钥打印到屏幕，直接写进文件：
   ```sh
   node -e "const f='.secret',fs=require('fs');fs.writeFileSync(f,require('crypto').randomBytes(32).toString('base64url')+'\n'+fs.readFileSync(f,'utf8'))"
   ```
2. `node tools/deploy.mjs`。新 Cookie 用新密钥签；旧密钥签的 Cookie 仍认，并在下一次 `me`、投票或撤回时换发新签名。对账口令和 IP 哈希随之换新（限频计数换一批，无妨）。
3. 过几个月，删掉 `.secret` 里的旧密钥那一行再部署。到那时还没回来过的观测者会被当成新观测者。

密钥泄露时直接删掉旧行再部署：所有观测者都会被当成新观测者，票留在库里但认不回原主。

## 在网站的 Vite 开发服务器里挂本地票箱

处理函数和内存票箱只用 Node 自带模块，不依赖本目录的 `node_modules`，Vite 配置里直接 import：

```js
// website/topics/aesthetics/vite.config.js（或 scripts/ 里的一个插件）
import { readFileSync } from 'node:fs';
import { createHandler } from '../../services/votes/src/handler.js';
import { createMemoryStore } from '../../services/votes/src/store/memory.js';

function votesDev(dataDir) {
  return {
    name: 'votes-dev',
    configureServer(server) {
      const handle = createHandler({
        store: createMemoryStore(),
        votable: () => JSON.parse(readFileSync(`${dataDir}/votable.json`, 'utf8')),  // 每次请求都读，读不到就关
        limits: { newIdsPerIp: 0 },   // 本地反复清 Cookie 时不卡新 ID
      });
      server.middlewares.use(handle);   // 不是 /api/votes/ 的请求交给下一个中间件
    },
  };
}
```

- 开发服务器里网页和本地票箱同源，不用给 `cors`；前端在本地应把接口基址设成 `/api/votes/v1/aesthetics`（同源），线上是 `https://api.wendystars.com/api/votes/v1/aesthetics`。
- `createHandler({ store, votable, secret, limits, now, topic, clientIp, closed, pow, cookieSecure, cors })` 返回 `(req, res, next?)`，用的是 Node `http` 的请求和响应。它按 `req.originalUrl ?? req.url` 路由，挂在根上或挂在 `/api/votes` 下都行。
- `votable` 可以是返回名单对象的函数（同步或异步）、名单网址、或名单对象。
- 不给 `secret` 时每次启动随机一串；不给 `store` 时用内存票箱。重启开发服务器后票清零。
- 浏览器在 `http://localhost` 上也收带 `Secure` 的 Cookie；用局域网 IP 打开页面时传 `cookieSecure: false`。
- 开发服务器里的 IP 是 `req.socket.remoteAddress`。

## 发布时的快照（第 9.3 节）

`publish.py` 正式发布时 `GET https://api.wendystars.com/api/votes/v1/aesthetics/tally`，原样写进数据目录的 `votes.json`。名单还没发布或读不到时，这份计票是空的（`tasks: {}`）。

## 依赖

只有官方 SDK `tablestore@5.6.6`。`npm audit` 报它依赖的 `protobufjs@6` 有高危公告，均与解析不受信的 protobuf 定义或动态生成代码有关；SDK 只用自带的固定定义解码表格存储的回复，官方 SDK 目前没有修复版本。
