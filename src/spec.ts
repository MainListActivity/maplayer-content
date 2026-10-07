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

/** 动作缓动曲线（走位用）。 */
export const ActionEaseSchema = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']);

/**
 * 角色动作：镜头内按 atSec（秒，镜头本地时间）触发的戏剧动作，可叠加、按时刻排序求值。
 * 四类：move 走位 / pose 姿态切换 / turn 转身 / prop 道具互动。
 */
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    atSec: z.number().min(0),
    durSec: z.number().min(0.05).max(60).default(0.8),
    to: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      scale: z.number().min(0.05).max(4).optional(),
    }),
    ease: ActionEaseSchema.default('easeInOut'),
    face: z.enum(['auto', 'left', 'right', 'keep']).default('auto'), // auto=按水平位移方向转身
  }),
  z.object({
    type: z.literal('pose'),                   // 姿态/手势切换：到帧换 variant（如 default→point）
    atSec: z.number().min(0),
    variant: z.string(),
  }),
  z.object({
    type: z.literal('turn'),                   // 转身：压扁-翻转过渡；variant 在翻转中点换装（如背对）
    atSec: z.number().min(0),
    durSec: z.number().min(0.05).max(10).default(0.4),
    face: z.enum(['left', 'right', 'toggle']).default('toggle'),
    variant: z.string().optional(),
  }),
  z.object({
    type: z.literal('prop'),                   // 道具互动：attach 绑定同镜头 prop 跟随角色；detach 就地放下
    atSec: z.number().min(0),
    mode: z.enum(['attach', 'detach']),
    prop: z.string(),                          // 引用同镜头 props[].file
    dx: z.number().min(-1).max(1).optional(),  // 相对角色脚底锚点的世界系偏移（缺省 attach=0.05，detach=沿用绑定位移）
    dy: z.number().min(-1).max(1).optional(),  // dy<0 向上（缺省 attach=-0.16）
    mirrorDx: z.boolean().default(true),       // 角色翻转时 dx 镜像（道具保持在身体同侧）
  }),
]);
export type ActionSpec = z.infer<typeof ActionSchema>;

/** 角色站位：x,y 为「变焦 1 时的画面」归一化坐标（与背景同一世界系），随镜头运动。 */
export const PlacementSchema = z.object({
  id: z.string(),                              // 角色登记名 = assets/characters/<id>/ 目录名
  variant: z.string().default('default'),      // 表情/服装变体 = <variant>.svg
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),                 // 脚底锚点（角色底部中心落在 (x,y)）
  scale: z.number().min(0.05).max(4).default(1),
  flip: z.boolean().default(false),            // 面向右侧时用 true 镜像
  enter: z.enum(['none', 'left', 'right']).default('none'),
  exit: z.enum(['none', 'left', 'right']).default('none'),
  actions: z.array(ActionSchema).default([]),  // 动作时间线；缺省行为与旧版一致
});
export type Placement = z.infer<typeof PlacementSchema>;

/** 道具/服化道挂件：assets/props/<file>.svg，世界系坐标，中心锚点。 */
export const PropSchema = z.object({
  file: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.01).max(4).default(1),
  anim: z.enum(['none', 'blink', 'float', 'blink-fast']).default('none'),
});

export const DialogueSchema = z.object({
  speaker: z.string().nullable(),              // null = 旁白
  text: z.string().min(1),
  voice: z.string().optional(),                // 覆盖角色声线（edge-tts voice 名或 'say:<voice>'）
  gapSec: z.number().min(0).max(10).default(0.25), // 本句之后的停顿
});

export const ShotSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  scene: z.string().nullable(),                // assets/scenes/<scene>.svg；null = 黑场
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
