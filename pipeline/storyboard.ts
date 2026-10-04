/* 分镜预览：每个镜头渲一张静帧到 storyboard/frames/，并生成 contact sheet HTML。 */
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ensure, epDir, loadEp, ROOT, timelineSummary} from './common';
import {buildTimeline} from '../src/spec';

const id = process.argv[2] ?? 'ep01';
const {ep, shots, manifest} = loadEp(id);
const tl = buildTimeline(ep, shots, manifest);
const outDir = join(epDir(id), 'storyboard');
ensure(join(outDir, 'frames'));

const serve = await bundle(join(ROOT, 'src', 'index.ts'), undefined, {publicDir: join(ROOT, 'public')});
const comp = await selectComposition({serveUrl: serve, id: 'episode', inputProps: {episodeId: id}});

for (const t of tl) {
  const frame = t.startFrame + Math.floor(t.durationFrames * 0.4);
  const file = join(outDir, 'frames', `${t.shot.id}.png`);
  await renderStill({composition: {...comp, durationInFrames: Math.max(comp.durationInFrames, frame + 1)}, serveUrl: serve, output: file, frame, inputProps: {episodeId: id}});
  console.log(`✓ ${t.shot.id} → frames/${t.shot.id}.png`);
}

const rows = tl.map((t) => {
  const s = t.shot;
  const lines = s.dialogue.map((d) => `${d.speaker ?? '旁白'}：${d.text}`).join('<br>');
  return `<div class="cell"><img src="frames/${s.id}.png"><div class="meta"><b>${s.id}</b> ${s.scene ?? '黑场'} · ${(t.durationFrames / ep.fps).toFixed(1)}s<br><span class="d">${lines || '&nbsp;'}</span></div></div>`;
}).join('\n');
writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${ep.id} 分镜</title>
<style>body{background:#111;color:#eee;font:14px/1.5 sans-serif;padding:24px}h1{font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}.cell{background:#1c1c22;border-radius:8px;overflow:hidden}.cell img{width:100%;display:block}.meta{padding:10px 12px}.d{color:#9ab;font-size:13px}</style>
<h1>${ep.id}「${ep.title}」分镜 · ${shots.length} 镜头</h1><div class="grid">${rows}</div>`);
console.log(`\ncontact sheet → public/episodes/${id}/storyboard/index.html`);
