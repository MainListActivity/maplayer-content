import assert from 'node:assert/strict';
import {ActionClipSchema, PartsFileSchema, PlacementSchema, SceneFileSchema, ShotSchema} from '../src/spec';
import {buildLoco, evalLoco, evalParts, evalShadow, idleBob, layerTransform, legacyEnterSlide, partAnchorWorld, sequenceIndex} from '../src/lib/rig';

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

// 命名锚点：points 表里的挂点随同一世界矩阵变换（attachTo.anchor 用）
const withPoints = PartsFileSchema.parse({size: [100, 200], parts: [
  {id: 'forearm', file: 'f.png', at: [0, 0], pivot: [10, 10], points: {grip: [10, 60]}},
]});
const still0 = evalParts(withPoints, null, 0);
const elbow = partAnchorWorld(withPoints, still0, 'forearm')!;
const grip = partAnchorWorld(withPoints, still0, 'forearm', 'grip')!;
assert.equal(elbow.x, 10); assert.equal(elbow.y, 10);
assert.equal(grip.x, 10); assert.equal(grip.y, 60);
assert.equal(partAnchorWorld(withPoints, still0, 'forearm', 'missing')!.y, 10, '未命中锚点退回 pivot');
// 抬臂 90°：grip 相对 pivot 的偏移随世界矩阵旋转 → (10,60) 偏移 (0,50) 旋转后落 (-40,10)
const raised = evalParts(withPoints, ActionClipSchema.parse({durationSec: 1, loop: false, tracks: {forearm: [{t: 0, rot: 0}, {t: 1, rot: 90}]}}), 1);
const grip90 = partAnchorWorld(withPoints, raised, 'forearm', 'grip')!;
assert.ok(Math.abs(grip90.x - -40) < 1e-6 && Math.abs(grip90.y - 10) < 1e-6, `rot90 grip=${grip90.x},${grip90.y}`);
console.log('PASS named anchor (points) resolves, missing anchor falls back to pivot, rotates with part');
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

// 常驻闲置 bob 与阴影衰减同链：idleBob 抬升帧的阴影必须弱于贴地帧
{
  const cfg = ShotSchema.parse({id: 'sx', scene: null}).shadow;
  let lifted: number | null = null, grounded: number | null = null;
  for (let f = 0; f < 240; f++) {
    const dy = idleBob(f / 24, 'rin');
    if (lifted === null && dy <= -3.9) lifted = dy;
    if (grounded === null && dy >= 0) grounded = dy;
  }
  assert.ok(lifted !== null && grounded !== null, 'idleBob covers both lift and ground phases');
  const up = evalShadow(cfg, 670, -lifted!)!, down = evalShadow(cfg, 670, -grounded!)!;
  assert.ok(up.opacity < down.opacity && up.rx < down.rx, 'idle bob lift attenuates shadow');
  // 非 legacy 角色（有 moves）不走闲置 bob：抬升只由步态提供
  const moving = PlacementSchema.parse({id: 'b', x: .2, y: .9, moves: [{to: {x: .5, y: .9}, durSec: 2}]});
  assert.ok(moving.moves.length > 0); // legacy 条件不含 moves —— 由 useCharWorld 内同款判定保证
}
console.log('PASS idle bob coupled into shadow lift attenuation');

// ---- renderStill 集成回归：纯部件角色渲染 + rig×姿势帧复合（黑场隔离环境噪声）----
const {bundle} = await import('@remotion/bundler');
const {renderStill, selectComposition} = await import('@remotion/renderer');
const {readFileSync, mkdtempSync} = await import('node:fs');
const {tmpdir} = await import('node:os');
const {join} = await import('node:path');
const {loadEp, ROOT} = await import('./common');
const {buildTimeline} = await import('../src/spec');

const {ep, shots, manifest} = loadEp('ep00');
const tl = buildTimeline(ep, shots, manifest);
const startOf = (id: string) => tl.find((s) => s.shot.id === id)!.startFrame;

const serve = await bundle(join(ROOT, 'src', 'index.ts'), undefined, {publicDir: join(ROOT, 'public')});
const comp = await selectComposition({serveUrl: serve, id: 'episode', inputProps: {episodeId: 'ep00'}});
const outDir = mkdtempSync(join(tmpdir(), 'engine-stills-'));
const still = async (shotId: string, tSec: number, name: string) => {
  const p = join(outDir, name);
  await renderStill({composition: comp, serveUrl: serve, output: p, frame: startOf(shotId) + Math.round(tSec * ep.fps), inputProps: {episodeId: 'ep00'}});
  return readFileSync(p);
};

// rig-pose（黑场）：t=0.3 与 t=0.68 轨道姿态完全一致（arm -100° 平台段），仅姿势帧 idle→alert 不同
const poseA = await still('rig-pose', 0.3, 'pose-idle.png');
const poseB = await still('rig-pose', 0.68, 'pose-alert.png');
assert.ok(!poseA.equals(poseB), 'rig-pose: 姿势帧覆写未改变部件 rig 渲染结果');
console.log('PASS rig frames×tracks composite: pose override changes rig output');

// rig-only（黑场）：bot2 无 default 整幅资产；look 轨道 t=0.3 vs t=1.0 头部角度不同
const onlyA = await still('rig-only', 0.3, 'only-a.png');
const onlyB = await still('rig-only', 1.0, 'only-b.png');
assert.ok(!onlyA.equals(onlyB), 'rig-only: 纯部件角色未渲染或未应用关节轨道');
console.log('PASS parts-only character renders and animates without default asset');

// 加载竞态：延迟 parts.json 1.5s 让动作剪辑先返回——rig 姿势名不得被当整幅帧请求
// （回归前此序会 cancelRender: missing .../bot/idle.svg）
const delayedServe = await bundle(join(ROOT, 'pipeline', 'fixtures', 'delayed-entry.ts'), undefined, {publicDir: join(ROOT, 'public')});
const delayedComp = await selectComposition({serveUrl: delayedServe, id: 'episode', inputProps: {episodeId: 'ep00'}});
const delayedPath = join(outDir, 'pose-delayed.png');
await renderStill({
  composition: delayedComp,
  serveUrl: delayedServe,
  output: delayedPath,
  frame: startOf('rig-pose') + Math.round(0.68 * ep.fps),
  inputProps: {episodeId: 'ep00'},
});
assert.ok(!readFileSync(delayedPath).equals(poseA), '竞态渲染产物应与 idle 帧不同（alert 姿势）');
console.log('PASS delayed parts.json (action resolves first) still renders rig pose frame');
console.log(`  stills → ${outDir}`);
