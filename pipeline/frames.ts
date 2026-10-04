/*
 * QA 抽帧检查：pnpm frames <video.mp4> [每N秒一帧=10] [拼贴列数=5]
 * 用 ffmpeg-static（无系统 ffmpeg 依赖）。产物：
 *   qa/frames/<片名>/fNNN.jpg  逐张抽样帧
 *   qa/frames/<片名>/sheet.jpg 全片拼贴总览
 */
import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const ffmpeg = resolve('node_modules/ffmpeg-static/ffmpeg');
const video = process.argv[2];
const every = Number(process.argv[3] ?? 10);
const cols = Number(process.argv[4] ?? 5);
if (!video || !existsSync(video)) {console.error('用法: pnpm frames <video.mp4> [每N秒一帧] [列数]'); process.exit(1);}

const name = basename(video).replace(/\.[^.]+$/, '');
const outDir = join('qa/frames', name);
mkdirSync(outDir, {recursive: true});

// 片元信息（-i 的 stderr 里带时长/分辨率/帧率）
const probe = execFileSync(ffmpeg, ['-hide_banner', '-i', video, '-f', 'null', '-'], {stdio: 'pipe', encoding: 'utf8'}).toString();
const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe);
const stream = /Video: .*?, (\d+x\d+).*?([\d.]+) fps/.exec(probe);
const secs = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
console.log(`${name}: ${secs.toFixed(1)}s · ${stream?.[1] ?? '?'} · ${stream?.[2] ?? '?'}fps · 每 ${every}s 抽一帧`);

execFileSync(ffmpeg, ['-y', '-i', video, '-vf', `fps=1/${every},scale=640:-1`, '-q:v', '3', join(outDir, 'f%03d.jpg')], {stdio: 'inherit'});
const frames = readdirSync(outDir).filter((f) => f.startsWith('f'));
execFileSync(ffmpeg, ['-y', '-i', video, '-vf', `fps=1/${every},scale=320:-1,tile=${cols}x${Math.ceil(frames.length / cols)}`, '-frames:v', '1', '-update', '1', '-q:v', '4', join(outDir, 'sheet.jpg')], {stdio: 'inherit'});
console.log(`✓ ${frames.length} 张抽样帧 + sheet.jpg → ${outDir}`);
console.log('检查清单: 黑帧/闪帧、字幕错位或截断、口型与画面是否对得上、机位露黑边、角色资产穿帮');
