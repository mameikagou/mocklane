# PLANNING-4 · 规则级实时命中 URL 视图

## 目的

用户要知道的是**哪些规则正在生效**——不是历史累计（"命中过"方案已否决），
而是此刻流量实际打进了哪些规则、每个规则正在被哪些 URL 命中。

一句话：规则行可展开，展示该规则**正在命中**的 URL 实时清单。

## 数据来源：不加存储，用 live 事件流

dashboard store 已经维护最近 80 条 hit（`refresh()` 拉取 + socket `hit` 事件实时前置）。
按 `ruleId` 分组、按 URL 聚合，就是"正在命中"的准确视图：

- 扩展端零改动、零新字段——live 视图本质上是会话级的，持久化反而是误导
- dashboard 刚打开时也有数据（refresh 拉最近 80 条），随后随事件流实时更新
- 窗口被淘汰的旧 hit 自然消失，语义正好是"现在"，不是"曾经"

## 方案

1. `lib/time.js`（新）：`ago()` 从 now-serving feature 上移到 lib（feature 间禁止交叉引用），
   NowServingPanel 改为 import。
2. `EndpointRow.jsx`：
   - 订阅 `s.logs`，按 `rule.id` 过滤，按 URL 聚合成 `{url, count, last, host}`（host 来自
     hit.pageUrl，呼应环境维度：能看到这条规则正在哪个环境生效）
   - meta 行加 `live · N` 提示（N = 窗口内该规则的不同 URL 数，0 则不显示）
   - 展开区在场景卡之下加 "live urls" 区块：URL（mono，整 URL 入 title）、page host、
     ×N、ago(last)，按最后命中倒序，展示上限 20 条
3. `styles.css`：`.live-hits` 系列 class，字面量（purge 规则），复用既有 token。
4. README dashboard 段一句话提及。

## 不做

- 不做持久化 hitUrls 字段（用户明确否决"命中过"）
- 不做定时器刷新 ago——事件驱动 rerender，与 NowServing 现状一致
- CLI 不动：`report` 已回答"哪些规则从未命中"（neverHit），dashboard 回答"此刻谁在生效"
