import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {ShotSpec} from '../spec';

const EASE = {linear: (t: number) => t, hold: () => 0, easeInOut: (t: number) => t * t * (3 - 2 * t)};

/**
 * Ken Burns 机位：世界系坐标 (0..1) × 变焦。
 * 取景中心点投影到屏幕中心：translate(W/2 - z·fx·W, H/2 - z·fy·H) scale(z)。
 */
export const CameraRig: React.FC<{shot: ShotSpec; totalFrames: number; children: React.ReactNode}> = ({shot, totalFrames, children}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const cam = shot.camera;
  const to = cam.to ?? cam.from;
  const t = EASE[cam.ease](totalFrames <= 1 ? 1 : Math.min(1, frame / (totalFrames - 1)));
  const fx = interpolate(t, [0, 1], [cam.from.x, to.x]);
  const fy = interpolate(t, [0, 1], [cam.from.y, to.y]);
  const z = interpolate(t, [0, 1], [cam.from.zoom, to.zoom]);
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${W / 2 - z * fx * W}px, ${H / 2 - z * fy * H}px) scale(${z})`}}>
      {children}
    </div>
  );
};
