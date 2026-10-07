# 演出引擎 · 数据契约（走位 / 部件关节 / 姿势序列 / 景深氛围）

本文件是 `shots.json` 新字段与资产目录约定的唯一真源。schema 实现在
`src/spec.ts`，逐帧求值在 `src/lib/rig.ts`（纯函数），渲染在
`src/lib/Sprite.tsx` / `src/lib/Shot.tsx`。

## 1. 角色走位（moves / 进出走场）

`characters[].moves`：分段位移，镜头内按 `at` 起始时刻（缺省接上一段结束）顺序执行。

```jsonc
{"id": "rin", "x": 0.3, "y": 0.94, "enter": "walk-left",
 "moves": [
   {"to": {"x": 0.55, "y": 0.96}, "durSec": 2.0, "gait": "walk"},
   {"to": {"x": 0.3,  "y": 0.9},  "durSec": 1.5, "gait": "walk", "at": 4.0, "ease": "linear"}
 ]}
```

- `to`：目标锚点（脚底，世界系 0..1，允许 -0.2~1.2 出画）
- `durSec` / `at` / `ease`（easeInOut|linear|hold）
- `gait`：`walk` = 步态起伏+轻微倾摆；`glide`/`none` = 纯位移
- **朝向自动**：行进方向左→自动 flip，右→取消 flip；`flip` 字段仍作默认朝向
- `enter/exit` 新增 `walk-left`/`walk-right`：从画外走入/走出（固定约 1.1s）；
  旧值 `left`/`right` 仍是 0.6s 滑动，零迁移。

## 2. 部件关节 rig（可选）

```
characters/<id>/
  parts/parts.json     # 存在即启用部件渲染模式
  parts/<part>.png     # 带 alpha 部件图，自然尺寸
```

`parts.json`（拼合坐标 = 与原立绘同口径的 px 画布）：

```jsonc
{"size": [400, 640],
 "parts": [
   {"id": "torso", "file": "torso.png", "at": [102, 168], "pivot": [200, 380], "depth": 4},
   {"id": "head", "file": "head.png", "at": [128, 2], "pivot": [200, 160], "parent": "torso", "depth": 5}
 ]}
```

- `at`：部件左上角在拼合画布上的偏移
- `pivot`：旋转关节点（拼合 px）；旋转/缩放绕它进行
- `parent`：父部件 id，子部件继承父变换（前臂跟上臂）
- `depth`：部件叠放次序（小→后）

**SVG 角色同样可用**：无需 parts.json，动作轨道直接作用于 SVG 内
`id="<part>"` 的命名组；关节点用 `data-pivot="x y"`（viewBox 坐标）声明，
缺省取包围盒中心。`#eyes`/`#mouth`/`#mouth-open` 行为不变。

## 3. 动作剪辑（action）

声明式剪辑 `characters/<id>/actions/<name>.json`，`characters[].action`
引用（字符串或 `{name, speed, loop}`）：

```jsonc
{"durationSec": 1.6, "loop": false, "hold": true, "fps": 8,
 "frames": ["seq/step-1", "seq/step-2"],              // 可选：姿势序列帧
 "tracks": {                                          // 可选：部件轨道
   "arm-r": [{"t": 0, "rot": 0},
             {"t": 0.55, "rot": -118, "ease": "easeInOut"},
             {"t": 1.6, "rot": -110}]}}
```

- `frames`：`characters/<id>/<name>.png` 逐帧切换（变体名/子目录均可），
  `fps` 控制节奏、`loop:false`/`hold` 播完停末帧。大动作（换姿势/换表情）用它。
- `tracks`：部件关键帧，`t` 秒处 `{rot,dx,dy,scale,opacity,ease}`，
  相邻关键帧间按 ease 插值。小动作（抬手/转头/鞠躬）用它。
- 两者可并存：frames 切整幅、tracks 同时驱动部件或 SVG 组。
- 剪辑时长 `durationSec`：轨道求值的循环周期；`loop:false` 播完保持。

## 4. 道具（attachTo / motion / depth）

```jsonc
{"file": "tea-mug", "x": 0, "y": 0, "scale": 0.5,
 "attachTo": {"character": "bot", "part": "forearm-r"}}

{"file": "signal-pip", "x": 0.2, "y": 0.45, "scale": 0.8,
 "motion": [{"t": 0, "x": 0.2, "y": 0.45, "rot": 0},
            {"t": 2.2, "x": 0.8, "y": 0.35, "rot": 180}]}
```

- `attachTo`：道具中心锚在目标部件 pivot 上，随部件移动/旋转/透明度；
  目标无 parts 时退回静态摆位（validate 警告）。
- `motion`：镜头内位移+自转关键帧（优先于静态 x/y）。
- `depth`：道具与角色统一 z 序混排（大者靠前）。

## 5. 分层场景与氛围

`scenes/<name>/scene.json` 存在即启用分层模式（否则用 `scenes/<name>.png|.svg`）：

```jsonc
{"layers": [{"file": "background.png", "depth": 0.7, "id": "bg"},
            {"file": "console.png",    "depth": 1.0, "id": "console"},
            {"file": "foreground.png", "depth": 1.35, "id": "deck"}],
 "ambient": [{"type": "dust", "count": 36, "depth": 1.1, "size": 3, "opacity": 0.35},
             {"type": "flicker", "layer": "console", "hz": 2.4, "amp": 0.10},
             {"type": "pulse",   "layer": "holo",    "hz": 0.9, "amp": 0.05}]}
```

- 层 `depth`：<1 远景（相机移动少）/ 1 随主体 / >1 前景（遮挡角色脚部）。
  depth≤1 的层渲染在角色后，>1 在前。
- `ambient`：`dust` 漂浮粒子（depth 决定它在角色前/后）、`flicker` 目标层
  透明度抖动、`pulse` 目标层缩放呼吸。数据驱动，不写死镜头。
- 角色/道具 `depth` 字段是世界内 z 序，与场景层 depth 正交。

## 6. 兼容性

- 旧 `shots.json` 零迁移：新字段全可选；`enter:left/right`、静态角色、
  整幅场景行为逐帧不变。
- 相机/转场/字幕/口型/眨眼/音轨路径不变；letterbox 字幕仍压黑边。
- `pnpm validate` 卡口新增：scene.json 层文件、parts.json 部件图、
  动作剪辑文件与序列帧、attachTo 目标存在性。
- 参考夹具：`public/episodes/ep00/`（演示集，9 镜头覆盖全部能力）。
