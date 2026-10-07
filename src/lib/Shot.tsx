import React, {useMemo} from 'react';
import {Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {useAssetSrc, useJsonOpt} from './load';
import {CameraRig, useCamPose} from './CameraRig';
import {Sprite} from './Sprite';
import {useCharWorld} from './useCharWorld';
import {evalPropMotion, layerTransform, partAnchorWorld} from './rig';
import {AmbientSchema, AudioManifest, PropSchema, SceneFile, SceneFileSchema, ShotSpec, ShotTimeline, lineKey} from '../spec';
import {z} from 'zod';

type PropSpec = z.infer<typeof PropSchema>;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Source Han Serif SC", serif';

/** 平铺场景：整幅 PNG/SVG 铺变焦 1 的画面（旧资产形态），相机变换 depth=1 与 CameraRig 同式。 */
const FlatScene: React.FC<{episodeId: string; scene: string; pose: {fx: number; fy: number; z: number}}> = ({episodeId, scene, pose}) => {
  const {width: W, height: H} = useVideoConfig();
  const src = useAssetSrc(`episodes/${episodeId}/assets/scenes/${scene}`);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: layerTransform(pose, 1, W, H), transformOrigin: '0 0'}}>
      {src?.kind === 'png' ? (
        <img src={staticFile(src.url)} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
      ) : src?.kind === 'svg' ? (
        <div style={{width: '100%', height: '100%'}} dangerouslySetInnerHTML={{__html: src.svg.replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid slice"')}} />
      ) : null}
    </div>
  );
};

/** 氛围：dust 漂浮粒子层（确定性伪随机，帧间连续）。 */
const DustLayer: React.FC<{a: z.infer<typeof AmbientSchema>; pose: {fx: number; fy: number; z: number}}> = ({a, pose}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  const t = frame / fps;
  const dots = useMemo(() => Array.from({length: a.count}, (_, i) => {
    const s = (i * 2654435761) >>> 0;
    return {x: ((s % 1000) / 1000), y: (((s >> 10) % 1000) / 1000), ph: ((s >> 20) % 628) / 100, sz: a.size * (0.6 + ((s >> 8) % 40) / 100)};
  }), [a.count, a.size]);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: layerTransform(pose, a.depth, W, H), transformOrigin: '0 0', overflow: 'hidden'}}>
      {dots.map((d, i) => {
        const dx = Math.sin(t * Math.PI * 2 * a.hz * 0.13 + d.ph) * W * 0.02 + t * W * 0.004 * (i % 3 - 1);
        const dy = Math.cos(t * Math.PI * 2 * a.hz * 0.11 + d.ph * 1.7) * H * 0.015;
        return (
          <div key={i} style={{
            position: 'absolute', left: ((d.x + t * 0.008) % 1) * W, top: (d.y % 1) * H,
            width: d.sz, height: d.sz, borderRadius: '50%',
            background: a.color, opacity: a.opacity * (0.5 + 0.5 * Math.sin(t * a.hz + d.ph)),
            transform: `translate(${dx}px, ${dy}px)`,
          }} />
        );
      })}
    </div>
  );
};

/** 分层场景的一组层（back: depth<=1 在角色后；front: >1 在角色前遮挡脚部）。 */
const SceneLayers: React.FC<{episodeId: string; scene: string; layers: SceneFile['layers']; ambient: SceneFile['ambient']; pose: {fx: number; fy: number; z: number}; back: boolean}> =
  ({episodeId, scene, layers, ambient, pose, back}) => {
  const {width: W, height: H} = useVideoConfig();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  return (
    <>
      {layers.map((l, i) => {
        const amb = ambient.filter((x) => !x.layer || x.layer === l.id);
        let extra = '';
        let op = 1;
        for (const x of amb) {
          if (x.type === 'flicker') op *= 1 - x.amp + x.amp * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * x.hz) * Math.sin(t * 3.7 + i));
          if (x.type === 'pulse') extra += ` scale(${1 + x.amp * Math.sin(t * Math.PI * 2 * x.hz)})`;
        }
        return (
          <div key={l.id ?? i} style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: layerTransform(pose, l.depth, W, H), transformOrigin: '0 0'}}>
            <div style={{width: '100%', height: '100%', transform: extra || undefined, transformOrigin: '50% 50%', opacity: op}}>
              <img src={staticFile(`episodes/${episodeId}/assets/scenes/${scene}/${l.file}`)} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
            </div>
          </div>
        );
      })}
      {ambient.filter((a) => a.type === 'dust' && (back ? a.depth <= 1 : a.depth > 1)).map((a, i) => <DustLayer key={`d${i}`} a={a} pose={pose} />)}
    </>
  );
};

