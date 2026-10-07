/* 演出引擎求值核心：纯函数，Sprite/Prop/validate 共用。
 * 坐标口径：角色世界系 = 变焦1时画面归一化 (0..1)；部件拼合系 = parts.size px，锚点底中。 */
import {z} from 'zod';
import {KeyframeSchema, MoveSchema, PartsFile, PlacementSchema, ActionClip, ShadowSpec, ShotSpec, CameraSchema} from '../spec';

type Placement = z.infer<typeof PlacementSchema>;
type Move = z.infer<typeof MoveSchema>;
type Kf = z.infer<typeof KeyframeSchema>;

export const EASE = {linear: (t: number) => t, hold: () => 0, easeInOut: (t: number) => t * t * (3 - 2 * t)};

/** 相机姿态（与 CameraRig 同式）：取景中心 (fx,fy) + 变焦 z。 */
export const camPose = (shot: ShotSpec, totalFrames: number, frame: number): {fx: number; fy: number; z: number} => {
  const cam = shot.camera;
  const to = cam.to ?? cam.from;
  const t = EASE[cam.ease](totalFrames <= 1 ? 1 : Math.min(1, frame / (totalFrames - 1)));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {fx: lerp(cam.from.x, to.x), fy: lerp(cam.from.y, to.y), z: lerp(cam.from.zoom, to.zoom)};
};

/** 世界层变换：depth<1 远景动得少（视差），>1 前景动得多。d=1 与相机一致。 */
export const layerTransform = (pose: {fx: number; fy: number; z: number}, depth: number, W: number, H: number): string => {
  const z = 1 + (pose.z - 1) * depth;
  const fx = depth === 1 ? pose.fx : .5 + (pose.fx - .5) * depth;
  const fy = depth === 1 ? pose.fy : .5 + (pose.fy - .5) * depth;
  return `translate(${W / 2 - z * fx * W}px, ${H / 2 - z * fy * H}px) scale(${z})`;
};

/* ---------- 走位 ---------- */

export interface LocoSeg {from: {x: number; y: number}; to: {x: number; y: number}; at: number; dur: number; gait: string; ease: 'linear' | 'easeInOut' | 'hold'}

const WALK_SEC = 1.1; // walk-in/out 用时

/** 把 enter/moves/exit 展开为时间轴分段。 */
export const buildLoco = (p: Placement, shotDurSec: number): LocoSeg[] => {
  const segs: LocoSeg[] = [];
  const home = {x: p.x, y: p.y};
  if (p.enter === 'walk-left' || p.enter === 'walk-right') {
    const from = {x: p.enter === 'walk-left' ? -0.12 : 1.12, y: p.y};
    segs.push({from, to: home, at: 0, dur: WALK_SEC, gait: 'walk', ease: 'linear'});
  }
  let cursor = p.enter.startsWith('walk') ? WALK_SEC : 0;
  const moves = p.moves.map((m) => {
    const at = m.at ?? cursor;
    cursor = at + m.durSec;
    return {...m, at};
  }).sort((a, b) => a.at - b.at);
  for (const m of moves) {
    const {x, y} = evalLoco(p, segs, m.at);
    segs.push({from: {x, y}, to: m.to, at: m.at, dur: m.durSec, gait: m.gait, ease: m.ease});
  }
  if (p.exit === 'walk-left' || p.exit === 'walk-right') {
    const at = Math.max(0, shotDurSec - WALK_SEC);
    const {x, y} = evalLoco(p, segs, at);
    // walk-out 接管之后的时间线，避免更晚 moves 覆盖离场。
    const prior = segs.filter((s) => s.at <= at);
    segs.splice(0, segs.length, ...prior, {from: {x, y}, to: {x: p.exit === 'walk-left' ? -0.12 : 1.12, y}, at, dur: Math.min(WALK_SEC, shotDurSec), gait: 'walk', ease: 'linear'});
  }
  return segs;
};

export interface LocoState {x: number; y: number; flip: boolean; gaiting: boolean}

