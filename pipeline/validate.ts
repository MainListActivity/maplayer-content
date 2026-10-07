/* 校验一集的完整度：schema、资产存在性、机位边界、音频清单覆盖率、时间线。 */
import {existsSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {assetPath, epDir, loadEp, timelineSummary} from './common';
import {buildTimeline, lineKey} from '../src/spec';
import {lintEpisodeArt} from './art-lint';

const id = process.argv[2] ?? 'ep01';
const problems: string[] = [];
const warnings: string[] = [];

const {ep, shots, manifest} = loadEp(id);
const charsDir = join(epDir(id), 'assets', 'characters');
const variantsOf = (c: string) => (existsSync(join(charsDir, c)) ? readdirSync(join(charsDir, c)).map((f) => f.replace(/\.(svg|png)$/, '')) : []);
const hasAsset = (kind: 'scenes' | 'props', name: string) => existsSync(assetPath(id, kind, `${name}.svg`)) || existsSync(assetPath(id, kind, `${name}.png`));
const shotSecs = new Map(buildTimeline(ep, shots, manifest).map((t) => [t.shot.id, t.durationFrames / ep.fps]));

for (const s of shots) {
  const dur = shotSecs.get(s.id) ?? Infinity;
  if (s.scene && !hasAsset('scenes', s.scene)) problems.push(`${s.id}: 缺场景 ${s.scene}（.png/.svg 均无）`);
  for (const p of s.props) if (!hasAsset('props', p.file)) problems.push(`${s.id}: 缺道具 ${p.file}（.png/.svg 均无）`);
  for (const c of s.characters) {
    const variants = variantsOf(c.id);
    if (!variants.length) {problems.push(`${s.id}: 缺角色目录 ${c.id}`); continue;}
    if (!variants.includes(c.variant)) problems.push(`${s.id}: 角色 ${c.id} 无变体 ${c.variant}（现有 ${variants.join(',')}）`);
    // 动作校验：时间点落在镜头时长内；引用的 variant/prop 存在
    for (const a of c.actions) {
      const endSec = (a.type === 'move' || a.type === 'turn') ? a.atSec + a.durSec : a.atSec;
      if (endSec > dur + 0.001) problems.push(`${s.id}: ${c.id} 动作 ${a.type}@${a.atSec}s 超出镜头时长 ${dur.toFixed(1)}s`);
      if ((a.type === 'pose' || a.type === 'turn') && a.variant && !variants.includes(a.variant))
        problems.push(`${s.id}: 角色 ${c.id} 动作引用缺失变体 ${a.variant}（现有 ${variants.join(',')}）`);
      if (a.type === 'prop' && !s.props.some((pr) => pr.file === a.prop))
        problems.push(`${s.id}: 角色 ${c.id} 动作绑定的道具 ${a.prop} 不在镜头 props 里`);
    }
  }
  // 道具绑定冲突：attach 期间被他人 attach / detach 未绑定道具
  const live = new Map<string, string>();
  for (const {a, c} of s.characters
    .flatMap((ch) => ch.actions.filter((a) => a.type === 'prop').map((a) => ({a, c: ch})))
    .sort((x, y) => x.a.atSec - y.a.atSec)) {
    if (a.type !== 'prop') continue;
    const holder = live.get(a.prop);
    if (a.mode === 'attach') {
      if (holder && holder !== c.id) warnings.push(`${s.id}: 道具 ${a.prop} 被 ${c.id} attach 时仍挂在 ${holder}（先 detach 再转手）`);
      live.set(a.prop, c.id);
    } else {
      if (!holder) warnings.push(`${s.id}: ${c.id} detach 未绑定的道具 ${a.prop}`);
      else if (holder !== c.id) warnings.push(`${s.id}: ${c.id} detach 了挂在 ${holder} 的道具 ${a.prop}`);
      live.delete(a.prop);
    }
  }
  // 机位越界检查：取景框 [fx±0.5/z] 须落在 [0,1]
  for (const k of [s.camera.from, s.camera.to].filter(Boolean) as {x: number; y: number; zoom: number}[]) {
    if (k.x - 0.5 / k.zoom < -0.001 || k.x + 0.5 / k.zoom > 1.001 || k.y - 0.5 / k.zoom < -0.001 || k.y + 0.5 / k.zoom > 1.001)
      warnings.push(`${s.id}: 机位 (${k.x},${k.y})@z${k.zoom} 越界，画面会露黑边`);
  }
  s.dialogue.forEach((d, i) => {
    if (manifest && !manifest.lines[lineKey(s.id, i)]) problems.push(`${s.id}: 音频清单缺 ${lineKey(s.id, i)}（改过台词后要重跑 pnpm audio ${id}）`);
    if (d.speaker && !s.characters.some((c) => c.id === d.speaker) && !Object.keys(ep.voices).includes(d.speaker))
      warnings.push(`${s.id}: 说话人 ${d.speaker} 不在画面中且未登记声线`);
  });
}

const art = lintEpisodeArt(epDir(id));
problems.push(...art.problems);
warnings.push(...art.warnings);
if (!art.strict) warnings.push('风格基线 public/assets/style-bible/ 不存在：风格类检查处于警告态，老板选定后升级为失败');

if (!manifest) warnings.push('未生成音频清单：pnpm audio ' + id);
else {
  for (const [k, v] of Object.entries(manifest.lines))
    if (!existsSync(join(epDir(id), 'audio', v.file))) problems.push(`音频文件缺失 ${v.file}`);
}

const total = timelineSummary(ep, shots, manifest).reduce((a, t) => a + t.sec, 0);
console.log(`== ${ep.id}「${ep.title}」 ${shots.length} 镜头 ≈ ${Math.floor(total / 60)}m${Math.round(total % 60)}s ==`);
for (const t of timelineSummary(ep, shots, manifest)) console.log(`  ${t.shot}  ${t.sec}s`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const p of problems) console.log(`  ✗ ${p}`);
if (problems.length) {console.log(`FAIL ${problems.length} 处`); process.exit(1);}
console.log(warnings.length ? 'PASS（有警告）' : 'PASS');
