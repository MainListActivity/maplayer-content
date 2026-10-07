import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Shot} from '../../../src/lib/Shot';
import {ShotSchema} from '../../../src/spec';

const Demo: React.FC<{mode: string}> = ({mode}) => {
  const shot = ShotSchema.parse({id: 'ambient-test', scene: mode === 'pan' ? 'both' : mode,
    camera: mode === 'pan' ? {from: {x: .43, y: .5, zoom: 1.4}, to: {x: .6, y: .5, zoom: 1.7}} : {from: {x: .5, y: .5, zoom: 1}},
  });
  return <Shot episodeId="ep00" tl={{shot, startFrame: 0, durationFrames: 96, lineFrames: []}} />;
};
registerRoot(() => <Composition id="ambient" component={Demo} width={640} height={360} fps={24} durationInFrames={96} defaultProps={{mode: 'both'}} />);
