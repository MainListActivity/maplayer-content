import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {AudioManifest, AudioManifestSchema, EpisodeSchema, EpisodeSpec, ShotsFileSchema, ShotSpec, buildTimeline} from '../src/spec';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const epDir = (id: string) => join(ROOT, 'public', 'episodes', id);
export const run = promisify(execFile);

export const loadEp = (id: string): {ep: EpisodeSpec; shots: ShotSpec[]; manifest?: AudioManifest} => {
  const dir = epDir(id);
  const ep = EpisodeSchema.parse(JSON.parse(readFileSync(join(dir, 'episode.json'), 'utf8')));
  const {shots} = ShotsFileSchema.parse(JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8')));
  const mPath = join(dir, 'audio', 'manifest.json');
  const manifest = existsSync(mPath) ? AudioManifestSchema.parse(JSON.parse(readFileSync(mPath, 'utf8'))) : undefined;
  return {ep, shots, manifest};
};

export const assetPath = (epId: string, kind: 'scenes' | 'characters' | 'props', name: string) =>
  join(epDir(epId), 'assets', kind, name);

export const ensure = (p: string) => mkdirSync(p, {recursive: true});

export const timelineSummary = (ep: EpisodeSpec, shots: ShotSpec[], manifest?: AudioManifest) =>
  buildTimeline(ep, shots, manifest).map((t) => ({
    shot: t.shot.id,
    start: t.startFrame,
    frames: t.durationFrames,
    sec: +(t.durationFrames / ep.fps).toFixed(2),
  }));
