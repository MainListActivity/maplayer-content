/* 动作系统回归：pnpm test。断言 evalCharState/evalPropPos 的关键语义与向后兼容。 */
import {PlacementSchema, ShotSchema} from '../src/spec';
import {evalCharState, evalPropPos, variantsUsed} from '../src/lib/actions';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown, eps = 1e-9) => {
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= eps : got === want;
  if (ok) console.log(`  ✓ ${name}`);
  else {fails++; console.log(`  ✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);}
};
const place = (o: object) => PlacementSchema.parse(o);
const shot = (o: object) => ShotSchema.parse(o);
const FPS = 24;

console.log('== 向后兼容：无 actions ==');
{
  const p = place({id: 'rin', x: 0.5, y: 0.9, exit: 'right'});
  // 旧版 exit 是死字段：无 actions 时任何帧都不滑移
  eq('exit 无 actions 末帧 x 不变', evalCharState(p, 239, FPS, 240).x, 0.5);
  eq('exit 无 actions 末帧 flip 不变', evalCharState(p, 239, FPS, 240).flip, false);
  const pe = place({id: 'rin', x: 0.5, y: 0.9, enter: 'left'});
  eq('enter 首帧滑移保持旧值', evalCharState(pe, 0, FPS, 240).x, 0.5 - 0.12);
  eq('enter 滑移窗口后归位', evalCharState(pe, Math.ceil(0.6 * FPS), FPS, 240).x, 0.5);
}
console.log('== enter/exit 与动作组合 ==');
{
  const p = place({id: 'rin', x: 0.5, y: 0.9, exit: 'right', actions: [{type: 'pose', atSec: 1, variant: 'worried'}]});
  eq('exit 有 actions 末帧滑出', evalCharState(p, 239, FPS, 240).x > 0.6, true);
}
console.log('== 走位：重叠接管（起点冻结）==');
{
  const p = place({id: 'rin', x: 0.2, y: 0.9, actions: [
    {type: 'move', atSec: 0, durSec: 4, to: {x: 0.8, y: 0.9}, ease: 'linear'},
    {type: 'move', atSec: 1, durSec: 2, to: {x: 0.5, y: 0.9}, ease: 'linear'},
  ]});
  // B 在 t=1s 开始：A 当时 x=.35，B 冻结起点 .35 朝右走（auto），2.5s 时应为 .35+.15*.75=.4625
  eq('接管帧位置', evalCharState(p, 2.5 * FPS, FPS, 240).x, 0.4625);
  eq('接管朝向为右', evalCharState(p, 2.5 * FPS, FPS, 240).flip, true);
  eq('B 结束后停目标点', evalCharState(p, 3.5 * FPS, FPS, 240).x, 0.5);
  eq('B 结束后朝向保持右', evalCharState(p, 3.5 * FPS, FPS, 240).flip, true);
  // 无重叠时行为不变
  const q = place({id: 'rin', x: 0.2, y: 0.9, actions: [{type: 'move', atSec: 0, durSec: 2, to: {x: 0.8, y: 0.9}, ease: 'linear'}]});
  eq('单走位中点', evalCharState(q, FPS, FPS, 240).x, 0.5);
  eq('单走位结束', evalCharState(q, 2 * FPS, FPS, 240).x, 0.8);
  eq('moving 标志', evalCharState(q, FPS, FPS, 240).moving, true);
}
console.log('== 姿态切换 ==');
{
  const p = place({id: 'rin', x: 0.5, y: 0.9, actions: [{type: 'pose', atSec: 1, variant: 'worried'}]});
  eq('pose 前仍为 default', evalCharState(p, FPS - 1, FPS, 240).variant, 'default');
  eq('pose 帧起换 worried', evalCharState(p, FPS, FPS, 240).variant, 'worried');
}
console.log('== 转身 ==');
{
  const p = place({id: 'rin', x: 0.5, y: 0.9, actions: [{type: 'turn', atSec: 1, durSec: 0.5, face: 'toggle', variant: 'back'}]});
  const mid = evalCharState(p, (1 + 0.25) * FPS, FPS, 240); // u=0.5
  eq('转身中点压扁至 0', mid.turnScale, 0, 1e-6);
  eq('转身中点换朝向与变体', mid.flip && mid.variant === 'back', true);
  const before = evalCharState(p, (1 + 0.2) * FPS, FPS, 240); // u=0.4 未过半
  eq('转身前半朝向未变', before.flip, false);
  const after = evalCharState(p, (1 + 0.5) * FPS + 1, FPS, 240);
  eq('转身结束复原', after.turnScale, 1);
  eq('转身后朝向保持', after.flip, true);
}
console.log('== 道具绑定 ==');
{
  const s = shot({id: 't', scene: null, holdSec: 10,
    characters: [{id: 'rin', x: 0.2, y: 0.9, actions: [
      {type: 'prop', mode: 'attach', atSec: 1, prop: 'mug', dx: 0.05, dy: -0.16},
      {type: 'move', atSec: 2, durSec: 2, to: {x: 0.6, y: 0.9}, ease: 'linear'},
      {type: 'prop', mode: 'detach', atSec: 5, prop: 'mug'},
    ]}],
    props: [{file: 'mug', x: 0.3, y: 0.8}]});
  eq('attach 前在原位', evalPropPos(s, 'mug', 0.3, 0.8, 0, FPS, 240).x, 0.3);
  // t=2.5s：角色 x=.3、面朝右（move 自动转身），mirrorDx 下 dx 镜像为 -.05 → 道具 x=.25；
  // y 含行走颠簸 ∈ [.732, .74]
  const held = evalPropPos(s, 'mug', 0.3, 0.8, 2.5 * FPS, FPS, 240);
  eq('绑定跟随角色位置', held.bound && Math.abs(held.x - 0.25) < 1e-9 && held.y <= 0.74 && held.y >= 0.732, true);
  // detach 帧 move 已结束，角色 x=.6 面朝右 → 释放点 .6-.05=.55
  const rel = evalPropPos(s, 'mug', 0.3, 0.8, 5 * FPS, FPS, 240);
  eq('detach 后留在释放点', rel.bound === false && Math.abs(rel.x - 0.55) < 1e-9, true);
  eq('detach 后不再跟随', evalPropPos(s, 'mug', 0.3, 0.8, 7 * FPS, FPS, 240).x, 0.55);
}
console.log('== 变体预载清单 ==');
{
  const p = place({id: 'rin', x: 0.5, y: 0.9, actions: [
    {type: 'pose', atSec: 1, variant: 'worried'},
    {type: 'turn', atSec: 2, variant: 'back'},
  ]});
  eq('variantsUsed 收集全部', JSON.stringify(variantsUsed(p)), JSON.stringify(['default', 'worried', 'back']));
}

console.log(fails ? `\nFAIL ${fails} 处` : '\nPASS');
process.exit(fails ? 1 : 0);
