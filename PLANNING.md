# PLANNING · Dashboard「Now serving」状态板重构

日期:2026-09-01 · 状态:执行中

## 目的(为什么改)

Mocklane 是 AI 自动化 mock 工具,真实分工是:

- **Agent(CLI)** 负责读日志、验证命中、驱动全流程——`logs` 是 agent 的眼睛
- **人(dashboard)** 只需要三眼确认:桥活着吗?门开着吗?现在页面上跑的是哪个场景?

当前 dashboard 把 Hit log 流水账放在右列黄金位置,服务的是一个不存在的需求(人不看日志)。本次重构把 dashboard 从「日志控制台」改成「状态板」:右列从 80 行日志表格换成按规则聚合的实时状态视图,日志降级为可展开抽屉。

同时清除营销/噪音文案——这是工作台,不是落地页。

## 交互语义约定

- 「静默」不是异常,不标灰、不报警。唯一值得标记的信号是**从未命中**(`no hits` muted 徽标)——它可能意味着规则没配上或页面不调该接口。
- 「禁用」已有 `is-muted` 语义,不与任何其他状态共享视觉。
- 命中计数必须诚实:从 extension 状态里的持久计数器取,**不允许**从 dashboard 本地的 80 条窗口推算(窗口会截断,计数是假的)。

## 改动范围

### 后端(src/core,协议零变更)

| 文件 | 改动 |
|---|---|
| `src/core/schema.mjs` | `normalizeRule` 增加两个持久字段:`hitCount`(整数,默认 0)、`lastHitAt`(ISO 字符串,默认空) |
| `src/core/state.mjs` | `recordHit` 追加日志后,按 `hit.ruleId` 命中规则时 `hitCount += 1`、`lastHitAt = hit.timestamp` |

- 不动:daemon(纯 relay)、CLI、matcher、request 路径、任何现有命令的出入参形状。
- `list` / `status` 自动携带新字段(它们直接返回 normalize 后的 rule)。
- 兼容性:旧 IndexedDB 数据没有这两个字段,normalize 补默认值,无迁移逻辑。
- 兜底:`bun run test` 全绿才算完;如后端改炸,回退方案 = dashboard 仅从 logs 窗口聚合(计数标注 `last 80`),GPT 兜底修复。

### 前端(dashboard/src)

| 文件 | 改动 |
|---|---|
| `features/system/SystemPanel.jsx` | **新增**。替换 HeroPanel:display 字号呈现 gate 状态(Gate open · mocking live / Gate closed · pass-through),下方一行桥状态 + armed 规则数。无营销文案 |
| `features/now-serving/NowServingPanel.jsx` | **新增**。每条规则一行:endpoint(mono)+ 当前生效场景(琥珀)+ 最后命中相对时间 + hitCount;0 命中给 `no hits` muted 徽标;disabled 沿用 is-muted |
| `features/hitlog/HitLogPanel.jsx` | 改造成 NowServingPanel 内部的**折叠抽屉**(`Hit log · N events` + chevron),展开后表格在 max-height 内滚动 |
| `features/hero/HeroPanel.jsx` | **删除**(营销位移除) |
| `app/App.jsx` | overview-grid = SystemPanel + GlobalGatePanel;content-grid = EndpointsPanel + NowServingPanel |
| `styles.css` | 删 hero/hero-meta/muted-text;删 log-panel sticky 那套(抽屉不需要);新增 system-panel、now-serving、drawer 样式;相对时间用 mono ink-3 |
| `dashboard/DESIGN.md` | features 目录清单同步(system、now-serving;移除 hero) |

### 文档

| 文件 | 改动 |
|---|---|
| `README.md` | Dashboard 一节改写:状态板定位,不再是 "streaming hit log" |
| `skills/browser-mock/references/schema.md` | Rule 字段表补 `hitCount` / `lastHitAt`(只读,由系统维护) |

## 不做的事(显式排除)

- 不加 dashboard 写规则的能力(CLI 仍是唯一写路径)
- 不加过滤/搜索/多 tab 维度(用户当前单 tab 场景,等真实需求出现)
- 不改 hit log 表格本身(它只是搬家进抽屉)
- 不动 daemon 与 CLI

## 验收

1. `bun run test` / `lint` / `typecheck` / `build` 全绿
2. 页面首屏一眼可读:gate 状态、桥状态、每条规则当前场景 + 命中情况
3. 首屏无营销文案;日志默认收起,点击可展开
4. 旧数据(无 hitCount 字段)打开不报错,计数从 0 开始累加
