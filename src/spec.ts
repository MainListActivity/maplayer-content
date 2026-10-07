import {z} from 'zod';

/** 机位：以取景中心点 (x,y ∈ 0..1) + 变焦定义；from/to 之间缓动插值（Ken Burns）。 */
export const CameraKeySchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(6).default(1),
});
export const CameraSchema = z.object({
  from: CameraKeySchema,
  to: CameraKeySchema.optional(),
  ease: z.enum(['easeInOut', 'linear', 'hold']).default('easeInOut'),
});

/** 走位分段：镜头内按序执行；gait=walk 带步幅起伏，朝向随位移自动 flip。 */
export const MoveSchema = z.object({
  to: z.object({x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2)}),
  durSec: z.number().min(0.1).max(30),
  at: z.number().min(0).optional(),            // 段起始时刻（缺省=接上一段结束）
  gait: z.enum(['walk', 'glide', 'none']).default('walk'),
  ease: z.enum(['easeInOut', 'linear', 'hold']).default('easeInOut'),
});

/** 动作引用：characters/<id>/actions/<name>.json 声明式剪辑（帧序列+部件轨道）。 */
export const ActionRefSchema = z.union([
  z.string(),
  z.object({name: z.string(), speed: z.number().min(0.1).max(4).default(1), loop: z.boolean().optional()}),
]);

/** 角色站位：x,y 为「变焦 1 时的画面」归一化坐标（与背景同一世界系），随镜头运动。 */
export const PlacementSchema = z.object({
  id: z.string(),                              // 角色登记名 = assets/characters/<id>/ 目录名
  variant: z.string().default('default'),      // 表情/服装变体 = <variant>.svg|.png
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),                 // 脚底锚点（角色底部中心落在 (x,y)）
  scale: z.number().min(0.05).max(4).default(1),
  flip: z.boolean().default(false),            // 面向右侧时用 true 镜像；走位时自动朝向覆盖
  enter: z.enum(['none', 'left', 'right', 'walk-left', 'walk-right']).default('none'),
  exit: z.enum(['none', 'left', 'right', 'walk-left', 'walk-right']).default('none'),
  moves: z.array(MoveSchema).default([]),      // 走位分段（时间轴按序/可 at 指定）
  action: ActionRefSchema.optional(),          // 动作剪辑名（部件轨道 / 姿势帧序列）
  depth: z.number().min(-2).max(2).default(0), // 世界系 z 序：越大越靠前
});

/** 道具运动关键帧（世界系归一化坐标）。 */
export const PropMotionSchema = z.object({
  t: z.number().min(0),                        // 时刻（镜头内秒）
  x: z.number().min(-0.2).max(1.2),
  y: z.number().min(-0.2).max(1.2),
  rot: z.number().default(0),                  // 自转（度）
  ease: z.enum(['easeInOut', 'linear', 'hold']).default('easeInOut'), // 到下一点的插值
});

/** 道具/服化道挂件：assets/props/<file>.svg|.png，世界系坐标，中心锚点。 */
export const PropSchema = z.object({
  file: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.01).max(4).default(1),
  anim: z.enum(['none', 'blink', 'float', 'blink-fast']).default('none'),
  attachTo: z.object({character: z.string(), part: z.string(), anchor: z.string().optional()}).optional(), // 跟随角色部件（anchor=部件命名锚点，缺省 pivot）
  motion: z.array(PropMotionSchema).default([]), // 位移关键帧（优先于静态 x/y）
  depth: z.number().min(-2).max(2).default(0),   // 世界系 z 序（与角色同排）
});

export const DialogueSchema = z.object({
  speaker: z.string().nullable(),              // null = 旁白
  text: z.string().min(1),
  voice: z.string().optional(),                // 覆盖角色声线（edge-tts voice 名或 'say:<voice>'）
  gapSec: z.number().min(0).max(10).default(0.25), // 本句之后的停顿
});

