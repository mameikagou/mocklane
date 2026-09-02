# Mocklane Dashboard 设计系统

> 移植自 `agent-evolution-nocode`（Agent 无限进化场）的锁定设计系统，
> 以 `src/styles/tokens.css` 与 `tailwind.config.js` 为真值提炼。本文件是移植过程中的参考文档；
> Mocklane 内的生产真值位于 `dashboard/src/styles.css` 与 `tailwind.config.cjs`。

## Genre

Atmospheric technical console。**深空蓝黑画布 + 单一琥珀主色 + 语义状态色 + 极少量静态场景光**。
功能界面本身承担视觉表达，不使用装饰性插画、外部图片或营销型 enrichment。
Mocklane 是 Workbench 宏观结构：顶部运行上下文固定，主体是可操作的规则/日志工作台。

## Theme（颜色唯一真值）

深色为原生设计，浅色是同一语言的日间演绎（不是简单反色）。

### 深色（默认）

| Token | 值 | 用途 |
|---|---|---|
| `--surface-0` | `oklch(11.5% 0.018 255)` | 画布底色 |
| `--surface-1` | `oklch(15% 0.021 255)` | 面板 |
| `--surface-2` | `oklch(19% 0.024 255)` | 抬升面 / 控件 |
| `--surface-3` | `oklch(23% 0.026 255)` | 悬浮态 / 滑轨 |
| `--line` | `oklch(31% 0.026 255)` | 常规描边 |
| `--line-strong` | `oklch(42% 0.038 255)` | 强描边 / hover |
| `--grid` | `oklch(28% 0.025 255)` | 背景网格线 |
| `--ink-1` | `oklch(95% 0.012 80)` | 主文字（微暖白） |
| `--ink-2` | `oklch(74% 0.016 255)` | 次级文字 |
| `--ink-3` | `oklch(60% 0.02 255)` | 弱化 / meta |
| `--amber-core` | `oklch(78% 0.17 72)` | 唯一主色（竞技场琥珀金） |
| `--amber-strong` | `oklch(69% 0.19 58)` | 主色加深（实心底用） |
| `--amber-dim` | `oklch(56% 0.12 66)` | 弱化的主色文字 |
| `--amber-soft` | `oklch(36% 0.08 66)` | 主色底面（badge/track） |
| `--amber-ink` | `oklch(16% 0.025 58)` | 琥珀底上的文字 |
| `--amber-glow` | `oklch(78% 0.17 72 / 0.35)` | 辉光 |
| `--amber-faint` | `oklch(78% 0.17 72 / 0.08)` | 极淡琥珀底 |
| `--ok` / `--fail` | `oklch(76% 0.14 163)` / `oklch(69% 0.17 25)` | 成功 / 失败语义 |
| `--tool` / `--llm` | `oklch(72% 0.11 240)` / `oklch(72% 0.12 292)` | 信息 / 次级语义 |
| `--focus` | `oklch(88% 0.13 84)` | 键盘焦点环 |

约束：**Accent 每个视窗不超过约 5%**；语义色只承担状态，不参与大面积装饰。

### 浅色（`[data-theme='light']`）

暖纸面 + 深墨 + 同源琥珀：

- surface-0..3：`oklch(95.5%/98.5%/92.5%/87.5% … 90)`（暖白阶梯，surface-1 最亮做面板）
- line：`oklch(80% 0.015 90)`；line-strong：`oklch(64% 0.02 80)`；grid：`oklch(74% 0.015 90)`
- amber-core：`oklch(60% 0.15 60)`；soft：`oklch(82% 0.07 68)`；ink：`oklch(98% 0.01 90)`
- ok/fail/tool/llm 降明度同台（如 ok = `oklch(52% 0.12 163)`）
- ink-1/2/3：`oklch(22%/40%/54% … 255)`
- focus：`oklch(52% 0.14 60)`

## Typography

- **Display**：`Tomorrow` 600/700 —— 页面主标题（hero h1）、品牌名。
- **Body**：`IBM Plex Sans` 400/600 —— 说明与操作文本。
- **Mono**：`IBM Plex Mono` 400/500 —— endpoint、rule id、时间、端口、状态码。
- 所有指标/表格使用 `font-variant-numeric: tabular-nums`。
- 字号四层：面板标题 16–18px、正文/操作 13–14px、meta/徽标 10–11px（等宽）、hero clamp(26px, 3vw, 36px)。
- 中文回退 `PingFang SC`；字体经 Google Fonts `<link>` 加载（不用 `@import`）。

## 形态语言（Shape）

- **切角面板（chamfer）**：卡片角落 8–12px 的 45° 裁切，用 `clip-path: polygon(...)`。
  视觉裁切，**勿与大圆角、外阴影同用**。
