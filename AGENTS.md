# maplayer-content · AI 员工流水线手册

本仓库是 2D 手绘风格动画的内容生产线。员工产出**数据与 SVG 资产**，由内置的
Remotion 播放器（`src/lib/`）按分镜表自动合成成片，不要改渲染代码，除非你领的是工程任务。

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

依赖规则：M2 依赖对应角色的 P2 验收任务；M3/M4 依赖 P3；M5 依赖全部原型关；
M6 依赖 M5；M7 依赖 M6。新增角色永远先走 P2 demo，禁止直接进量产。

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
pnpm typecheck
```

依赖：`python3 -m edge_tts`（pip install edge-tts）用于配音；缺它自动退到 `say`。
FFmpeg 不用装——Remotion 自带合成器。

## 红线

- 不改公司规则；不把客户资料/凭证/`.env` 内容写进任何产物或证据。
- 资产和分镜只动自己任务授权的集数目录。
- 台词改动必须重跑 `pnpm audio` 再 `pnpm validate`，否则清单对不上。
