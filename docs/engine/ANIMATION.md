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
- 缺省 `at` 按声明顺序接前一段结束；解析后按起始时间稳定排序。
  重叠时后段接管，起点冻结为接管时刻的位置，停步后停止步态并保留行进朝向。
  `walk-out` 在离场开始时接管；其后的 moves 不再执行。
- `gait`：`walk` = 步态起伏+轻微倾摆；`glide`/`none` = 纯位移
- **朝向自动**：行进方向左→自动 flip，右→取消 flip；`flip` 字段仍作默认朝向
- `enter/exit` 新增 `walk-left`/`walk-right`：从画外走入/走出（固定约 1.1s）；
  旧 `enter:left/right` 仍是 0.6s 线性滑动；旧 `exit:left/right` 是历史死字段，
  继续不生效以保持零迁移。离场必须用新增的 `exit:walk-left/walk-right`。

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

部件 rig 即完整渲染模式：**纯部件角色可不带 `default` 整幅资产**（rig 模式下
整幅变体根本不加载）。`variant` 字段仅作用于无 parts 的整幅模式。

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

- `frames` 的语义随渲染模式分流：
  - **整幅模式**（无 parts）：`characters/<id>/<name>.png|.svg` 逐帧切换
    （PNG 优先，变体名/子目录均可）。大动作（换姿势/换表情）用它。
  - **部件 rig 模式**：`frames[i]` 指姿势目录 `parts/poses/<frame>/`，
    目录内与部件同名的 PNG **稀疏覆写**该部件贴图（缺哪个部件就用基底贴图，
    目录不存在则整帧退回基底，validate 会警告该帧无视觉效果）。
    部件的 at/pivot/parent 几何不变 —— 姿势目录只换贴图。
  - **SVG 整幅**：同上按整幅变体切换；tracks 同时作用于 `#id` 命名组。
  `fps` 控制节奏、`loop:false`/`hold` 播完停末帧。
  引用中的 `speed` 同时影响 frames 与 tracks，`loop` 覆盖剪辑默认值。
- `tracks`：部件关键帧，`t` 秒处 `{rot,dx,dy,scale,opacity,ease}`，
  相邻关键帧间按 ease 插值。小动作（抬手/转头/鞠躬）用它。
- 两者可并存：整幅模式下 frames 切整幅；rig 模式下 frames 换部件贴图，
  tracks 同时驱动关节 —— 换装与运动叠加互不干扰。
- 剪辑时长 `durationSec`：轨道求值的循环周期；`loop:false` 播完保持。

## 4. 道具（attachTo / motion / depth）

```jsonc
{"file": "tea-mug", "x": 0, "y": 0, "scale": 0.5,
 "attachTo": {"character": "bot", "part": "forearm-r", "anchor": "grip"}}

{"file": "signal-pip", "x": 0.2, "y": 0.45, "scale": 0.8,
 "motion": [{"t": 0, "x": 0.2, "y": 0.45, "rot": 0},
            {"t": 2.2, "x": 0.8, "y": 0.35, "rot": 180}]}
```

- `attachTo`：`{character, part, anchor?}`——道具中心锚在部件的命名锚点上，
  随部件移动/旋转/透明度。`anchor` 指 `parts.json` 部件 `points` 表里的键名
  （如 `"grip"` 手端握持点），缺省/未命中退回 pivot（旋转关节点）。
  部件 `points` 是资产属性：手端、指尖、面部朝向等挂点由美术在 parts.json
  里声明（拼合坐标 px），姿势覆写目录不动几何所以锚点始终有效。
  目标无 parts 时退回静态摆位（validate 警告）；anchor 名不存在是
  validate 错误。
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
  系数同时影响相机平移与缩放；固定 zoom 的摇移也产生视差。depth=1 保留旧相机公式。
- `ambient`：`dust` 漂浮粒子（depth 决定它在角色前/后）、`flicker` 目标层
  透明度抖动、`pulse` 目标层缩放呼吸。数据驱动，不写死镜头。
  flicker/pulse 省略 `layer` 时应用于全部场景层；指定时只作用于对应 id。
