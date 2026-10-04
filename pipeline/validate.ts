/* 校验一集的完整度：schema、资产存在性、机位边界、音频清单覆盖率、时间线。 */
import {existsSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {assetPath, epDir, loadEp, timelineSummary} from './common';
import {lineKey} from '../src/spec';
import {lintEpisodeArt} from './art-lint';

const id = process.argv[2] ?? 'ep01';
const problems: string[] = [];
const warnings: string[] = [];

const {ep, shots, manifest} = loadEp(id);
const charsDir = join(epDir(id), 'assets', 'characters');
const variantsOf = (c: string) => (existsSync(join(charsDir, c)) ? readdirSync(join(charsDir, c)).map((f) => f.replace(/\.svg$/, '')) : []);

for (const s of shots) {
  if (s.scene && !existsSync(assetPath(id, 'scenes', `${s.scene}.svg`))) problems.push(`${s.id}: 缺场景 ${s.scene}.svg`);
  for (const c of s.characters) {
    const variants = variantsOf(c.id);
    if (!variants.length) {problems.push(`${s.id}: 缺角色目录 ${c.id}`); continue;}
    if (!variants.includes(c.variant)) problems.push(`${s.id}: 角色 ${c.id} 无变体 ${c.variant}（现有 ${variants.join(',')}）`);
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
