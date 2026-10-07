import {Placement, ShotSpec} from '../spec';

/**
 * 动作求值：把分镜 actions 在任意帧折叠成角色/道具的瞬时状态。
 * 纯函数，Shot.tsx 每帧调用；无 actions 时产出与旧版完全一致的状态。
 */

export interface CharState {
  x: number;          // 世界系脚底锚点（已含 enter/exit 滑移与走位）
  y: number;
  scale: number;
  flip: boolean;      // true = 面向右
  variant: string;    // 当前应渲染的变体
  turnScale: number;  // 转身压扁系数（1 = 无转身，~0 = 侧身瞬间）
  moving: boolean;    // 本帧是否处于走位窗口内（驱动行走颠簸）
}

export interface PropPose {x: number; y: number; bound: boolean;}

const EASE = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => t * t * (3 - 2 * t),
};

const ENTER_SLIDE_SEC = 0.6; // 与旧版 Sprite 入/出场滑移时长一致
const SLIDE_DIST = 0.12;     // 世界系滑移距离

/** 求角色在镜头本地帧 frame 的姿态状态。动作按 atSec 排序顺序应用，后到动作在当前状态上继续。 */
export const evalCharState = (p: Placement, frame: number, fps: number, durationFrames: number): CharState => {
  const st: CharState = {x: p.x, y: p.y, scale: p.scale, flip: p.flip, variant: p.variant, turnScale: 1, moving: false};
  const acts = [...p.actions].sort((a, b) => a.atSec - b.atSec);
  for (const a of acts) {
    const s = a.atSec * fps;
    if (frame < s) continue;
    if (a.type === 'move') {
      const u = Math.min(1, (frame - s) / (a.durSec * fps));
      const from = {x: st.x, y: st.y, scale: st.scale};
      const face = a.face === 'keep' ? null
        : a.face === 'auto'
          ? (Math.abs(a.to.x - from.x) > 0.01 ? (a.to.x > from.x ? 'right' : 'left') : null)
          : a.face;
      if (face) st.flip = face === 'right';
      if (u < 1) {
        const e = EASE[a.ease](u);
        st.x = from.x + (a.to.x - from.x) * e;
        st.y = from.y + (a.to.y - from.y) * e;
        if (a.to.scale != null) st.scale = from.scale + (a.to.scale - from.scale) * e;
        st.moving = true;
      } else {
        st.x = a.to.x;
        st.y = a.to.y;
        if (a.to.scale != null) st.scale = a.to.scale;
      }
    } else if (a.type === 'pose') {
      st.variant = a.variant;
    } else if (a.type === 'turn') {
      const target = a.face === 'toggle' ? !st.flip : a.face === 'right';
      const u = Math.min(1, (frame - s) / (a.durSec * fps));
      if (u >= 0.5) {
        st.flip = target;
        if (a.variant) st.variant = a.variant;
      }
      st.turnScale = u >= 1 ? 1 : Math.abs(Math.cos(Math.PI * u));
    }
    // prop 动作不影响角色自身状态，见 evalPropPos
  }
  const slide = ENTER_SLIDE_SEC * fps;
  if (p.enter !== 'none' && frame < slide) st.x += (1 - frame / slide) * (p.enter === 'left' ? -1 : 1) * SLIDE_DIST;
  if (p.exit !== 'none' && frame > durationFrames - slide) st.x += ((frame - (durationFrames - slide)) / slide) * (p.exit === 'left' ? -1 : 1) * SLIDE_DIST;
  if (st.moving) st.y -= Math.abs(Math.sin((frame / fps) * 9)) * 0.008;
  return st;
};

/**
 * 求道具在镜头本地帧 frame 的位置。
 * 未被绑定时返回 (baseX, baseY)；绑定期间 = 角色脚底锚点 + 偏移（dx 随角色朝向镜像）；
 * detach 之后停留在释放瞬间的位置。
 */
export const evalPropPos = (
  shot: ShotSpec, file: string, baseX: number, baseY: number,
  frame: number, fps: number, durationFrames: number,
): PropPose => {
  const acts = shot.characters
    .flatMap((c) => c.actions.filter((a) => a.type === 'prop' && a.prop === file).map((a) => ({a, c})))
    .sort((x, y) => x.a.atSec - y.a.atSec);
  let bind: {charId: string; dx: number; dy: number; mirrorDx: boolean} | null = null;
  let released: {x: number; y: number} | null = null;
  for (const {a, c} of acts) {
    if (a.type !== 'prop') continue;
    const s = a.atSec * fps;
    if (frame < s) continue;
    if (a.mode === 'attach') {
      bind = {charId: c.id, dx: a.dx ?? 0.05, dy: a.dy ?? -0.16, mirrorDx: a.mirrorDx};
      released = null;
    } else if (bind) {
      const cs = evalCharState(c, s, fps, durationFrames);
      const dx = a.dx ?? bind.dx;
      const dy = a.dy ?? bind.dy;
      released = {x: cs.x + (bind.mirrorDx && cs.flip ? -dx : dx), y: cs.y + dy};
      bind = null;
    }
  }
  if (bind) {
    const c = shot.characters.find((x) => x.id === bind!.charId);
    if (c) {
      const cs = evalCharState(c, frame, fps, durationFrames);
      return {x: cs.x + (bind.mirrorDx && cs.flip ? -bind.dx : bind.dx), y: cs.y + bind.dy, bound: true};
    }
  }
  return released ? {...released, bound: false} : {x: baseX, y: baseY, bound: false};
};

/** 角色在镜头内用到的全部变体（含初始 variant），供播放器一次性预载避免中途闪载。 */
export const variantsUsed = (p: Placement): string[] => [
  ...new Set([
    p.variant,
    ...p.actions.flatMap((a) => (a.type === 'pose' || a.type === 'turn') && a.variant ? [a.variant] : []),
  ]),
];
