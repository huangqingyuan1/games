// 把 ../../engine/4.5.1/index.wasm.0..N 拼成一条流，冒充 engine/4.5.1/index.wasm。
// - 分片单独缓存进 Cache API（永久），第二次打开不再走网络
// - 逐片边下边喂给引擎，进度条会跟着网络走，而不是等 36MB 全下完
const CHUNKS = 37;
const WASM_TAIL = '/engine/4.5.1/index.wasm';
const TOTAL_BYTES = 38034280;
const CACHE_NAME = 'wasm-4.5.1-v1';

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const base = new URL('../../engine/4.5.1/', self.location.href).href;
const chunkUrls = Array.from({ length: CHUNKS }, (_, i) => `${base}index.wasm.${i}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getChunk(i) {
  const cache = await caches.open(CACHE_NAME);
  const url = chunkUrls[i];
  const hit = await cache.match(url);
  if (hit) return hit;

  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        // 存一份进 Cache API，下次直接命中
        cache.put(url, res.clone()).catch(() => {});
        return res;
      }
      lastErr = new Error('chunk ' + i + ' HTTP ' + res.status);
    } catch (err) {
      lastErr = err;
    }
    await sleep(300 * (attempt + 1));
  }
  throw lastErr || new Error('chunk ' + i + ' failed');
}

function streamWasm() {
  let i = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (i >= CHUNKS) {
        controller.close();
        return;
      }
      const res = await getChunk(i++);
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) controller.enqueue(value);
      }
    }
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/wasm',
      'Content-Length': String(TOTAL_BYTES),
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.endsWith(WASM_TAIL)) return;

  // Godot 会先发 HEAD 探长度，再发 GET。HEAD 必须回 200 + 不带 body，否则浏览器会中止。
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
});