/** 走位求值：当前位置 + 是否处于步态段 + 自动朝向（右行 flip=false）。 */
export const evalLoco = (p: Placement, segs: LocoSeg[], tSec: number): LocoState => {
  if (!segs.length) return {x: p.x, y: p.y, flip: p.flip, gaiting: false};
  let cur = {x: p.x, y: p.y}, flip = p.flip, gaiting = false;
  for (const s of segs) {
    if (tSec < s.at) break;
    const k = Math.min(1, (tSec - s.at) / s.dur);
    const e = k >= 1 ? 1 : EASE[s.ease](k);
    cur = {x: s.from.x + (s.to.x - s.from.x) * e, y: s.from.y + (s.to.y - s.from.y) * e};
    if (s.to.x !== s.from.x) flip = s.to.x < s.from.x; // 停步后保留最后行进朝向
    gaiting = k < 1 && s.gait === 'walk';
  }
  return {x: cur.x, y: cur.y, flip, gaiting};
};

/** 旧 enter 为线性滑动，旧 exit 是死字段；新走场由 buildLoco 处理。 */
export const legacyEnterSlide = (p: Placement, tSec: number): number =>
  (p.enter === 'left' || p.enter === 'right') && tSec < .6
    ? (1 - tSec / .6) * (p.enter === 'left' ? -1 : 1) * .12 : 0;

export const spriteHash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 常驻闲置浮动（旧角色视觉，Sprite 与落地阴影共用同一位移源）。正值=下沉。 */
export const idleBob = (tSec: number, charId: string): number => Math.sin(tSec * 2.2 + spriteHash(charId)) * 4;

export const sequenceIndex = (clip: ActionClip, tSec: number, speed = 1): number => {
  const n = clip.frames?.length ?? 0;
  if (!n) return 0;
  const index = Math.floor(tSec * speed * clip.fps);
  return !clip.loop || clip.hold ? Math.min(n - 1, index) : index % n;
};

/** 步态起伏：步行周期内 |sin| 下压/抬升，单位像素。 */
export const gaitBob = (tSec: number, gaiting: boolean, pxPerUnit: number): {dy: number; tilt: number} => {
  if (!gaiting) return {dy: 0, tilt: 0};
  const ph = tSec * Math.PI * 2.2; // ~2.2 半步/秒
  return {dy: -Math.abs(Math.sin(ph)) * pxPerUnit * 0.012, tilt: Math.sin(ph) * 1.4};
};

/* ---------- 关键帧求值 ---------- */

export interface PartPose {rot: number; dx: number; dy: number; scale: number; opacity: number}

export const evalKf = (kfs: Kf[], tSec: number, clipDur: number, loop: boolean): PartPose => {
  const t = loop ? tSec % clipDur : Math.min(tSec, clipDur);
  let prev = kfs[0], next = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length; i++) {
    if (kfs[i].t <= t) prev = kfs[i];
    if (kfs[i].t > t) {next = kfs[i]; break;}
    next = kfs[i];
  }
  const span = next.t - prev.t;
  const k = span > 0 ? Math.min(1, (t - prev.t) / span) : 0;
  const e = EASE[prev.ease](k);
  const L = (a: number, b: number) => a + (b - a) * e;
  return {rot: L(prev.rot, next.rot), dx: L(prev.dx, next.dx), dy: L(prev.dy, next.dy), scale: L(prev.scale, next.scale), opacity: L(prev.opacity, next.opacity)};
};

/* ---------- 部件 2D 仿射矩阵 ---------- */

type M = [number, number, number, number, number, number]; // a b c d e f
const mIdent: M = [1, 0, 0, 1, 0, 0];
const mMul = (A: M, B: M): M => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const mT = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const mR = (deg: number): M => {const r = (deg * Math.PI) / 180; const c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0];};
const mS = (s: number): M => [s, 0, 0, s, 0, 0];

/** 部件局部矩阵：绕 pivot 旋转/缩放后平移 dx,dy。 */
const localM = (pivot: [number, number], pose: PartPose): M =>
  mMul(mT(pose.dx, pose.dy), mMul(mT(pivot[0], pivot[1]), mMul(mR(pose.rot), mMul(mS(pose.scale), mT(-pivot[0], -pivot[1])))));

export interface PartWorld {m: M; opacity: number}

/**
 * 求每个部件的世界矩阵（拼合系 px）。父链递归：子部件 pivot 先被父变换。
 * 返回 Map<partId, PartWorld>；DOM 用法：元素放在 at 偏移、transform=matrix(m·T(at))。
 */
