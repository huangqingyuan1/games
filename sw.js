// 把分片的 index.wasm.0..6 拼成一条流，冒充 /engine/4.5.1/index.wasm
// 这样 36MB 的引擎文件可以按 6MB 一片传到 GitHub（单文件上限 100MB，但大文件一次性上传不稳）。
const ENGINE = '/engine/4.5.1/';
const WASM_URL = ENGINE + 'index.wasm';
const CHUNKS = 37;

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function streamWasm() {
  let i = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (i >= CHUNKS) {
        controller.close();
        return;
      }
      const url = `${ENGINE}index.wasm.${i++}`;
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
  if (url.pathname === WASM_URL) {
    event.respondWith(streamWasm());
  }
});
