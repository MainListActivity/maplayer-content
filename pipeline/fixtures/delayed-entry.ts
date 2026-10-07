/* 竞态回归入口：延迟所有 parts.json 1500ms 模拟「动作剪辑先返回」加载顺序。
 * 仅供 pnpm test 的 renderStill 断言打包用，不影响 src/index.ts 正式入口。 */
import {registerRoot} from 'remotion';
import {RemotionRoot} from '../../src/Root';

const origFetch = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/parts/parts.json')) {
    return new Promise<Response>((resolve) => setTimeout(() => resolve(origFetch(input, init)), 1500));
  }
  return origFetch(input, init);
}) as typeof fetch;

registerRoot(RemotionRoot);
