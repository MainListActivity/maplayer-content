import {z} from 'zod';
import {AmbientSchema} from '../spec';

type Ambient = z.infer<typeof AmbientSchema>;

/** 平铺运动平面；位移包裹而不复位视觉内容。旋转后仍覆盖固定层视口。 */
export const ambientMotion = (ambient: Ambient[], t: number, width: number, height: number) => {
  const rotate = ambient.find(a => a.type === 'rotate');
  const drifts = ambient.filter(a => a.type === 'drift');
  if (!rotate && !drifts.length) return null;
  const wrap = (v: number) => ((v + 0.5) % 1 + 1) % 1 - 0.5;
  const dx = wrap(drifts.reduce((sum, a) => sum + (a.dx ?? 0), 0) * t) * width;
  const dy = wrap(drifts.reduce((sum, a) => sum + (a.dy ?? 0), 0) * t) * height;
  const pivot = rotate?.pivot ?? {x: 0.5, y: 0.5};
  const px = pivot.x * width, py = pivot.y * height;
  // 逆变换后的视口角落离 pivot 的距离，加最大包裹位移半对角线。
  const radius = Math.hypot(Math.max(px, width - px), Math.max(py, height - py)) + Math.hypot(width, height) / 2;
  const nx = rotate ? Math.ceil(radius / width) + 1 : 1;
  const ny = rotate ? Math.ceil(radius / height) + 1 : 1;
  return {
    left: -nx * width, top: -ny * height,
    width: (2 * nx + 1) * width, height: (2 * ny + 1) * height,
    transformOrigin: `${nx * width + px}px ${ny * height + py}px`,
    transform: `rotate(${((rotate?.degPerSec ?? 0) * t) % 360}deg) translate(${dx}px, ${dy}px)`,
  };
};
