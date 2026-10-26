import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const before = process.argv[2];
const port = Number(process.argv[3] ?? 5282);
if (!before) throw new Error('Usage: node scripts/serve-load-benchmark.mjs <before-build-directory>');
const roots = {before: path.resolve(before), after: path.resolve('dist')};
const cache = new Map(), clocks = new Map();
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png'};
http.createServer(async (req, res) => {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const run = parts.shift() ?? '', variant = run.split('-')[0];
  if (!roots[variant]) { res.writeHead(404).end(); return; }
  const file = path.resolve(roots[variant], parts.join('/') || 'index.html');
  if (!file.startsWith(roots[variant] + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const gzip = /\.(html|js|css|json)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] ?? '');
    const key = file + gzip;
    let data = cache.get(key);
    if (!data) { data = await readFile(file); if (file.endsWith('.html')) data = Buffer.from(data.toString().replace('</head>', "<script>const probeErrors=[];addEventListener('error',e=>probeErrors.push(e.message));const probeTimer=setInterval(()=>{const ready=performance.getEntriesByName('game:ready')[0];if(!ready)return;document.getElementById('game').dataset.loadMetrics=JSON.stringify({url:location.href,readyMs:ready.startTime,marks:performance.getEntriesByType('mark').map(e=>({name:e.name,ms:e.startTime})),resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),bytes:e.encodedBodySize,transfer:e.transferSize,startMs:e.startTime,endMs:e.responseEnd})),viewport:[innerWidth,innerHeight],errors:probeErrors});clearInterval(probeTimer)},50);</script></head>")); if (gzip) data = gzipSync(data); cache.set(key, data); }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store', 'Content-Length':data.length, ...(gzip ? {'Content-Encoding':'gzip'} : {})});
    // Shared 10 Mbit/s link per run, 80 ms response latency. Unique run URLs + no-store keep browser loads cold.
    let offset = 0;
    while (offset < data.length) {
      const end = Math.min(offset + 32768, data.length), chunk = data.subarray(offset, end);
      const at = Math.max(performance.now() + (offset === 0 ? 80 : 0), clocks.get(run) ?? 0) + chunk.length / 1250;
      clocks.set(run, at);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, at - performance.now())));
      if (res.destroyed) return;
      res.write(chunk); offset = end;
    }
    res.end();
  } catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log('Load benchmark: http://localhost:' + port + '/before-1/ (10 Mbps, 80 ms, no-store)'));
