/*
 * QA 抽帧检查：pnpm frames <video.mp4> [每N秒一帧=10] [拼贴列数=5]
 * 用 ffmpeg-static（无系统 ffmpeg 依赖）。产物：
 *   qa/frames/<片名>/fNNN.jpg  逐张抽样帧
 *   qa/frames/<片名>/sheet.jpg 全片拼贴总览
 */
import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

/* ffmpeg 解析：优先 ffmpeg-static；缺二进制时回退 remotion compositor 自带 ffmpeg
   （其动态库在同目录，需 DYLD_LIBRARY_PATH）。 */
const findFfmpeg = (): {bin: string; env?: NodeJS.ProcessEnv} => {
  const direct = resolve('node_modules/ffmpeg-static/ffmpeg');
  if (existsSync(direct)) return {bin: direct};
  const compDir = join('node_modules', '.pnpm');
  if (existsSync(compDir)) {
    for (const d of readdirSync(compDir)) {
      if (!d.startsWith('@remotion+compositor')) continue;
      const bin = join(compDir, d, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
      if (existsSync(bin)) return {bin: resolve(bin), env: {...process.env, DYLD_LIBRARY_PATH: dirname(bin)}};
    }
  }
  throw new Error('找不到 ffmpeg：ffmpeg-static 二进制缺失且无 remotion compositor');
};
const {bin: ffmpeg, env: ffEnv} = findFfmpeg();
const run = (args: string[], stdio: 'pipe' | 'inherit') =>
  execFileSync(ffmpeg, args, {stdio, encoding: 'utf8', env: ffEnv});
const video = process.argv[2];
const every = Number(process.argv[3] ?? 10);
const cols = Number(process.argv[4] ?? 5);
if (!video || !existsSync(video)) {console.error('用法: pnpm frames <video.mp4> [每N秒一帧] [列数]'); process.exit(1);}

const name = basename(video).replace(/\.[^.]+$/, '');
const outDir = join('qa/frames', name);
mkdirSync(outDir, {recursive: true});

// 片元信息（ffmpeg 无输出参数时打印到 stderr 并以 1 退出）
let probe = '';
try {run(['-hide_banner', '-i', video], 'pipe');} catch (e) {probe = String((e as {stderr?: string}).stderr ?? '');}
const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe);
const stream = /Video: .*?, (\d+x\d+).*?([\d.]+) fps/.exec(probe);
const secs = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
console.log(`${name}: ${secs.toFixed(1)}s · ${stream?.[1] ?? '?'} · ${stream?.[2] ?? '?'}fps · 每 ${every}s 抽一帧`);

run(['-y', '-i', video, '-vf', `fps=${(1 / every).toFixed(4)},scale=640:-1`, '-q:v', '3', join(outDir, 'f%03d.jpg')], 'inherit');
const frames = readdirSync(outDir).filter((f) => f.startsWith('f'));
run(['-y', '-i', video, '-vf', `fps=${(1 / every).toFixed(4)},scale=320:-1,tile=${cols}x${Math.ceil(frames.length / cols)}`, '-frames:v', '1', '-update', '1', '-q:v', '4', join(outDir, 'sheet.jpg')], 'inherit');
console.log(`✓ ${frames.length} 张抽样帧 + sheet.jpg → ${outDir}`);
console.log('检查清单: 黑帧/闪帧、字幕错位或截断、口型与画面是否对得上、机位露黑边、角色资产穿帮');
