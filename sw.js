// 把分片的 index.wasm.0..N 拼成一条流，冒充 .../engine/4.5.1/index.wasm
// （GitHub 单文件 100MB 上限 + 大文件单次上传不稳，所以切成 1MB 片）
const CHUNKS = 37;

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function streamWasm() {
  const base = self.registration.scope; // 例如 https://xxx.github.io/games/
  let i = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (i >= CHUNKS) {
        controller.close();
        return;
      }
      const url = new URL(`engine/4.5.1/index.wasm.${i++}`, base).href;
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) {
        controller.error(new Error('chunk fetch failed: ' + url));
        return;
      }
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/wasm',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/engine/4.5.1/index.wasm')) {
    event.respondWith(streamWasm());
  }
});