- 角色/道具 `depth` 字段是世界内 z 序，与场景层 depth 正交。


### 持续旋转与平移（rotate / drift）

| 字段 | 用途 / 单位 | 范围 / 默认 |
|---|---|---|
| `type` | `rotate` 或 `drift` | 必填 |
| `layer` | 目标层 id | 省略则作用于全部场景层；指定不存在的 id 校验失败 |
| `degPerSec` | rotate 角速度，正值顺时针、负值逆时针 | 必填，-360..360 度/秒 |
| `pivot` | rotate 旋转中心，相对层画幅 | `{x:0.5,y:0.5}`；两轴 0..1 |
| `dx` / `dy` | drift 匀速位移，画幅宽/秒、画幅高/秒，右/下为正 | 至少一个必填；每轴 -1..1；省略轴为0 |

时间从镜头第0帧起算，按 fps 转秒；镜头切换重新起算。不依赖浏览器计时器。
每层最多一个 rotate（包括未定向的全场景 rotate），多个 drift 的速度相加。
旋转与平移可叠加：先沿贴图画幅轴平移，再绕 pivot 旋转（同层旋转时漂移轴随贴图转动，
保证包裹位移始终为纹理周期；地球/云层分层时各自运动互不影响）；原相机与 depth 变换位于外层，
参数不随相机缩放改变。flicker/pulse 仍在运动视口外侧叠加，旧场景没有新类型时走原渲染路径。

**余量与循环包裹约定**：运动层使用重复平铺平面，不缩放原纹理内容。drift 位移按画幅周期
包裹到半幅范围；这是相同图案的平铺副本接管，不是单图离场后突然跳回。
rotate 平面根据画幅比例、pivot 到最远角的距离和最大漂移余量自动扩展，任意角度覆盖
固定层视口，再裁切到该层原画幅。推拉/视差仍沿用原层取景规则；只要相机满足原合法取景范围，
新动效不额外露出纹理边缘或黑边。无新动效时不会改变旧整幅层的边缘行为。

运动纹理需输出为与画幅同宽高比的 PNG（引擎将一格映射到完整画幅）；需要无接缝的云带/
底纹须在左右、上下边缘可平铺，alpha 云层可覆盖静态不透明底图。平铺不会修复资产本身的接缝。
不希望重复的圆形地球可画在透明整幅中，围绕地球中心声明 pivot，并用上层舷窗遮罩限制可见区域；
不会改成真实三维球面投影。静态舷窗层必须不被 rotate/drift 定向，避免窗框一起运动。

```json
{
  "layers": [
    {"id":"space", "file":"space.png", "depth":0.7},
    {"id":"earth", "file":"earth.png", "depth":0.7},
    {"id":"clouds", "file":"clouds.png", "depth":0.7},
    {"id":"window", "file":"window-mask.png", "depth":1.4}
  ],
  "ambient": [
    {"type":"rotate", "layer":"earth", "degPerSec":0.4, "pivot":{"x":0.5,"y":0.5}},
    {"type":"drift", "layer":"clouds", "dx":0.008, "dy":0}
  ]
}
```

地球/云层在同一远景平面，window-mask 的舷窗区域透明、外部不透明；前景窗框遮挡世界角色，
沿既有 depth>1 规则绘制。未指定 layer 时 rotate/drift 的默认行为与 flicker/pulse 一致。
`pnpm validate` 同时检查参数、目标 id 和多重 rotate 冲突；播放器也按同一 schema 拒绝非法场景。
工程 demo 在 `pipeline/fixtures/ambient/`，不代表正式场景风格或老板原型验收。

## 6. 落地阴影与接触着色（治纸片感）

`shot.shadow`（镜头级，默认开）：

```jsonc
"shadow": {"enabled": true, "opacity": 0.32, "size": 1, "blur": 16, "contact": 0.45}
```