- **细描边**：1px `--line` hairline；hover 可升至 `--line-strong`。
- 圆角尺度收紧：卡片 = chamfer；控件（badge/select/button）≤ 6px；pill 只允许 switch/状态点。
- **背景场 `.mc-field`**：fixed 全屏、pointer-events none——
  径向琥珀辉光（52% 26%，9% 混合）+ 2.5rem 网格（mask 上下淡出）+ 两个同心琥珀环（16% 混合）。
- **顶部光谱线**：`linear-gradient(90deg, llm, amber 55%, ok)`，可用于 hero/面板顶饰。

## Spacing / Radius / Motion

- 4pt 命名尺度：`--space-xs .5rem / sm .75rem / md 1rem / lg 1.5rem / xl 2.5rem`。
- 时长：`micro 120ms / short 200ms / long 420ms / scene 600ms`。
- 缓动：`ease-expo cubic-bezier(0.16,1,0.3,1)`（出）、`ease-in cubic-bezier(0.7,0,0.84,0)`。
- **只用 transform 与 opacity**；不使用无语义的连续装饰动画。
- reduced-motion：全部动画/过渡压到 ≤150ms 淡入或直接终态。

## Microinteractions

- 成功默认静默；错误用 fail 语义条（notice）。
- 键盘 focus **立即**显示：2px `--focus` outline，offset 2px，不参与过渡。
- 状态点 pulse：7px 圆点，激活态 `--amber-core` + 琥珀辉光。
- switch：38×22 轨道、16px 滑块；激活态琥珀 soft 底 + core 滑块。
- 选区 `::selection`：琥珀 glow 底 + ink-1 文字。

## CTA voice

- **Primary**：琥珀描边或轻量琥珀底（amber-faint），不用大面积实心色块。
- **Secondary**：深色表面（surface-2）+ 细边框，hover 边框升 line-strong。
- **Ghost**：ink-3 文字，hover 升 ink-1；refresh/主题切换等低频操作用。
- 标签用具体动作（Refresh、Dark/Light），不用模糊词。

## Mocklane 语义映射

| Mocklane 旧 token | Arena token |
|---|---|
| accent 绿 `#64d8b1` | `amber-core`（全局唯一主色） |
| badge success | `ok` 绿（命中/连通语义保留绿，但收敛到 arena 的 ok） |
| badge info | `tool` 蓝 |
| badge warning | `amber-dim` |
| badge danger | `fail` 红 |
| badge muted | `ink-3` + surface-2 底 |
| 12px 圆角面板 | chamfer 切角面板 |
| hero/brand 字重 650 | Tomorrow 600/700 |
| UI mono | IBM Plex Mono |

页面共享：深空网格 + 同心环 + 琥珀焦点 + 切角面板 + 三套字体 + 统一按钮/焦点/状态语言。

## Frontend architecture（功能域划分）

```
dashboard/src/
  index.jsx            rspack 薄入口：挂 <App/>，无逻辑
  styles.css           arena 视觉真值（tokens + 组件层类名）
  app/                 组合层，只做布局
    App.jsx            shell（mc-field 背景场 + 组合各 feature 面板 + 错误条）
    Topbar.jsx         品牌 + 连接状态 + 主题/刷新操作
    Footer.jsx
  lib/                 跨域基础设施
    client.js          daemon 传输层：WebSocket / RPC 配对 / 指数退避重连，无业务
    store.js           唯一状态源：useMocklane(selector) 订阅 + 动作
                       (refresh / changeGlobal / switchScenario / toggleRule / initMocklane)
    theme.js           useTheme（dark 默认，localStorage 持久化）
  ui/                  无状态原语（Button Badge Switch Select Icon EmptyState）
  features/            功能域，一个域一个目录
    connection/        daemon/extension 连接状态
    system/            系统状态位（gate 大字状态 + 桥/规则计数）
    gate/              全局 mock 开关
    rules/             endpoint 列表（EndpointsPanel + EndpointRow）
    now-serving/       每条规则当前场景 + 命中计数（NowServingPanel）
    hitlog/            命中日志（HitLogDrawer 抽屉 + HitLog 表格，默认收起）
```

约束（新代码必须遵守）：

- **组件不许 new WebSocket、不许直接持有 RPC**；读状态用 `useMocklane(selector)`，改状态调 store 动作。
- `lib/client.js` 只懂协议（hello / rpc-result / event），不 import store；`lib/store.js` 单向依赖 client。
- `ui/` 原语保持无状态、不 import lib/；`features/*` 可以 import ui/ 和 lib/store.js，不许跨 feature 互相 import（共享逻辑下沉到 lib/）。
- 新功能 = 在 `features/` 下开新域目录 + 在 `App.jsx` 组合；App 内不写业务逻辑。
- 事件上限、RPC 超时等常数留在对应 lib 文件顶部，不散落到组件。

