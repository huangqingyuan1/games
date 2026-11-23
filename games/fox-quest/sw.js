// 引擎 wasm（切成 37 片）与游戏 pck 的取数层。
// 顺序取片（并发太高会被 CDN/代理掐断）：先试 jsDelivr，失败回退 GitHub Pages。
// 取到的每一片都写进 Cache API，第二次打开完全不走网络。
const CHUNKS = 37;
const WASM_TAIL = '/engine/4.5.1/index.wasm';
const TOTAL_BYTES = 38034280;
const PCK_TAIL = '/games/fox-quest/game.pck';
const PCK_BYTES = 3352316;
const CACHE_NAME = 'godot-assets-v3';

const CDN = 'https://cdn.jsdelivr.net/gh/huangqingyuan1/games@main/';
const CDN_VER = '?v=20261123b';
const GH = new URL('../../', self.location.href).href;

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAsset(name) {
  // 缓存键用绝对 URL（Cache API 不接受相对路径）
  const key = new URL(name, GH).href;
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(key);
  if (hit) return hit;

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const root of [CDN, GH]) {
      const url = root + name + (root === CDN ? CDN_VER : '');
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          cache.put(key, res.clone()).catch(() => {});
          return res;
        }
        lastErr = new Error(name + ' -> ' + res.status);
      } catch (err) {
        lastErr = err;
      }
    }
    await sleep(300 * (attempt + 1));
  }
  throw lastErr || new Error(name + ' failed');
}

function streamWasm() {
  // 分批并发（4 片 ≈ 4MB 内存），批内并发、批间顺序，既快又不会被掐断
  const BATCH = 4;
  let next = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (next >= CHUNKS) {
        controller.close();
        return;
      }
      const idxs = [];
      for (let k = 0; k < BATCH && next < CHUNKS; k++) idxs.push(next++);
      const parts = await Promise.all(idxs.map(async (i) => {
        const res = await fetchAsset(`engine/4.5.1/index.wasm.${i}`);
        return new Uint8Array(await res.arrayBuffer());
      }));
      for (const b of parts) controller.enqueue(b);
    }
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/wasm',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith(WASM_TAIL)) {
    if (event.request.method !== 'GET') {
      event.respondWith(new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'application/wasm',
          'Content-Length': String(TOTAL_BYTES),
          'Accept-Ranges': 'bytes'
        }
      }));
      return;
    }
    event.respondWith(streamWasm());
    return;
  }

  if (url.pathname.endsWith(PCK_TAIL)) {
    event.respondWith((async () => {
      if (event.request.method !== 'GET') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(PCK_BYTES)
          }
        });
      }
      const res = await fetchAsset(`games/fox-quest/game.pck`);
      return new Response(res.body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    })());
  }
});
