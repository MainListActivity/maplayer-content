# maplayer-content · AI 员工流水线手册

本仓库是 2D 手绘风格动画的内容生产线。员工产出**数据与 SVG 资产**，由内置的
Remotion 播放器（`src/lib/`）按分镜表自动合成成片，不要改渲染代码，除非你领的是工程任务。

## 流水线（七段）

| 阶段 | 产物 | 落点 |
|---|---|---|
| 1 剧本 | 分场剧本 | `episodes/<ep>/script.md` |
| 2 角色设计 | 每个角色一目录，每个表情/服装一个 SVG | `public/episodes/<ep>/assets/characters/<id>/<variant>.svg` |
| 3 服化道 | 道具、挂件 SVG | `public/episodes/<ep>/assets/props/*.svg`（服装差异走角色 variant） |
| 4 场景 | 背景 SVG，1920×1080 viewBox | `public/episodes/<ep>/assets/scenes/<name>.svg` |
| 5 分镜 | 镜头表 | `public/episodes/<ep>/shots.json` |
| 6 配音 | 声线配置 + 生成音轨 | `episode.json` 的 `voices` + `pnpm audio <ep>` |
| 7 成片 | mp4 | `pnpm render <ep>` → `renders/` |

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
