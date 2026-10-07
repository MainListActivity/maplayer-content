import React, {useEffect, useMemo, useRef} from 'react';
import {staticFile, useVideoConfig} from 'remotion';
import {useAssetSrc, useAssetsReady, usePngProbeMap, usePngReady} from './load';
import {evalKf, sequenceIndex, spriteHash} from './rig';
import {Placement, useCharWorld} from './useCharWorld';

/**
 * 角色精灵。渲染模式按资产自动选择：
 *  1. parts/parts.json 存在 → 部件 rig（tracks 关节动画，含父子链矩阵）；此模式下 action.frames
 *     指 parts/poses/<frame>/ 目录 —— 目录内与部件同名的 PNG 覆写该部件贴图（稀疏覆写，缺的用基底），
 *     纯部件角色无需 default 整幅资产。
 *  2. 无 parts 时 action 剪辑有 frames → 姿势序列帧（characters/<id>/<frame>.png|.svg 逐帧切换整幅）
 *  3. 默认 → 整幅 PNG/SVG；SVG 上 tracks 应用到 #id 命名组（data-pivot="x y" 指定关节点）
 * 走位 = placement.moves 分段插值 + gait:walk 步态起伏 + 自动朝向；walk-left/right 走场替换旧滑动。
 */
export const Sprite: React.FC<{episodeId: string; p: Placement; speaking: boolean; shotDurSec: number}> = ({episodeId, p, speaking, shotDurSec}) => {
  const {height: H, fps} = useVideoConfig();
  const {tSec, charBase, partsReady: partsMetaReady, partsFile, clip, cfg, pos, flip, tilt, hPx, worlds} = useCharWorld(episodeId, p, shotDurSec);
  const rigMode = partsFile != null;

  // 姿势序列帧（仅非 rig 模式：frames = 整幅变体名）：预载全帧。
  // 竞态防护：parts.json 未就绪时 frames 不得预载——否则 rig 姿势目录名会被当整幅图请求。
  const frameUrls = useMemo(
    () => (partsMetaReady && !rigMode ? (clip?.frames ?? []).map((f) => `${charBase}/${f}`) : []),
    [clip, charBase, rigMode, partsMetaReady],
  );
  const framesReady = useAssetsReady(frameUrls);
  const frameIdx = clip ? sequenceIndex(clip, tSec, cfg?.speed ?? 1) : 0;
  const seqFrame = rigMode ? undefined : clip?.frames?.[frameIdx];

  // rig 模式姿势帧：探测所有候选覆写图 parts/poses/<frame>/<partFile>（404→基底贴图）
  const poseFrame = rigMode ? clip?.frames?.[frameIdx] : undefined;
  const poseUrls = useMemo(
    () => (partsFile && clip?.frames
      ? clip.frames.flatMap((f) => partsFile.parts.map((d) => `${charBase}/parts/poses/${f}/${d.file}`))
      : []),
    [partsFile, clip, charBase],
  );
  const poseMap = usePngProbeMap(poseUrls);
  const partSrc = (d: {file: string}) => {
    const override = poseFrame ? `${charBase}/parts/poses/${poseFrame}/${d.file}` : null;
    return override && poseMap?.[override] ? override : `${charBase}/parts/${d.file}`;
  };

  // 整幅资产仅在非 rig 模式下请求（parts-only 角色无 default 也可渲染）
  const variant = seqFrame ?? p.variant ?? 'default';
  const src = useAssetSrc(partsMetaReady && !partsFile ? `${charBase}/${variant}` : null);

  // 部件基底 PNG 预载（覆写图经 probe 已入缓存）
  const partUrls = useMemo(() => (partsFile?.parts ?? []).map((d) => `${charBase}/parts/${d.file}`), [partsFile, charBase]);
  const partsReady = usePngReady(partUrls);

  // ---- SVG 命名组变换 + 口型/眨眼（DOM 副作用，沿用既有 hook 约定）----
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
  if (src?.kind === 'svg' && host.current && src.svg) {
    const root = host.current.querySelector('svg');
    if (root) {
      const open = root.querySelector('#mouth-open');
      const closed = root.querySelector('#mouth');
      const frame = Math.round(tSec * fps);
      const on = speaking && Math.floor(frame / (fps / 6)) % 2 === 0;
      if (open) (open as SVGElement).style.display = on ? '' : 'none';
      if (closed) (closed as SVGElement).style.display = open && on ? 'none' : '';
      const blink = (frame + spriteHash(p.id) % 120) % 160 < 5;
      for (const sel of ['#eyes', '#eye-l', '#eye-r']) {
        const eyes = root.querySelector(sel) as SVGElement | null;
        if (eyes) {
          eyes.style.transformBox = 'fill-box'; eyes.style.transformOrigin = 'center';
          eyes.style.transform = blink ? 'scaleY(0.1)' : '';
        }
      }
      // 部件轨道 → SVG 命名组（data-pivot="x y" = viewBox 坐标关节点，缺省取包围盒中心）
      if (clip) {
        for (const [pid, kfs] of Object.entries(clip.tracks)) {
          const el = root.querySelector(`#${CSS.escape(pid)}`) as SVGGraphicsElement | null;
          if (!el || !kfs.length) continue;
          const pose = evalKf(kfs, tSec * (cfg?.speed ?? 1), clip.durationSec, clip.loop);
          let px = 0, py = 0;
          const attr = el.getAttribute('data-pivot');
          if (attr) {[px, py] = attr.split(/[\s,]+/).map(Number);} else {
            try {const b = el.getBBox(); px = b.x + b.width / 2; py = b.y + b.height / 2;} catch {continue;}
          }
          const r = (pose.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), sc = pose.scale;
          const e = pose.dx + px - sc * (c * px - s * py);
          const f = pose.dy + py - sc * (s * px + c * py);
          el.setAttribute('transform', `matrix(${(sc * c).toFixed(4)} ${(sc * s).toFixed(4)} ${(-sc * s).toFixed(4)} ${(sc * c).toFixed(4)} ${e.toFixed(2)} ${f.toFixed(2)})`);
          (el as unknown as HTMLElement).style.opacity = String(pose.opacity);
        }
      }
    }
  }
  }, [src, tSec, fps, speaking, p.id, clip, cfg?.speed, framesReady]);

  if (!src && !partsFile) return null;

  const legacy = !partsFile && !clip && !p.moves.length && !p.enter.startsWith('walk') && !p.exit.startsWith('walk');
  const bob = legacy ? Math.sin(tSec * 2.2 + spriteHash(p.id)) * 4 : 0;
  const talkPulse = src?.kind === 'png' && speaking && Math.floor(Math.round(tSec * fps) / (fps / 6)) % 2 === 0 ? 1.015 : 1;
  const innerStyle: React.CSSProperties = {height: '100%', transformOrigin: '50% 100%', transform: `translateY(${bob}px) scaleY(${talkPulse})`};
  const outerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${pos.x * 100}%`,
    top: `${pos.y * 100}%`,
    transform: `translate(-50%, -100%) scaleX(${flip ? -1 : 1}) rotate(${tilt}deg)`,
    transformOrigin: '50% 100%',
    height: hPx,
  };

  // 模式 1：部件 rig —— 每部件按世界矩阵贴图（拼合系 px → 屏 px 缩放 unit）
  if (partsFile) {
    const [cw, ch] = partsFile.size;
    const unit = hPx / ch;
    const ordered = [...partsFile.parts].sort((a, b) => a.depth - b.depth);
    return (
      <div style={outerStyle}>
        <div style={{position: 'relative', width: cw * unit, height: hPx, margin: '0 auto'}}>
          {partsReady && poseMap &&
            ordered.map((d) => {
              const w = worlds?.get(d.id);
              if (!w) return null;
              const m = w.m;
              // 元素变换 = S(unit) · M_world · T(at)：拼合 px → 屏 px
              const a = m[0] * unit, b = m[1] * unit, c = m[2] * unit, dd = m[3] * unit;
              const e = (m[0] * d.at[0] + m[2] * d.at[1] + m[4]) * unit;
              const f = (m[1] * d.at[0] + m[3] * d.at[1] + m[5]) * unit;
              return (
                <img
                  key={d.id}
                  src={staticFile(partSrc(d))}
                  data-part={d.id}
                  style={{
                    position: 'absolute', left: 0, top: 0,
                    transform: `matrix(${a}, ${b}, ${c}, ${dd}, ${e}, ${f})`,
                    transformOrigin: '0 0',
                    opacity: w.opacity,
                  }}
                />
              );
            })}
        </div>
      </div>
    );
  }

  const style: React.CSSProperties = {height: '100%', width: 'auto', display: 'block'};

  // 模式 2/3：序列帧或整幅
  if (src?.kind === 'png') {
    const url = staticFile(src.url);
    if (!url || (seqFrame && !framesReady)) return null;
    return (
      <div style={outerStyle}>
        <div style={innerStyle}><img src={url} style={style} /></div>
      </div>
    );
  }
  if (src?.kind === 'svg') {
    if (seqFrame && !framesReady) return null;
    return (
      <div style={outerStyle}>
        <div style={innerStyle}>
          <div ref={host} style={{height: '100%'}} dangerouslySetInnerHTML={{__html: src.svg.replace('<svg', '<svg style="height:100%;width:auto;display:block;overflow:visible" preserveAspectRatio="xMidYMax meet"')}} />
        </div>
      </div>
    );
  }
  return null;
};
