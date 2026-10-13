import React from 'react';
import {AbsoluteFill, Audio, Composition, registerRoot, staticFile, useCurrentFrame} from 'remotion';
import {Shot} from '../../../src/lib/Shot';
import {fixtureShot, manifest} from './input';
const Demo: React.FC<{mode: string}> = ({mode}) => {
  const shot = fixtureShot(mode);
  return <Shot episodeId="fixture" manifest={mode === 'face' ? manifest : undefined} tl={{shot, startFrame: 0, durationFrames: 72, lineFrames: mode === 'face' ? [0, 30] : []}} />;
};
const Source: React.FC<{alpha: boolean}> = ({alpha}) => {
  const frame = useCurrentFrame();
  const color = frame < 24 ? '#ff0000' : frame < 48 ? '#00ff00' : '#0000ff';
  return <AbsoluteFill style={{background: alpha ? 'transparent' : color}}>
    {alpha ? <div style={{position: 'absolute', left: '25%', top: '25%', width: '50%', height: '50%', background: color}} /> : <><Audio src={staticFile('tone.wav')} loop /><div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: 10, background: 'white'}} /></>}
  </AbsoluteFill>;
};
registerRoot(() => <>
  <Composition id="performance" component={Demo} width={400} height={300} fps={24} durationInFrames={72} defaultProps={{mode: 'face'}} />
  <Composition id="source" component={Source} width={200} height={150} fps={24} durationInFrames={72} defaultProps={{alpha: false}} />
</>);
