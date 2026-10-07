import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {ActionClip, ActionClipSchema, PartsFile, PartsFileSchema, PlacementSchema} from '../spec';
import {useJsonOpt} from './load';
import {buildLoco, evalLoco, evalParts, gaitBob, legacyEnterSlide, PartWorld} from './rig';

export type Placement = z.infer<typeof PlacementSchema>;

const actionCfg = (a: Placement['action']): {name: string; speed: number; loop?: boolean} | null =>
  a == null ? null : typeof a === 'string' ? {name: a, speed: 1} : a;

export interface CharWorld {
  tSec: number;
  charBase: string;
  /** parts.json 探测是否完成（区分加载中与不存在）；rigMode=ready&&partsFile!=null。 */
  partsReady: boolean;
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
    return partsRaw.data ? PartsFileSchema.parse(partsRaw.data) : null;
  }, [partsRaw]);

  const cfg = p ? actionCfg(p.action) : null;
  const clipRaw = useJsonOpt<ActionClip>(cfg ? `${charBase}/actions/${cfg.name}.json` : null);
  const clip = useMemo(() => {
    const parsed = clipRaw.data ? ActionClipSchema.parse(clipRaw.data) : null;
    return parsed && cfg?.loop != null ? {...parsed, loop: cfg.loop} : parsed;
  }, [clipRaw, cfg?.loop]);

  const segs = useMemo(() => (p ? buildLoco(p, shotDurSec) : []), [p, shotDurSec]);
  const loco = evalLoco(p ?? {x: 0, y: 0, flip: false} as Placement, segs, tSec);
  const hPx = H * 0.62 * (p?.scale ?? 1);
  const bob = gaitBob(tSec, loco.gaiting, hPx);

  const x = loco.x + (p ? legacyEnterSlide(p, tSec) : 0);

  const worlds = useMemo(
    () => (partsFile ? evalParts(partsFile, clip, tSec, cfg?.speed ?? 1) : null),
    [partsFile, clip, tSec, cfg?.speed],
  );

  return {tSec, charBase, partsReady: partsRaw.ready, partsFile, clip, cfg, pos: {x, y: loco.y + bob.dy / H}, flip: loco.flip, tilt: bob.tilt, hPx, worlds};
};
