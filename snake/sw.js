/* 由 gen_sw2.py 生成：wasm 以 brotli 分片存放，SW 取片后流式解压 */
const RAW_BYTES = 38034280;
const CHUNKS = 9;
const PCK_BYTES = 5652128;
const MU = '/engine/4.5.1/index.wasm';
const CDN = 'https://cdn.jsdelivr.net/gh/huangqingyuan1/games@main/';
const Q = '?v=20261124a';
const GH = new URL('../', self.location.href).href;
const CACHE_NAME = 'godot-br-v1';

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function cached(name, put) {
  const key = new URL(name, GH).href;
  const cache = await caches.open(CACHE_NAME);
  if (!put) {
    const hit = await cache.match(key);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  let lastErr = null;
  for (const base of [CDN, GH]) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(base + name + Q, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.byteLength === 0) throw new Error('empty');
        await cache.put(key, new Response(buf));
        return buf;
      } catch (err) {
        lastErr = err;
        await new Promise((res) => setTimeout(res, 300 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function brStream() {
  return new ReadableStream({
    async start(ctrl) {
      for (let i = 0; i < CHUNKS; i++) {
        ctrl.enqueue(await cached('engine/4.5.1/index.wasm.gz.' + i, false));
      }
      ctrl.close();
    },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith(MU)) {
    event.respondWith((async () => {
      if (event.request.method === 'HEAD') {
        return new Response(null, { status: 200, headers: {
          'Content-Type': 'application/wasm',
          'Content-Length': String(RAW_BYTES),
          'Accept-Ranges': 'bytes',
        }});
      }
      const raw = brStream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(raw, { headers: {
        'Content-Type': 'application/wasm',
        'Cache-Control': 'public, max-age=31536000, immutable',
      }});
    })());
    return;
  }
  if (url.pathname.endsWith('/game.pck')) {
    event.respondWith((async () => {
      const buf = await cached('games/snake/game.pck', false);
      return new Response(buf, { headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(PCK_BYTES),
        'Cache-Control': 'public, max-age=31536000, immutable',
      }});
    })());
  }
});