/** ---- 资产侧约定（characters/<id>/parts、actions、scenes/<name>/scene.json） ---- */

/** 部件关节：characters/<id>/parts/parts.json。部件图为带 alpha PNG；
 *  at = 部件左上角在拼合坐标中的偏移(px)；pivot = 旋转关节点（拼合坐标 px）；
 *  parent = 父部件 id（子部件跟随父变换，如 forearm-l 跟随 arm-l）；
 *  points = 命名锚点表（拼合坐标 px），如 {"grip":[x,y]} 手端握持点 —— attachTo.anchor 引用。 */
export const PartDefSchema = z.object({
  id: z.string(),
  file: z.string(),                            // 相对 parts/ 目录的 png
  at: z.tuple([z.number(), z.number()]),       // 拼合坐标偏移
  pivot: z.tuple([z.number(), z.number()]),    // 拼合坐标关节点
  points: z.record(z.string(), z.tuple([z.number(), z.number()])).default({}), // 命名锚点（attachTo.anchor）
  parent: z.string().optional(),
  depth: z.number().default(0),                // 部件间叠放次序
});
export const PartsFileSchema = z.object({
  size: z.tuple([z.number(), z.number()]),     // 拼合画布 (w,h) px，与默认立绘同尺寸口径
  parts: z.array(PartDefSchema).min(1),
});
export type PartsFile = z.infer<typeof PartsFileSchema>;

/** 部件关键帧：t 秒处把部件绕 pivot 转到 rot 度 / 平移 dx,dy / 缩放 scale / 透明度 opacity。 */
export const KeyframeSchema = z.object({
  t: z.number().min(0),
  rot: z.number().default(0),
  dx: z.number().default(0),
  dy: z.number().default(0),
  scale: z.number().min(0.01).max(8).default(1),
  opacity: z.number().min(0).max(1).default(1),
  ease: z.enum(['easeInOut', 'linear', 'hold']).default('easeInOut'), // 到下一帧的插值
});

/** 动作剪辑 characters/<id>/actions/<name>.json：
 *  frames = 姿势序列帧（相对 <id>/ 的资产基名，逐帧切换，fps/loop 控制节奏）；
 *  tracks = 部件关节轨道（partId -> 关键帧表）；两者可同时存在。 */
export const ActionClipSchema = z.object({
  durationSec: z.number().min(0.05),           // 剪辑总长（秒）
  loop: z.boolean().default(true),
  fps: z.number().min(1).max(60).default(8),   // frames 播放速率
  hold: z.boolean().default(false),            // 播完停在末帧
  frames: z.array(z.string()).optional(),
  tracks: z.record(z.string(), z.array(KeyframeSchema).min(1)).default({}),
});
export type ActionClip = z.infer<typeof ActionClipSchema>;

/** 分层场景 scenes/<name>/scene.json：多 PNG 视差 + 声明式氛围。 */
export const SceneLayerSchema = z.object({
  file: z.string(),                            // 相对 scenes/<name>/ 的 png
  depth: z.number().min(0.2).max(2).default(1),// <1 远景(动得少) >1 前景(动得多)
  id: z.string().optional(),                   // ambient 目标名
});
export const AmbientSchema = z.object({
  type: z.enum(['dust', 'flicker', 'pulse']),
  layer: z.string().optional(),                // 目标层 id；缺省=场景级覆盖层
  count: z.number().int().min(1).max(200).default(24),   // dust 粒子数
  depth: z.number().min(0.2).max(2).default(1),          // dust 层视差系数
  hz: z.number().min(0.05).max(10).default(0.4),         // flicker/pulse 频率
  amp: z.number().min(0).max(1).default(0.15),           // flicker 不透明振幅 / pulse 缩放振幅
  size: z.number().min(1).max(40).default(3),            // dust 粒径 px@1080p
  opacity: z.number().min(0).max(1).default(0.35),       // dust 透明度
  color: z.string().default('#dff6fb'),
});
export const SceneFileSchema = z.object({
  layers: z.array(SceneLayerSchema).min(1),
  ambient: z.array(AmbientSchema).default([]),
});
export type SceneFile = z.infer<typeof SceneFileSchema>;

