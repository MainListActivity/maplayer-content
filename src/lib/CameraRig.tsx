import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {ShotSpec} from '../spec';
import {camPose, layerTransform} from './rig';

/** 相机姿态 hook：取景中心 (fx,fy) + 变焦 z。Scene 分层视差也复用。 */
export const useCamPose = (shot: ShotSpec, totalFrames: number) => {
  const frame = useCurrentFrame();
  return camPose(shot, totalFrames, frame);
};

/**
 * Ken Burns 机位：世界系坐标 (0..1) × 变焦。
 * 取景中心点投影到屏幕中心：translate(W/2 - z·fx·W, H/2 - z·fy·H) scale(z)。
 */
export const CameraRig: React.FC<{shot: ShotSpec; totalFrames: number; children: React.ReactNode}> = ({shot, totalFrames, children}) => {
  const {width: W, height: H} = useVideoConfig();
  const pose = useCamPose(shot, totalFrames);
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: '0 0', transform: layerTransform(pose, 1, W, H)}}>
      {children}
    </div>
  );
};
