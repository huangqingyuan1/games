// 把 ../../engine/4.5.1/index.wasm.0..N 拼成一条流，冒充 engine/4.5.1/index.wasm。
// 37 个分片**同时开始下载**，再按顺序拼给引擎——这样在高延迟线路上也能跑满带宽。
const CHUNKS = 37;
const WASM_TAIL = '/engine/4.5.1/index.wasm';

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let started = null;

function startAll() {
  if (started) return started;
  const base = new URL('../../engine/4.5.1/', self.location.href).href;
  started = Array.from({ length: CHUNKS }, (_, i) =>
    fetch(`${base}index.wasm.${i}`, { cache: 'force-cache' }).then((res) => {
      if (!res.ok) throw new Error('chunk ' + i + ' HTTP ' + res.status);
      return res;
    })
  );
  return started;
}

function streamWasm() {
  const parts = startAll();
  let i = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (i >= CHUNKS) {
        controller.close();
        return;
      }
      const res = await parts[i++];
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
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith(WASM_TAIL)) {
    event.respondWith(streamWasm());
  }
});
