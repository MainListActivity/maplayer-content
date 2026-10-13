import React from 'react';
import {Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {MediaLayerSpec} from '../spec';

export const mediaSequenceIndex = (layer: MediaLayerSpec, frame: number, fps: number): number => {
  if (layer.source.type !== 'sequence') return 0;
  return Math.min(layer.source.files.length - 1, Math.floor((layer.trimStartSec + frame / fps * layer.playbackRate) * layer.source.fps + 1e-8));
};
const Source: React.FC<{layer: MediaLayerSpec}> = ({layer}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: layer.fit};
  return layer.source.type === 'video'
    ? <OffthreadVideo src={staticFile(layer.source.file)} trimBefore={Math.round(layer.trimStartSec * fps)} playbackRate={layer.playbackRate} muted transparent={layer.source.transparent} style={style} />
    : <Img src={staticFile(layer.source.files[mediaSequenceIndex(layer, frame, fps)])} style={style} />;
};
/** Sequence 给源组件镜头内局部帧；包裹视口负责裁切，源音轨永远静音。 */
export const MediaLayer: React.FC<{layer: MediaLayerSpec}> = ({layer}) => (
  <Sequence from={layer.from} durationInFrames={layer.durationFrames} layout="none">
    <div style={{position: 'absolute', left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, width: `${layer.width * 100}%`, height: `${layer.height * 100}%`, overflow: 'hidden', opacity: layer.opacity}}>
      <Source layer={layer} />
    </div>
  </Sequence>
);
