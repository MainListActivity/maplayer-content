/* 成片渲染：pnpm render ep01 [输出名.mp4]。产物落 renders/。 */
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {join} from 'node:path';
import {ensure, ROOT} from './common';

const id = process.argv[2] ?? 'ep01';
const out = process.argv[3] ?? `${id}-${new Date().toISOString().slice(0, 10)}.mp4`;
const outDir = join(ROOT, 'renders');
ensure(outDir);

const serve = await bundle(join(ROOT, 'src', 'index.ts'), undefined, {publicDir: join(ROOT, 'public')});
const comp = await selectComposition({serveUrl: serve, id: 'episode', inputProps: {episodeId: id}});
console.log(`${comp.id}: ${comp.durationInFrames} 帧 @${comp.fps}fps ≈ ${(comp.durationInFrames / comp.fps).toFixed(1)}s`);
await renderMedia({
  composition: comp,
  serveUrl: serve,
  codec: 'h264',
  outputLocation: join(outDir, out),
  inputProps: {episodeId: id},
  onProgress: ({progress}) => process.stdout.write(`\r${(progress * 100).toFixed(1)}%`),
});
console.log(`\n成片 → renders/${out}`);