- 自动在每个 `characters[]` 脚下渲染椭圆渐变投影：锚点钉在**地面位**
  （loco 脚底锚点，不含 bob 起伏），随走位位移、随 scale 缩放；
  步态腾空瞬间影缩小变淡（`evalShadow` 衰减），入画走场阴影随行。
- `contact` 控制第二层更小的接触暗芯（脚底 AO），消除贴纸漂浮感。
- `characters[].shadow: false` 单角色关闭——悬浮物/全息投影类角色用。
- `scenes/<name>/scene.json` 层可加 `castShadow: {dx, dy, blur, opacity}`——
  该层剪影向身后内容的软投影（前景层在中景/角色上投缘影）。

## 7. 兼容性

- 旧 `shots.json` 零迁移：新字段全可选；`enter:left/right`、静态角色、
  整幅场景行为逐帧不变。
- 相机/转场/字幕/口型/眨眼/音轨路径不变；letterbox 字幕仍压黑边。
- `pnpm validate` 卡口新增：scene.json 层文件、parts.json 部件图、
  动作剪辑文件与序列帧（rig 模式下为姿势目录覆写图）、attachTo 目标存在性。
- 存在但非法的 parts/动作 JSON 是错误，不会静默退回整幅资产；缺失的可选 parts 文件仍可回退。

- `pnpm test` 运行确定性的走位接管、旧进出场、帧序列与父子关节回归测试，
  以及两条 renderStill 集成断言（黑场隔离）：
  `rig-pose` 同关节姿态下 idle↔alert 姿势帧渲染不同；`rig-only` 纯部件角色
  （无 default 资产）正常渲染且关节轨道生效。
- 参考夹具：`public/episodes/ep00/`（演示集，12 镜头覆盖全部能力：
  `rig-pose` 验证 rig 模式姿势覆写×关节叠加、`rig-only` 验证纯部件渲染、
  末镜 `svg-sequence` 验证 SVG 帧序列与关节叠加；末四镜 `shadow-*` 验证落地阴影开关/单角色豁免/走位跟随）。
  `bot2`/`svg-fixture` 为工程机制夹具，不代表正式角色或美术风格验收。

## 8. 独立面部演出（face）

`characters[].face` 是 `partId → {role, keys, closedFile?}`，仅用于有 `parts.json`
的角色。每条轨道在该部件原有 at/pivot/parent 上换贴图，继承头部运动；贴图自然
尺寸由作者决定，透明底 PNG 推荐。眼神、眉、眼睑、嘴分别建部件，不把身体缩放当嘴型。

```json
{"id":"rin", "x":0.5, "y":0.9,
 "action":{"name":"react", "speed":0.8, "offsetSec":0.25},
 "face":{
   "eyes":{"role":"gaze", "keys":[{"t":0,"file":"face/eyes-left.png"},{"t":1.2,"file":"face/eyes-right.png"}]},
   "brows":{"role":"brow", "keys":[{"t":0,"file":"face/brows-neutral.png"},{"t":1.8,"file":"face/brows-up.png"}]},
   "lids":{"role":"eyelid", "keys":[{"t":0,"file":"face/lids-open.png"},{"t":2,"file":"face/lids-closed.png"},{"t":2.12,"file":"face/lids-open.png"}]},
   "mouth":{"role":"mouth", "closedFile":"face/closed.png", "keys":[{"t":0.4,"file":"face/a.png"},{"t":0.6,"file":"face/i.png"},{"t":0.8,"file":"face/closed.png"}]}
 }}
```

- 文件相对 `characters/<id>/parts/`，带扩展名；部件 id 必须存在，validate 检查全部贴图。
- `t` 是镜头内秒，严格递增；按最后一个 `t ≤ 当前时间` 取图，有意 hold 保持到下一时间码。
  首个时间码之前用原姿势/基底贴图；优先级：面部轨道 > 姿势覆写 > 部件基底。
- `role` 为 gaze/brow/eyelid/mouth，默认 gaze。mouth 必须声明 `closedFile`。
  该角色声音区间外强制取闭口图；声音区间按 audio manifest 的完整对白实测时长，
  缺清单时使用既有估时。台词间 gap 与末句之后都闭口。音频 Sequence 在实测区间结束。
  有 closedFile 的其他角色轨道也会使用这一声音门控，通常仅嘴轨道需要它。
