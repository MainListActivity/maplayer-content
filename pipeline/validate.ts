/* 校验一集的完整度：schema、资产存在性、机位边界、音频清单覆盖率、时间线。 */
import {existsSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {assetPath, epDir, loadEp, timelineSummary} from './common';
import {ActionClipSchema, PartsFileSchema, SceneFileSchema, lineKey} from '../src/spec';
import {lintEpisodeArt} from './art-lint';
import {readFileSync} from 'node:fs';

const id = process.argv[2] ?? 'ep01';
const problems: string[] = [];
const warnings: string[] = [];

const {ep, shots, manifest} = loadEp(id);
const charsDir = join(epDir(id), 'assets', 'characters');
const scenesDir = join(epDir(id), 'assets', 'scenes');
const variantsOf = (c: string) =>
  existsSync(join(charsDir, c)) ? readdirSync(join(charsDir, c)).filter((f) => /\.(svg|png)$/.test(f)).map((f) => f.replace(/\.(svg|png)$/, '')) : [];
const hasAsset = (kind: 'scenes' | 'props', name: string) => existsSync(assetPath(id, kind, `${name}.svg`)) || existsSync(assetPath(id, kind, `${name}.png`));
const hasScene = (name: string) => hasAsset('scenes', name) || existsSync(join(scenesDir, name, 'scene.json'));

const readJson = (p: string) => {try {return JSON.parse(readFileSync(p, 'utf8'));} catch {return null;}};

// 部件 rig 元数据缓存：角色 id → parts.json（存在性 + 部件名集合）
const partsCache = new Map<string, {ids: Set<string>} | null>();
const partsOf = (c: string) => {
  if (!partsCache.has(c)) {
    const f = join(charsDir, c, 'parts', 'parts.json');
    if (!existsSync(f)) {partsCache.set(c, null); return null;}
    const r = PartsFileSchema.safeParse(readJson(f));
    if (!r.success) {partsCache.set(c, null); return null;}
    for (const d of r.data.parts) if (!existsSync(join(charsDir, c, 'parts', d.file))) problems.push(`角色 ${c} 部件图缺失 parts/${d.file}`);
    partsCache.set(c, {ids: new Set(r.data.parts.map((d) => d.id))});
  }
  return partsCache.get(c);
};

const actionOf = (c: string, name: string) => {
  const f = join(charsDir, c, 'actions', `${name}.json`);
  if (!existsSync(f)) {problems.push(`角色 ${c} 缺动作剪辑 actions/${name}.json`); return null;}
  const r = ActionClipSchema.safeParse(readJson(f));
  if (!r.success) {problems.push(`角色 ${c} actions/${name}.json 不符合 ActionClipSchema`); return null;}
  return r.data;
};

for (const s of shots) {
  if (s.scene && !hasScene(s.scene)) problems.push(`${s.id}: 缺场景 ${s.scene}（.png/.svg/scene.json 均无）`);
  else if (s.scene && existsSync(join(scenesDir, s.scene, 'scene.json'))) {
    const r = SceneFileSchema.safeParse(readJson(join(scenesDir, s.scene, 'scene.json')));
    if (!r.success) problems.push(`${s.id}: scenes/${s.scene}/scene.json 不符合 SceneFileSchema`);
    else for (const l of r.data.layers) if (!existsSync(join(scenesDir, s.scene, l.file))) problems.push(`${s.id}: 场景 ${s.scene} 缺层 ${l.file}`);
  }
  for (const p of s.props) {
    if (!hasAsset('props', p.file)) problems.push(`${s.id}: 缺道具 ${p.file}（.png/.svg 均无）`);
    if (p.attachTo) {
      const t = s.characters.find((c) => c.id === p.attachTo!.character);
      if (!t) problems.push(`${s.id}: 道具 ${p.file} attachTo 目标 ${p.attachTo.character} 不在镜头中`);
      else {
        const pf = partsOf(t.id);
        if (!pf) warnings.push(`${s.id}: 道具 ${p.file} attachTo ${t.id}.${p.attachTo.part}，但该角色无 parts/（将退回静态摆位）`);
        else if (!pf.ids.has(p.attachTo.part)) problems.push(`${s.id}: 道具 ${p.file} attachTo 部件 ${t.id}.${p.attachTo.part} 不存在`);
      }
    }
  }
  for (const c of s.characters) {
    const variants = variantsOf(c.id);
    if (!variants.length && !partsOf(c.id)) {problems.push(`${s.id}: 缺角色目录 ${c.id}`); continue;}
    if (!variants.includes(c.variant) && !partsOf(c.id)) problems.push(`${s.id}: 角色 ${c.id} 无变体 ${c.variant}（现有 ${variants.join(',')}）`);
    if (c.action) {
      const name = typeof c.action === 'string' ? c.action : c.action.name;
      const clip = actionOf(c.id, name);
      if (clip) {
        for (const f of clip.frames ?? [])
          if (!existsSync(join(charsDir, c.id, `${f}.png`)) && !existsSync(join(charsDir, c.id, `${f}.svg`)))
            problems.push(`${s.id}: 角色 ${c.id} 动作 ${name} 缺序列帧 ${f}`);
        const pf = partsOf(c.id);
        for (const pid of Object.keys(clip.tracks))
          if (pf && !pf.ids.has(pid)) problems.push(`${s.id}: 角色 ${c.id} 动作 ${name} 轨道部件 ${pid} 不在 parts.json`);
      }
    }
    // 机位越界检查：取景框 [fx±0.5/z] 须落在 [0,1]
    for (const k of [s.camera.from, s.camera.to].filter(Boolean) as {x: number; y: number; zoom: number}[]) {
      if (k.x - 0.5 / k.zoom < -0.001 || k.x + 0.5 / k.zoom > 1.001 || k.y - 0.5 / k.zoom < -0.001 || k.y + 0.5 / k.zoom > 1.001)
        warnings.push(`${s.id}: 机位 (${k.x},${k.y})@z${k.zoom} 越界，画面会露黑边`);
    }
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
