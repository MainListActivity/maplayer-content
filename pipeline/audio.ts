/*
 * 台词配音：edge-tts（python3 -m edge_tts）为主，say 兜底。
 * 声线解析顺序：台词 voice 字段 > episode.voices[角色] > 默认 zh-CN-YunjianNeural。
 * 'say:<voice>' 前缀强制走 macOS say。产物写入 audio/<shot>-<idx>.<ext> + manifest.json。
 */
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ensure, epDir, loadEp, run} from './common';
import {lineKey} from '../src/spec';

const id = process.argv[2] ?? 'ep01';
const {ep, shots} = loadEp(id);
const outDir = join(epDir(id), 'audio');
ensure(outDir);

const DEFAULT_VOICE = 'zh-CN-YunjianNeural';
const NARRATOR = 'zh-CN-XiaoyiNeural';

const synthEdge = async (text: string, voice: string, file: string) => {
  try {
    await run('edge-tts', ['--voice', voice, '--text', text, '--write-media', file], {timeout: 30000});
    return true;
  } catch { /* bin 不在 PATH 时走 python 模块 */ }
  try {
    await run('python3', ['-m', 'edge_tts', '--voice', voice, '--text', text, '--write-media', file], {timeout: 30000});
    return true;
  } catch (e) {return false;}
};

const synthSay = async (text: string, voice: string | undefined, file: string) => {
  const args = ['-o', file, '--data-format=LEI16@22050'];
  if (voice) args.push('-v', voice);
  args.push(text);
  await run('say', args);
};

const {parseFile} = await import('music-metadata');
const manifest: Record<string, {file: string; durationSec: number}> = {};

for (const s of shots) {
  for (let i = 0; i < s.dialogue.length; i++) {
    const d = s.dialogue[i];
    const voice = d.voice ?? (d.speaker ? ep.voices[d.speaker] : undefined) ?? (d.speaker ? DEFAULT_VOICE : NARRATOR);
    const key = lineKey(s.id, i);
    const useSay = voice.startsWith('say:');
    const base = `${s.id}-${i}`;
    let file = `${base}.mp3`;
    try {
      if (useSay) {
        file = `${base}.wav`;
        await synthSay(d.text, voice.slice(4), join(outDir, file));
      } else {
        const ok = await synthEdge(d.text, voice, join(outDir, file));
        if (!ok) {
          file = `${base}.wav`;
          await synthSay(d.text, undefined, join(outDir, file));
        }
      }
      const meta = await parseFile(join(outDir, file));
      manifest[key] = {file, durationSec: +(meta.format.duration ?? 1).toFixed(3)};
      console.log(`✓ ${key} ${d.speaker ?? '旁白'}: ${d.text.slice(0, 24)}${d.text.length > 24 ? '…' : ''} (${manifest[key].durationSec}s, ${file})`);
    } catch (e) {
      console.log(`✗ ${key} 合成失败: ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    }
  }
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({lines: manifest}, null, 2));
console.log(`\n清单 ${Object.keys(manifest).length} 条 → audio/manifest.json`);
