# maplayer-content · AI 员工流水线手册

本仓库是 2D 手绘风格动画的内容生产线。员工产出**数据与 SVG 资产**，由内置的
Remotion 播放器（`src/lib/`）按分镜表自动合成成片，不要改渲染代码，除非你领的是工程任务。

## 岗位轨（discipline）

本项目岗位体系与软件线不同。schema 字段落地前，任务标题统一挂轨标签
（如「[角色] 凛 表情变体量产」），员工按标签认领对口任务：

| 轨 | 职责 | 验收人 |
|---|---|---|
| `script` 编剧 | 剧本、分场、角色小传、台词 | GM→owner（原型段）|
| `character` 角色设计 | 角色 SVG、变体、三视图 | owner（demo）→GM（量产）|
| `prop` 服化道 | 道具、挂件、服装差异 | GM |
| `scene` 场景美术 | 背景、氛围图 | owner（基调 demo）→GM |
| `storyboard` 分镜 | shots.json、镜头设计 | GM |
| `voice` 配音 | 声线表、台词音轨 | GM |
| `composite` 合成 | 渲染、成片 | QA |
| `review` 审片 | 抽帧终验 | QA→owner（里程碑）|

过渡期所有轨共享 ai-content 编制，标签只做认领引导；岗位轨字段落地后
（工程目标 435893bef77a60fa）改为编制级定向派工。

## 流水线（两段：原型 → 量产）

**原型段（概念设计，验收人必须是老板）**——任何新角色、新视觉风格、新场景基调，
先做 demo 收进「原型验收任务」（reviewerRole=owner），交付证据必须是老板能直接
打开的产物（静帧 PNG 或短样片路径）。老板 approve 前，所有依赖它的量产任务不得解锁。

| 原型阶段 | 产物 | 落点 |
|---|---|---|
| P1 概念剧本 | 分场大纲 + 角色小传 | `episodes/<ep>/script.md` |
| P2 角色 demo | 新角色 `default` SVG + 一张入镜静帧 | `assets/characters/<id>/default.svg` + `storyboard/frames/` |
| P3 风格 demo | 场景基调图 + 道具风格样张 | `assets/scenes/<id>.svg` + `assets/props/*.svg` |

**量产段（铺量制作，GM/QA 验收）**——原型过关后由经理解锁：

| 量产阶段 | 产物 | 落点 |
|---|---|---|
| M1 剧本定稿 | 完整分场剧本 | `episodes/<ep>/script.md` |
| M2 角色量产 | 表情/服装变体 SVG | `assets/characters/<id>/<variant>.svg` |
| M3 服化道量产 | 全量道具、挂件 | `assets/props/*.svg` |
| M4 场景量产 | 全量背景 | `assets/scenes/*.svg` |
| M5 分镜 | 镜头表 | `shots.json` |
| M6 配音 | 声线 + 音轨 | `episode.json` voices + `pnpm audio` |
| M7 成片 | mp4 | `pnpm render` → `renders/` |
| M8 QA 终验 | 抽帧检查报告 | `pnpm frames renders/<片>.mp4` → `qa/frames/` |

依赖规则：M2 依赖对应角色的 P2 验收任务；M3/M4 依赖 P3；M5 依赖全部原型关；
M6 依赖 M5；M7 依赖 M6。新增角色永远先走 P2 demo，禁止直接进量产。

## 原画质量规范（开工前必读）

唯一参照系是 `public/assets/style-bible/`——老板选定的风格定稿。
**没有基线不许开工**：先走「风格方向」任务，员工出 2~3 个候选方向
（每方向一张角色+一张场景 demo 帧），老板选定后落定基线。
现有 ep01 资产全部是基线未定前的占位货，基线落地后要整批按基线重绘。

产出纪律：
1. 读 `docs/style/STYLE.md`（线宽/墨色/三阶上色/比例/透视硬规范）
2. 角色一律从 `public/assets/templates/character-front.svg` 骨架起稿，
   交付前删 `#guide` 参考线层
