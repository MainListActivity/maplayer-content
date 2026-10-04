import React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {Shot, ShotOverlay} from './Shot';
import {useBundle} from './load';

/** 颗粒层：手绘质感的轻微噪点。 */
const Grain: React.FC<{opacity?: number}> = ({opacity = 0.06}) => (
  <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, pointerEvents: 'none', mixBlendMode: 'overlay'}}>
    <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" /><feColorMatrix type="saturate" values="0" /></filter>
    <rect width="100%" height="100%" filter="url(#g)" />
  </svg>
);

export const EpisodePlayer: React.FC<{episodeId: string; bundle?: import('./load').EpisodeBundle}> = ({episodeId, bundle: preloaded}) => {
  const loaded = useBundle(episodeId);
  const bundle = preloaded ?? loaded;
  const {height: H, width: W} = useVideoConfig();
  if (!bundle) return null;
  const bar = bundle.ep.letterbox ? (H - W / 2.35) / 2 : 0;
  return (
    <div style={{position: 'absolute', inset: 0, background: '#000'}}>
      {bundle.timeline.map((tl) => (
        <Sequence key={tl.shot.id} from={tl.startFrame} durationInFrames={tl.durationFrames}>
          <Shot episodeId={episodeId} tl={tl} manifest={bundle.manifest} />
        </Sequence>
      ))}
      {bundle.ep.letterbox ? (
        <>
          <div style={{position: 'absolute', top: 0, width: '100%', height: bar, background: '#000'}} />
          <div style={{position: 'absolute', bottom: 0, width: '100%', height: bar, background: '#000'}} />
        </>
      ) : null}
      {bundle.timeline.map((tl) => (
        <Sequence key={`${tl.shot.id}-ov`} from={tl.startFrame} durationInFrames={tl.durationFrames}>
          <ShotOverlay tl={tl} names={bundle.ep.names} bar={bar} />
        </Sequence>
      ))}
      {bundle.ep.grain ? <Grain /> : null}
    </div>
  );
};
