import assert from 'node:assert/strict';
import {ActionClipSchema, PartsFileSchema, PlacementSchema, SceneFileSchema, ShotSchema} from '../src/spec';
import {buildLoco, evalLoco, evalParts, evalShadow, layerTransform, legacyEnterSlide, partAnchorWorld, sequenceIndex} from '../src/lib/rig';

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
assert.equal(layerTransform({fx: .6, fy: .5, z: 1}, .5, 1000, 500), 'translate(-50px, 0px) scale(1)');
assert.equal(layerTransform({fx: .6, fy: .5, z: 1}, 1, 1000, 500), 'translate(-100px, 0px) scale(1)');
console.log('PASS depth parallax during fixed-zoom pan');

// ---- 落地阴影（shot.shadow + character.shadow + 场景层 castShadow）----
const shotShadow = ShotSchema.parse({id: 's1', scene: null}).shadow;
assert.deepEqual(shotShadow, {enabled: true, opacity: .32, size: 1, blur: 16, contact: .45});
const g0 = evalShadow(shotShadow, 670, 0)!;
assert.ok(g0 && Math.abs(g0.rx - 201) < 1e-9 && Math.abs(g0.opacity - .32) < 1e-9 && g0.coreOpacity < g0.opacity);
const gLift = evalShadow(shotShadow, 670, 120)!;
assert.ok(gLift.opacity < g0.opacity && gLift.rx <= g0.rx, 'lift fades and shrinks shadow');
assert.equal(evalShadow({...shotShadow, enabled: false}, 670, 0), null);
assert.equal(evalShadow({...shotShadow, opacity: 0}, 670, 0), null);
assert.equal(PlacementSchema.parse({id: 'k', x: .5, y: .9}).shadow, true);
assert.equal(PlacementSchema.parse({id: 'k', x: .5, y: .9, shadow: false}).shadow, false);
assert.equal(ShotSchema.parse({id: 's2', scene: null, shadow: {enabled: false}}).shadow.enabled, false);
assert.throws(() => ShotSchema.parse({id: 's3', scene: null, shadow: {opacity: 2}}));
assert.throws(() => ShotSchema.parse({id: 's4', scene: null, shadow: {blur: 500}}));
const ls = SceneFileSchema.parse({layers: [{file: 'a.png', castShadow: {opacity: .5}}]}).layers[0].castShadow!;
assert.deepEqual({dx: ls.dx, dy: ls.dy, blur: ls.blur, opacity: ls.opacity}, {dx: 8, dy: 10, blur: 14, opacity: .5});
assert.equal(SceneFileSchema.parse({layers: [{file: 'a.png'}]}).layers[0].castShadow, undefined);
console.log('PASS shadow defaults, per-char opt-out, lift attenuation, castShadow schema');
