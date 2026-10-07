import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {ActionClip, ActionClipSchema, PartsFile, PartsFileSchema, PlacementSchema} from '../spec';
import {useJsonOpt} from './load';
import {buildLoco, evalLoco, evalParts, gaitBob, PartWorld} from './rig';

export type Placement = z.infer<typeof PlacementSchema>;

const actionCfg = (a: Placement['action']): {name: string; speed: number; loop?: boolean} | null =>
  a == null ? null : typeof a === 'string' ? {name: a, speed: 1} : a;

export interface CharWorld {
  tSec: number;
  charBase: string;
  partsFile: PartsFile | null;
  clip: ActionClip | null;
  cfg: {name: string; speed: number; loop?: boolean} | null;
  /** 世界系归一化锚点（脚底中心）+ 自动朝向 + 步态倾斜。 */
  pos: {x: number; y: number};
  flip: boolean;
  tilt: number;
  hPx: number;
  worlds: Map<string, PartWorld> | null;
}

/**
 * 角色当帧世界姿态：走位分段求值（含 enter/exit 兼容滑动）、步态起伏、
 * 可选 parts rig 的部件世界矩阵、可选动作剪辑。Sprite 与道具 attachTo 共用。
 */
export const useCharWorld = (episodeId: string, p: Placement | null, shotDurSec: number): CharWorld => {
  const frame = useCurrentFrame();
  const {height: H, fps} = useVideoConfig();
  const tSec = frame / fps;
  const charBase = `episodes/${episodeId}/assets/characters/${p?.id ?? '__none__'}`;

  const partsRaw = useJsonOpt<PartsFile>(p ? `${charBase}/parts/parts.json` : null);
  const partsFile = useMemo(() => {
    const r = partsRaw.data ? PartsFileSchema.safeParse(partsRaw.data) : null;
    return r?.success ? r.data : null;
  }, [partsRaw]);

  const cfg = p ? actionCfg(p.action) : null;
  const clipRaw = useJsonOpt<ActionClip>(cfg ? `${charBase}/actions/${cfg.name}.json` : null);
  const clip = useMemo(() => {
    const r = clipRaw.data ? ActionClipSchema.safeParse(clipRaw.data) : null;
    return r?.success ? r.data : null;
  }, [clipRaw]);

  const segs = useMemo(() => (p ? buildLoco(p, shotDurSec) : []), [p, shotDurSec]);
  const loco = evalLoco(p ?? {x: 0, y: 0, flip: false} as Placement, segs, tSec);
  const hPx = H * 0.62 * (p?.scale ?? 1);
  const bob = gaitBob(tSec, loco.gaiting, hPx);

  // 旧式 enter/exit 滑动（left/right 值兼容）
  const slide = 0.12;
  let x = loco.x;
  if (p?.enter === 'left' || p?.enter === 'right') {
    const dir = p.enter === 'left' ? -1 : 1;
    const k = Math.min(1, tSec / 0.6);
    x += dir * slide * (1 - k * k);
  }
  if (p?.exit === 'left' || p?.exit === 'right') {
    const dir = p.exit === 'left' ? -1 : 1;
    const k = Math.min(1, (shotDurSec - tSec) / 0.6);
    x += dir * slide * (1 - k * k);
  }

  const worlds = useMemo(
    () => (partsFile ? evalParts(partsFile, clip, tSec, cfg?.speed ?? 1) : null),
    [partsFile, clip, tSec, cfg?.speed],
  );

  return {tSec, charBase, partsFile, clip, cfg, pos: {x, y: loco.y + bob.dy / H}, flip: loco.flip, tilt: bob.tilt, hPx, worlds};
};