/** 道具层：静态摆位 / motion 位移关键帧 / attachTo 跟随角色部件（世界系）。 */
const Prop: React.FC<{episodeId: string; pr: PropSpec; shot: ShotSpec; shotDurSec: number}> = ({episodeId, pr, shot, shotDurSec}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  const tSec = frame / fps;
  const src = useAssetSrc(`episodes/${episodeId}/assets/props/${pr.file}`);

  // attachTo：取目标角色世界姿态（useCharWorld 无条件调用，null 目标 → 不加载部件）
  const target = pr.attachTo ? shot.characters.find((c) => c.id === pr.attachTo!.character) : undefined;
  const cw = useCharWorld(episodeId, target ?? null, shotDurSec);

  let x = pr.x, y = pr.y, rot = 0, extraOp = 1;
  if (pr.attachTo && target && cw.partsFile && cw.worlds) {
    const anchor = partAnchorWorld(cw.partsFile, cw.worlds, pr.attachTo.part);
    if (anchor) {
      const unit = cw.hPx / cw.partsFile.size[1];
      const dx = (anchor.x - cw.partsFile.size[0] / 2) * unit * (cw.flip ? -1 : 1);
      const dy = (anchor.y - cw.partsFile.size[1]) * unit;
      x = cw.pos.x + dx / W;
      y = cw.pos.y + dy / H;
      rot = anchor.rot * (cw.flip ? -1 : 1);
      extraOp = anchor.opacity;
    }
  } else if (pr.motion.length) {
    const m = evalPropMotion(pr.motion, tSec);
    x = m.x; y = m.y; rot = m.rot;
  }

  const blinkOn = pr.anim === 'blink' ? frame % Math.round(fps * 0.9) < fps * 0.45 : pr.anim === 'blink-fast' ? frame % Math.round(fps * 0.3) < fps * 0.15 : true;
  const float = pr.anim === 'float' ? Math.sin(frame / (fps * 0.8)) * H * 0.006 : 0;
  return (
    <div style={{position: 'absolute', left: x * W, top: y * H + float, transform: `translate(-50%,-50%) rotate(${rot}deg)`, width: W * 0.12 * pr.scale, opacity: (blinkOn ? 1 : 0.15) * extraOp}}>
      {src?.kind === 'png' ? (
        <img src={staticFile(src.url)} style={{width: '100%', height: 'auto', display: 'block'}} />
      ) : src?.kind === 'svg' ? (
        <div style={{width: '100%'}} dangerouslySetInnerHTML={{__html: src.svg.replace('<svg', '<svg style="width:100%;height:auto;display:block;overflow:visible"')}} />
      ) : null}
    </div>
  );
};

/** 底部对白字幕。bar>0 时压在下 letterbox 黑边内（不被裁切）。 */
const DialogueBar: React.FC<{tl: ShotTimeline; names: Record<string, string>; bar: number}> = ({tl, names, bar}) => {
  const frame = useCurrentFrame();
  const {height: H} = useVideoConfig();
  const idx = tl.lineFrames.findIndex((s, i) => {
    const end = i + 1 < tl.lineFrames.length ? tl.lineFrames[i + 1] : tl.durationFrames - Math.round(0.15 * 24);
    return frame >= s && frame < end;
  });
  if (idx < 0) return null;
  const line = tl.shot.dialogue[idx];
  const who = line.speaker ? names[line.speaker] ?? line.speaker : '';
  const box = bar > 0
    ? {position: 'absolute' as const, left: '12%', right: '12%', bottom: 0, height: bar, display: 'flex', alignItems: 'center', justifyContent: 'center'}
    : {position: 'absolute' as const, left: '12%', right: '12%', bottom: H * 0.075, textAlign: 'center' as const};
  return (
    <div style={{...box, textAlign: 'center', fontFamily: FONT}}>
      <span style={{
        display: 'inline-block', padding: '0.35em 0.9em', borderRadius: 6,
        fontSize: H * 0.036, lineHeight: 1.45, letterSpacing: 2, color: '#f5f2ec',
        background: 'rgba(8,10,16,0.55)',
        textShadow: '0 2px 6px rgba(0,0,0,0.9)',
      }}>
        {who ? <b style={{color: '#ffd27a', marginRight: '0.6em'}}>{who}</b> : null}
        {line.text}
      </span>
    </div>
  );
};

