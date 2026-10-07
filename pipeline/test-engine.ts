import assert from 'node:assert/strict';
import {ActionClipSchema, PartsFileSchema, PlacementSchema} from '../src/spec';
import {buildLoco, evalLoco, evalParts, legacyEnterSlide, partAnchorWorld, sequenceIndex} from '../src/lib/rig';

const p = PlacementSchema.parse({id: 'bot', x: .2, y: .9, moves: [
  {to: {x: .8, y: .9}, durSec: 4, ease: 'linear'},
  {at: 1, to: {x: .5, y: .9}, durSec: 2, ease: 'linear'},
]});
const segs = buildLoco(p, 10);
for (let frame = 24; frame < 120; frame++) {
  const t = frame / 24;
  const s = evalLoco(p, segs, t);
  assert.ok(Math.abs(s.x - (.35 + .15 * Math.min(1, (t - 1) / 2))) < 1e-9, `overlap x at ${t}: ${s.x}`);
  assert.equal(s.flip, false, `overlap facing at ${t}`);
  assert.equal(s.gaiting, t < 3, `overlap gait at ${t}`);
}
console.log('PASS overlap takeover: position, facing, stopped gait');

for (const enter of ['none', 'left', 'right']) for (const exit of ['none', 'left', 'right']) {
  const p = PlacementSchema.parse({id: 'rin', x: .5, y: .9, enter, exit});
  for (let frame = 0; frame < 240; frame++) {
    const t = frame / 24;
    const oldSlide = enter !== 'none' && t < .6 ? (1 - t / .6) * (enter === 'left' ? -1 : 1) * .12 : 0;
    const state = evalLoco(p, buildLoco(p, 10), t);
    assert.ok(Math.abs(state.x + legacyEnterSlide(p, t) - (.5 + oldSlide)) < 1e-9);
    assert.equal(state.y, .9);
    assert.equal(state.flip, false);
    assert.equal(state.gaiting, false);
  }
}
console.log('PASS 2160 legacy frames including enter/exit combinations');

const unsorted = PlacementSchema.parse({id: 'bot', x: .2, y: .9, moves: [
  {at: 3, to: {x: .8, y: .9}, durSec: 1, ease: 'linear'},
  {at: 0, to: {x: .4, y: .9}, durSec: 1, ease: 'linear'},
]});
assert.equal(evalLoco(unsorted, buildLoco(unsorted, 10), 1).x, .4);
assert.equal(evalLoco(unsorted, buildLoco(unsorted, 10), 3).x, .4);
const walkOut = PlacementSchema.parse({...p, exit: 'walk-right'});
const exitSegs = buildLoco(walkOut, 2);
const beforeExit = evalLoco(p, buildLoco(p, 2), .9);
assert.ok(Math.abs(evalLoco(walkOut, exitSegs, .9).x - beforeExit.x) < 1e-9);
assert.equal(evalLoco(walkOut, exitSegs, 2).x, 1.12);
console.log('PASS chronological moves and overlapping walk-out');

const seq = ActionClipSchema.parse({durationSec: 2, fps: 2, frames: ['a', 'b', 'c']});
assert.equal(sequenceIndex(seq, .5, 2), 2);
assert.equal(sequenceIndex(seq, 2), 1);
assert.equal(sequenceIndex({...seq, loop: false}, 2), 2);
assert.equal(sequenceIndex({...seq, hold: true}, 2), 2);
console.log('PASS sequence speed/loop/hold');

const parts = PartsFileSchema.parse({size: [100, 200], parts: [
  {id: 'arm', file: 'a.png', at: [0, 0], pivot: [0, 0]},
  {id: 'hand', file: 'h.png', at: [10, 0], pivot: [10, 0], parent: 'arm'},
]});
const clip = ActionClipSchema.parse({durationSec: 1, loop: false, tracks: {arm: [{t: 0, rot: 0, ease: 'linear'}, {t: 1, rot: 90}]}});
const anchor = partAnchorWorld(parts, evalParts(parts, clip, 1), 'hand')!;
assert.ok(Math.abs(anchor.x) < 1e-9 && Math.abs(anchor.y - 10) < 1e-9);
console.log('PASS parent rig matrix and attached hand anchor');
