import React, {useEffect, useState} from 'react';
import {Audio, continueRender, delayRender, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {fetchText} from './load';
import {CameraRig} from './CameraRig';
import {Sprite} from './Sprite';
import {AudioManifest, ShotTimeline, lineKey} from '../spec';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Source Han Serif SC", serif';

/** 背景层：SVG 场景铺满变焦 1 的画面。 */
const Scene: React.FC<{episodeId: string; scene: string | null}> = ({episodeId, scene}) => {
  const {width: W, height: H} = useVideoConfig();
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!scene) return;
    const h = delayRender('scene');
    fetchText(`episodes/${episodeId}/assets/scenes/${scene}.svg`).then(setSvg).catch((e) => {continueRender(h); throw e;}).finally(() => continueRender(h));
  }, [scene, episodeId]);
  if (!scene) return <div style={{position: 'absolute', inset: 0, background: '#000'}} />;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H}}>
      {svg ? <div style={{width: '100%', height: '100%'}} dangerouslySetInnerHTML={{__html: svg.replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid slice"')}} /> : null}
    </div>
  );
};

/** 道具层：世界系 SVG 挂件（灯效/漂浮物等）。 */
const Prop: React.FC<{episodeId: string; file: string; x: number; y: number; scale: number; anim: string}> = ({episodeId, file, x, y, scale, anim}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H, fps} = useVideoConfig();
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    const h = delayRender('prop');
    fetchText(`episodes/${episodeId}/assets/props/${file}.svg`).then(setSvg).catch((e) => {continueRender(h); throw e;}).finally(() => continueRender(h));
  }, [file, episodeId]);
  const blinkOn = anim === 'blink' ? frame % Math.round(fps * 0.9) < fps * 0.45 : anim === 'blink-fast' ? frame % Math.round(fps * 0.3) < fps * 0.15 : true;
  const float = anim === 'float' ? Math.sin(frame / (fps * 0.8)) * H * 0.006 : 0;
  return (
    <div style={{position: 'absolute', left: x * W, top: y * H + float, transform: 'translate(-50%,-50%)', width: W * 0.12 * scale, opacity: blinkOn ? 1 : 0.15}}>
      {svg ? <div style={{width: '100%'}} dangerouslySetInnerHTML={{__html: svg.replace('<svg', '<svg style="width:100%;height:auto;display:block;overflow:visible"')}} /> : null}
    </div>
  );
};

/** 底部对白字幕。 */
const DialogueBar: React.FC<{tl: ShotTimeline; names: Record<string, string>}> = ({tl, names}) => {
  const frame = useCurrentFrame();
  const {height: H} = useVideoConfig();
  const idx = tl.lineFrames.findIndex((s, i) => {
    const end = i + 1 < tl.lineFrames.length ? tl.lineFrames[i + 1] : tl.durationFrames - Math.round(0.15 * 24);
    return frame >= s && frame < end;
  });
  if (idx < 0) return null;
  const line = tl.shot.dialogue[idx];
  const who = line.speaker ? names[line.speaker] ?? line.speaker : '';
  return (
    <div style={{position: 'absolute', left: '12%', right: '12%', bottom: H * 0.075, textAlign: 'center', fontFamily: FONT}}>
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

/** 顶部说明字幕（场景卡/旁白条）。 */
const CaptionBar: React.FC<{text: string}> = ({text}) => {
  const {height: H} = useVideoConfig();
  return (
    <div style={{position: 'absolute', top: H * 0.07, width: '100%', textAlign: 'center', fontFamily: FONT}}>
      <span style={{fontSize: H * 0.03, letterSpacing: 6, color: 'rgba(245,242,236,0.85)', fontStyle: 'italic', textShadow: '0 2px 8px #000'}}>{text}</span>
    </div>
  );
};

/** 单个镜头：场景 + 角色 + 机位 + 台词音轨 + 字幕 + 转场。 */
export const Shot: React.FC<{episodeId: string; tl: ShotTimeline; manifest?: AudioManifest; names: Record<string, string>}> = ({episodeId, tl, manifest, names}) => {
  const frame = useCurrentFrame();
  const {fps, height: H} = useVideoConfig();
  const {shot, lineFrames, durationFrames} = tl;

  const speakingAt = (charId: string) => lineFrames.some((s, i) => {
    const end = i + 1 < lineFrames.length ? lineFrames[i + 1] : durationFrames;
    return shot.dialogue[i].speaker === charId && frame >= s && frame < end;
  });

  const fade = Math.min(
    interpolate(frame, [0, fps * 0.5], [shot.transitionIn === 'cut' ? 1 : 0, 1], {extrapolateRight: 'clamp'}),
    interpolate(frame, [durationFrames - fps * 0.4, durationFrames - 1], [1, shot.transitionIn === 'fade' || shot.transitionIn === 'fade-black' ? 0.15 : 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );

  return (
    <div style={{position: 'absolute', inset: 0, background: '#06070c', opacity: fade}}>
      <CameraRig shot={shot} totalFrames={durationFrames}>
        <Scene episodeId={episodeId} scene={shot.scene} />
        {shot.props.map((pr, i) => <Prop key={i} episodeId={episodeId} {...pr} />)}
        {shot.characters.map((p) => <Sprite key={p.id} episodeId={episodeId} p={p} speaking={speakingAt(p.id)} />)}
      </CameraRig>
      {shot.dialogue.map((d, i) => {
        const line = manifest?.lines[lineKey(shot.id, i)];
        if (!line) return null;
        return (
          <Sequence key={i} from={lineFrames[i]} durationInFrames={durationFrames - lineFrames[i]}>
            <Audio src={staticFile(`episodes/${episodeId}/audio/${line.file}`)} />
          </Sequence>
        );
      })}
      <DialogueBar tl={tl} names={names} />
      {shot.caption ? <CaptionBar text={shot.caption} /> : null}
    </div>
  );
};
