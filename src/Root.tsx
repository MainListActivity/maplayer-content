import React from 'react';
import {Composition} from 'remotion';
import {EpisodePlayer} from './lib/EpisodePlayer';
import {loadEpisodeBundle} from './lib/load';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="episode"
    component={EpisodePlayer}
    durationInFrames={24}
    fps={24}
    width={1920}
    height={1080}
    defaultProps={{episodeId: 'ep01'}}
    calculateMetadata={async ({props}) => {
      const bundle = await loadEpisodeBundle(props.episodeId);
      const total = bundle.timeline.reduce((a, t) => a + t.durationFrames, 0);
      return {durationInFrames: Math.max(1, total), fps: bundle.ep.fps, width: bundle.ep.width, height: bundle.ep.height, props: {...props, bundle}};
    }}
  />
);