- 面部时间码独立于身体 action 的 speed、loop、offsetSec；作者按音频时间码创作。
  不自动生成音素，也不替代动作或表情创作。
- `action.offsetSec` 为动作时间相位：动作时刻 `(镜头秒 + offsetSec) × speed`；
  同时作用于 frames 与 tracks。hold 会让两者都停住，不只姿势图停住。
- 修正镜头总长的 gap 统计为「每句之后，除末句」，与原 lineFrames 算法一致。
  不同 gap 的旧数据可能因此得到正确的新总长；不更改台词起点。

## 9. 镜头级预制源（media）

```json
{"media":[
  {"source":{"type":"video","file":"episodes/demo/assets/animation/reaction.webm","transparent":true},
   "from":12,"durationFrames":48,"trimStartSec":0.5,"playbackRate":1,
   "space":"screen","x":0,"y":0,"width":1,"height":1,"fit":"cover"},
  {"source":{"type":"sequence","files":["episodes/demo/assets/fx/001.png","episodes/demo/assets/fx/002.png"],"fps":12},
   "from":24,"durationFrames":24,"space":"world","depth":1}
]}
```

- 源是 `public/` 相对本地路径，带扩展名；不提供浏览器原生播放时钟、网络生成服务或随机取帧。
- `from`/`durationFrames` 使用合成 fps，区间 `[from, from + durationFrames)`。
  `trimStartSec` 为源裁头秒。局部播放秒 = `(镜头帧-from)/合成fps × playbackRate`。
  视频由 Remotion OffthreadVideo 按帧提取，trimBefore 按合成 fps 四舍五入；
  PNG 序列索引为 `floor((trimStartSec + 局部播放秒) × 源fps)`，超出序列末帧保持，
  不默认循环。视频源必须包含所需播放区间，避免超尾行为；不自动拉长镜头。
- `space:screen`（默认）在前景之后、字幕之前合成，适合预制完整镜头/覆盖特效；
  `world` 与角色道具按 depth 混排，复用同一相机。x/y/width/height 为画幅归一化，
  左上角锚定；fit=contain（默认）/cover/fill，视口裁切。opacity 默认 1。
- 透明 PNG 自带 alpha；透明视频声明 transparent:true（例如带 alpha WebM）。
  源内容是否有 alpha 由创作端保证。所有视频强制 muted，不重复叠入源对白/配乐；
  正式声音仍走已有对白音轨。
- 本任务使用锁文件 Remotion **4.0.532**，未升级依赖。官方依据：
  [OffthreadVideo](https://www.remotion.dev/docs/offthreadvideo)、
  [Sequence](https://www.remotion.dev/docs/sequence)、[Img](https://www.remotion.dev/docs/img)。
  API 同时核对已安装版本类型定义。PNG 节点用 Img 等待加载，避免首帧缺道具。

### 机制验证与回归

`pnpm test:performance` 在临时目录生成确定性 PNG/parts/action/音源与预制视频，
真实调用 Remotion renderStill/renderMedia。设置 `PERFORMANCE_EVIDENCE_DIR=/绝对目录`
可将三段 3 秒机制片、逐帧静帧、输入 JSON 与全部源放进指定证据目录；不写正式集目录。
夹具源码在 `pipeline/fixtures/performance/`，色块为工程验证用途，不构成角色美术验收。

检查面部区域的独立颜色变化、两段无声区间闭口、固定身体区域；检查握持道具中心的解析坐标与
白色手端在左右行走/镜像/动作/相机变焦八个时相的实际像素接触；检查视频和 PNG 序列裁头后的首/中/末
帧颜色、开始/结束独占边界、两种 alpha 合成，以及源有音轨但接入后无音轨。
对白输出检查声音区间有 tone、gap/尾段静音。`pnpm test` 保留既有 parts/姿势/默认资产回归。
