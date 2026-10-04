/* 原画规范机检（docs/style/STYLE.md §6）。返回 {problems, warnings}。 */
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const SHAPES = /<(path|ellipse|circle|rect|polygon|line|polyline)[\s>]/g;
const HEX = /#([0-9a-fA-F]{6})\b/g;

const hex2rgb = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const near = (c: string, pal: string[], tol: number) => {
  const [r, g, b] = hex2rgb(c);
  return pal.some((p) => {
    const [pr, pg, pb] = hex2rgb(p);
    return Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2) <= tol;
  });
};

const paletteFor = (epDir: string): string[] => {
  const f = join(epDir, 'palette.json');
  if (!existsSync(f)) return [];
  const obj = JSON.parse(readFileSync(f, 'utf8')) as Record<string, string[]>;
  return Object.values(obj).flat();
};

const ALWAYS_HARD = /viewBox|<image|id="guide"|#eyes|#mouth/;

export const lintSvg = (file: string, kind: 'character' | 'scene' | 'prop', palette: string[], strict: boolean): {problems: string[]; warnings: string[]} => {
  const problems: string[] = [];
  const warnings: string[] = [];
  const svg = readFileSync(file, 'utf8');
  const rel = file.split('assets/')[1] ?? file;

  if (!/viewBox=/.test(svg)) problems.push(`${rel}: 缺 viewBox`);
  if (/<image[\s>]/.test(svg)) problems.push(`${rel}: 禁止嵌入位图 <image>`);
  if (/id="guide"/.test(svg)) problems.push(`${rel}: 模板参考线 #guide 未删除`);

  if (kind === 'character') {
    if (!/id="(eyes|eye-l)"/.test(svg)) problems.push(`${rel}: 缺动画组 #eyes/#eye-l`);
    if (!/id="mouth(-open)?"/.test(svg)) problems.push(`${rel}: 缺动画组 #mouth`);
  }

  const strokes = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => +m[1]);
  if (strokes.some((w) => w < 2 || w > 7)) warnings.push(`${rel}: 线宽越界（规范 2.5~5，见到 ${Math.min(...strokes)}~${Math.max(...strokes)}）`);

  const nShapes = (svg.match(SHAPES) ?? []).length;
  const min = kind === 'character' ? 30 : kind === 'scene' ? 60 : 8;
  if (nShapes < min) {
    const msg = `${rel}: 复杂度过低 ${nShapes} 形状（${kind} 下限 ${min}）`;
    (strict ? problems : warnings).push(msg + (strict ? '' : '（style-bible 未定，暂作警告）'));
  }

  if (!/id="rq(-sm|-bg)?"/.test(svg) && !/url\(#rq/.test(svg)) warnings.push(`${rel}: 未用手绘滤镜 rq*`);

  if (palette.length) {
    const bad = new Set<string>();
    for (const m of svg.matchAll(HEX)) {
      const c = m[1].toLowerCase();
      if (!near(c, palette, 40)) bad.add('#' + c);
    }
    if (bad.size) warnings.push(`${rel}: ${bad.size} 个色不在色板容差内 ${[...bad].slice(0, 5).join(' ')}`);
  }
  return {problems, warnings};
};

export const lintEpisodeArt = (epDir: string): {problems: string[]; warnings: string[]; strict: boolean} => {
  const problems: string[] = [];
  const warnings: string[] = [];
  const palette = paletteFor(epDir);
  // 风格基线存在前，风格类项（复杂度/色板/线宽/滤镜）只警告；基线落地后全部升级失败。
  const strict = existsSync(join(epDir, '..', '..', 'assets', 'style-bible'));
  const dirs: Array<[string, 'character' | 'scene' | 'prop']> = [
    [join(epDir, 'assets', 'characters'), 'character'],
    [join(epDir, 'assets', 'scenes'), 'scene'],
    [join(epDir, 'assets', 'props'), 'prop'],
  ];
  const walk = (dir: string, kind: 'character' | 'scene' | 'prop') => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, {withFileTypes: true})) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, kind);
      else if (e.name.endsWith('.svg')) {
        const r = lintSvg(p, kind, palette, strict);
        problems.push(...r.problems);
        warnings.push(...r.warnings);
      }
    }
  };
  for (const [d, k] of dirs) walk(d, k);
  return {problems, warnings, strict};
};