3. 共享滤镜/渐变从 `public/assets/shared/defs.svg` 复制 defs 块
4. 用色限在 `public/episodes/<ep>/palette.json` 色板容差内
5. `pnpm validate` 的结构项（viewBox/位图/动画组/参考线）永远硬卡口；
   风格项（复杂度/色板/线宽/滤镜）在基线落地前为警告、落地后升级失败

## 数据契约

`episode.json`：集号、标题、画幅、声线表（角色 id → edge-tts 声线，如
`zh-CN-XiaoxiaoNeural`；`say:<voice>` 强制走 macOS say 兜底）。

`shots.json` 每镜头字段：

- `scene`：场景名（无 `.svg`），`null` = 黑场
- `camera`：`{from:{x,y,zoom}, to:{...}, ease}`，x/y 为取景中心（0..1）、zoom≥1；
  取景范围约束 `x∈[0.5/z, 1-0.5/z]`，越界会露黑边（validate 会警告）
- `characters`：`{id, variant, x, y, scale, flip, enter}`；y 是脚底锚点
- `props`：`{file, x, y, scale, anim: none|blink|blink-fast|float}`
- `dialogue`：`[{speaker|null(旁白), text, voice?, gapSec?}]`
- `caption`：顶部说明字幕（场景卡/旁白条）；`transitionIn`：cut|fade|fade-black
- 镜头时长自动算：`padIn + Σ台词 + padOut`，无台词用 `holdSec`

## SVG 角色约定（动画挂点）

- 必须有 `viewBox`；底部中心是站位锚点；建议高度 400~600 单位
- `#mouth` 闭嘴、`#mouth-open` 说话口型（初始 `display:none`，播放器自动开合 ~6fps）
- `#eyes`（或 `#eye-l`/`#eye-r`）眨眼组，播放器周期性压扁
- `feTurbulence+feDisplacementMap` 滤镜（scale 3~5）营造手绘抖动线感

## 命令

```bash
pnpm install        # 首次
pnpm validate ep01  # 完整性检查（资产/机位/音轨覆盖/时间线）
pnpm audio ep01     # 生成全部台词音轨 → audio/manifest.json（改台词后必跑）
pnpm storyboard ep01# 每镜头静帧 + contact sheet → public/.../storyboard/
pnpm studio         # Remotion Studio 实时预览
pnpm render ep01    # 成片 → renders/
pnpm frames renders/ep01-smoke.mp4  # QA 抽帧：抽样帧 + 拼贴总览 → qa/frames/
pnpm typecheck
```

依赖：`python3 -m edge_tts`（pip install edge-tts）用于配音；缺它自动退到 `say`。
FFmpeg 不用装——Remotion 自带合成器。

## QA 终验标准（验收人必查）

1. `pnpm validate <ep>` 全绿；
2. `pnpm render <ep>` 出片成功；
3. `pnpm frames renders/<片>.mp4` 后逐张检查抽样帧与 sheet.jpg：
   黑帧/闪帧、字幕错位截断、口型对不上说话人、机位露黑边、资产穿帮；
4. 音频：抽查 2~3 段台词音画同步、说话人声线符合声线表；
5. 时长符合目标（ep01 正式版 ~5 分钟）。证据附 sheet.jpg 路径与问题清单。

## 老板审核交付包（reviewerRole=owner 的任务）

按公司交付包标准：证据须附老板可直接打开的样片 mp4 路径 +
qa/frames/<片>/sheet.jpg 拼贴图；多版本对比给多张静帧。缺件视为不合格交付。

## 红线

- 不改公司规则；不把客户资料/凭证/`.env` 内容写进任何产物或证据。
- 资产和分镜只动自己任务授权的集数目录。
- 台词改动必须重跑 `pnpm audio` 再 `pnpm validate`，否则清单对不上。
