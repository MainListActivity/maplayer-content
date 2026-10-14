import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {useEffect, useMemo, useRef, useState} from 'react';
import {AudioManifestSchema, EpisodeSchema, EpisodeSpec, ShotsFileSchema, ShotSpec, AudioManifest, buildTimeline, ShotTimeline} from '../spec';

const cache = new Map<string, Promise<unknown>>();
const fetchJson = <T>(path: string): Promise<T> => {
  if (!cache.has(path)) cache.set(path, fetch(staticFile(path)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`missing ${path}`)))));
  return cache.get(path) as Promise<T>;
};

const optCache = new Map<string, Promise<unknown>>();
/** 可选 JSON：404 解析为 null（用于 parts/actions/scene 约定文件探测）。 */
export const fetchJsonOpt = <T>(path: string): Promise<T | null> => {
  if (!optCache.has(path)) optCache.set(path, fetch(staticFile(path)).then((r) => {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Cannot load ${path}: ${r.status}`);
    return r.json();
  }));
  return optCache.get(path) as Promise<T | null>;
};

/**
 * 渲染期延迟门。delayRender 必须在渲染体同步登记：在 useEffect 里登记会在
 * 「React 提交 → effect 执行」之间留下 remotion_renderReady=true 的空窗，
 * 新挂载 Sequence 的首帧可能在句柄出现前被截图（切镜处场景/图层整帧缺失）。
 * arm 在渲染体调用：pending 期间按 key 占住一句柄（同 key 幂等，换 key 先放旧句柄）。
 * 放行放在提交后的 effect 里做（结果落地到 DOM、<Img> 自身的解码句柄已接上）。
 * 卸载兜底放行：组件带着 pending 句柄卸载时释放，避免句柄泄漏挂死整片渲染。
 */
interface RenderGate {key: string; handle: number; done: boolean}

const useRenderGate = () => {
  const gate = useRef<RenderGate | null>(null);
  const api = useMemo(() => {
    const release = (key?: string) => {
      const t = gate.current;
      if (!t || t.done || (key !== undefined && t.key !== key)) return;
      t.done = true;
      gate.current = null;
      continueRender(t.handle);
    };
    return {
      /** 渲染体调用：pending 时按 key 占住一句柄（同 key 幂等，换 key 原子放旧占新）。 */
      arm(key: string | null, label: string) {
        if (key === null || gate.current?.key === key) return;
        release();
        gate.current = {key, handle: delayRender(label), done: false};
      },
      release,
    };
  }, []);
  useEffect(() => () => api.release(), [api]);
  return api;
};

/** 组件内取可选 JSON。ready 区分「加载中」与「确实不存在」。 */
export const useJsonOpt = <T>(path: string | null): {data: T | null; ready: boolean} => {
  const [res, setRes] = useState<{key: string | null; data: T | null}>({key: null, data: null});
  const gate = useRenderGate();
  const pending = path !== null && res.key !== path;
  gate.arm(pending ? path : null, `json ${path}`);
  useEffect(() => {
    if (!path) return;
    let live = true;
    fetchJsonOpt<T>(path)
      .then((d) => {if (live) setRes({key: path, data: d});})
      .catch((error) => {gate.release(path); cancelRender(error);});
    return () => {live = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {if (!pending) gate.release();});
  return {data: res.key === path ? res.data : null, ready: !pending};
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
  const [res, setRes] = useState<{key: string | null; data: EpisodeBundle | null}>({key: null, data: null});
  const gate = useRenderGate();
  const pending = res.key !== episodeId;
  gate.arm(pending ? episodeId : null, 'load episode');
  useEffect(() => {
    let live = true;
    loadEpisodeBundle(episodeId)
      .then((d) => {if (live) setRes({key: episodeId, data: d});})
      .catch((e) => {gate.release(episodeId); throw e;});
    return () => {live = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);
  useEffect(() => {if (!pending) gate.release();});
  return res.key === episodeId ? res.data : null;
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
      // onload 后再等 decode()：保证位图可绘制（onload 只保证元数据就绪）。
      im.onload = () => {im.decode().then(() => res(true)).catch(() => res(true));};
      im.onerror = () => res(false);
      im.src = staticFile(path);
    }));
  }
  return pngCache.get(path)!;
};

/** 预载 PNG 列表（渲染前确保 decode 完成，部件/序列帧用）。 */
export const usePngReady = (urls: string[]): boolean => {
  const [resKey, setResKey] = useState<string | null>(null);
  const gate = useRenderGate();
  const key = urls.join('|');
  const pending = urls.length > 0 && resKey !== key;
  gate.arm(pending ? key : null, 'png preload');
  useEffect(() => {
    if (!urls.length) return;
    let live = true;
    Promise.all(urls.map(probePng))
      .then((found) => {
        if (found.some((ok) => !ok)) throw new Error('Missing PNG in preload list');
        if (live) setResKey(key);
      })
      .catch((error) => {gate.release(key); cancelRender(error);});
    return () => {live = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {if (!pending) gate.release();});
  return urls.length === 0 || resKey === key;
};

/** 探测一组 PNG 的存在性映射（姿势覆写用）：返回 url→存在？；全部探测完才算就绪。 */
export const usePngProbeMap = (urls: string[]): Record<string, boolean> | null => {
  const [res, setRes] = useState<{key: string | null; map: Record<string, boolean> | null}>({key: null, map: null});
  const gate = useRenderGate();
  const key = urls.join('|');
  const pending = urls.length > 0 && res.key !== key;
  gate.arm(pending ? key : null, 'png probe');
  useEffect(() => {
    if (!urls.length) return;
    let live = true;
    Promise.all(urls.map(async (u) => [u, await probePng(u)] as const))
      .then((entries) => {if (live) setRes({key, map: Object.fromEntries(entries)});})
      .catch((error) => {gate.release(key); cancelRender(error);});
    return () => {live = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {if (!pending) gate.release();});
  return urls.length === 0 ? {} : (res.key === key ? res.map : null);
};

/** 姿势帧预载：与 useAssetSrc 一样先 PNG 后 SVG，确保切帧前全序列就绪。 */
export const useAssetsReady = (bases: string[]): boolean => {
  const [resKey, setResKey] = useState<string | null>(null);
  const gate = useRenderGate();
  const key = bases.join('|');
  const pending = bases.length > 0 && resKey !== key;
  gate.arm(pending ? key : null, 'sequence preload');
  useEffect(() => {
    if (!bases.length) return;
    let live = true;
    Promise.all(bases.map(async (base) => {
      if (!await probePng(`${base}.png`)) await fetchText(`${base}.svg`);
    })).then(() => {if (live) setResKey(key);})
      .catch((error) => {gate.release(key); cancelRender(error);});
    return () => {live = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {if (!pending) gate.release();});
  return bases.length === 0 || resKey === key;
};

export type AssetSrc = {kind: 'png'; url: string} | {kind: 'svg'; svg: string} | null;

/** 资产装载：优先同名 .png（位图基线），缺失回退 .svg。 */
export const useAssetSrc = (base: string | null): AssetSrc => {
  const [res, setRes] = useState<{key: string | null; src: AssetSrc}>({key: null, src: null});
  const gate = useRenderGate();
  const pending = base !== null && res.key !== base;
  gate.arm(pending ? base : null, `asset ${base}`);
  useEffect(() => {
    if (!base) return;
    let live = true;
    (async () => {
      try {
        if (await probePng(`${base}.png`)) {
          if (live) setRes({key: base, src: {kind: 'png', url: `${base}.png`}});
        } else {
          const svg = await fetchText(`${base}.svg`);
          if (live) setRes({key: base, src: {kind: 'svg', svg}});
        }
      } catch (e) {
        gate.release(base);
        throw e;
      }
    })();
    return () => {live = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  useEffect(() => {if (!pending) gate.release();});
  return res.key === base ? res.src : null;
};