export const ShotSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  scene: z.string().nullable(),                // assets/scenes/<scene>.png|.svg 或 <scene>/scene.json 分层；null = 黑场
  holdSec: z.number().min(0.2).max(120).default(2.5), // 无台词镜头时长 / 有台词时的保底
  padInSec: z.number().min(0).max(10).default(0.4),
  padOutSec: z.number().min(0).max(10).default(0.5),
  camera: CameraSchema.default({from: {x: 0.5, y: 0.5, zoom: 1.15}, ease: 'easeInOut'}),
  characters: z.array(PlacementSchema).default([]),
  props: z.array(PropSchema).default([]),
  dialogue: z.array(DialogueSchema).default([]),
  caption: z.string().nullable().default(null), // 顶部说明字幕（场景卡/旁白条）
  transitionIn: z.enum(['cut', 'fade', 'fade-black']).default('cut'),
});
export type ShotSpec = z.infer<typeof ShotSchema>;

export const ShotsFileSchema = z.object({shots: z.array(ShotSchema).min(1)});

export const EpisodeSchema = z.object({
  id: z.string().regex(/^ep\d+$/),
  title: z.string(),
  fps: z.number().int().min(12).max(60).default(24),
  width: z.number().int().default(1920),
  height: z.number().int().default(1080),
  letterbox: z.boolean().default(true),        // 上下黑边（2.35:1 构图线）
  grain: z.boolean().default(true),            // 手绘颗粒层
  voices: z.record(z.string(), z.string()).default({}), // 角色 -> edge-tts 声线
  names: z.record(z.string(), z.string()).default({}),  // 角色 -> 字幕显示名
});
export type EpisodeSpec = z.infer<typeof EpisodeSchema>;

export const AudioManifestSchema = z.object({
  lines: z.record(z.string(), z.object({file: z.string(), durationSec: z.number()})),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

export const lineKey = (shotId: string, idx: number) => `${shotId}#${idx}`;

/** 台词时长：优先音频清单实测值，清单缺失时按语速估算（约 4.6 字/秒 + 0.3s）。 */
export const lineDuration = (shotId: string, idx: number, text: string, manifest?: AudioManifest): number => {
  const hit = manifest?.lines[lineKey(shotId, idx)];
  return hit ? hit.durationSec : Math.max(0.8, text.length / 4.6 + 0.3);
};

export interface ShotTimeline {shot: ShotSpec; startFrame: number; durationFrames: number; lineFrames: number[];}

/** 计算整集时间线：镜头时长 = padIn + Σ(台词+停顿) + padOut，无台词用 holdSec。 */
export const buildTimeline = (ep: EpisodeSpec, shots: ShotSpec[], manifest?: AudioManifest): ShotTimeline[] => {
  let cursor = 0;
  return shots.map((shot) => {
    const lineSecs = shot.dialogue.map((d, i) => lineDuration(shot.id, i, d.text, manifest));
    const bodySec = shot.dialogue.length
      ? Math.max(shot.holdSec, lineSecs.reduce((a, b) => a + b, 0) + shot.dialogue.reduce((a, d, i) => a + (i ? d.gapSec : 0), 0))
      : shot.holdSec;
    const durationFrames = Math.round((shot.padInSec + bodySec + shot.padOutSec) * ep.fps);
    const lineFrames: number[] = [];
    let t = shot.padInSec;
    shot.dialogue.forEach((d, i) => {
      lineFrames.push(Math.round(t * ep.fps));
      t += lineSecs[i] + (i < shot.dialogue.length - 1 ? d.gapSec : 0);
    });
    const tl = {shot, startFrame: cursor, durationFrames, lineFrames};
    cursor += durationFrames;
    return tl;
  });
};
