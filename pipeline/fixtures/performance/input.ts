import {ShotSchema} from '../../../src/spec';
const face = {
  gaze: {role: 'gaze', keys: [{t: 0, file: 'gaze.png'}, {t: 1, file: 'gaze-right.png'}]},
  lid: {role: 'eyelid', keys: [{t: 0, file: 'lid-open.png'}, {t: 1.5, file: 'lid-closed.png'}]},
  brow: {role: 'brow', keys: [{t: 0, file: 'brow.png'}, {t: 1.5, file: 'brow-raised.png'}]},
  mouth: {role: 'mouth', closedFile: 'closed.png', keys: [{t: 0, file: 'open.png'}, {t: 1, file: 'wide.png'}]},
};
export const fixtureShot = (mode: string) => ShotSchema.parse({
  id: mode, scene: mode === 'media' ? 'backdrop' : null, holdSec: 3, padInSec: 0, padOutSec: 0,
  camera: mode.startsWith('contact') ? {from: {x: .5, y: .5, zoom: 1}, to: {x: .55, y: .5, zoom: 1.25}} : {from: {x: .5, y: .5, zoom: 1}},
  shadow: {enabled: false},
  characters: mode === 'media' ? [] : [{id: 'actor', x: mode === 'contact-left' ? .7 : .4, y: .9, action: 'gesture', face: mode === 'face' ? face : {},
    moves: mode.startsWith('contact') ? [{to: {x: mode === 'contact-left' ? .4 : .7, y: .9}, durSec: 3, ease: 'linear', gait: 'walk'}] : []}],
  props: mode.startsWith('contact') ? [{file: 'core', x: 0, y: 0, scale: .3, depth: 1, attachTo: {character: 'actor', part: 'hand', anchor: 'grip'}}] : [],
  dialogue: mode === 'face' ? [{speaker: 'actor', text: '机制对白一', gapSec: .5}, {speaker: 'actor', text: '机制对白二', gapSec: 0}] : [],
  media: mode === 'media' ? [
    {source: {type: 'video', file: 'source.mp4'}, from: 12, durationFrames: 48, trimStartSec: .5, x: 0, y: 0, width: .5, height: .4, fit: 'cover'},
    {source: {type: 'sequence', files: ['seq-red.png', 'seq-green.png', 'seq-blue.png'], fps: 1}, from: 12, durationFrames: 48, trimStartSec: .5, x: .5, y: 0, width: .5, height: .5, fit: 'fill'},
    {source: {type: 'video', file: 'alpha.webm', transparent: true}, from: 0, durationFrames: 72, x: 0, y: .5, width: 1, height: .5, fit: 'fill'},
  ] : [],
});
export const manifest = {lines: {'face#0': {file: 'tone.wav', durationSec: .75}, 'face#1': {file: 'tone.wav', durationSec: 1}}};
