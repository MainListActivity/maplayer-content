import {continueRender, delayRender, staticFile} from 'remotion';
import {useEffect, useState} from 'react';
import {AudioManifestSchema, EpisodeSchema, EpisodeSpec, ShotsFileSchema, ShotSpec, AudioManifest, buildTimeline, ShotTimeline} from '../spec';

const cache = new Map<string, Promise<unknown>>();
const fetchJson = <T>(path: string): Promise<T> => {
  if (!cache.has(path)) cache.set(path, fetch(staticFile(path)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`missing ${path}`)))));
  return cache.get(path) as Promise<T>;
};

export interface EpisodeBundle {ep: EpisodeSpec; shots: ShotSpec[]; manifest?: AudioManifest; timeline: ShotTimeline[];}

export const loadEpisodeBundle = async (episodeId: string): Promise<EpisodeBundle> => {
  const base = `episodes/${episodeId}`;
  const ep = EpisodeSchema.parse(await fetchJson(`${base}/episode.json`));
  const {shots} = ShotsFileSchema.parse(await fetchJson(`${base}/shots.json`));
  let manifest: AudioManifest | undefined;
  try {
    manifest = AudioManifestSchema.parse(await fetchJson(`${base}/audio/manifest.json`));
  } catch { /* 未生成音频时按语速估算 */ }
  return {ep, shots, manifest, timeline: buildTimeline(ep, shots, manifest)};
};

/** 组件内异步取数据（Studio 预览与渲染通用）。 */
export const useBundle = (episodeId: string): EpisodeBundle | null => {
  const [bundle, setBundle] = useState<EpisodeBundle | null>(null);
  useEffect(() => {
    const h = delayRender('load episode');
    loadEpisodeBundle(episodeId).then(setBundle).catch((e) => {continueRender(h); throw e;}).finally(() => continueRender(h));
  }, [episodeId]);
  return bundle;
};

const svgCache = new Map<string, Promise<string>>();
export const fetchText = (path: string): Promise<string> => {
  if (!svgCache.has(path)) svgCache.set(path, fetch(staticFile(path)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`missing ${path}`)))));
  return svgCache.get(path) as Promise<string>;
};

const pngCache = new Map<string, Promise<boolean>>();
const probePng = (path: string): Promise<boolean> => {
  if (!pngCache.has(path)) {
    pngCache.set(path, new Promise<boolean>((res) => {
      const im = new Image();
      im.onload = () => res(true);
      im.onerror = () => res(false);
      im.src = staticFile(path);
    }));
  }
  return pngCache.get(path)!;
};

export type AssetSrc = {kind: 'png'; url: string} | {kind: 'svg'; svg: string} | null;

/** 资产装载：优先同名 .png（位图基线），缺失回退 .svg。 */
export const useAssetSrc = (base: string | null): AssetSrc => {
  const [src, setSrc] = useState<AssetSrc>(null);
  useEffect(() => {
    if (!base) return;
    const h = delayRender(`asset ${base}`);
    let live = true;
    (async () => {
      try {
        if (await probePng(`${base}.png`)) {
          if (live) setSrc({kind: 'png', url: `${base}.png`});
        } else {
          const svg = await fetchText(`${base}.svg`);
          if (live) setSrc({kind: 'svg', svg});
        }
      } catch (e) {
        continueRender(h);
        throw e;
      } finally {
        continueRender(h);
      }
    })();
    return () => {live = false;};
  }, [base]);
  return src;
};
