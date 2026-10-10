#!/usr/bin/env tsx
/* 资产档案库：员工把角色/场景/服化道存档进规范位置并登记。
 *
 *   pnpm archive add <ep> character <id> <variant> <file> [--name 名] [--note 说明] [--tags a,b] [--by 员工]
 *   pnpm archive add <ep> scene    <id> <file>           [同上选项]
 *   pnpm archive add <ep> prop     <id> <file>           [同上选项]
 *   pnpm archive note <ep> <kind> <id> [--name 名] [--note 说明] [--tags a,b]
 *   pnpm archive list <ep> [kind]
 *   pnpm archive show <ep> <kind> <id>
 *
 * 落点约定（与播放器一致）：
 *   character → assets/characters/<id>/<variant>.<ext>（透明底 PNG 或 SVG）
 *   scene     → assets/scenes/<id>.<ext>（满幅位图，≥1920×1080）
 *   prop      → assets/props/<id>.<ext>
 * 档案登记在 assets/registry.json；入库前过原画机检（lintPng/lintSvg），硬问题拒绝入库。
 */
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, extname, join} from 'node:path';
import {epDir, ensure} from './common';
import {lintPng, lintSvg} from './art-lint';

type Kind = 'character' | 'scene' | 'prop';
const KIND_DIR: Record<Kind, string> = {character: 'characters', scene: 'scenes', prop: 'props'};

interface Entry {
  file: string;
  archivedAt: string;
  by?: string;
}
interface Record_ {
  name?: string;
  note?: string;
  tags?: string[];
  variants: Record<string, Entry>;
}
interface Registry {
  version: 1;
  characters: Record<string, Record_>;
  scenes: Record<string, Record_>;
  props: Record<string, Record_>;
}

const regPath = (ep: string) => join(epDir(ep), 'assets', 'registry.json');
const loadReg = (ep: string): Registry =>
  existsSync(regPath(ep))
    ? JSON.parse(readFileSync(regPath(ep), 'utf8'))
    : {version: 1, characters: {}, scenes: {}, props: {}};
const saveReg = (ep: string, r: Registry) => writeFileSync(regPath(ep), JSON.stringify(r, null, 2) + '\n');

const opt = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const pos = (args: string[]) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) i++;
    else out.push(args[i]);
  }
  return out;
};

const palette = (ep: string): string[] => {
  const f = join(epDir(ep), 'palette.json');
  return existsSync(f) ? Object.values(JSON.parse(readFileSync(f, 'utf8'))).flat() as string[] : [];
};
const strictArt = (ep: string) => existsSync(join(epDir(ep), '..', '..', 'assets', 'style-bible'));

const destFor = (ep: string, kind: Kind, id: string, variant: string | undefined, ext: string) => {
  const base = join(epDir(ep), 'assets', KIND_DIR[kind]);
  if (kind === 'character') {
    const dir = join(base, id);
    ensure(dir);
    return join(dir, `${variant}.${ext}`);
  }
  ensure(base);
  return join(base, `${id}.${ext}`);
};

const lint = (file: string, kind: Kind, ep: string) =>
  file.endsWith('.png')
    ? lintPng(file, kind)
    : lintSvg(file, kind, palette(ep), strictArt(ep));

const add = (args: string[]) => {
  const [ep, kind, id, a3, a4] = pos(args);
  if (!ep || !kind || !id || !a3) return usage();
  if (!['character', 'scene', 'prop'].includes(kind)) return usage();
  let variant: string | undefined;
  let file: string;
  if (kind === 'character') {
    variant = a3;
    file = a4 ?? '';
  } else {
    file = a3;
  }
  if (!file || !existsSync(file)) fail(`文件不存在：${file}`);
  const ext = extname(file).slice(1).toLowerCase();
  if (!['png', 'svg'].includes(ext)) fail(`只接受 .png/.svg，收到 .${ext}`);

  const {problems, warnings} = lint(file, kind as Kind, ep);
  for (const w of warnings) console.warn('警告:', w);
  if (problems.length) fail(`机检不通过，未入库：\n${problems.map((p) => '  ' + p).join('\n')}`);

  const dest = destFor(ep, kind as Kind, id, variant, ext);
  copyFileSync(file, dest);
  const rel = dest.split('assets/')[1];

  const reg = loadReg(ep);
  const bucket = reg[KIND_DIR[kind as Kind] as 'characters' | 'scenes' | 'props'];
  const rec = (bucket[id] ??= {variants: {}});
  const key = kind === 'character' ? variant! : 'default';
  const name = opt(args, 'name');
  const note = opt(args, 'note');
  const tags = opt(args, 'tags')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (name) rec.name = name;
  if (note) rec.note = note;
  if (tags?.length) rec.tags = tags;
  rec.variants[key] = {file: rel, archivedAt: new Date().toISOString(), ...(opt(args, 'by') ? {by: opt(args, 'by')} : {})};
  saveReg(ep, reg);
  console.log(`已入库 ${kind}:${id}/${key} → ${rel}`);
};

const noteCmd = (args: string[]) => {
  const [ep, kind, id] = pos(args);
  if (!ep || !kind || !id) return usage();
  const reg = loadReg(ep);
  const bucket = reg[KIND_DIR[kind as Kind] as 'characters' | 'scenes' | 'props'];
  if (!bucket[id]) fail(`档案不存在：${kind}:${id}`);
  const name = opt(args, 'name');
  const note = opt(args, 'note');
  const tags = opt(args, 'tags')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (name) bucket[id].name = name;
  if (note) bucket[id].note = note;
  if (tags?.length) bucket[id].tags = tags;
  saveReg(ep, reg);
  console.log(`已更新档案 ${kind}:${id}`);
};

const list = (args: string[]) => {
  const [ep, kind] = pos(args);
  if (!ep) return usage();
  const reg = loadReg(ep);
  for (const [k, bucket] of Object.entries({character: reg.characters, scene: reg.scenes, prop: reg.props})) {
    if (kind && k !== kind) continue;
    for (const [id, rec] of Object.entries(bucket)) {
      const vs = Object.keys(rec.variants).join(',');
      console.log(`${k.padEnd(10)} ${id.padEnd(16)} ${rec.name ?? '-'}  [${vs}]  ${rec.note ? rec.note.slice(0, 40) : ''}`);
    }
  }
};

const show = (args: string[]) => {
  const [ep, kind, id] = pos(args);
  if (!ep || !kind || !id) return usage();
  const reg = loadReg(ep);
  const rec = reg[KIND_DIR[kind as Kind] as 'characters' | 'scenes' | 'props'][id];
  if (!rec) fail(`档案不存在：${kind}:${id}`);
  console.log(JSON.stringify(rec, null, 2));
};

const fail = (msg: string): never => {
  console.error('错误:', msg);
  process.exit(1);
};
const usage = (): never => {
  console.log(`用法：
  pnpm archive add <ep> character <id> <variant> <file> [--name 名] [--note 说明] [--tags a,b] [--by 员工]
  pnpm archive add <ep> scene|prop <id> <file> [同上选项]
  pnpm archive note <ep> <kind> <id> [--name] [--note] [--tags]
  pnpm archive list <ep> [kind]
  pnpm archive show <ep> <kind> <id>`);
  process.exit(1);
};

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'add') add(rest);
else if (cmd === 'note') noteCmd(rest);
else if (cmd === 'list') list(rest);
else if (cmd === 'show') show(rest);
else usage();