export const evalParts = (parts: PartsFile, clip: ActionClip | null, tSec: number, speed = 1): Map<string, PartWorld> => {
  const out = new Map<string, PartWorld>();
  const byId = new Map(parts.parts.map((d) => [d.id, d]));
  const world = (id: string, seen: Set<string>): PartWorld => {
    const hit = out.get(id);
    if (hit) return hit;
    const def = byId.get(id);
    if (!def || seen.has(id)) return {m: mIdent, opacity: 1};
    seen.add(id);
    const t = tSec * speed;
    const kfs = clip?.tracks[def.id];
    const pose = kfs ? evalKf(kfs, t, clip!.durationSec, clip!.loop) : {rot: 0, dx: 0, dy: 0, scale: 1, opacity: 1};
    const lm = localM(def.pivot, pose);
    const parent = def.parent ? world(def.parent, seen) : {m: mIdent, opacity: 1};
    const w = {m: mMul(parent.m, lm), opacity: parent.opacity * pose.opacity};
    out.set(id, w);
    return w;
  };
  for (const d of parts.parts) world(d.id, new Set());
  return out;
};

/** 道具位移关键帧求值（世界系归一化坐标 + 自转）。 */
export const evalPropMotion = (kfs: {t: number; x: number; y: number; rot: number; ease: 'linear' | 'easeInOut' | 'hold'}[], tSec: number): {x: number; y: number; rot: number} => {
  if (!kfs.length) return {x: 0, y: 0, rot: 0};
  let prev = kfs[0], next = kfs[kfs.length - 1];
  for (const kf of kfs) {
    if (kf.t <= tSec) prev = kf;
    if (kf.t > tSec) {next = kf; break;}
    next = kf;
  }
  const span = next.t - prev.t;
  const k = span > 0 ? Math.min(1, (tSec - prev.t) / span) : 0;
  const e = EASE[prev.ease](k);
  return {x: prev.x + (next.x - prev.x) * e, y: prev.y + (next.y - prev.y) * e, rot: prev.rot + (next.rot - prev.rot) * e};
};

/** 部件世界锚点（拼合系 px）：命名锚点（points 表，如 "grip" 手端）经世界矩阵后的位置；
 *  anchor 缺省/未命中时退回 pivot —— attachTo 用。validate 负责锚点名存在性卡口。 */
export const partAnchorWorld = (parts: PartsFile, worlds: Map<string, PartWorld>, partId: string, anchor?: string): {x: number; y: number; rot: number; opacity: number} | null => {
  const def = parts.parts.find((d) => d.id === partId);
  const w = worlds.get(partId);
  if (!def || !w) return null;
  const [a, b, c, d, e, f] = w.m;
  const pt = (anchor && def.points[anchor]) || def.pivot;
  const x = pt[0], y = pt[1];
  return {x: a * x + c * y + e, y: b * x + d * y + f, rot: (Math.atan2(b, a) * 180) / Math.PI, opacity: w.opacity};
};

/* ---------- 落地阴影 ---------- */

export interface ShadowGeom {
  rx: number;         // 主影半宽（变焦1屏 px，随角色身高 hPx 与 size 缩放）
  ry: number;         // 主影半高（透视压扁）
  opacity: number;    // 主影不透明度（抬升衰减后）
  coreRx: number;     // 接触暗芯半宽（AO 贴底）
  coreRy: number;
  coreOpacity: number;
}

/** 落地阴影几何：锚点=角色脚底世界位；liftPx≥0 抬升/步态腾空 → 影缩小变淡。
 *  返回 null = 不画（enabled=false 或强度为 0）。 */
export const evalShadow = (cfg: ShadowSpec, hPx: number, liftPx: number): ShadowGeom | null => {
  if (!cfg.enabled || cfg.opacity <= 0) return null;
  const fade = Math.max(0.25, Math.min(1, 1 - Math.max(0, liftPx) / (hPx * 0.35)));
  const rx = hPx * 0.3 * cfg.size * (0.9 + 0.1 * fade);
  return {rx, ry: rx * 0.26, opacity: cfg.opacity * fade, coreRx: rx * 0.52, coreRy: rx * 0.16, coreOpacity: cfg.opacity * cfg.contact * fade};
};