/** 顶部说明字幕（场景卡/旁白条）。bar>0 时压在上 letterbox 黑边内。 */
const CaptionBar: React.FC<{text: string; bar: number}> = ({text, bar}) => {
  const {height: H} = useVideoConfig();
  const box = bar > 0
    ? {position: 'absolute' as const, top: 0, width: '100%', height: bar, display: 'flex', alignItems: 'center', justifyContent: 'center'}
    : {position: 'absolute' as const, top: H * 0.07, width: '100%'};
  return (
    <div style={{...box, textAlign: 'center', fontFamily: FONT}}>
      <span style={{fontSize: H * 0.03, letterSpacing: 6, color: 'rgba(245,242,236,0.85)', fontStyle: 'italic', textShadow: '0 2px 8px #000'}}>{text}</span>
    </div>
  );
};

/** 字幕覆盖层：在 letterbox 之后绘制，使对白/说明条不被黑边裁切。 */
export const ShotOverlay: React.FC<{tl: ShotTimeline; names: Record<string, string>; bar: number}> = ({tl, names, bar}) => (
  <>
    <DialogueBar tl={tl} names={names} bar={bar} />
    {tl.shot.caption ? <CaptionBar text={tl.shot.caption} bar={bar} /> : null}
  </>
);

/** 单个镜头：场景（分层视差/氛围）+ 角色/道具（depth 混排）+ 机位 + 台词音轨 + 转场。 */
export const Shot: React.FC<{episodeId: string; tl: ShotTimeline; manifest?: AudioManifest}> = ({episodeId, tl, manifest}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {shot, lineFrames, durationFrames} = tl;
  const shotDurSec = durationFrames / fps;
  const pose = useCamPose(shot, durationFrames);

  const sceneRaw = useJsonOpt<SceneFile>(shot.scene ? `episodes/${episodeId}/assets/scenes/${shot.scene}/scene.json` : null);
  const sceneDef = useMemo(() => {
    const r = sceneRaw.data ? SceneFileSchema.safeParse(sceneRaw.data) : null;
    return r?.success ? r.data : null;
  }, [sceneRaw]);

  const speakingAt = (charId: string) => lineFrames.some((s, i) => {
    const end = i + 1 < lineFrames.length ? lineFrames[i + 1] : durationFrames;
    return shot.dialogue[i].speaker === charId && frame >= s && frame < end;
  });

  const fade = Math.min(
    interpolate(frame, [0, fps * 0.5], [shot.transitionIn === 'cut' ? 1 : 0, 1], {extrapolateRight: 'clamp'}),
    interpolate(frame, [durationFrames - fps * 0.4, durationFrames - 1], [1, shot.transitionIn === 'fade' || shot.transitionIn === 'fade-black' ? 0.15 : 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );

  // 世界系混排：角色与道具按 depth 升序（同级保持声明顺序）
  const actors = [
    ...shot.props.map((pr, i) => ({d: pr.depth, k: `p:${i}`, node: <Prop key={i} episodeId={episodeId} pr={pr} shot={shot} shotDurSec={shotDurSec} />})),
    ...shot.characters.map((p) => ({d: p.depth, k: `c:${p.id}`, node: <Sprite key={p.id} episodeId={episodeId} p={p} speaking={speakingAt(p.id)} shotDurSec={shotDurSec} />})),
  ].sort((a, b) => a.d - b.d);

  const back = sceneDef?.layers.filter((l) => l.depth <= 1) ?? [];
  const front = sceneDef?.layers.filter((l) => l.depth > 1) ?? [];

  return (
    <div style={{position: 'absolute', inset: 0, background: '#06070c', opacity: fade}}>
      {shot.scene == null ? (
        <div style={{position: 'absolute', inset: 0, background: '#000'}} />
      ) : sceneDef ? (
        <SceneLayers episodeId={episodeId} scene={shot.scene} layers={back} ambient={sceneDef.ambient} pose={pose} back />
      ) : sceneRaw.ready ? (
        <FlatScene episodeId={episodeId} scene={shot.scene} pose={pose} />
      ) : null}
      <CameraRig shot={shot} totalFrames={durationFrames}>
        {actors.map((a) => <React.Fragment key={a.k}>{a.node}</React.Fragment>)}
      </CameraRig>
      {sceneDef && (front.length > 0 || sceneDef.ambient.some((a) => a.type === 'dust' && a.depth > 1)) ? (
        <SceneLayers episodeId={episodeId} scene={shot.scene!} layers={front} ambient={sceneDef.ambient} pose={pose} back={false} />
      ) : null}
      {shot.dialogue.map((d, i) => {
        const line = manifest?.lines[lineKey(shot.id, i)];
        if (!line) return null;
        return (
          <Sequence key={i} from={lineFrames[i]} durationInFrames={durationFrames - lineFrames[i]}>
            <Audio src={staticFile(`episodes/${episodeId}/audio/${line.file}`)} />
          </Sequence>
        );
      })}
    </div>
  );
};
