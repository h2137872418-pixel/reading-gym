# 答题台 PWA

逐句精读的本地优先作答台。设计定稿见 `../../project_meta/answer_card/DESIGN.md`，与团队侧的 JSON 契约见 `../../project_meta/answer_card/CONTRACT.md`。

## 跑起来

```powershell
npm install
npm run dev          # http://localhost:5173
# 或
npm run build
npm run preview      # http://localhost:4173
```

> 必须通过 http 打开。service worker 和 PWA 安装在 `file://` 下不工作。

## 一天的流程

1. **今日** → `导入 task`（或点 `载入示例`），打开 session。
2. **切句**：点词与词之间加 `¶`，自己判断句子边界；`冻结边界` 生成 `S1、S2…`。
3. **逐句作答**：`① 切块 → ② 标类 → ③ 骨架`。三个阶段同屏，光标自己往下走。
4. **导出 answer**：下载 `YYYY-MM-DD.json`，拖进 `shared/answers/`。
5. **导入批改**：coach 产出 review JSON 后导入，错句直接高亮，可「只看错句」。

## 手机使用

```powershell
npm run dev:host     # 监听局域网，终端会打印 http://<电脑IP>:5173
```

手机连同一 Wi-Fi，浏览器打开那个地址即可。第一次可能要允许 Windows 防火墙放行 Node。

- 布局：≤900px 自动单列；顶栏把「简洁模式 / 导入批改 / 导出 / 导出 md / 重切」收进右上 `⋯`；底栏只留「提交」和「下一步」。
- 触屏：词间切点的热区扩大到约 24×44px，手指也能点准。
- **数据各自独立**：手机和电脑的 IndexedDB 互不相通。搬运用「设置 → 导出全部备份」，另一台「导入备份」。
- **装成 App 需要 HTTPS**：`http://局域网IP` 不是安全上下文，service worker 不会注册。要安装请部署到 GitHub Pages / Cloudflare Pages，或用 `cloudflared tunnel --url http://localhost:5173` 拿一个临时 HTTPS 地址。

## 键盘

| 阶段 | 键 | 作用 |
|---|---|---|
| 切块 | `←` `→` | 在词界间移动 |
| 切块 | `Space` | 切 / 取消切点 |
| 切块 | `Enter` | 进入标类 |
| 标类 | `1` `2` `3` | 从句 / 非谓语 / 并列，继续按数字选子类 |
| 标类 | `Space` | 跳到下一块 |
| 标类 | `Backspace` | 清除当前块标注 |
| 标类 | `Enter` | 进入骨架 |
| 骨架 | `Tab` | 换行 |
| 骨架 | `Enter` | 下一句 |

任意时刻点任意块都能直接标：软流程，不锁界面。

## 数据

- 本地副本：IndexedDB（库 `reading-gym`），自动保存，无云同步、无遥测。
- 导出：`answer JSON`（契约 v0.2）、`Markdown`（贴 issue 用）、`全量备份`。
- 真源 / 派生：`chunk_cuts → chunks`、`chunk_tags → clause_types`、`skeleton_parts → skeleton`。

## 示例文件

- `public/samples/task-demo.json`：两段真实 CET-6 材料（来自 `shared/texts/inbox/`）。
- `public/samples/review-demo.json`：批改回放用，导入后可在「只看错句」里看到 `C`/`M`/`R` 三种错误。

## 自测

```powershell
npm run typecheck
npm run smoke        # schema / 切点 / 派生字段 / 不变量
npm run build
```

`npm run smoke` 覆盖：task schema、冻结切句、`chunks.join('') === text`、骨架行与标签对齐、导出不变量、review schema。

## 目录

```text
src/
  types.ts          领域类型与受控词表
  schema.ts         zod 校验 + 导出不变量
  db.ts             IndexedDB 适配器、备份/恢复
  lib/text.ts       切点、分块、句子切片
  lib/taxonomy.ts   三层从句类型树
  lib/session.ts    冻结、骨架对齐、answer 派生
  lib/export.ts     JSON / Markdown 导出
  components/       ChunkLine、SentenceEditor、ClauseMenu、ReviewCard、Segmenter
  pages/            Today、Session、History、Settings
scripts/smoke.ts    纯逻辑自测
```
