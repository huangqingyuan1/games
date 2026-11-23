// 把 ../../engine/4.5.1/index.wasm.0..N 拼成一条流，冒充 engine/4.5.1/index.wasm。
// 37 个分片**同时开始下载**，再按顺序拼给引擎——这样在高延迟线路上也能跑满带宽。
const CHUNKS = 37;
const WASM_TAIL = '/engine/4.5.1/index.wasm';
const TOTAL_BYTES = 38034280;

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const base = new URL('../../engine/4.5.1/', self.location.href).href;

// 一次只抓一片（并发太高时 CDN / 代理会直接掐断连接），每片最多重试 4 次。
async function fetchChunk(i) {
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${base}index.wasm.${i}`, { cache: 'force-cache' });
      if (res.ok) return res;
      lastErr = new Error('chunk ' + i + ' HTTP ' + res.status);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
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
      const res = await fetchChunk(i++);
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
  if (!url.pathname.endsWith(WASM_TAIL)) return;

  // Godot 的加载器会先发 HEAD 探长度，再发 GET（可能带 Range）。
  // HEAD 必须回一个不带 body 的 200，否则请求会被浏览器中止（ERR_ABORTED）。
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
