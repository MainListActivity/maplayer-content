import React, {useEffect, useRef, useState} from 'react';
import {continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {fetchText} from './load';
import {PlacementSchema} from '../spec';
import {z} from 'zod';

type Placement = z.infer<typeof PlacementSchema>;

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * SVG 角色立绘。约定动画组（可选）：
 *   #mouth-open  说话口型（台词期间 ~6fps 开合）
 *   #eye-l/#eye-r 眨眼（周期性压扁）
 *   #prop-*      道具挂件
 * 呼吸浮动 + 入/出场滑移由外层 transform 负责。
 */
export const Sprite: React.FC<{episodeId: string; p: Placement; speaking: boolean}> = ({episodeId, p, speaking}) => {
  const frame = useCurrentFrame();
  const {height: H, fps} = useVideoConfig();
  const [svg, setSvg] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const src = `episodes/${episodeId}/assets/characters/${p.id}/${p.variant}.svg`;
  useEffect(() => {
    const h = delayRender(`sprite ${p.id}`);
    fetchText(src).then(setSvg).catch((e) => {continueRender(h); throw e;}).finally(() => continueRender(h));
  }, [src]);

  useEffect(() => {
    const root = host.current;
    if (!root || !svg) return;
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
  }, [svg, frame, speaking, p.id, fps]);

  const bob = Math.sin((frame / fps) * 2.2 + hash(p.id)) * 4;
  const slide = p.enter !== 'none' && frame < fps * 0.6 ? (1 - frame / (fps * 0.6)) * (p.enter === 'left' ? -1 : 1) * 0.12 : 0;
  const slideOut = p.exit !== 'none' ? 0 : 0; // 出场由镜头切换承担，暂保留插槽

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
      <div ref={host} style={{height: '100%', transform: `translateY(${bob}px)`}}>
        {svg ? (
          <div
            style={{height: '100%'}}
            dangerouslySetInnerHTML={{__html: svg.replace('<svg', '<svg style="height:100%;width:auto;display:block;overflow:visible" preserveAspectRatio="xMidYMax meet"')}}
          />
        ) : null}
      </div>
    </div>
  );
};
