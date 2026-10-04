import React, {useEffect, useRef} from 'react';
import {staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {useAssetSrc} from './load';
import {PlacementSchema} from '../spec';
import {z} from 'zod';

type Placement = z.infer<typeof PlacementSchema>;

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * 角色立绘。位图（.png）优先，缺失回退 SVG。
 * SVG 约定动画组（可选）：
 *   #mouth-open  说话口型（台词期间 ~6fps 开合）
 *   #eye-l/#eye-r 眨眼（周期性压扁）
 *   #prop-*      道具挂件
 * 位图无挂点：说话期间做轻微纵向脉动代替口型。
 * 呼吸浮动 + 入/出场滑移由外层 transform 负责。
 */
export const Sprite: React.FC<{episodeId: string; p: Placement; speaking: boolean}> = ({episodeId, p, speaking}) => {
  const frame = useCurrentFrame();
  const {height: H, fps} = useVideoConfig();
  const host = useRef<HTMLDivElement>(null);
  const src = useAssetSrc(`episodes/${episodeId}/assets/characters/${p.id}/${p.variant}`);

  useEffect(() => {
    const root = host.current;
    if (!root || src?.kind !== 'svg') return;
    const mouthOpen = root.querySelector('#mouth-open') as SVGGElement | null;
    const mouth = root.querySelector('#mouth') as SVGGElement | null;
    const open = speaking && Math.floor(frame / (fps / 6)) % 2 === 0;
    if (mouthOpen) mouthOpen.style.display = open ? '' : 'none';
    if (mouth) mouth.style.display = mouthOpen ? (open ? 'none' : '') : '';
    const seed = hash(p.id) % 120;
    const blink = (frame + seed) % 160 < 5;
    (['#eye-l', '#eye-r', '#eyes'] as const).forEach((sel) => {
      const g = root.querySelector(sel) as SVGGElement | null;
      if (g) {g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center'; g.style.transform = blink ? 'scaleY(0.1)' : '';}
    });
  }, [src, frame, speaking, p.id, fps]);

  const bob = Math.sin((frame / fps) * 2.2 + hash(p.id)) * 4;
  const talkPulse = src?.kind === 'png' && speaking && Math.floor(frame / (fps / 6)) % 2 === 0 ? 1.015 : 1;
  const slide = p.enter !== 'none' && frame < fps * 0.6 ? (1 - frame / (fps * 0.6)) * (p.enter === 'left' ? -1 : 1) * 0.12 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${(p.x + slide) * 100}%`,
        top: `${p.y * 100}%`,
        transform: `translate(-50%, -100%) scaleX(${p.flip ? -1 : 1})`,
        height: H * 0.62 * p.scale,
      }}
    >
      <div ref={host} style={{height: '100%', transformOrigin: '50% 100%', transform: `translateY(${bob}px) scaleY(${talkPulse})`}}>
        {src?.kind === 'png' ? (
          <img src={staticFile(src.url)} style={{height: '100%', width: 'auto', display: 'block'}} />
        ) : src?.kind === 'svg' ? (
          <div
            style={{height: '100%'}}
            dangerouslySetInnerHTML={{__html: src.svg.replace('<svg', '<svg style="height:100%;width:auto;display:block;overflow:visible" preserveAspectRatio="xMidYMax meet"')}}
          />
        ) : null}
      </div>
    </div>
  );
};
